import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { IdempotencyService } from '../../common/idempotency.service';
import { D, dayKey, money } from '../../common/money.util';
import { PrismaService } from '../../common/prisma.service';
import { CreateTransferDto } from './dto/transfer.dto';

export function transferDto(t: {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: Prisma.Decimal;
  currency: string;
  date: Date;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: t.id,
    fromAccountId: t.fromAccountId,
    toAccountId: t.toAccountId,
    amount: money(t.amount),
    currency: t.currency,
    date: dayKey(t.date),
    description: t.description,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
  ) {}

  /**
   * Transferencia atómica entre cuentas propias de la misma moneda.
   * Genera dos movimientos (TRANSFER_OUT / TRANSFER_IN) que no cuentan como
   * ingreso ni gasto. Idempotente mediante Idempotency-Key.
   */
  async create(
    userId: string,
    dto: CreateTransferDto,
    idempotencyKey: string | undefined,
  ): Promise<{ body: ReturnType<typeof transferDto>; replayed: boolean }> {
    if (dto.fromAccountId === dto.toAccountId) {
      throw new BadRequestException('Las cuentas de origen y destino deben ser distintas.');
    }
    const amount = D(dto.amount);
    if (amount.lte(0)) throw new BadRequestException('El importe debe ser mayor que cero.');
    const key = idempotencyKey ?? randomUUID();
    const requestHash = this.idempotency.hashRequest(userId, 'POST /transfers', dto);

    const result = await this.prisma.$transaction((tx) =>
      this.idempotency.withIdempotency(tx, userId, key, 'POST /transfers', requestHash, async () => {
        const accounts = await tx.account.findMany({
          where: { userId, id: { in: [dto.fromAccountId, dto.toAccountId] } },
        });
        const from = accounts.find((a) => a.id === dto.fromAccountId);
        const to = accounts.find((a) => a.id === dto.toAccountId);
        if (!from || !to) throw new NotFoundException('Cuenta de origen o destino no encontrada.');
        if (from.archived || to.archived) {
          throw new BadRequestException('No se puede transferir con cuentas archivadas.');
        }
        if (from.currency !== to.currency) {
          throw new BadRequestException(
            `Transferencias entre monedas distintas no están soportadas todavía (${from.currency} → ${to.currency}). Se requiere conversión explícita.`,
          );
        }
        const date = new Date(`${dto.date}T00:00:00.000Z`);
        const transfer = await tx.transfer.create({
          data: {
            userId,
            fromAccountId: from.id,
            toAccountId: to.id,
            amount: amount.toFixed(4),
            currency: from.currency,
            date,
            description: dto.description?.trim() || null,
          },
        });
        await tx.transaction.createMany({
          data: [
            {
              userId,
              accountId: from.id,
              type: 'TRANSFER_OUT',
              amount: amount.toFixed(4),
              currency: from.currency,
              date,
              description: dto.description?.trim() || `Transferencia a cuenta ${to.name}`,
              transferId: transfer.id,
            },
            {
              userId,
              accountId: to.id,
              type: 'TRANSFER_IN',
              amount: amount.toFixed(4),
              currency: to.currency,
              date,
              description: dto.description?.trim() || `Transferencia desde cuenta ${from.name}`,
              transferId: transfer.id,
            },
          ],
        });
        return transferDto(transfer);
      }),
    );
    return { body: result.value, replayed: result.replayed };
  }
}
