import * as fs from 'node:fs';
import * as path from 'node:path';
import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { createApp } from '../../src/main';

const ENV_FILE = path.resolve(__dirname, '..', '..', '.pgdata', 'e2e-env.json');

let app: NestExpressApplication;
let server: any;
const today = new Date().toISOString().slice(0, 10);
const pastDate = '2026-01-01';

class Client {
  cookie = '';
  csrf = '';

  async get(url: string) {
    return this.send('get', url);
  }

  async post(url: string, body?: object, headers: Record<string, string> = {}) {
    return this.send('post', url, body, headers);
  }

  async patch(url: string, body?: object) {
    return this.send('patch', url, body);
  }

  async delete(url: string) {
    return this.send('delete', url);
  }

  private async send(method: string, url: string, body?: object, headers: Record<string, string> = {}) {
    const full = url.startsWith('/api/v1') ? url : '/api/v1' + url;
    const r = request(server);
    const req = (
      method === 'get'
        ? r.get(full)
        : method === 'post'
          ? r.post(full)
          : method === 'patch'
            ? r.patch(full)
            : r.delete(full)
    )
      .set('Cookie', this.cookie)
      .set('X-CSRF-Token', this.csrf)
      .set(headers);
    const res = body !== undefined ? await req.send(body) : await req;
    const setCookie = ((res.headers['set-cookie'] ?? []) as unknown) as string[];
    const jar = new Map(
      this.cookie.split('; ').filter(Boolean).map((c) => [c.slice(0, c.indexOf('=')), c] as [string, string]),
    );
    for (const c of setCookie) {
      const pair = c.split(';')[0];
      const k = pair.slice(0, pair.indexOf('='));
      jar.set(k, pair);
      if (k === 'mb_csrf') this.csrf = pair.slice(pair.indexOf('=') + 1);
    }
    this.cookie = Array.from(jar.values()).join('; ');
    return res;
  }
}

async function register(email: string): Promise<Client> {
  const c = new Client();
  await c.get('/auth/csrf');
  const res = await c.post('/auth/register', { email, password: 'contrasena-segura-1', name: 'Test ' + email });
  expect(res.status).toBe(201);
  return c;
}

