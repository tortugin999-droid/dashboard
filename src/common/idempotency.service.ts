import { ConflictException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

export interface IdempotentResult<T> {
  value: T;
  replayed: boolean;
}

/**
 * Claves de idempotencia por usuario y operación. Si la misma clave se repite
 * con un cuerpo distinto se rechaza con 409; si el cuerpo es idéntico se
 * devuelve la respuesta guardada sin reejecutar la operación.
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  hashRequest(userId: string, endpoint: string, payload: unknown): string {
    return createHash('sha256')
      .update(`${userId}|${endpoint}|${JSON.stringify(payload ?? null)}`)
      .digest('hex');
  }

  async findReplay<T>(
    userId: string,
    key: string,
    requestHash: string,
  ): Promise<IdempotentResult<T> | null> {
    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { userId_key: { userId, key } },
    });
    if (!existing) return null;
    if (existing.requestHash !== requestHash) {
      throw new ConflictException(
        'La Idempotency-Key ya fue usada con una petición distinta.',
      );
    }
    return { value: existing.responseBody as T, replayed: true };
  }

  /** Ejecuta `fn` dentro de la transacción tx registrando la clave. */
  async withIdempotency<T>(
    tx: Prisma.TransactionClient,
    userId: string,
    key: string,
    endpoint: string,
    requestHash: string,
    fn: () => Promise<T>,
  ): Promise<IdempotentResult<T>> {
    const existing = await tx.idempotencyKey.findUnique({
      where: { userId_key: { userId, key } },
    });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictException(
          'La Idempotency-Key ya fue usada con una petición distinta.',
        );
      }
      return { value: existing.responseBody as T, replayed: true };
    }
    const value = await fn();
    await tx.idempotencyKey.create({
      data: { userId, key, endpoint, requestHash, responseBody: value as object, statusCode: 201 },
    });
    return { value, replayed: false };
  }
}
