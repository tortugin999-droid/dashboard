import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BalanceService } from '../../common/balance.service';
import { D, dayKey, Dec, money, parseDay, todayInTz, ZERO } from '../../common/money.util';
import { PrismaService } from '../../common/prisma.service';
import { BudgetsService } from '../budgets/budgets.service';
import { buildInsights, Insight, InsightInput } from './insights.rules';

export interface DashboardQuery {
  from?: string;
  to?: string;
  currency?: string;
  accountId?: string;
  commitmentsThrough?: string;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balanceService: BalanceService,
    private readonly budgetsService: BudgetsService,
  ) {}

  async build(userId: string, tz: string, mainCurrency: string, q: DashboardQuery) {
    const today = todayInTz(tz);
    const from = q.from ?? `${today.slice(0, 7)}-01`;
    const to = q.to ?? dayKey(new Date(Date.UTC(
      Number(today.slice(0, 4)),
      Number(today.slice(5, 7)) - 1 + 1,
      0,
    )));
    if (from > to) throw new Error('from debe ser <= to');
    const currency = q.currency ?? mainCurrency;
    const commitmentsThrough = q.commitmentsThrough ?? to;

    const accounts = await this.prisma.account.findMany({
      where: {
        userId,
        currency,
        archived: false,
        ...(q.accountId ? { id: q.accountId } : {}),
      },
    });
    const accountIds = accounts.map((a) => a.id);

    const [balances, periodTxs, obligations, goals, budgets] = await Promise.all([
      this.balanceService.getBalances(userId, accounts, today),
      this.prisma.transaction.findMany({
        where: {
          userId,
          accountId: { in: accountIds },
          date: { gte: parseDay(from), lte: parseDay(to) },
        },
        include: { category: { select: { name: true } } },
        orderBy: [{ date: 'asc' }],
      }),
      this.prisma.obligation.findMany({
        where: {
          userId,
          direction: 'PAYABLE',
          status: { in: ['PENDING', 'PARTIALLY_PAID'] },
          account: { currency, userId },
          dueDate: { lte: parseDay(commitmentsThrough) },
        },
        include: { account: { select: { name: true, currency: true } } },
        orderBy: [{ dueDate: 'asc' }],
      }),
      this.prisma.savingsGoal.findMany({ where: { userId, currency, status: 'ACTIVE' } }),
      this.prisma.budget.findMany({
        where: {
          userId,
          currency,
          month: { gte: parseDay(`${from.slice(0, 7)}-01`), lte: parseDay(to) },
        },
        include: { category: { select: { name: true } } },
      }),
    ]);

    const currentBalance = accounts.reduce((acc, a) => acc.plus(balances.get(a.id) ?? ZERO), ZERO);

    let incomeReceived = ZERO;
    let expensesPaid = ZERO;
    let debtServiceInPeriod = ZERO;
    for (const t of periodTxs) {
      const amt = D(t.amount);
      if (t.type === 'INCOME') incomeReceived = incomeReceived.plus(amt);
      else if (t.type === 'EXPENSE') expensesPaid = expensesPaid.plus(amt);
      else if (t.type === 'DEBT_PAYMENT') debtServiceInPeriod = debtServiceInPeriod.plus(amt);
    }
    // Los intereses y cargos de deudas pagadas en el período cuentan como gasto;
    // el abono a capital no (es reducción de deuda, no gasto).
    const debtPaymentIds = periodTxs.filter((t) => t.type === 'DEBT_PAYMENT' && t.debtPaymentId).map((t) => t.debtPaymentId as string);
    if (debtPaymentIds.length > 0) {
      const dps = await this.prisma.debtPayment.findMany({ where: { id: { in: debtPaymentIds } } });
      for (const p of dps) {
        expensesPaid = expensesPaid.plus(D(p.interestAmount)).plus(D(p.feeAmount));
      }
    }

    const pendingObligations = obligations.reduce(
      (acc, o) => acc.plus(D(o.amount).minus(D(o.paidAmount))),
      ZERO,
    );

    const reservedSavings = goals.reduce((acc, g) => {
      const remaining = D(g.targetAmount).minus(D(g.savedAmount));
      return acc.plus(remaining.gt(0) ? remaining : ZERO);
    }, ZERO);

    const availableAfterCommitments = currentBalance.minus(pendingObligations).minus(reservedSavings);

    const [balanceSeries, previousPeriodExpenses] = await Promise.all([
      this.balanceService.balanceSeries(userId, accounts, from, to),
      this.previousPeriodExpenses(userId, accountIds, from, to, today),
    ]);

    const incomeExpenseSeries = this.groupByDay(periodTxs, from, to);
    const expensesByCategory = this.expensesByCategory(periodTxs);

    const budgetProgress = await this.budgetProgress(userId, budgets);

    const upcoming = await this.prisma.obligation.findMany({
      where: {
        userId,
        direction: 'PAYABLE',
        status: { in: ['PENDING', 'PARTIALLY_PAID'] },
        account: { currency, userId },
        dueDate: { gte: parseDay(today), lte: parseDay(commitmentsThrough) },
      },
      include: { account: { select: { name: true, currency: true } } },
      orderBy: [{ dueDate: 'asc' }],
      take: 10,
    });

    const debts = await this.prisma.debt.findMany({
      where: { userId, currency, status: 'ACTIVE' },
      orderBy: [{ createdAt: 'asc' }],
    });

    const upcomingForRules = upcoming.map((o) => ({
      id: o.id,
      description: o.description,
      dueDate: dayKey(o.dueDate),
      remaining: money(D(o.amount).minus(D(o.paidAmount))),
      accountId: o.accountId,
      accountBalance: money(balances.get(o.accountId) ?? ZERO),
    }));

    const periodDays = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1);
    const daysToCommitments = Math.max(0, Math.round((Date.parse(commitmentsThrough) - Date.parse(today)) / 86_400_000) + 1);
    const dailyAvgExpense = expensesPaid.div(periodDays);

    const insightInput: InsightInput = {
      currency,
      period: { from, to },
      commitmentsThrough,
      today,
      currentBalance: money(currentBalance),
      pendingObligations: money(pendingObligations),
      reservedSavings: money(reservedSavings),
      availableAfterCommitments: money(availableAfterCommitments),
      expensesPaid: money(expensesPaid),
      previousPeriodExpenses,
      budgets: budgetProgress.map((b) => ({ id: b.budgetId, name: b.categoryName, month: b.month, amount: b.amount, spent: b.spent })),
      upcoming: upcomingForRules,
      dailyAvgExpense: money(dailyAvgExpense),
      daysToCommitments,
    };
    const insights: Insight[] = buildInsights(insightInput);

    return {
      period: { from, to },
      currency,
      asOf: new Date().toISOString(),
      balanceAsOf: today,
      commitmentsThrough,
      summary: {
        incomeReceived: money(incomeReceived),
        expensesPaid: money(expensesPaid),
        periodResult: money(incomeReceived.minus(expensesPaid)),
        currentBalance: money(currentBalance),
        pendingObligations: money(pendingObligations),
        reservedSavings: money(reservedSavings),
        availableAfterCommitments: money(availableAfterCommitments),
      },
      balanceSeries,
      incomeExpenseSeries,
      expensesByCategory,
      budgetProgress,
      upcomingObligations: upcomingForRules,
      debtSummary: debts.map((d) => ({
        id: d.id,
        counterparty: d.counterparty,
        direction: d.direction,
        currency: d.currency,
        originalPrincipal: money(d.originalPrincipal),
        remainingPrincipal: money(d.remainingPrincipal),
        dueDate: d.dueDate ? dayKey(d.dueDate) : null,
      })),
      insights,
    };
  }

  private groupByDay(
    txs: (Prisma.TransactionGetPayload<{ include: { category: { select: { name: true } } } }>)[],
    from: string,
    to: string,
  ) {
    const byDay = new Map<string, { income: Dec; expense: Dec }>();
    let cursor = parseDay(from);
    const end = parseDay(to);
    while (cursor <= end) {
      byDay.set(dayKey(cursor), { income: ZERO, expense: ZERO });
      cursor = new Date(cursor.getTime() + 86_400_000);
    }
    for (const t of txs) {
      const key = dayKey(t.date);
      const entry = byDay.get(key);
      if (!entry) continue;
      if (t.type === 'INCOME') entry.income = entry.income.plus(D(t.amount));
      if (t.type === 'EXPENSE') entry.expense = entry.expense.plus(D(t.amount));
    }
    return Array.from(byDay.entries()).map(([date, v]) => ({
      date,
      income: money(v.income),
      expense: money(v.expense),
    }));
  }

  private expensesByCategory(
    txs: (Prisma.TransactionGetPayload<{ include: { category: { select: { name: true } } } }>)[],
  ) {
    const byCat = new Map<string, { name: string; total: Dec }>();
    let totalAll = ZERO;
    for (const t of txs) {
      if (t.type !== 'EXPENSE') continue;
      const key = t.categoryId ?? 'sin-categoria';
      const entry = byCat.get(key) ?? { name: t.category?.name ?? 'Sin categoría', total: ZERO };
      entry.total = entry.total.plus(D(t.amount));
      byCat.set(key, entry);
      totalAll = totalAll.plus(D(t.amount));
    }
    return Array.from(byCat.entries())
      .map(([categoryId, v]) => ({
        categoryId,
        name: v.name,
        amount: money(v.total),
        pct: totalAll.gt(0) ? v.total.div(totalAll).times(100).toFixed(2) : '0.00',
      }))
      .sort((a, b) => (a.amount < b.amount ? 1 : -1));
  }

  private async budgetProgress(
    userId: string,
    budgets: Prisma.BudgetGetPayload<{ include: { category: { select: { name: true } } } }>[],
  ) {
    if (budgets.length === 0) return [];
    const spent = await this.budgetsService.spentForBudgets(userId, budgets);
    return budgets.map((b) => {
      const amount = D(b.amount);
      const spentVal = D(spent.get(b.id) ?? '0');
      return {
        budgetId: b.id,
        budgetName: b.category?.name ?? null,
        categoryName: b.category?.name ?? null,
        month: b.month.toISOString().slice(0, 7),
        amount: money(amount),
        spent: money(spentVal),
        remaining: money(amount.minus(spentVal)),
        pct: amount.gt(0) ? spentVal.div(amount).times(100).toFixed(2) : '0.00',
      };
    });
  }

  private async previousPeriodExpenses(
    userId: string,
    accountIds: string[],
    from: string,
    to: string,
    today: string,
  ) {
    const days = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
    const prevTo = dayKey(new Date(parseDay(from).getTime() - 86_400_000));
    const prevFrom = dayKey(new Date(parseDay(prevTo).getTime() - (days - 1) * 86_400_000));
    const agg = await this.prisma.transaction.aggregate({
      where: {
        userId,
        accountId: { in: accountIds },
        type: 'EXPENSE',
        date: { gte: parseDay(prevFrom), lte: parseDay(prevTo) },
      },
      _sum: { amount: true },
    });
    return {
      from: prevFrom,
      to: prevTo,
      total: money(agg._sum.amount ?? 0),
      complete: prevTo < today,
    };
  }
}
