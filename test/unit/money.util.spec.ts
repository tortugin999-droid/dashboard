import { D, dayKey, money, parseDay, todayInTz } from '../../src/common/money.util';

describe('money.util', () => {
  it('serializa dinero como cadena decimal con 2 decimales', () => {
    expect(money('1250')).toBe('1250.00');
    expect(money('0.1')).toBe('0.10');
    expect(money('12.345')).toBe('12.35');
    expect(money(null)).toBe('0.00');
  });

  it('usa aritmética decimal exacta, no punto flotante binario', () => {
    expect(D('0.1').plus(D('0.2')).toString()).toBe('0.3');
    expect(D('0.1').plus(D('0.2')).toFixed(2)).toBe('0.30');
    expect(D('1000.10').minus(D('0.10')).toString()).toBe('1000');
    // Contraejemplo float: 0.1 + 0.2 !== 0.3 en binario
    expect(0.1 + 0.2).not.toBe(0.3);
  });

  it('fechas de calendario YYYY-MM-DD redondean a días UTC', () => {
    expect(dayKey(parseDay('2026-11-13'))).toBe('2026-11-13');
    expect(dayKey(parseDay('2028-02-29'))).toBe('2028-02-29');
  });

  it('todayInTz devuelve la fecha de calendario de la zona horaria', () => {
    const utc = todayInTz('UTC');
    expect(utc).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Una zona horaria muy al este puede tener "mañana" respecto a UTC.
    const nowUtcHour = new Date().getUTCHours();
    const pacific = todayInTz('Pacific/Kiritimati');
    const expectedOffset = nowUtcHour >= 10 ? 1 : 0;
    const diff = Math.round((Date.parse(pacific) - Date.parse(utc)) / 86_400_000);
    expect(diff).toBe(expectedOffset);
  });
});
