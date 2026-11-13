// Ejemplo ejecutable de punta a punta contra Mi Balance API.
// Requisitos: Node 22+, servidor levantado (npm run start:dev).
// Uso: node docs/ejemplo-e2e.mjs [baseUrl]

const BASE = process.argv[2] ?? 'http://localhost:3111/api/v1';

const cookies = new Map();
let csrfToken = null;

function cookieHeader() {
  return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function storeCookies(res) {
  const setCookies = res.headers.getSetCookie?.() ?? [];
  for (const raw of setCookies) {
    const [pair] = raw.split(';');
    const eq = pair.indexOf('=');
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (raw.includes('Max-Age=0') || raw.includes('Expires=Thu, 01 Jan 1970')) cookies.delete(name);
    else cookies.set(name, value);
  }
}

async function call(method, path, body, idempotencyKey) {
  const headers = { Accept: 'application/json' };
  if (cookies.size) headers.Cookie = cookieHeader();
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (csrfToken && !['GET', 'HEAD', 'OPTIONS'].includes(method)) headers['X-CSRF-Token'] = csrfToken;
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  storeCookies(res);
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  return { status: res.status, json };
}

function money(value, label) {
  if (typeof value !== 'string' || !/^\d+(\.\d{2})?$/.test(value)) {
    throw new Error(`${label} debería ser cadena decimal, llegó: ${JSON.stringify(value)}`);
  }
}

async function main() {
  const suffix = Date.now();
  const email = `demo-e2e-${suffix}@example.com`;
  const password = 'Demo12345!';

  const health = await call('GET', '/health');
  console.log('health:', health.json.data.status);

  const csrf = await call('GET', '/auth/csrf');
  csrfToken = csrf.json.data.csrfToken;
  console.log('csrf token recibido (cookie mb_csrf emitida)');

  await call('POST', '/auth/register', { email, password, name: 'Demo E2E' });
  console.log('registrado:', email);

  const me = await call('GET', '/auth/me');
  if (me.json.data.user.email !== email) throw new Error('la sesión no corresponde al usuario');
  console.log('sesión actual OK, moneda principal:', me.json.data.user.mainCurrency);

  const bank = await call('POST', '/accounts', {
    name: 'Banco principal',
    type: 'BANK',
    currency: 'USD',
    initialBalance: '1000.00',
    initialBalanceDate: '2026-01-01',
  });
  const cash = await call('POST', '/accounts', {
    name: 'Efectivo',
    type: 'CASH',
    currency: 'USD',
    initialBalance: '100.00',
    initialBalanceDate: '2026-01-01',
  });
  money(bank.json.data.currentBalance, 'bank.currentBalance');
  console.log('cuentas creadas, saldos:', bank.json.data.currentBalance, cash.json.data.currentBalance);

  const categories = await call('GET', '/categories');
  const food = categories.json.data.find((c) => c.kind === 'EXPENSE' && /comida|aliment/i.test(c.name))
    ?? categories.json.data.find((c) => c.kind === 'EXPENSE');
  const salary = categories.json.data.find((c) => c.kind === 'INCOME');

  const today = new Date().toISOString().slice(0, 10);
  const income = await call('POST', '/transactions', {
    accountId: bank.json.data.id,
    categoryId: salary.id,
    type: 'INCOME',
    amount: '1250.00',
    date: today,
    description: 'Sueldo',
  });
  if (!/^[A-Z]{3}$/.test(income.json.data.currency)) throw new Error(`moneda inesperada: ${income.json.data.currency}`);
  console.log('transacción creada, moneda derivada:', income.json.data.currency);

  const transfer = await call('POST', '/transfers', {
    fromAccountId: bank.json.data.id,
    toAccountId: cash.json.data.id,
    amount: '50.00',
    date: today,
    description: 'Retiro de efectivo',
  }, `tr-${suffix}`);
  const replay = await call('POST', '/transfers', {
    fromAccountId: bank.json.data.id,
    toAccountId: cash.json.data.id,
    amount: '50.00',
    date: today,
    description: 'Retiro de efectivo',
  }, `tr-${suffix}`);
  if (replay.json.data.id !== transfer.json.data.id) throw new Error('Idempotency-Key no devolvió la misma transferencia');
  console.log('transferencia idempotente OK (replay devuelve el mismo id)');

  const accounts = await call('GET', '/accounts');
  const bankAfter = accounts.json.data.find((a) => a.id === bank.json.data.id);
  const cashAfter = accounts.json.data.find((a) => a.id === cash.json.data.id);
  if (bankAfter.currentBalance !== '2200.00') throw new Error(`saldo banco inesperado: ${bankAfter.currentBalance}`);
  if (cashAfter.currentBalance !== '150.00') throw new Error(`saldo efectivo inesperado: ${cashAfter.currentBalance}`);
  console.log('saldos tras ingreso+transferencia OK:', bankAfter.currentBalance, cashAfter.currentBalance);

  const obligation = await call('POST', '/obligations', {
    accountId: bank.json.data.id,
    description: 'Alquiler',
    amount: '400.00',
    dueDate: today,
    direction: 'PAYABLE',
  });
  const payment = await call('POST', `/obligations/${obligation.json.data.id}/payments`, {
    accountId: bank.json.data.id,
    amount: '150.00',
    date: today,
  }, `pay-${suffix}`);
  if (payment.json.data.status !== 'PARTIALLY_PAID') {
    throw new Error(`estado tras pago parcial inesperado: ${payment.json.data.status}`);
  }
  console.log('pago parcial OK, estado:', payment.json.data.status, 'pendiente:', payment.json.data.remaining);

  const dashboard = await call('GET', `/dashboard?currency=USD&commitmentsThrough=${today}`);
  const s = dashboard.json.data.summary;
  for (const key of ['incomeReceived', 'expensesPaid', 'periodResult', 'currentBalance', 'pendingObligations', 'reservedSavings', 'availableAfterCommitments']) {
    money(s[key], `dashboard.summary.${key}`);
  }
  if (s.incomeReceived !== '1250.00') throw new Error(`incomeReceived inesperado: ${s.incomeReceived}`);
  if (s.pendingObligations !== '250.00') throw new Error(`pendingObligations inesperado: ${s.pendingObligations}`);
  console.log('dashboard OK:', JSON.stringify(s));
  console.log('insights:', dashboard.json.data.insights.map((i) => i.ruleCode).join(', ') || '(ninguno)');

  await call('POST', '/auth/logout');
  try {
    await call('GET', '/auth/me');
    throw new Error('la sesión debería estar revocada tras logout');
  } catch (err) {
    if (!String(err.message).includes('401')) throw err;
  }
  console.log('logout revoca la sesión OK');
  console.log('E2E OK');
}

main().catch((err) => {
  console.error('FALLO:', err.message);
  process.exit(1);
});
