/**
 * RF-009/RF-007 (pagos con fecha anterior): contrato 6 — validación de fecha y texto de tasa del
 * cobro en sala (`apps/web/src/lib/cobro-sala.ts`).
 *
 * Fase ROJA: `validarFechaCobro` y `textoTasaCobro` todavía no existen en `cobro-sala.ts`; el
 * test define su contrato: hoy o anterior válidas, vacía pide elegir, futura devuelve el mensaje
 * aprobado, y la tasa solo se anuncia cuando existe.
 */
import { describe, expect, it } from 'vitest';
import {
  MENSAJE_FECHA_PAGO_VACIA,
  errorTrasCambiarFecha,
  textoTasaCobro,
  validarFechaCobro,
} from './cobro-sala';

const MENSAJE_FECHA_PAGO_FUTURA = 'La fecha del pago no puede ser posterior a hoy.';
const HOY = '2026-10-11';

describe('cobro-sala · contrato 6: fecha del pago y texto de tasa', () => {
  it('6a · hoy es una fecha válida', () => {
    expect(validarFechaCobro(HOY, HOY)).toBeNull();
  });

  it('6b · una fecha anterior es válida', () => {
    expect(validarFechaCobro('2026-09-21', HOY)).toBeNull();
  });

  it('6c · una fecha vacía pide elegir la fecha del pago', () => {
    expect(validarFechaCobro('', HOY)).toBe('Elige la fecha del pago.');
  });

  it('6d · una fecha posterior a hoy devuelve el mensaje aprobado', () => {
    expect(validarFechaCobro('2026-10-12', HOY)).toBe(MENSAJE_FECHA_PAGO_FUTURA);
  });

  it('6e · sin tasa no hay texto de tasa', () => {
    expect(textoTasaCobro(undefined)).toBeNull();
    expect(textoTasaCobro(null)).toBeNull();
    expect(textoTasaCobro('')).toBeNull();
  });

  it('6f · con tasa el texto anuncia la conversión con la tasa vigente al registrar', () => {
    expect(textoTasaCobro('65.0000')).toBe(
      'Se convertirá con la tasa vigente al registrar: 1 USD = 65.0000 Bs.'
    );
  });

  it('6g · con espacios iniciales, una fecha futura sigue siendo futura (hallazgo 4)', () => {
    expect(validarFechaCobro(' 2099-01-01', '2026-10-12')).toBe(MENSAJE_FECHA_PAGO_FUTURA);
  });

  it('6h · una fecha de solo espacios pide elegir la fecha del pago (hallazgo 4)', () => {
    expect(validarFechaCobro('  ', HOY)).toBe(MENSAJE_FECHA_PAGO_VACIA);
    expect(validarFechaCobro('  ', HOY)).toBe('Elige la fecha del pago.');
  });
});

describe('cobro-sala · contrato 4 (unitario): errorTrasCambiarFecha (hallazgo 5)', () => {
  it('4u-a · un error de fecha vacía se borra al cambiar la fecha', () => {
    expect(errorTrasCambiarFecha(MENSAJE_FECHA_PAGO_VACIA)).toBeNull();
  });

  it('4u-b · un error de fecha futura se borra al cambiar la fecha', () => {
    expect(errorTrasCambiarFecha(MENSAJE_FECHA_PAGO_FUTURA)).toBeNull();
  });

  it('4u-c · un error que no es de fecha se conserva al cambiar la fecha', () => {
    expect(errorTrasCambiarFecha('El monto debe ser mayor a 0.00.')).toBe(
      'El monto debe ser mayor a 0.00.'
    );
  });

  it('4u-d · sin error no aparece ninguno al cambiar la fecha', () => {
    expect(errorTrasCambiarFecha(null)).toBeNull();
  });
});
