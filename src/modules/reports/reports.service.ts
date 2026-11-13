import { Injectable } from '@nestjs/common';
import { BalanceService } from '../../common/balance.service';
import { D, dayKey, money, parseDay, ZERO } from '../../common/money.util';
import { PrismaService } from '../../common/prisma.service';
import { BudgetsService } from '../budgets/budgets.service';

export interface ReportQuery {
  from?: string;
  to?: string;
  currency?: string;
  accountId?: string;
  month?: string;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balanceService: BalanceService,
    private readonly budgetsService: BudgetsService,
  ) {}

  /**
   * Flujo de caja diario: separa el resultado operativo (ingresos - gastos)
   * del flujo total de caja (incluye desembolsos/abonos de deudas y
   * transferencias entre cuentas propias, que NO son ingreso ni gasto).
   */
  async cashFlow(userId: string, q: ReportQuery) {
    const { from, to, currency, accountIds } = await this.resolveRange(userId, q);
    const txs = await this.prisma.transaction.findMany({
      where: { userId, accountId: { in: accountIds }, date: { gte: parseDay(from), lte: parseDay(to) } },
      orderBy: [{ date: 'asc' }],
    });
    const series = new Map<string, { income: number; expense: number; loanIn: number; loanOut: number }>();
    for (let d = parseDay(from); d <= parseDay(to); d = new Date(d.getTime() + 86_400_000)) {
      series.set(dayKey(d), { income: 0, expense: 0, loanIn: 0, loanOut: 0 });
    }
    for (const t of txs) {
      const entry = series.get(dayKey(t.date));
      if (!entry) continue;
      const amt = Number(D(t.amount));
      if (t.type === 'INCOME') entry.income += amt;
      else if (t.type === 'EXPENSE') entry.expense += amt;
      else if (t.type === 'LOAN_DISBURSEMENT') entry.loanIn += amt;
      else if (t.type === 'DEBT_PAYMENT') entry.loanOut += amt;
    }
    const balances = await this.balanceService.getBalances(userId, await this.accounts(userId, currency, q.accountId), to);
    const closingBalance = (await this.accounts(userId, currency, q.accountId)).reduce(
      (acc, a) => acc.plus(balances.get(a.id) ?? ZERO),
      ZERO,
    );
    const data = Array.from(series.entries()).map(([date, v]) => ({
      date,
      income: money(v.income),
      expense: money(v.expense),
      operatingResult: money(v.income - v.expense),
      loanDisbursements: money(v.loanIn),
      debtPayments: money(v.loanOut),
      netCashFlow: money(v.income - v.expense + v.loanIn - v.loanOut),
    }));
    const totals = data.reduce(
      (acc, d) => ({
        income: acc.income + Number(d.income),
        expense: acc.expense + Number(d.expense),
        loanDisbursements: acc.loanDisbursements + Number(d.loanDisbursements),
        debtPayments: acc.debtPayments + Number(d.debtPayments),
        netCashFlow: acc.netCashFlow + Number(d.netCashFlow),
      }),
      { income: 0, expense: 0, loanDisbursements: 0, debtPayments: 0, netCashFlow: 0 },
    );
    return {
      period: { from, to },
      currency,
      totals: {
        income: money(totals.income),
        expense: money(totals.expense),
        operatingResult: money(totals.income - totals.expense),
        loanDisbursements: money(totals.loanDisbursements),
        debtPayments: money(totals.debtPayments),
        netCashFlow: money(totals.netCashFlow),
      },
      closingBalanceAtPeriodEnd: money(closingBalance),
      note:
        'closingBalanceAtPeriodEnd es el saldo al cierre del período (fecha de referencia: to). El saldo actual está en GET /dashboard (balanceAsOf). Los préstamos afectan caja pero no el resultado operativo.',
      series: data,
    };
  }

  async expensesByCategory(userId: string, q: ReportQuery) {
    const { from, to, currency, accountIds } = await this.resolveRange(userId, q);
    const rows = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: {
        userId,
        type: 'EXPENSE',
        currency,
        accountId: { in: accountIds },
        date: { gte: parseDay(from), lte: parseDay(to) },
      },
      _sum: { amount: true },
    });
    const categoryIds = rows.map((r) => r.categoryId).filter((x): x is string => x !== null);
    const categories = await this.prisma.category.findMany({ where: { userId, id: { in: categoryIds } } });
    const names = new Map(categories.map((c) => [c.id, c.name]));
    const total = rows.reduce((acc, r) => acc.plus(r._sum.amount ?? 0), ZERO);
    return {
      period: { from, to },
      currency,
      total: money(total),
      items: rows
        .map((r) => ({
          categoryId: r.categoryId,
          name: r.categoryId ? names.get(r.categoryId) ?? 'Sin categoría' : 'Sin categoría',
          amount: money(r._sum.amount ?? 0),
          pct: total.gt(0) ? D(r._sum.amount ?? 0).div(total).times(100).toFixed(2) : '0.00',
        }))
        .sort((a, b) => (a.amount < b.amount ? 1 : -1)),
    };
  }

  async budgetPerformance(userId: string, q: ReportQuery) {
    const month = q.month ?? new Date().toISOString().slice(0, 7);
    const currency = q.currency ?? (await this.prisma.user.findUniqueOrThrow({ where: { id: userId } })).mainCurrency;
    const monthStart = parseDay(`${month}-01`);
    const budgets = await this.prisma.budget.findMany({
      where: { userId, currency, month: monthStart },
      include: { category: { select: { name: true } } },
    });
    const spent = await this.budgetsService.spentForBudgets(userId, budgets);
    const items = budgets.map((b) => {
      const amount = D(b.amount);
      const spentVal = D(spent.get(b.id) ?? '0');
      return {
        budgetId: b.id,
        categoryName: b.category?.name ?? null,
        month,
        currency,
        amount: money(amount),
        spent: money(spentVal),
        remaining: money(amount.minus(spentVal)),
        pct: amount.gt(0) ? spentVal.div(amount).times(100).toFixed(2) : '0.00',
        exceeded: spentVal.gt(amount),
      };
    });
    return { month, currency, items };
  }

  private async accounts(userId: string, currency: string, accountId?: string) {
    return this.prisma.account.findMany({
      where: { userId, currency, archived: false, ...(accountId ? { id: accountId } : {}) },
    });
  }

  private async resolveRange(userId: string, q: ReportQuery) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: user.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const from = q.from ?? `${today.slice(0, 7)}-01`;
    const to = q.to ?? today;
    const currency = q.currency ?? user.mainCurrency;
    const accounts = await this.accounts(userId, currency, q.accountId);
    return { from, to, currency, accountIds: accounts.map((a) => a.id) };
  }
}
