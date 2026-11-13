import { buildInsights, InsightInput } from '../../src/modules/dashboard/insights.rules';

const base: InsightInput = {
  currency: 'USD',
  period: { from: '2026-11-01', to: '2026-11-30' },
  commitmentsThrough: '2026-11-30',
  today: '2026-11-13',
  currentBalance: '1000.00',
  pendingObligations: '0.00',
  reservedSavings: '0.00',
  availableAfterCommitments: '1000.00',
  expensesPaid: '100.00',
  previousPeriodExpenses: null,
  budgets: [],
  upcoming: [],
  dailyAvgExpense: '0.00',
  daysToCommitments: 18,
};

describe('buildInsights (reglas transparentes)', () => {
  it('marca CRITICAL cuando una obligación supera el saldo de su cuenta', () => {
    const out = buildInsights({
      ...base,
      upcoming: [
        { id: 'o1', description: 'Alquiler', dueDate: '2026-11-20', remaining: '800.00', accountId: 'a1', accountBalance: '500.00' },
      ],
    });
    const rule = out.find((i) => i.ruleCode === 'OBLIGATION_EXCEEDS_BALANCE');
    expect(rule).toBeDefined();
    expect(rule?.severity).toBe('CRITICAL');
    expect(rule?.evidence).toMatchObject({ obligationId: 'o1', remaining: '800.00' });
  });

  it('marca presupuesto superado y cerca del límite', () => {
    const out = buildInsights({
      ...base,
      budgets: [
        { id: 'b1', name: 'Comida', month: '2026-11', amount: '100.00', spent: '120.00' },
        { id: 'b2', name: 'Transporte', month: '2026-11', amount: '100.00', spent: '85.00' },
      ],
    });
    expect(out.find((i) => i.ruleCode === 'BUDGET_EXCEEDED' && i.evidence.budgetId === 'b1')).toBeDefined();
    expect(out.find((i) => i.ruleCode === 'BUDGET_NEAR_LIMIT' && i.evidence.budgetId === 'b2')).toBeDefined();
  });

  it('avisa vencimientos en los próximos 7 días', () => {
    const out = buildInsights({
      ...base,
      upcoming: [
        { id: 'o2', description: 'Luz', dueDate: '2026-11-18', remaining: '50.00', accountId: 'a1', accountBalance: '1000.00' },
      ],
    });
    const rule = out.find((i) => i.ruleCode === 'DUE_SOON');
    expect(rule).toBeDefined();
    expect((rule?.evidence as { total: string }).total).toBe('50.00');
  });

  it('compara gastos con el período anterior solo si está completo', () => {
    const out = buildInsights({
      ...base,
      expensesPaid: '150.00',
      previousPeriodExpenses: { from: '2026-10-01', to: '2026-10-31', total: '100.00', complete: true },
    });
    const rule = out.find((i) => i.ruleCode === 'SPENDING_INCREASE');
    expect(rule).toBeDefined();
    expect((rule?.evidence as { changePct: string }).changePct).toBe('50.00');
  });

  it('advierte cuando la comparación de períodos está incompleta', () => {
    const out = buildInsights({
      ...base,
      previousPeriodExpenses: { from: '2026-10-14', to: '2026-11-12', total: '10.00', complete: false },
    });
    expect(out.find((i) => i.ruleCode === 'INCOMPLETE_COMPARISON')).toBeDefined();
  });

  it('proyecta faltante cuando el gasto diario excede el disponible', () => {
    const out = buildInsights({
      ...base,
      dailyAvgExpense: '100.00',
      daysToCommitments: 18,
      availableAfterCommitments: '500.00',
    });
    const rule = out.find((i) => i.ruleCode === 'PROJECTION_SHORTFALL');
    expect(rule).toBeDefined();
    expect((rule?.evidence as { projectedExpenses: string }).projectedExpenses).toBe('1800.00');
  });

  it('no proyecta faltante si el disponible cubre la proyección', () => {
    const out = buildInsights({
      ...base,
      dailyAvgExpense: '10.00',
      daysToCommitments: 18,
      availableAfterCommitments: '500.00',
    });
    expect(out.find((i) => i.ruleCode === 'PROJECTION_SHORTFALL')).toBeUndefined();
  });

  it('cada insight tiene id, ruleCode, severity, title, message, period y evidence', () => {
    const out = buildInsights({ ...base, upcoming: [{ id: 'o1', description: 'X', dueDate: '2026-11-20', remaining: '9999.00', accountId: 'a1', accountBalance: '1.00' }] });
    for (const i of out) {
      expect(i.id).toBeTruthy();
      expect(i.ruleCode).toBeTruthy();
      expect(['INFO', 'WARNING', 'CRITICAL']).toContain(i.severity);
      expect(i.title).toBeTruthy();
      expect(i.message).toBeTruthy();
      expect(i.period).toEqual(base.period);
      expect(i.evidence).toBeInstanceOf(Object);
    }
  });
});
