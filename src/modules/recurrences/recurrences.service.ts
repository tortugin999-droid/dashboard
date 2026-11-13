import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Frequency, Prisma, Recurrence } from '@prisma/client';
import { dayKey, D, money } from '../../common/money.util';
import { PrismaService } from '../../common/prisma.service';
import { CreateRecurrenceDto, UpdateRecurrenceDto } from './dto/recurrence.dto';
import { occurrencesBetween } from './recurrence-dates';

export function recurrenceDto(r: Recurrence & { account?: { name: string }; category?: { name: string } | null }) {
  return {
    id: r.id,
    accountId: r.accountId,
    categoryId: r.categoryId,
    accountName: r.account?.name ?? null,
    categoryName: r.category?.name ?? null,
    description: r.description,
    direction: r.direction,
    frequency: r.frequency,
    amount: money(r.amount),
    currency: r.currency,
    startDate: dayKey(r.startDate),
    endDate: r.endDate ? dayKey(r.endDate) : null,
    monthlyDay1: r.monthlyDay1,
    monthlyDay2: r.monthlyDay2,
    active: r.active,
    lastGeneratedDate: r.lastGeneratedDate ? dayKey(r.lastGeneratedDate) : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

@Injectable()
export class RecurrencesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, query: object, pagination: { skip: number; take: number }) {
    const q = query as Record<string, any>;
    const where: Prisma.RecurrenceWhereInput = {
      userId,
      ...(q.active === undefined ? {} : { active: q.active as boolean }),
      ...(q.currency ? { currency: q.currency } : {}),
      ...(q.accountId ? { accountId: q.accountId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.recurrence.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: pagination.skip,
        take: pagination.take,
        include: { account: { select: { name: true } }, category: { select: { name: true } } },
      }),
      this.prisma.recurrence.count({ where }),
    ]);
    return { rows: rows.map((r) => recurrenceDto(r)), total };
  }

  async getOwned(userId: string, id: string): Promise<Recurrence> {
    const r = await this.prisma.recurrence.findFirst({ where: { id, userId } });
    if (!r) throw new NotFoundException('Programación no encontrada.');
    return r;
  }

  async create(userId: string, dto: CreateRecurrenceDto) {
    const account = await this.prisma.account.findFirst({ where: { id: dto.accountId, userId } });
    if (!account) throw new NotFoundException('Cuenta no encontrada o no pertenece al usuario.');
    if (dto.categoryId) {
      const cat = await this.prisma.category.findFirst({ where: { id: dto.categoryId, userId } });
      if (!cat) throw new NotFoundException('Categoría no encontrada o no pertenece al usuario.');
    }
    if (dto.frequency === Frequency.TWICE_MONTHLY && !dto.monthlyDay1) {
      throw new BadRequestException('TWICE_MONTHLY requiere monthlyDay1 (y opcionalmente monthlyDay2).');
    }
    if (dto.endDate && dto.endDate < dto.startDate) {
      throw new BadRequestException('endDate no puede ser anterior a startDate.');
    }
    return this.prisma.recurrence.create({
      data: {
        userId,
        accountId: account.id,
        categoryId: dto.categoryId ?? null,
        description: dto.description.trim(),
        direction: dto.direction,
        frequency: dto.frequency,
        amount: D(dto.amount).toFixed(4),
        currency: account.currency,
        startDate: new Date(`${dto.startDate}T00:00:00.000Z`),
        endDate: dto.endDate ? new Date(`${dto.endDate}T00:00:00.000Z`) : null,
        monthlyDay1: dto.monthlyDay1 ?? null,
        monthlyDay2: dto.monthlyDay2 ?? null,
        active: dto.active ?? true,
      },
    });
  }

  /**
   * Los cambios afectan SOLO a ocurrencias futuras: no se modifican ni
   * eliminan obligaciones ya generadas ni movimientos pagados.
   */
  async update(userId: string, id: string, dto: UpdateRecurrenceDto) {
    await this.getOwned(userId, id);
    return this.prisma.recurrence.update({
      where: { id },
      data: {
        ...(dto.description !== undefined ? { description: dto.description.trim() } : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        ...(dto.amount !== undefined ? { amount: D(dto.amount).toFixed(4) } : {}),
        ...(dto.endDate !== undefined ? { endDate: dto.endDate ? new Date(`${dto.endDate}T00:00:00.000Z`) : null } : {}),
        ...(dto.monthlyDay1 !== undefined ? { monthlyDay1: dto.monthlyDay1 } : {}),
        ...(dto.monthlyDay2 !== undefined ? { monthlyDay2: dto.monthlyDay2 } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
  }

  /**
   * Genera obligaciones concretas de forma idempotente hasta `through`
   * (inclusive). La restricción única (recurrenceId, dueDate) impide
   * duplicar la misma ocurrencia; repetir la llamada no crea duplicados.
   */
  async generate(userId: string, id: string, through: string) {
    const recurrence = await this.getOwned(userId, id);
    if (!recurrence.active) {
      throw new BadRequestException('La programación está inactiva.');
    }
    const from = recurrence.lastGeneratedDate
      ? dayKey(new Date(recurrence.lastGeneratedDate.getTime() + 86_400_000))
      : dayKey(recurrence.startDate);
    if (through < from) {
      return { recurrenceId: recurrence.id, created: 0, through };
    }
    const dates = Array.from(
      occurrencesBetween(
        {
          frequency: recurrence.frequency,
          startDate: dayKey(recurrence.startDate),
          endDate: recurrence.endDate ? dayKey(recurrence.endDate) : null,
          monthlyDay1: recurrence.monthlyDay1,
          monthlyDay2: recurrence.monthlyDay2,
        },
        from,
        through,
      ),
    );
    if (dates.length === 0) {
      await this.prisma.recurrence.update({
        where: { id: recurrence.id },
        data: { lastGeneratedDate: new Date(`${through}T00:00:00.000Z`) },
      });
      return { recurrenceId: recurrence.id, created: 0, through };
    }
    const created = await this.prisma.$transaction(async (tx) => {
      let count = 0;
      for (const date of dates) {
        const res = await tx.obligation.createMany({
          data: {
            userId,
            recurrenceId: recurrence.id,
            accountId: recurrence.accountId,
            categoryId: recurrence.categoryId,
            description: recurrence.description,
            direction: recurrence.direction,
            amount: recurrence.amount,
            dueDate: new Date(`${date}T00:00:00.000Z`),
            status: 'PENDING',
          },
          skipDuplicates: true,
        });
        count += res.count;
      }
      await tx.recurrence.update({
        where: { id: recurrence.id },
        data: { lastGeneratedDate: new Date(`${through}T00:00:00.000Z`) },
      });
      return count;
    });
    return { recurrenceId: recurrence.id, created, through };
  }

  /** Genera ocurrencias de todas las programaciones activas del usuario. */
  async generateAll(userId: string, through: string) {
    const recurrences = await this.prisma.recurrence.findMany({ where: { userId, active: true } });
    const results = [];
    for (const r of recurrences) {
      try {
        results.push(await this.generate(userId, r.id, through));
      } catch {
        results.push({ recurrenceId: r.id, created: 0, through, error: true });
      }
    }
    return results;
  }
}