describe('Mi Balance API (e2e con PostgreSQL)', () => {
  let userA: Client;
  let userB: Client;
  const suffix = Date.now();

  beforeAll(async () => {
    const { databaseUrl } = JSON.parse(fs.readFileSync(ENV_FILE, 'utf8'));
    process.env.DATABASE_URL = databaseUrl;
    process.env.CSRF_SECRET = process.env.CSRF_SECRET ?? 'e2e-csrf-secret';
    app = await createApp();
    await app.init();
    server = app.getHttpServer();
  }, 120_000);

  afterAll(async () => {
    await app.close();
  });

  it('GET /health responde con base de datos activa', async () => {
    const res = await request(server).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.data.database).toBe('up');
    expect(res.body.data.status).toBe('ok');
  });

  it('registro, sesión actual y cierre de sesión', async () => {
    userA = await register(`a-${suffix}@test.local`);
    const me = await userA.get('/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(`a-${suffix}@test.local`);
    expect(me.body.data.user).not.toHaveProperty('passwordHash');

    userB = await register(`b-${suffix}@test.local`);
    const logout = await userA.post('/auth/logout');
    expect(logout.status).toBe(204);
    const meAfter = await userA.get('/auth/me');
    expect(meAfter.status).toBe(401);
    userA = await register(`a2-${suffix}@test.local`);
  });

  it('login con credenciales inválidas no revela si el correo existe', async () => {
    const c = new Client();
    await c.get('/auth/csrf');
    const res = await c.post('/auth/login', { email: `noexiste-${suffix}@test.local`, password: 'cualquier-cosa-123' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.error.message).toBe('Credenciales inválidas.');
  });

  it('peticiones que modifican datos exigen CSRF', async () => {
    const res = await request(server)
      .post('/api/v1/accounts')
      .set('Content-Type', 'application/json')
      .send({ name: 'X', type: 'CASH', currency: 'USD' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('aislamiento entre usuarios en cuentas, categorías y movimientos', async () => {
    const accRes = await userA.post('/accounts', {
      name: 'Caja A',
      type: 'CASH',
      currency: 'USD',
      initialBalance: '100.00',
      initialBalanceDate: pastDate,
    });
    expect(accRes.status).toBe(201);
    const accountA = accRes.body.data;

    const catRes = await userA.post('/categories', { name: `Comida ${suffix}`, kind: 'EXPENSE' });
    expect(catRes.status).toBe(201);
    const categoryA = catRes.body.data;

    const txRes = await userA.post('/transactions', {
      accountId: accountA.id,
      categoryId: categoryA.id,
      type: 'EXPENSE',
      amount: '10.00',
      date: today,
      description: 'compra',
    });
    expect(txRes.status).toBe(201);
    const txA = txRes.body.data;

    const patchRes = await userB.patch(`/accounts/${accountA.id}`, { name: 'hackeada' });
    expect(patchRes.status).toBe(404);

    const accB = await userB.post('/accounts', {
      name: 'Caja B',
      type: 'CASH',
      currency: 'USD',
      initialBalance: '0.00',
      initialBalanceDate: pastDate,
    });
    const stolen = await userB.post('/transactions', {
      accountId: accB.body.data.id,
      categoryId: categoryA.id,
      type: 'EXPENSE',
      amount: '5.00',
      date: today,
    });
    expect(stolen.status).toBe(404);

    const getTx = await userB.get(`/transactions/${txA.id}`);
    expect(getTx.status).toBe(404);

    const listB = await userB.get('/transactions');
    expect(listB.body.data.every((t: { id: string }) => t.id !== txA.id)).toBe(true);
  });

  it('precisión decimal: 0.10 + 0.20 = 0.30', async () => {
    const acc = await userA.post('/accounts', {
      name: 'Decimal',
      type: 'BANK',
      currency: 'USD',
      initialBalance: '0.00',
      initialBalanceDate: pastDate,
    });
    const id = acc.body.data.id;
    await userA.post('/transactions', { accountId: id, type: 'INCOME', amount: '0.10', date: today });
    await userA.post('/transactions', { accountId: id, type: 'INCOME', amount: '0.20', date: today });
    const after = await userA.get('/accounts');
    const dto = after.body.data.find((a: { id: string }) => a.id === id);
    expect(dto.currentBalance).toBe('0.30');
    expect(typeof dto.currentBalance).toBe('string');
  });

  it('transferencia atómica entre cuentas propias: mueve saldo sin crear ingresos ni gastos', async () => {
    const from = await userA.post('/accounts', {
      name: 'Origen',
      type: 'BANK',
      currency: 'USD',
      initialBalance: '50.00',
      initialBalanceDate: pastDate,
    });
    const to = await userA.post('/accounts', {
      name: 'Destino',
      type: 'WALLET',
      currency: 'USD',
      initialBalance: '0.00',
      initialBalanceDate: pastDate,
    });
    const dashBefore = await userA.get('/dashboard?currency=USD');
    const incomeBefore = dashBefore.body.data.summary.incomeReceived;
    const expensesBefore = dashBefore.body.data.summary.expensesPaid;

    const res = await userA.post('/transfers', {
      fromAccountId: from.body.data.id,
      toAccountId: to.body.data.id,
      amount: '20.00',
      date: today,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.amount).toBe('20.00');

    const accounts = await userA.get('/accounts');
    const f = accounts.body.data.find((a: { id: string }) => a.id === from.body.data.id);
    const t = accounts.body.data.find((a: { id: string }) => a.id === to.body.data.id);
    expect(f.currentBalance).toBe('30.00');
    expect(t.currentBalance).toBe('20.00');

    const dashAfter = await userA.get('/dashboard?currency=USD');
    expect(dashAfter.body.data.summary.incomeReceived).toBe(incomeBefore);
    expect(dashAfter.body.data.summary.expensesPaid).toBe(expensesBefore);

    const list = await userA.get('/transactions?pageSize=100');
    const legs = list.body.data.filter((x: { transferId: string | null }) => x.transferId === res.body.data.id);
    expect(legs.map((l: { type: string }) => l.type).sort()).toEqual(['TRANSFER_IN', 'TRANSFER_OUT']);
  });

  it('rechaza transferencias entre monedas distintas', async () => {
    const usd = await userA.post('/accounts', {
      name: 'USD acc',
      type: 'BANK',
      currency: 'USD',
      initialBalance: '10.00',
      initialBalanceDate: pastDate,
    });
    const ves = await userA.post('/accounts', {
      name: 'VES acc',
      type: 'WALLET',
      currency: 'VES',
      initialBalance: '100.00',
      initialBalanceDate: pastDate,
    });
    const res = await userA.post('/transfers', {
      fromAccountId: usd.body.data.id,
      toAccountId: ves.body.data.id,
      amount: '5.00',
      date: today,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('monedas distintas');
  });

  it('pagos parciales de obligaciones, rechazo de sobrepago', async () => {
    const acc = await userA.post('/accounts', {
      name: 'Cuenta obligaciones',
      type: 'BANK',
      currency: 'USD',
      initialBalance: '500.00',
      initialBalanceDate: pastDate,
    });
    const dashBase = await userA.get('/dashboard?currency=USD');
    const expensesBeforeOb = dashBase.body.data.summary.expensesPaid;
    const ob = await userA.post('/obligations', {
      accountId: acc.body.data.id,
      description: 'Seguro',
      amount: '50.00',
      dueDate: today,
    });
    expect(ob.status).toBe(201);
    const id = ob.body.data.id;

    const p1 = await userA.post(`/obligations/${id}/payments`, { accountId: acc.body.data.id, amount: '20.00', date: today });
    expect(p1.status).toBe(201);
    expect(p1.body.data.status).toBe('PARTIALLY_PAID');
    expect(p1.body.data.remaining).toBe('30.00');

    const over = await userA.post(`/obligations/${id}/payments`, { accountId: acc.body.data.id, amount: '40.00', date: today });
    expect(over.status).toBe(409);

    const p2 = await userA.post(`/obligations/${id}/payments`, { accountId: acc.body.data.id, amount: '30.00', date: today });
    expect(p2.body.data.status).toBe('PAID');
    expect(p2.body.data.remaining).toBe('0.00');

    const dash = await userA.get('/dashboard?currency=USD');
    expect(Number(dash.body.data.summary.expensesPaid) - Number(expensesBeforeOb)).toBe(50);
  });

  it('Idempotency-Key: repetición idéntica no duplica; cuerpo distinto se rechaza', async () => {
    const acc = await userA.post('/accounts', {
      name: 'Cuenta idempotencia',
      type: 'BANK',
      currency: 'USD',
      initialBalance: '1000.00',
      initialBalanceDate: pastDate,
    });
    const ob = await userA.post('/obligations', {
      accountId: acc.body.data.id,
      description: 'Cuota gym',
      amount: '100.00',
      dueDate: today,
    });
    const id = ob.body.data.id;
    const key = `e2e-key-${suffix}`;

    const r1 = await userA.post(`/obligations/${id}/payments`, { accountId: acc.body.data.id, amount: '40.00', date: today }, { 'Idempotency-Key': key });
    expect(r1.status).toBe(201);
    const r2 = await userA.post(`/obligations/${id}/payments`, { accountId: acc.body.data.id, amount: '40.00', date: today }, { 'Idempotency-Key': key });
    expect(r2.status).toBe(201);
    expect(r2.body.data.paymentId).toBe(r1.body.data.paymentId);

    const obAfter = await userA.get('/obligations');
    const refreshed = obAfter.body.data.find((o: { id: string }) => o.id === id);
    expect(refreshed.paidAmount).toBe('40.00');
    expect(refreshed.remaining).toBe('60.00');

    const clash = await userA.post(`/obligations/${id}/payments`, { accountId: acc.body.data.id, amount: '10.00', date: today }, { 'Idempotency-Key': key });
    expect(clash.status).toBe(409);
  });

  it('generación recurrente idempotente y meses cortos', async () => {
    const acc = await userA.post('/accounts', {
      name: 'Cuenta recurrente',
      type: 'BANK',
      currency: 'USD',
      initialBalance: '0.00',
      initialBalanceDate: pastDate,
    });
    const r = await userA.post('/recurrences', {
      accountId: acc.body.data.id,
      description: 'Membresía día 31',
      direction: 'PAYABLE',
      frequency: 'MONTHLY',
      amount: '31.00',
      startDate: '2026-01-31',
    });
    expect(r.status).toBe(201);

    const g1 = await userA.post(`/recurrences/${r.body.data.id}/generate`, { through: '2026-03-31' });
    expect(g1.status).toBe(201);
    expect(g1.body.data.created).toBe(3);

    const g2 = await userA.post(`/recurrences/${r.body.data.id}/generate`, { through: '2026-03-31' });
    expect(g2.body.data.created).toBe(0);

    const obligations = await userA.get('/obligations?pageSize=100');
    const generated = obligations.body.data.filter((o: { recurrenceId: string | null }) => o.recurrenceId === r.body.data.id);
    expect(generated.map((o: { dueDate: string }) => o.dueDate).sort()).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });

  it('cada 14 días NO es igual a dos veces al mes', async () => {
    const acc = await userA.post('/accounts', {
      name: 'Cuenta quincenas',
      type: 'BANK',
      currency: 'USD',
      initialBalance: '0.00',
      initialBalanceDate: pastDate,
    });
    const biweekly = await userA.post('/recurrences', {
      accountId: acc.body.data.id,
      description: 'Cobro cada 14 días',
      direction: 'RECEIVABLE',
      frequency: 'EVERY_TWO_WEEKS',
      amount: '100.00',
      startDate: '2026-01-01',
    });
    const twice = await userA.post('/recurrences', {
      accountId: acc.body.data.id,
      description: 'Cobro dos veces al mes',
      direction: 'RECEIVABLE',
      frequency: 'TWICE_MONTHLY',
      amount: '100.00',
      startDate: '2026-01-01',
      monthlyDay1: 1,
      monthlyDay2: 15,
    });
    await userA.post(`/recurrences/${biweekly.body.data.id}/generate`, { through: '2026-03-31' });
    await userA.post(`/recurrences/${twice.body.data.id}/generate`, { through: '2026-03-31' });
    const obligations = await userA.get('/obligations?pageSize=100');
    const biDates = obligations.body.data
      .filter((o: { recurrenceId: string }) => o.recurrenceId === biweekly.body.data.id)
      .map((o: { dueDate: string }) => o.dueDate)
      .sort();
    const twDates = obligations.body.data
      .filter((o: { recurrenceId: string }) => o.recurrenceId === twice.body.data.id)
      .map((o: { dueDate: string }) => o.dueDate)
      .sort();
    expect(biDates).toEqual(['2026-01-01', '2026-01-15', '2026-01-29', '2026-02-12', '2026-02-26', '2026-03-12', '2026-03-26']);
    expect(twDates).toEqual(['2026-01-01', '2026-01-15', '2026-02-01', '2026-02-15', '2026-03-01', '2026-03-15']);
    expect(biDates).not.toEqual(twDates);
  });

  it('desembolso de préstamo aumenta caja pero no ingresos; abono reduce deuda', async () => {
    const acc = await userA.post('/accounts', {
      name: 'Cuenta préstamo',
      type: 'BANK',
      currency: 'USD',
      initialBalance: '0.00',
      initialBalanceDate: pastDate,
    });
    const dashBefore = await userA.get('/dashboard?currency=USD');
    const incomeBefore = dashBefore.body.data.summary.incomeReceived;

    const debt = await userA.post('/debts', {
      direction: 'I_OWE',
      counterparty: 'Prestamista X',
      currency: 'USD',
      originalPrincipal: '500.00',
      disbursementAccountId: acc.body.data.id,
    });
    expect(debt.status).toBe(201);
    expect(debt.body.data.remainingPrincipal).toBe('500.00');

    const accounts = await userA.get('/accounts');
    const balance = accounts.body.data.find((a: { id: string }) => a.id === acc.body.data.id).currentBalance;
    expect(balance).toBe('500.00');

    const dashMid = await userA.get('/dashboard?currency=USD');
    expect(dashMid.body.data.summary.incomeReceived).toBe(incomeBefore);
    const expensesBeforeDebt = dashMid.body.data.summary.expensesPaid;

    const pay = await userA.post(`/debts/${debt.body.data.id}/payments`, {
      accountId: acc.body.data.id,
      principalAmount: '100.00',
      interestAmount: '10.00',
      feeAmount: '5.00',
      date: today,
    });
    expect(pay.status).toBe(201);
    expect(pay.body.data.amount).toBe('115.00');

    const debtAfter = await userA.get(`/debts/${debt.body.data.id}`);
    expect(debtAfter.body.data.remainingPrincipal).toBe('400.00');
    expect(debtAfter.body.data.payments).toHaveLength(1);

    const accountsAfter = await userA.get('/accounts');
    const balanceAfter = accountsAfter.body.data.find((a: { id: string }) => a.id === acc.body.data.id).currentBalance;
    expect(balanceAfter).toBe('385.00');

    const dashAfter = await userA.get('/dashboard?currency=USD');
    const expensesDelta = Number(dashAfter.body.data.summary.expensesPaid) - Number(expensesBeforeDebt);
    expect(expensesDelta).toBe(15);
    expect(dashAfter.body.data.summary.incomeReceived).toBe(incomeBefore);
  });

  it('reservas de ahorro: suman al guardado y reducen el disponible sin ser gastos', async () => {
    const goal = await userA.post('/savings-goals', {
      name: 'Fondo e2e',
      currency: 'USD',
      targetAmount: '1000.00',
    });
    expect(goal.status).toBe(201);
    const alloc = await userA.post(`/savings-goals/${goal.body.data.id}/allocations`, { amount: '200.00', date: today });
    expect(alloc.status).toBe(201);
    expect(alloc.body.data.goalSavedAmount).toBe('200.00');

    const goals = await userA.get('/savings-goals');
    const g = goals.body.data.find((x: { id: string }) => x.id === goal.body.data.id);
    expect(g.savedAmount).toBe('200.00');
    expect(g.progressPct).toBe('20.00');

    const dash = await userA.get('/dashboard?currency=USD');
    // reservado = pendiente por ahorrar (1000 - 200)
    expect(dash.body.data.summary.reservedSavings).toBe('800.00');
  });

  it('monedas distintas nunca se suman entre sí', async () => {
    const dashUsd = await userA.get('/dashboard?currency=USD');
    const dashVes = await userA.get('/dashboard?currency=VES');
    expect(dashUsd.body.data.currency).toBe('USD');
    expect(dashVes.body.data.currency).toBe('VES');
    const accounts = await userA.get('/accounts?currency=VES');
    const vesTotal = accounts.body.data.reduce((acc: number, a: { currentBalance: string }) => acc + Number(a.currentBalance), 0);
    expect(Number(dashVes.body.data.summary.currentBalance)).toBe(vesTotal);
  });

  it('presupuesto: rendimiento y regla de presupuesto superado', async () => {
    const cat = await userA.post('/categories', { name: `Ocio ${suffix}`, kind: 'EXPENSE' });
    const acc = await userA.post('/accounts', {
      name: 'Cuenta presupuesto',
      type: 'CASH',
      currency: 'USD',
      initialBalance: '0.00',
      initialBalanceDate: pastDate,
    });
    const month = today.slice(0, 7);
    const budget = await userA.post('/budgets', { categoryId: cat.body.data.id, month, amount: '100.00', currency: 'USD' });
    expect(budget.status).toBe(201);
    await userA.post('/transactions', {
      accountId: acc.body.data.id,
      categoryId: cat.body.data.id,
      type: 'EXPENSE',
      amount: '120.00',
      date: today,
    });
    const perf = await userA.get(`/reports/budget-performance?month=${month}&currency=USD`);
    const item = perf.body.data.items.find((i: { budgetId: string }) => i.budgetId === budget.body.data.id);
    expect(item.spent).toBe('120.00');
    expect(item.exceeded).toBe(true);

    const dash = await userA.get('/dashboard?currency=USD');
    const insight = dash.body.data.insights.find((i: { ruleCode: string }) => i.ruleCode === 'BUDGET_EXCEEDED');
    expect(insight).toBeDefined();
    expect(insight.evidence.budgetId).toBe(budget.body.data.id);
  });

  it('dashboard incluye series, vencimientos y resumen de deudas con referencias de fecha', async () => {
    const dash = await userA.get('/dashboard?currency=USD');
    const d = dash.body.data;
    expect(d.period.from).toBeDefined();
    expect(d.period.to).toBeDefined();
    expect(d.asOf).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(d.balanceAsOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Array.isArray(d.balanceSeries)).toBe(true);
    expect(Array.isArray(d.incomeExpenseSeries)).toBe(true);
    expect(Array.isArray(d.expensesByCategory)).toBe(true);
    expect(Array.isArray(d.budgetProgress)).toBe(true);
    expect(Array.isArray(d.upcomingObligations)).toBe(true);
    expect(Array.isArray(d.debtSummary)).toBe(true);
    expect(d.balanceSeries.length).toBeGreaterThan(0);
    for (const point of d.balanceSeries) {
      expect(point.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof point.balance).toBe('string');
    }
  });

  it('paginación y filtros de colecciones', async () => {
    const res = await userA.get('/transactions?page=1&pageSize=2');
    expect(res.body.meta).toMatchObject({ page: 1, pageSize: 2 });
    expect(res.body.data.length).toBeLessThanOrEqual(2);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(res.body.data.length);
    const filtered = await userA.get('/transactions?type=INCOME');
    expect(filtered.body.data.every((t: { type: string }) => t.type === 'INCOME')).toBe(true);
  });

  it('formato de error y contrato {data}', async () => {
    const res = await userA.post('/transactions', { accountId: 'no-existe', type: 'INCOME', amount: '1.00', date: today });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(typeof res.body.error.message).toBe('string');
    expect(res.body.error.details).toBeDefined();
  });

  it('no se puede borrar un movimiento vinculado a un pago', async () => {
    const acc = await userA.post('/accounts', {
      name: 'Cuenta delete',
      type: 'CASH',
      currency: 'USD',
      initialBalance: '0.00',
      initialBalanceDate: pastDate,
    });
    const ob = await userA.post('/obligations', { accountId: acc.body.data.id, description: 'Borrado', amount: '10.00', dueDate: today });
    await userA.post(`/obligations/${ob.body.data.id}/payments`, { accountId: acc.body.data.id, amount: '10.00', date: today });
    const txs = await userA.get('/transactions?pageSize=100');
    const linked = txs.body.data.find((t: { obligationId: string | null }) => t.obligationId === ob.body.data.id);
    const del = await userA.delete(`/transactions/${linked.id}`);
    expect(del.status).toBe(403);
  });
});
