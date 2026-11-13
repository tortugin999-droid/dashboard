import { Frequency } from '@prisma/client';
import { occurrencesBetween } from '../../src/modules/recurrences/recurrence-dates';

const rec = (partial: {
  frequency: Frequency;
  startDate: string;
  endDate?: string | null;
  monthlyDay1?: number | null;
  monthlyDay2?: number | null;
}) => ({ endDate: null, monthlyDay1: null, monthlyDay2: null, ...partial });

describe('occurrencesBetween (lógica de recurrencias)', () => {
  it('MONTHLY día 31 usa el último día válido en meses cortos', () => {
    const r = rec({ frequency: Frequency.MONTHLY, startDate: '2026-01-31', monthlyDay1: 31 });
    const out = Array.from(occurrencesBetween(r, '2026-01-01', '2026-05-31'));
    expect(out).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
  });

  it('MONTHLY día 30 en año bisiesto: febrero tiene 29', () => {
    const r = rec({ frequency: Frequency.MONTHLY, startDate: '2028-01-30', monthlyDay1: 30 });
    const out = Array.from(occurrencesBetween(r, '2028-01-01', '2028-03-31'));
    expect(out).toEqual(['2028-01-30', '2028-02-29', '2028-03-30']);
  });

  it('TWICE_MONTHLY con monthlyDay2 null usa el último día del mes', () => {
    const r = rec({ frequency: Frequency.TWICE_MONTHLY, startDate: '2026-02-01', monthlyDay1: 15 });
    const out = Array.from(occurrencesBetween(r, '2026-02-01', '2026-04-30'));
    expect(out).toEqual([
      '2026-02-15',
      '2026-02-28',
      '2026-03-15',
      '2026-03-31',
      '2026-04-15',
      '2026-04-30',
    ]);
  });

  it('TWICE_MONTHLY días 1 y 15', () => {
    const r = rec({ frequency: Frequency.TWICE_MONTHLY, startDate: '2026-03-01', monthlyDay1: 1, monthlyDay2: 15 });
    const out = Array.from(occurrencesBetween(r, '2026-03-01', '2026-03-31'));
    expect(out).toEqual(['2026-03-01', '2026-03-15']);
  });

  it('TWICE_MONTHLY día 31 en febrero no se duplica con el último día', () => {
    const r = rec({ frequency: Frequency.TWICE_MONTHLY, startDate: '2026-02-01', monthlyDay1: 31 });
    const out = Array.from(occurrencesBetween(r, '2026-02-01', '2026-02-28'));
    expect(out).toEqual(['2026-02-28']);
  });

  it('EVERY_TWO_WEEKS son 14 días naturales, distinto de dos veces al mes', () => {
    const biweekly = rec({ frequency: Frequency.EVERY_TWO_WEEKS, startDate: '2026-01-01' });
    const twice = rec({ frequency: Frequency.TWICE_MONTHLY, startDate: '2026-01-01', monthlyDay1: 1, monthlyDay2: 15 });
    const a = Array.from(occurrencesBetween(biweekly, '2026-01-01', '2026-03-31'));
    const b = Array.from(occurrencesBetween(twice, '2026-01-01', '2026-03-31'));
    expect(a).toEqual(['2026-01-01', '2026-01-15', '2026-01-29', '2026-02-12', '2026-02-26', '2026-03-12', '2026-03-26']);
    expect(b).toEqual(['2026-01-01', '2026-01-15', '2026-02-01', '2026-02-15', '2026-03-01', '2026-03-15']);
    expect(a).not.toEqual(b);
  });

  it('WEEKLY avanza de 7 en 7 días', () => {
    const r = rec({ frequency: Frequency.WEEKLY, startDate: '2026-11-02' });
    const out = Array.from(occurrencesBetween(r, '2026-11-01', '2026-11-30'));
    expect(out).toEqual(['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']);
  });

  it('ONCE genera una única ocurrencia', () => {
    const r = rec({ frequency: Frequency.ONCE, startDate: '2026-11-13' });
    expect(Array.from(occurrencesBetween(r, '2026-01-01', '2026-12-31'))).toEqual(['2026-11-13']);
    expect(Array.from(occurrencesBetween(r, '2027-01-01', '2027-12-31'))).toEqual([]);
  });

  it('respeta endDate', () => {
    const r = rec({ frequency: Frequency.WEEKLY, startDate: '2026-11-02', endDate: '2026-11-10' });
    const out = Array.from(occurrencesBetween(r, '2026-11-01', '2026-11-30'));
    expect(out).toEqual(['2026-11-02', '2026-11-09']);
  });
});
