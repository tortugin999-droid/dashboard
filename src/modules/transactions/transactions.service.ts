import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Transaction, TransactionType } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { D, dayKey, money, todayInTz } from '../../common/money.util';
import { CreateTransactionDto, UpdateTransactionDto } from './dto/transaction.dto';

export function transactionDto(t: Transaction, extra?: { accountName?: string; categoryName?: string | null }) {
  return {
    id: t.id,
    accountId: t.accountId,
    categoryId: t.categoryId,
    type: t.type,
    amount: money(t.amount),
    currency: t.currency,
    date: dayKey(t.date),
    description: t.description ?? null,
    transferId: t.transferId,
    obligationId: t.obligationId,
    debtPaymentId: t.debtPaymentId,
    accountName: extra?.accountName ?? null,
    categoryName: extra?.categoryName ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async assertOwnedAccount(userId: string, accountId: string) {
    const account = await this.prisma.account.findFirst({ where: { id: accountId, userId } });
    if (!account) {
      throw new NotFoundException('Cuenta no encontrada o no pertenece al usuario.');
    }
    return account;
  }

  async assertOwnedCategory(userId: string, categoryId: string) {
    const category = await this.prisma.category.findFirst({ where: { id: categoryId, userId } });
    if (!category) {
      throw new NotFoundException('Categoría no encontrada o no pertenece al usuario.');
    }
    return category;
  }

  async assertDateAllowed(account: { initialBalanceDate: Date }, date: string, timezone: string) {
    if (date < dayKey(account.initialBalanceDate)) {
      throw new BadRequestException(
        'La fecha del movimiento no puede ser anterior a la fecha del saldo inicial de la cuenta.',
      );
    }
    if (date > todayInTz(timezone)) {
      throw new BadRequestException(
        'Una transacción representa un movimiento ya realizado: la fecha no puede ser futura. Usa programaciones u obligaciones para movimientos esperados.',
      );
    }
  }

  async create(userId: string, dto: CreateTransactionDto, timezone: string) {
    const account = await this.assertOwnedAccount(userId, dto.accountId);
    if (account.archived) throw new BadRequestException('La cuenta está archivada.');
    if (dto.categoryId) await this.assertOwnedCategory(userId, dto.categoryId);
    await this.assertDateAllowed(account, dto.date, timezone);
    const type: TransactionType = dto.type;
    return this.prisma.transaction.create({
      data: {
        userId,
        accountId: account.id,
        categoryId: dto.categoryId ?? null,
        type,
        amount: D(dto.amount).toFixed(4),
        currency: account.currency,
        date: new Date(`${dto.date}T00:00:00.000Z`),
        description: dto.description?.trim() || null,
      },
    });
  }

  async list(userId: string, query: object, pagination: { skip: number; take: number }) {
    const q = query as Record<string, any>;
    const where: Prisma.TransactionWhereInput = {
      userId,
      ...(q.currency ? { currency: q.currency } : {}),
      ...(q.accountId ? { accountId: q.accountId } : {}),
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(q.type ? { type: q.type } : {}),
      ...(q.from || q.to
        ? { date: { ...(q.from ? { gte: new Date(`${q.from}T00:00:00.000Z`) } : {}), ...(q.to ? { lte: new Date(`${q.to}T00:00:00.000Z`) } : {}) } }
        : {}),
      ...(q.search ? { description: { contains: q.search, mode: 'insensitive' as const } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: pagination.skip,
        take: pagination.take,
        include: { account: { select: { name: true } }, category: { select: { name: true } } },
      }),
      this.prisma.transaction.count({ where }),
    ]);
    return {
      rows: rows.map((t) =>
        transactionDto(t, { accountName: t.account.name, categoryName: t.category?.name ?? null }),
      ),
      total,
    };
  }

  async getOwned(userId: string, id: string) {
    const t = await this.prisma.transaction.findFirst({
      where: { id, userId },
      include: { account: { select: { name: true } }, category: { select: { name: true } } },
    });
    if (!t) throw new NotFoundException('Transacción no encontrada.');
    return t;
  }

  async update(userId: string, id: string, dto: UpdateTransactionDto, timezone: string) {
    const t = await this.getOwned(userId, id);
    if (t.transferId || t.obligationId || t.debtPaymentId) {
      throw new ForbiddenException(
        'Este movimiento fue generado por una transferencia, pago de obligación o abono de deuda; ajústalo desde su módulo.',
      );
    }
    const account = await this.assertOwnedAccount(userId, t.accountId);
    if (dto.categoryId) await this.assertOwnedCategory(userId, dto.categoryId);
    const date = dto.date ?? dayKey(t.date);
    await this.assertDateAllowed(account, date, timezone);
    return this.prisma.transaction.update({
      where: { id },
      data: {
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        ...(dto.amount !== undefined ? { amount: D(dto.amount).toFixed(4) } : {}),
        ...(dto.date !== undefined ? { date: new Date(`${dto.date}T00:00:00.000Z`) } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
      },
    });
  }

  async remove(userId: string, id: string) {
    const t = await this.getOwned(userId, id);
    if (t.transferId || t.obligationId || t.debtPaymentId) {
      throw new ForbiddenException(
        'No se puede eliminar un movimiento vinculado a una transferencia, pago de obligación o abono de deuda: destruiría el historial financiero.',
      );
    }
    await this.prisma.transaction.delete({ where: { id } });
  }
}
