import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Budget, Prisma } from '@prisma/client';
import { D, money, parseMonth } from '../../common/money.util';
import { PrismaService } from '../../common/prisma.service';
import { CreateBudgetDto, UpdateBudgetDto } from './dto/budget.dto';

export function budgetDto(b: Budget & { category?: { name: string } }) {
  return {
    id: b.id,
    categoryId: b.categoryId,
    categoryName: b.category?.name ?? null,
    currency: b.currency,
    month: dayOfMonth(b.month),
    amount: money(b.amount),
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

const dayOfMonth = (d: Date) => d.toISOString().slice(0, 7);

@Injectable()
export class BudgetsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, query: object, pagination: { skip: number; take: number }) {
    const q = query as Record<string, any>;
    const where: Prisma.BudgetWhereInput = {
      userId,
      ...(q.month ? { month: parseMonth(q.month as string) } : {}),
      ...(q.currency ? { currency: q.currency } : {}),
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.budget.findMany({
        where,
        orderBy: [{ month: 'desc' }],
        skip: pagination.skip,
        take: pagination.take,
        include: { category: { select: { name: true } } },
      }),
      this.prisma.budget.count({ where }),
    ]);
    return { rows: rows.map((b) => budgetDto(b)), total };
  }

  async create(userId: string, dto: CreateBudgetDto, mainCurrency: string) {
    const category = await this.prisma.category.findFirst({ where: { id: dto.categoryId, userId } });
    if (!category) throw new NotFoundException('Categoría no encontrada o no pertenece al usuario.');
    if (category.kind !== 'EXPENSE') {
      throw new ConflictException('Los presupuestos aplican a categorías de gasto.');
    }
    if (D(dto.amount).lte(0)) throw new ConflictException('El importe debe ser mayor que cero.');
    const exists = await this.prisma.budget.findFirst({
      where: { userId, categoryId: dto.categoryId, month: parseMonth(dto.month) },
    });
    if (exists) throw new ConflictException('Ya existe un presupuesto para esa categoría y mes.');
    return this.prisma.budget.create({
      data: {
        userId,
        categoryId: dto.categoryId,
        currency: dto.currency ?? mainCurrency,
        month: parseMonth(dto.month),
        amount: D(dto.amount).toFixed(4),
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateBudgetDto) {
    const budget = await this.prisma.budget.findFirst({ where: { id, userId } });
    if (!budget) throw new NotFoundException('Presupuesto no encontrado.');
    return this.prisma.budget.update({
      where: { id },
      data: {
        ...(dto.amount !== undefined ? { amount: D(dto.amount).toFixed(4) } : {}),
        ...(dto.month !== undefined ? { month: parseMonth(dto.month) } : {}),
      },
    });
  }

  /** Gasto real por presupuesto en el mes y moneda del presupuesto. */
  async spentForBudgets(userId: string, budgets: Budget[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    for (const b of budgets) {
      const agg = await this.prisma.transaction.aggregate({
        where: {
          userId,
          categoryId: b.categoryId,
          currency: b.currency,
          type: 'EXPENSE',
          date: { gte: new Date(`${b.month.toISOString().slice(0, 7)}-01T00:00:00.000Z`), lt: nextMonthStart(b.month) },
        },
        _sum: { amount: true },
      });
      result.set(b.id, money(agg._sum.amount ?? 0));
    }
    return result;
  }
}

function nextMonthStart(month: Date): Date {
  const y = month.getUTCFullYear();
  const m = month.getUTCMonth();
  return new Date(Date.UTC(m === 11 ? y + 1 : y, m === 11 ? 0 : m + 1, 1));
}
