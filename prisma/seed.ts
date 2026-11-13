/* Seed de desarrollo idempotente: borra y recrea SOLO el usuario demo. */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const DEMO_EMAIL = process.env.DEMO_USER_EMAIL ?? 'demo@mibalance.local';
const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD ?? 'demo-password-2026';

function day(offsetDays: number): Date {
  return new Date(new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10) + 'T00:00:00.000Z');
}

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (existing) {
    // Idempotente: elimina los datos del demo y los recrea limpios.
    const userId = existing.id;
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.transfer.deleteMany({ where: { userId } });
    await prisma.obligationPayment.deleteMany({ where: { userId } });
    await prisma.obligation.deleteMany({ where: { userId } });
    await prisma.recurrence.deleteMany({ where: { userId } });
    await prisma.budget.deleteMany({ where: { userId } });
    await prisma.debtPayment.deleteMany({ where: { userId } });
    await prisma.debt.deleteMany({ where: { userId } });
    await prisma.savingsAllocation.deleteMany({ where: { userId } });
    await prisma.savingsGoal.deleteMany({ where: { userId } });
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.idempotencyKey.deleteMany({ where: { userId } });
    await prisma.category.deleteMany({ where: { userId } });
    await prisma.account.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
  }

  const passwordHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });
  const user = await prisma.user.create({
    data: {
      email: DEMO_EMAIL,
      passwordHash,
      name: 'Usuario Demo',
      mainCurrency: 'USD',
      timezone: 'America/Caracas',
    },
  });

  const bank = await prisma.account.create({
    data: {
      userId: user.id,
      name: 'Banco principal',
      type: 'BANK',
      currency: 'USD',
      initialBalance: '1200.00',
      initialBalanceDate: day(-60),
    },
  });
  const cash = await prisma.account.create({
    data: {
      userId: user.id,
      name: 'Efectivo',
      type: 'CASH',
      currency: 'USD',
      initialBalance: '150.00',
      initialBalanceDate: day(-60),
    },
  });
  await prisma.account.create({
    data: {
      userId: user.id,
      name: 'Bolívares',
      type: 'WALLET',
      currency: 'VES',
      initialBalance: '5000.00',
      initialBalanceDate: day(-60),
    },
  });

  const cat = async (name: string, kind: 'INCOME' | 'EXPENSE') =>
    prisma.category.create({ data: { userId: user.id, name, kind } });

  const salary = await cat('Sueldo', 'INCOME');
  const food = await cat('Alimentación', 'EXPENSE');
  const transport = await cat('Transporte', 'EXPENSE');
  const housing = await cat('Vivienda', 'EXPENSE');

  const mkTx = (accountId: string, categoryId: string | null, type: 'INCOME' | 'EXPENSE', amount: string, date: Date, description: string) =>
    prisma.transaction.create({
      data: { userId: user.id, accountId, categoryId, type, amount, currency: 'USD', date, description },
    });

  await mkTx(bank.id, salary.id, 'INCOME', '1500.00', day(-30), 'Sueldo mes anterior');
  await mkTx(bank.id, food.id, 'EXPENSE', '320.50', day(-25), 'Despensa');
  await mkTx(bank.id, housing.id, 'EXPENSE', '450.00', day(-20), 'Alquiler');
  await mkTx(cash.id, transport.id, 'EXPENSE', '25.75', day(-10), 'Taxi');

  const rent = await prisma.recurrence.create({
    data: {
      userId: user.id,
      accountId: bank.id,
      categoryId: housing.id,
      description: 'Alquiler',
      direction: 'PAYABLE',
      frequency: 'MONTHLY',
      amount: '450.00',
      currency: 'USD',
      startDate: day(-60),
      monthlyDay1: 1,
    },
  });
  await prisma.obligation.create({
    data: {
      userId: user.id,
      recurrenceId: rent.id,
      accountId: bank.id,
      categoryId: housing.id,
      description: 'Alquiler',
      direction: 'PAYABLE',
      amount: '450.00',
      dueDate: day(5),
    },
  });

  await prisma.budget.create({
    data: {
      userId: user.id,
      categoryId: food.id,
      currency: 'USD',
      month: new Date(new Date().toISOString().slice(0, 7) + '-01T00:00:00.000Z'),
      amount: '400.00',
    },
  });

  await prisma.debt.create({
    data: {
      userId: user.id,
      direction: 'I_OWE',
      counterparty: 'Financiera ABC',
      currency: 'USD',
      description: 'Préstamo personal',
      originalPrincipal: '2000.00',
      remainingPrincipal: '1500.00',
      interestRate: '0.150000',
      installments: 12,
      dueDate: day(180),
    },
  });

  const goal = await prisma.savingsGoal.create({
    data: {
      userId: user.id,
      name: 'Fondo de emergencia',
      currency: 'USD',
      targetAmount: '3000.00',
      savedAmount: '500.00',
      deadline: day(180),
    },
  });
  await prisma.savingsAllocation.create({
    data: { userId: user.id, goalId: goal.id, amount: '500.00', date: day(-15), note: 'Aporte inicial' },
  });

  console.log(`Seed demo completo: ${DEMO_EMAIL} / contraseña de DEMO_USER_PASSWORD`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
