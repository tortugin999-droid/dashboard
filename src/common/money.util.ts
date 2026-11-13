import { Prisma } from '@prisma/client';

export type Dec = Prisma.Decimal;

export const D = (v: Prisma.Decimal.Value): Dec => new Prisma.Decimal(v);

export const ZERO = D(0);

/** Dinero como cadena decimal con 2 decimales: "1250.00" */
export function money(v: Prisma.Decimal.Value | null | undefined): string {
  if (v === null || v === undefined) return '0.00';
  return new Prisma.Decimal(v).toFixed(2, Prisma.Decimal.ROUND_HALF_UP);
}

/** Fecha de calendario -> Date (medianoche UTC) */
export function parseDay(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

/** Date -> "YYYY-MM-DD" (UTC) */
export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" o "YYYY-MM" -> primer día del mes en Date UTC */
export function parseMonth(s: string): Date {
  return parseDay(s.length === 7 ? `${s}-01` : s);
}

export function addDays(d: Date, days: number): Date {
  const n = new Date(d.getTime());
  n.setUTCDate(n.getUTCDate() + days);
  return n;
}

export function addMonths(d: Date, months: number): Date {
  const n = new Date(d.getTime());
  n.setUTCMonth(n.getUTCMonth() + months);
  return n;
}

export function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/** Día válido: clamp 29/30/31 al último día del mes */
export function clampDay(year: number, month0: number, day: number): number {
  return Math.min(day, daysInMonth(year, month0));
}

/** "YYYY-MM-DD" de hoy en la zona horaria dada */
export function todayInTz(tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function isValidDayString(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00.000Z`));
}

export function normalizeAmountString(v: string): string {
  return D(v).toFixed(4);
}
