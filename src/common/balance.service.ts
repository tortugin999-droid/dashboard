import { Injectable } from '@nestjs/common';
import { Prisma, TransactionType } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { D, dayKey, Dec, ZERO, parseDay } from './money.util';

// Las piernas TRANSFER_IN/TRANSFER_OUT no suman saldo: el efecto de una
// transferencia lo aporta una sola vez la fila Transfer.
const SIGNED_TYPES: Record<TransactionType, 1 | -1 | 0> = {
  INCOME: 1,
  LOAN_DISBURSEMENT: 1,
  EXPENSE: -1,
  DEBT_PAYMENT: -1,
  TRANSFER_IN: 0,
  TRANSFER_OUT: 0,
};

export interface Movement {
  accountId: string;
  date: string;
  signed: Dec;
}

/**
 * Semántica del saldo: initialBalance es el saldo de la cuenta en
 * initialBalanceDate. Solo se cuentan movimientos con date >= initialBalanceDate;
 * un movimiento anterior a esa fecha se rechaza al crearse.
 */
@Injectable()
export class BalanceService {
  constructor(private readonly prisma: PrismaService) {}

  async loadMovements(
    userId: string,
    accountIds: string[],
  ): Promise<Movement[]> {
    if (accountIds.length === 0) return [];
    const [txs, transfers] = await Promise.all([
      this.prisma.transaction.findMany({
        where: { userId, accountId: { in: accountIds } },
        select: { accountId: true, date: true, type: true, amount: true },
      }),
      this.prisma.transfer.findMany({
        where: { userId, OR: [{ fromAccountId: { in: accountIds } }, { toAccountId: { in: accountIds } }] },
        select: { fromAccountId: true, toAccountId: true, date: true, amount: true },
      }),
    ]);
    const movements: Movement[] = [];
    for (const t of txs) {
      const sign = SIGNED_TYPES[t.type];
      if (sign === 0) continue;
      movements.push({
        accountId: t.accountId,
        date: dayKey(t.date),
        signed: sign > 0 ? D(t.amount) : D(t.amount).neg(),
      });
    }
    for (const t of transfers) {
      const a = D(t.amount);
      movements.push({ accountId: t.fromAccountId, date: dayKey(t.date), signed: a.neg() });
      movements.push({ accountId: t.toAccountId, date: dayKey(t.date), signed: a });
    }
    return movements;
  }

  /**
   * Saldos por cuenta hasta `asOf` (inclusive). Si asOf es null, usa todos
   * los movimientos registrados (saldo "actual" completo).
   */
  async getBalances(
    userId: string,
    accounts: { id: string; initialBalance: Prisma.Decimal; initialBalanceDate: Date }[],
    asOf?: string,
  ): Promise<Map<string, Dec>> {
    const balances = new Map<string, Dec>();
    for (const a of accounts) balances.set(a.id, D(a.initialBalance));
    const movements = await this.loadMovements(userId, accounts.map((a) => a.id));
    const byAccount = new Map(accounts.map((a) => [a.id, dayKey(a.initialBalanceDate)]));
    for (const m of movements) {
      if (asOf && m.date > asOf) continue;
      const start = byAccount.get(m.accountId);
      if (start === undefined || m.date < start) continue;
      balances.set(m.accountId, (balances.get(m.accountId) ?? ZERO).plus(m.signed));
    }
    return balances;
  }

  /** Serie de saldo diario acumulado entre from y to (inclusive). */
  async balanceSeries(
    userId: string,
    accounts: { id: string; initialBalance: Prisma.Decimal; initialBalanceDate: Date }[],
    from: string,
    to: string,
  ): Promise<{ date: string; balance: string }[]> {
    const movements = await this.loadMovements(userId, accounts.map((a) => a.id));
    movements.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const startByAccount = new Map(accounts.map((a) => [a.id, dayKey(a.initialBalanceDate)]));
    const opening = accounts.reduce((acc, a) => acc.plus(D(a.initialBalance)), ZERO);
    const series: { date: string; balance: string }[] = [];
    let current = opening;
    let cursor = parseDay(from);
    const end = parseDay(to);
    let idx = 0;
    while (cursor <= end) {
      const key = dayKey(cursor);
      while (idx < movements.length && movements[idx].date <= key) {
        const m = movements[idx];
        const start = startByAccount.get(m.accountId);
        if (start === undefined || m.date >= start) current = current.plus(m.signed);
        idx++;
      }
      series.push({ date: key, balance: current.toFixed(2) });
      cursor = new Date(cursor.getTime() + 86_400_000);
    }
    return series;
  }
}

export { SIGNED_TYPES };
