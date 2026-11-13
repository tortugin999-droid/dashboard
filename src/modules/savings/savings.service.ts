import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SavingsGoal } from '@prisma/client';
import { dayKey, D, money } from '../../common/money.util';
import { PrismaService } from '../../common/prisma.service';
import { CreateAllocationDto, CreateSavingsGoalDto, UpdateSavingsGoalDto } from './dto/savings.dto';

export function goalDto(g: SavingsGoal) {
  const saved = D(g.savedAmount);
  const target = D(g.targetAmount);
  return {
    id: g.id,
    name: g.name,
    currency: g.currency,
    targetAmount: money(target),
    savedAmount: money(saved),
    remaining: money(target.minus(saved).gt(0) ? target.minus(saved) : 0),
    progressPct: target.gt(0) ? saved.div(target).times(100).toFixed(2) : '0.00',
    deadline: g.deadline ? dayKey(g.deadline) : null,
    status: g.status,
    note: g.note,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
  };
}

@Injectable()
export class SavingsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, query: object, pagination: { skip: number; take: number }) {
    const q = query as Record<string, any>;
    const where: Prisma.SavingsGoalWhereInput = {
      userId,
      ...(q.status ? { status: q.status } : {}),
      ...(q.currency ? { currency: q.currency } : {}),
      ...(q.search ? { name: { contains: q.search, mode: 'insensitive' as const } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.savingsGoal.findMany({ where, orderBy: [{ createdAt: 'asc' }], skip: pagination.skip, take: pagination.take }),
      this.prisma.savingsGoal.count({ where }),
    ]);
    return { rows: rows.map(goalDto), total };
  }

  async getOwned(userId: string, id: string): Promise<SavingsGoal> {
    const g = await this.prisma.savingsGoal.findFirst({ where: { id, userId } });
    if (!g) throw new NotFoundException('Meta de ahorro no encontrada.');
    return g;
  }

  async create(userId: string, dto: CreateSavingsGoalDto) {
    if (D(dto.targetAmount).lte(0)) throw new BadRequestException('El monto objetivo debe ser mayor que cero.');
    return this.prisma.savingsGoal.create({
      data: {
        userId,
        name: dto.name.trim(),
        currency: dto.currency,
        targetAmount: D(dto.targetAmount).toFixed(4),
        deadline: dto.deadline ? new Date(`${dto.deadline}T00:00:00.000Z`) : null,
        note: dto.note?.trim() || null,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateSavingsGoalDto) {
    await this.getOwned(userId, id);
    return this.prisma.savingsGoal.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.targetAmount !== undefined ? { targetAmount: D(dto.targetAmount).toFixed(4) } : {}),
        ...(dto.deadline !== undefined ? { deadline: dto.deadline ? new Date(`${dto.deadline}T00:00:00.000Z`) : null } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.note !== undefined ? { note: dto.note?.trim() || null } : {}),
      },
    });
  }

  /**
   * Reserva una cantidad para la meta. Es una asignación virtual: reduce el
   * disponible después de compromisos pero NO es un gasto ni mueve cuentas,
   * por lo que nunca se descuenta dos veces.
   */
  async allocate(userId: string, goalId: string, dto: CreateAllocationDto) {
    const amount = D(dto.amount);
    if (amount.lte(0)) throw new BadRequestException('El importe debe ser mayor que cero.');
    return this.prisma.$transaction(async (tx) => {
      const goal = await tx.savingsGoal.findFirst({ where: { id: goalId, userId } });
      if (!goal) throw new NotFoundException('Meta de ahorro no encontrada.');
      if (goal.status === 'ARCHIVED') throw new BadRequestException('La meta está archivada.');
      const allocation = await tx.savingsAllocation.create({
        data: {
          userId,
          goalId: goal.id,
          amount: amount.toFixed(4),
          date: new Date(`${dto.date}T00:00:00.000Z`),
          note: dto.note?.trim() || null,
        },
      });
      const saved = D(goal.savedAmount).plus(amount);
      await tx.savingsGoal.update({
        where: { id: goal.id },
        data: {
          savedAmount: saved.toFixed(4),
          ...(saved.gte(D(goal.targetAmount)) && goal.status === 'ACTIVE' ? { status: 'ACHIEVED' as const } : {}),
        },
      });
      return {
        id: allocation.id,
        goalId: goal.id,
        amount: money(allocation.amount),
        date: dayKey(allocation.date),
        note: allocation.note,
        goalSavedAmount: money(saved),
      };
    });
  }

  async listAllocations(userId: string, goalId: string) {
    await this.getOwned(userId, goalId);
    const rows = await this.prisma.savingsAllocation.findMany({
      where: { userId, goalId },
      orderBy: [{ date: 'asc' }],
    });
    return rows.map((a) => ({
      id: a.id,
      goalId: a.goalId,
      amount: money(a.amount),
      date: dayKey(a.date),
      note: a.note,
      createdAt: a.createdAt.toISOString(),
    }));
  }
}
