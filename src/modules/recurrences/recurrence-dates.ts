import { Frequency } from '@prisma/client';
import { addDays, addMonths, clampDay, daysInMonth, parseDay } from '../../common/money.util';

export interface RecurrenceInput {
  frequency: Frequency;
  startDate: string; // YYYY-MM-DD
  endDate?: string | null;
  monthlyDay1?: number | null;
  monthlyDay2?: number | null;
}

/**
 * Genera las fechas de ocurrencia (YYYY-MM-DD) dentro de [from, to].
 * - MONTHLY: día fijo; en meses cortos se usa el último día válido
 *   (29/30/31 -> 28/29 feb, 30 abr, etc.).
 * - TWICE_MONTHLY: dos días del mes; si monthlyDay2 es null, la segunda
 *   ocurrencia es el último día del mes. Días duplicados tras el clamp se
 *   emiten una sola vez (p. ej. día 31 en febrero).
 * - EVERY_TWO_WEEKS: cada 14 días naturales desde startDate (NO es
 *   "dos veces al mes": en un mes de 30 días cae 2 veces, a veces 3 en
 *   meses largos según el ancla).
 */
export function* occurrencesBetween(
  rec: RecurrenceInput,
  from: string,
  to: string,
): Generator<string> {
  const start = rec.startDate;
  const end = rec.endDate && rec.endDate < to ? rec.endDate : to;
  const lo = from > start ? from : start;
  if (lo > end) return;

  switch (rec.frequency) {
    case Frequency.ONCE: {
      if (start >= lo && start <= end) yield start;
      return;
    }
    case Frequency.WEEKLY:
    case Frequency.EVERY_TWO_WEEKS: {
      const step = rec.frequency === Frequency.WEEKLY ? 7 : 14;
      let cursor = parseDay(start);
      // saltar ocurrencias anteriores a `lo`
      while (dayKeyOf(cursor) < lo) cursor = addDays(cursor, step);
      while (dayKeyOf(cursor) <= end) {
        yield dayKeyOf(cursor);
        cursor = addDays(cursor, step);
      }
      return;
    }
    case Frequency.MONTHLY: {
      const day = rec.monthlyDay1 ?? Number(start.slice(8, 10));
      let [y, m] = [Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 1];
      while (true) {
        const d = clampDay(y, m, day);
        const key = fmt(y, m, d);
        if (key > end) return;
        if (key >= lo) yield key;
        [y, m] = nextMonth(y, m);
      }
    }
    case Frequency.TWICE_MONTHLY: {
      const day1 = rec.monthlyDay1 ?? Number(start.slice(8, 10));
      const day2 = rec.monthlyDay2 ?? null;
      let [y, m] = [Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 1];
      while (true) {
        const last = daysInMonth(y, m);
        const d1 = clampDay(y, m, day1);
        const d2 = day2 === null ? last : clampDay(y, m, day2);
        const keys = Array.from(new Set([d1, d2].sort((a, b) => a - b))).map((d) => fmt(y, m, d));
        for (const key of keys) {
          if (key > end) return;
          if (key >= lo) yield key;
        }
        [y, m] = nextMonth(y, m);
      }
    }
  }
}

const dayKeyOf = (d: Date) => d.toISOString().slice(0, 10);
const fmt = (y: number, m0: number, d: number) =>
  `${String(y).padStart(4, '0')}-${String(m0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const nextMonth = (y: number, m0: number): [number, number] => (m0 === 11 ? [y + 1, 0] : [y, m0 + 1]);
