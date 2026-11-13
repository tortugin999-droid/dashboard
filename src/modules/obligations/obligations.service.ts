import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Obligation, ObligationStatus, Prisma } from '@prisma/client';
import { IdempotencyService } from '../../common/idempotency.service';
import { dayKey, D, money, todayInTz } from '../../common/money.util';
import { PrismaService } from '../../common/prisma.service';
import { CreateObligationDto, PayObligationDto, UpdateObligationDto } from './dto/obligation.dto';

export function obligationDto(o: Obligation & { account?: { name: string }; category?: { name: string } | null }, today?: string) {
  const remaining = D(o.amount).minus(D(o.paidAmount));
  const isOverdue =
    (o.status === ObligationStatus.PENDING || o.status === ObligationStatus.PARTIALLY_PAID) &&
    remaining.gt(0) &&
    dayKey(o.dueDate) < (today ?? dayKey(new Date()));
  return {
    id: o.id,
    recurrenceId: o.recurrenceId,
    accountId: o.accountId,
    categoryId: o.categoryId,
    accountName: o.account?.name ?? null,
    categoryName: o.category?.name ?? null,
    description: o.description,
    direction: o.direction,
    amount: money(o.amount),
    paidAmount: money(o.paidAmount),
    remaining: money(remaining),
    dueDate: dayKey(o.dueDate),
    status: o.status,
    // OVERDUE se deriva de la fecha y del importe pendiente; nunca queda obsoleto.
    overdue: isOverdue,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

@Injectable()
export class ObligationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async list(userId: string, query: object, pagination: { skip: number; take: number }) {
    const q = query as Record<string, any>;
    const where: Prisma.ObligationWhereInput = {
      userId,
      ...(q.status ? { status: q.status } : {}),
      ...(q.direction ? { direction: q.direction } : {}),
      ...(q.currency ? { account: { currency: q.currency } } : {}),
      ...(q.accountId ? { accountId: q.accountId } : {}),
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(q.from || q.to
        ? {
            dueDate: {
              ...(q.from ? { gte: new Date(`${q.from}T00:00:00.000Z`) } : {}),
              ...(q.to ? { lte: new Date(`${q.to}T00:00:00.000Z`) } : {}),
            },
          }
        : {}),
      ...(q.search ? { description: { contains: q.search, mode: 'insensitive' as const } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.obligation.findMany({
        where,
        orderBy: [{ dueDate: 'asc' }],
        skip: pagination.skip,
        take: pagination.take,
        include: { account: { select: { name: true } }, category: { select: { name: true } } },
      }),
      this.prisma.obligation.count({ where }),
    ]);
    const today = todayInTz('UTC');
    return { rows: rows.map((o) => obligationDto(o, today)), total };
  }

  async getOwned(userId: string, id: string): Promise<Obligation> {
    const o = await this.prisma.obligation.findFirst({ where: { id, userId } });
    if (!o) throw new NotFoundException('Obligación no encontrada.');
    return o;
  }

  async create(userId: string, dto: CreateObligationDto) {
    const account = await this.prisma.account.findFirst({ where: { id: dto.accountId, userId } });
    if (!account) throw new NotFoundException('Cuenta no encontrada o no pertenece al usuario.');
    if (dto.categoryId) {
      const cat = await this.prisma.category.findFirst({ where: { id: dto.categoryId, userId } });
      if (!cat) throw new NotFoundException('Categoría no encontrada o no pertenece al usuario.');
    }
    if (D(dto.amount).lte(0)) throw new BadRequestException('El importe debe ser mayor que cero.');
    return this.prisma.obligation.create({
      data: {
        userId,
        accountId: account.id,
        categoryId: dto.categoryId ?? null,
        description: dto.description.trim(),
        direction: dto.direction ?? 'PAYABLE',
        amount: D(dto.amount).toFixed(4),
        dueDate: new Date(`${dto.dueDate}T00:00:00.000Z`),
      },
    });
  }

  /**
   * Ajusta una obligación estimada. No modifica retroactivamente movimientos
   * ya pagados: solo cambia importe/fecha/datos pendientes.
   */
  async update(userId: string, id: string, dto: UpdateObligationDto) {
    const o = await this.getOwned(userId, id);
    if (o.status === ObligationStatus.PAID || o.status === ObligationStatus.CANCELLED) {
      throw new ConflictException('No se puede ajustar una obligación pagada o cancelada.');
    }
    if (dto.amount !== undefined) {
      const newAmount = D(dto.amount);
      if (newAmount.lte(0)) throw new BadRequestException('El importe debe ser mayor que cero.');
      if (newAmount.lt(D(o.paidAmount))) {
        throw new BadRequestException('El nuevo importe no puede ser menor a lo ya pagado.');
      }
    }
    if (dto.accountId) {
      const account = await this.prisma.account.findFirst({ where: { id: dto.accountId, userId } });
      if (!account) throw new NotFoundException('Cuenta no encontrada o no pertenece al usuario.');
    }
    if (dto.categoryId) {
      const cat = await this.prisma.category.findFirst({ where: { id: dto.categoryId, userId } });
      if (!cat) throw new NotFoundException('Categoría no encontrada o no pertenece al usuario.');
    }
    return this.prisma.obligation.update({
      where: { id },
      data: {
        ...(dto.description !== undefined ? { description: dto.description.trim() } : {}),
        ...(dto.amount !== undefined ? { amount: D(dto.amount).toFixed(4) } : {}),
        ...(dto.dueDate !== undefined ? { dueDate: new Date(`${dto.dueDate}T00:00:00.000Z`) } : {}),
        ...(dto.accountId !== undefined ? { accountId: dto.accountId } : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        ...(dto.status === 'CANCELLED' ? { status: ObligationStatus.CANCELLED, cancelledAt: new Date() } : {}),
      },
    });
  }

  /**
   * Pago de una obligación, atómico e idempotente (Idempotency-Key):
   * crea/vincula el movimiento real, actualiza el importe pendiente y el
   * estado; soporta pagos parciales y rechaza sobrepagos.
   */
  async pay(userId: string, obligationId: string, dto: PayObligationDto, idempotencyKey: string | undefined) {
    const key = idempotencyKey ?? `pay:${obligationId}:${dto.date}:${dto.amount}`;
    const requestHash = this.idempotency.hashRequest(userId, 'POST /obligations/:id/payments', { obligationId, ...dto });
    const amount = D(dto.amount);
    if (amount.lte(0)) throw new BadRequestException('El importe debe ser mayor que cero.');

    const result = await this.prisma.$transaction((tx) =>
      this.idempotency.withIdempotency(tx, userId, key, 'POST /obligations/:id/payments', requestHash, async () => {
        const obligation = await tx.obligation.findFirst({
          where: { id: obligationId, userId },
          include: { account: { select: { currency: true } } },
        });
        if (!obligation) throw new NotFoundException('Obligación no encontrada.');
        if (obligation.status === ObligationStatus.CANCELLED) {
          throw new ConflictException('La obligación está cancelada.');
        }
        if (obligation.status === ObligationStatus.PAID) {
          throw new ConflictException('La obligación ya está pagada.');
        }
        const remaining = D(obligation.amount).minus(D(obligation.paidAmount));
        if (amount.gt(remaining)) {
          throw new ConflictException(
            `Sobrepago rechazado: el importe pendiente es ${money(remaining)}.`,
          );
        }
        const account = await tx.account.findFirst({ where: { id: dto.accountId, userId } });
        if (!account) throw new NotFoundException('Cuenta no encontrada o no pertenece al usuario.');
        if (account.archived) throw new BadRequestException('La cuenta está archivada.');
        if (account.currency !== obligation.account.currency) {
          throw new BadRequestException('La moneda de la cuenta de pago debe coincidir con la de la obligación.');
        }
        const txn = await tx.transaction.create({
          data: {
            userId,
            accountId: account.id,
            categoryId: obligation.categoryId,
            type: obligation.direction === 'PAYABLE' ? 'EXPENSE' : 'INCOME',
            amount: amount.toFixed(4),
            currency: account.currency,
            date: new Date(`${dto.date}T00:00:00.000Z`),
            description: `Pago: ${obligation.description}`,
            obligationId: obligation.id,
          },
        });
        const payment = await tx.obligationPayment.create({
          data: {
            userId,
            obligationId: obligation.id,
            accountId: account.id,
            transactionId: txn.id,
            amount: amount.toFixed(4),
            date: new Date(`${dto.date}T00:00:00.000Z`),
          },
        });
        const newPaid = D(obligation.paidAmount).plus(amount);
        const newStatus: ObligationStatus =
          newPaid.gte(D(obligation.amount)) ? ObligationStatus.PAID : ObligationStatus.PARTIALLY_PAID;
        await tx.obligation.update({
          where: { id: obligation.id },
          data: { paidAmount: newPaid.toFixed(4), status: newStatus },
        });
        return {
          paymentId: payment.id,
          transactionId: txn.id,
          obligationId: obligation.id,
          paidAmount: money(newPaid),
          remaining: money(D(obligation.amount).minus(newPaid)),
          status: newStatus,
        };
      }),
    );
    return { body: result.value, replayed: result.replayed };
  }
}
