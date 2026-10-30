/**
 * 01 · UX-10 · Contrato B6 · saldo-a-favor.
 *
 * B6: avisoExcedenteAprobacion(montoUsd, saldoCuota, nombreAlumno?):
 *     - Con ('50.00', '40.00', 'Carlos Mendoza') devuelve exactamente:
 *       "Este pago excede la deuda de la cuota en 10.00 USD; quedarán como saldo a favor de Carlos Mendoza."
 *     - Sin nombreAlumno se mantiene el texto actual:
 *       "Este pago excede la deuda de la cuota en 10.00 USD; quedarán como saldo a favor del alumno."
 */
import { describe, expect, it } from 'vitest';
import { avisoExcedenteAprobacion } from './saldo-a-favor';

describe('Contrato B6 · avisoExcedenteAprobacion con nombre del alumno (UX-10)', () => {
  it('con nombreAlumno personaliza el aviso con el nombre', () => {
    // Si la función en producción aún no declara el tercer parámetro en TS, se castea
    const fn = avisoExcedenteAprobacion as (
      monto: string,
      saldo?: string | null,
      nombre?: string
    ) => string | null;

    const resultado = fn('50.00', '40.00', 'Carlos Mendoza');
    expect(resultado).toBe(
      'Este pago excede la deuda de la cuota en 10.00 USD; quedarán como saldo a favor de Carlos Mendoza.'
    );
  });

  it('sin nombreAlumno mantiene el texto genérico previo', () => {
    const resultado = avisoExcedenteAprobacion('50.00', '40.00');
    expect(resultado).toBe(
      'Este pago excede la deuda de la cuota en 10.00 USD; quedarán como saldo a favor del alumno.'
    );
  });

  it('B6b · con nombreAlumno igual a "" o "   ", el aviso termina en "del alumno."', () => {
    const vacio = avisoExcedenteAprobacion('50.00', '40.00', '');
    expect(vacio).toBe(
      'Este pago excede la deuda de la cuota en 10.00 USD; quedarán como saldo a favor del alumno.'
    );

    const espacios = avisoExcedenteAprobacion('50.00', '40.00', '   ');
    expect(espacios).toBe(
      'Este pago excede la deuda de la cuota en 10.00 USD; quedarán como saldo a favor del alumno.'
    );
  });
});
