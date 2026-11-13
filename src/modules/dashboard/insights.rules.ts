import { D, Dec, money } from '../../common/money.util';

export type Severity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface InsightInput {
  currency: string;
  period: { from: string; to: string };
  commitmentsThrough: string;
  today: string;
  currentBalance: string;
  pendingObligations: string;
  reservedSavings: string;
  availableAfterCommitments: string;
  expensesPaid: string;
  previousPeriodExpenses?: { from: string; to: string; total: string; complete: boolean } | null;
  budgets: { id: string; name: string; month: string; amount: string; spent: string }[];
  upcoming: { id: string; description: string; dueDate: string; remaining: string; accountId: string; accountBalance: string }[];
  dailyAvgExpense: string;
  daysToCommitments: number;
}

export interface Insight {
  id: string;
  ruleCode: string;
  severity: Severity;
  title: string;
  message: string;
  period: { from: string; to: string };
  evidence: Record<string, unknown>;
}

let seq = 0;
function mkId(ruleCode: string): string {
  seq = (seq + 1) % 1_000_000;
  return `${ruleCode.toLowerCase()}-${Date.now().toString(36)}-${seq}`;
}

/**
 * Reglas transparentes y deterministas (sin IA). Cada insight incluye
 * evidencia numérica. Ninguna salida debe interpretarse como asesoramiento
 * financiero profesional.
 */
export function buildInsights(input: InsightInput): Insight[] {
  const insights: Insight[] = [];
  const balance = D(input.currentBalance);

  // 1. Obligaciones superiores al saldo
  for (const o of input.upcoming) {
    if (D(o.remaining).gt(D(o.accountBalance))) {
      insights.push({
        id: mkId('OBLIGATION_EXCEEDS_BALANCE'),
        ruleCode: 'OBLIGATION_EXCEEDS_BALANCE',
        severity: 'CRITICAL',
        title: 'Una obligación supera el saldo de su cuenta',
        message: `"${o.description}" vence el ${o.dueDate} por ${o.remaining} ${input.currency}, pero la cuenta asociada tiene ${o.accountBalance} ${input.currency}.`,
        period: input.period,
        evidence: {
          obligationId: o.id,
          dueDate: o.dueDate,
          remaining: o.remaining,
          accountBalance: o.accountBalance,
          currency: input.currency,
        },
      });
    }
  }

  // 2. Presupuesto superado / cerca del límite
  for (const b of input.budgets) {
    const amount = D(b.amount);
    const spent = D(b.spent);
    if (amount.lte(0)) continue;
    const pct = spent.div(amount).times(100);
    if (pct.gte(100)) {
      insights.push({
        id: mkId('BUDGET_EXCEEDED'),
        ruleCode: 'BUDGET_EXCEEDED',
        severity: 'CRITICAL',
        title: `Presupuesto superado: ${b.name}`,
        message: `En ${b.month} gastaste ${money(spent)} de ${money(amount)} (${pct.toFixed(0)}%) en "${b.name}".`,
        period: input.period,
        evidence: { budgetId: b.id, category: b.name, month: b.month, amount: money(amount), spent: money(spent), pct: pct.toFixed(2) },
      });
    } else if (pct.gte(80)) {
      insights.push({
        id: mkId('BUDGET_NEAR_LIMIT'),
        ruleCode: 'BUDGET_NEAR_LIMIT',
        severity: 'WARNING',
        title: `Presupuesto cerca del límite: ${b.name}`,
        message: `En ${b.month} llevas ${money(spent)} de ${money(amount)} (${pct.toFixed(0)}%) en "${b.name}".`,
        period: input.period,
        evidence: { budgetId: b.id, category: b.name, month: b.month, amount: money(amount), spent: money(spent), pct: pct.toFixed(2) },
      });
    }
  }

  // 3. Vencimiento cercano (<= 7 días desde hoy)
  const soon = input.upcoming.filter((o) => {
    const days = (Date.parse(o.dueDate) - Date.parse(input.today)) / 86_400_000;
    return days >= 0 && days <= 7 && D(o.remaining).gt(0);
  });
  if (soon.length > 0) {
    const total = soon.reduce((acc, o) => acc.plus(D(o.remaining)), D(0));
    insights.push({
      id: mkId('DUE_SOON'),
      ruleCode: 'DUE_SOON',
      severity: 'WARNING',
      title: `${soon.length} obligación(es) vencen en los próximos 7 días`,
      message: `Vencen ${money(total)} ${input.currency} antes del ${input.commitmentsThrough}.`,
      period: input.period,
      evidence: {
        obligations: soon.map((o) => ({ id: o.id, description: o.description, dueDate: o.dueDate, remaining: o.remaining })),
        total: money(total),
        currency: input.currency,
      },
    });
  }

  // 4. Incremento de gastos frente a un período comparable
  const prev = input.previousPeriodExpenses;
  if (prev && prev.complete) {
    const current = D(input.expensesPaid);
    const previous = D(prev.total);
    if (previous.gt(0)) {
      const changePct = current.minus(previous).div(previous).times(100);
      if (changePct.gte(20)) {
        insights.push({
          id: mkId('SPENDING_INCREASE'),
          ruleCode: 'SPENDING_INCREASE',
          severity: 'WARNING',
          title: 'Los gastos aumentaron respecto al período anterior',
          message: `Gastaste ${money(current)} ${input.currency} entre ${input.period.from} y ${input.period.to}, un ${changePct.toFixed(0)}% más que entre ${prev.from} y ${prev.to} (${money(previous)} ${input.currency}).`,
          period: input.period,
          evidence: {
            currentTotal: money(current),
            previousTotal: money(previous),
            previousPeriod: { from: prev.from, to: prev.to },
            changePct: changePct.toFixed(2),
            currency: input.currency,
          },
        });
      }
    }
  } else if (prev && !prev.complete) {
    insights.push({
      id: mkId('INCOMPLETE_COMPARISON'),
      ruleCode: 'INCOMPLETE_COMPARISON',
      severity: 'INFO',
      title: 'Comparación de períodos incompleta',
      message: `El período de referencia (${prev.from} a ${prev.to}) incluye el día actual o fechas futuras: la comparación de gastos puede estar sesgada.`,
      period: input.period,
      evidence: { previousPeriod: { from: prev.from, to: prev.to }, today: input.today },
    });
  }

  // 5. Proyección con faltante
  const dailyAvg = D(input.dailyAvgExpense);
  if (dailyAvg.gt(0) && input.daysToCommitments > 0) {
    const projected = dailyAvg.times(input.daysToCommitments);
    const available = D(input.availableAfterCommitments);
    if (available.lt(projected)) {
      insights.push({
        id: mkId('PROJECTION_SHORTFALL'),
        ruleCode: 'PROJECTION_SHORTFALL',
        severity: 'CRITICAL',
        title: 'Proyección de gasto con faltante',
        message: `A un ritmo de ${money(dailyAvg)} ${input.currency}/día, proyectamos ${money(projected)} ${input.currency} hasta ${input.commitmentsThrough}, pero el disponible después de compromisos es ${money(available)} ${input.currency}.`,
        period: input.period,
        evidence: {
          dailyAvgExpense: money(dailyAvg),
          daysToCommitments: input.daysToCommitments,
          projectedExpenses: money(projected),
          availableAfterCommitments: money(available),
          currency: input.currency,
        },
      });
    }
  }

  return insights;
}
