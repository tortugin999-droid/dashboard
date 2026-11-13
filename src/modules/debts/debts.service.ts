import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Debt, DebtPayment, Prisma } from '@prisma/client';
import { IdempotencyService } from '../../common/idempotency.service';
import { dayKey, D, money } from '../../common/money.util';
import { PrismaService } from '../../common/prisma.service';
import { CreateDebtDto, CreateDebtPaymentDto, UpdateDebtDto } from './dto/debt.dto';

export function debtDto(d: Debt) {
  return {
    id: d.id,
    direction: d.direction,
    counterparty: d.counterparty,
    currency: d.currency,
    description: d.description,
    originalPrincipal: money(d.originalPrincipal),
    remainingPrincipal: money(d.remainingPrincipal),
    interestRate: d.interestRate ? D(d.interestRate).toFixed(6) : null,
    dueDate: d.dueDate ? dayKey(d.dueDate) : null,
    installments: d.installments,
    status: d.status,
    disbursementAccountId: d.disbursementAccountId,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

export function debtPaymentDto(p: DebtPayment) {
  return {
    id: p.id,
    debtId: p.debtId,
    accountId: p.accountId,
    transactionId: p.transactionId,
    principalAmount: money(p.principalAmount),
    interestAmount: money(p.interestAmount),
    feeAmount: money(p.feeAmount),
    amount: money(p.amount),
    date: dayKey(p.date),
    createdAt: p.createdAt.toISOString(),
  };
}

@Injectable()
export class DebtsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async list(userId: string, query: object, pagination: { skip: number; take: number }) {
    const q = query as Record<string, any>;
    const where: Prisma.DebtWhereInput = {
      userId,
      ...(q.status ? { status: q.status } : {}),
      ...(q.direction ? { direction: q.direction } : {}),
      ...(q.currency ? { currency: q.currency } : {}),
      ...(q.search ? { counterparty: { contains: q.search, mode: 'insensitive' as const } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.debt.findMany({ where, orderBy: [{ createdAt: 'desc' }], skip: pagination.skip, take: pagination.take }),
      this.prisma.debt.count({ where }),
    ]);
    return { rows: rows.map(debtDto), total };
  }

  async getOwned(userId: string, id: string): Promise<Debt> {
    const d = await this.prisma.debt.findFirst({ where: { id, userId } });
    if (!d) throw new NotFoundException('Deuda no encontrada.');
    return d;
  }

  async create(userId: string, dto: CreateDebtDto) {
    const original = D(dto.originalPrincipal);
    if (original.lte(0)) throw new BadRequestException('El capital original debe ser mayor que cero.');
    if (dto.interestRate !== undefined) {
      const rate = D(dto.interestRate);
      if (rate.lt(0) || rate.gt(1)) {
        throw new BadRequestException('interestRate debe estar entre 0 y 1 (fracción anual).');
      }
    }
    return this.prisma.$transaction(async (tx) => {
      let disbursementTxId: string | null = null;
      if (dto.disbursementAccountId) {
        if (dto.direction !== 'I_OWE') {
          throw new BadRequestException('disbursementAccountId solo aplica a deudas I_OWE (desembolso recibido).');
        }
        const account = await tx.account.findFirst({ where: { id: dto.disbursementAccountId, userId } });
        if (!account) throw new NotFoundException('Cuenta de desembolso no encontrada o no pertenece al usuario.');
        if (account.currency !== dto.currency) {
          throw new BadRequestException('La moneda de la cuenta de desembolso debe coincidir con la de la deuda.');
        }
        const txn = await tx.transaction.create({
          data: {
            userId,
            accountId: account.id,
            type: 'LOAN_DISBURSEMENT',
            amount: original.toFixed(4),
            currency: dto.currency,
            date: new Date(),
            description: `Desembolso de préstamo: ${dto.counterparty}`,
          },
        });
        disbursementTxId = txn.id;
      }
      return tx.debt.create({
        data: {
          userId,
          direction: dto.direction,
          counterparty: dto.counterparty.trim(),
          currency: dto.currency,
          description: dto.description?.trim() || null,
          originalPrincipal: original.toFixed(4),
          remainingPrincipal: original.toFixed(4),
          interestRate: dto.interestRate ?? null,
          dueDate: dto.dueDate ? new Date(`${dto.dueDate}T00:00:00.000Z`) : null,
          installments: dto.installments ?? null,
          disbursementAccountId: dto.disbursementAccountId ?? null,
        },
      });
    });
  }

  async update(userId: string, id: string, dto: UpdateDebtDto) {
    await this.getOwned(userId, id);
    return this.prisma.debt.update({
      where: { id },
      data: {
        ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
        ...(dto.dueDate !== undefined ? { dueDate: dto.dueDate ? new Date(`${dto.dueDate}T00:00:00.000Z`) : null } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
  }

  /**
   * Abono (pago) de deuda, atómico e idempotente:
   * - El capital reduce la deuda y mueve caja (DEBT_PAYMENT).
   * - Intereses y cargos se registran por separado en el abono.
   * - Rechaza abonos de capital mayores al capital pendiente.
   */
  async pay(userId: string, debtId: string, dto: CreateDebtPaymentDto, idempotencyKey: string | undefined) {
    const key = idempotencyKey ?? `debt-pay:${debtId}:${dto.date}:${dto.principalAmount}:${dto.interestAmount ?? '0'}:${dto.feeAmount ?? '0'}`;
    const requestHash = this.idempotency.hashRequest(userId, 'POST /debts/:id/payments', { debtId, ...dto });
    const principal = D(dto.principalAmount);
    const interest = D(dto.interestAmount ?? '0');
    const fee = D(dto.feeAmount ?? '0');
    const total = principal.plus(interest).plus(fee);
    if (principal.lte(0)) throw new BadRequestException('El abono a capital debe ser mayor que cero.');
    if (interest.lt(0) || fee.lt(0)) throw new BadRequestException('Intereses y cargos no pueden ser negativos.');

    const result = await this.prisma.$transaction((tx) =>
      this.idempotency.withIdempotency(tx, userId, key, 'POST /debts/:id/payments', requestHash, async () => {
        const debt = await tx.debt.findFirst({ where: { id: debtId, userId } });
        if (!debt) throw new NotFoundException('Deuda no encontrada.');
        if (debt.status !== 'ACTIVE') throw new BadRequestException('La deuda no está activa.');
        if (principal.gt(D(debt.remainingPrincipal))) {
          throw new BadRequestException(
            `El abono excede el capital pendiente (${money(debt.remainingPrincipal)}).`,
          );
        }
        const account = await tx.account.findFirst({ where: { id: dto.accountId, userId } });
        if (!account) throw new NotFoundException('Cuenta no encontrada o no pertenece al usuario.');
        if (account.archived) throw new BadRequestException('La cuenta está archivada.');
        if (account.currency !== debt.currency) {
          throw new BadRequestException('La moneda de la cuenta debe coincidir con la de la deuda.');
        }
        const txn = await tx.transaction.create({
          data: {
            userId,
            accountId: account.id,
            type: 'DEBT_PAYMENT',
            amount: total.toFixed(4),
            currency: debt.currency,
            date: new Date(`${dto.date}T00:00:00.000Z`),
            description: `Abono deuda ${debt.counterparty} (capital ${money(principal)}, intereses ${money(interest)}, cargos ${money(fee)})`,
          },
        });
        const payment = await tx.debtPayment.create({
          data: {
            userId,
            debtId: debt.id,
            accountId: account.id,
            transactionId: txn.id,
            principalAmount: principal.toFixed(4),
            interestAmount: interest.toFixed(4),
            feeAmount: fee.toFixed(4),
            amount: total.toFixed(4),
            date: new Date(`${dto.date}T00:00:00.000Z`),
          },
        });
        await tx.transaction.update({
          where: { id: txn.id },
          data: { debtPaymentId: payment.id },
        });
        const newRemaining = D(debt.remainingPrincipal).minus(principal);
        await tx.debt.update({
          where: { id: debt.id },
          data: {
            remainingPrincipal: newRemaining.toFixed(4),
            ...(newRemaining.lte(0) ? { status: 'SETTLED' as const } : {}),
          },
        });
        return debtPaymentDto(payment);
      }),
    );
    return { body: result.value, replayed: result.replayed };
  }

  async listPayments(userId: string, debtId: string) {
    await this.getOwned(userId, debtId);
    const rows = await this.prisma.debtPayment.findMany({
      where: { userId, debtId },
      orderBy: [{ date: 'asc' }],
    });
    return rows.map(debtPaymentDto);
  }
}
