import { describe, it, expect } from 'vitest';
import { esViolacionUnicidad } from '../../src/common/violacion-unicidad.util';
import { esViolacionUnicidadCheckinDiario } from '../../src/modules/nutricion/nutricion.service';

/**
 * M5 · lote P1 (contrato B): detector ÚNICO de violaciones de unicidad.
 *
 * `apps/api/src/common/violacion-unicidad.util.ts` (NUEVO) exporta `esViolacionUnicidad`:
 * - `true` si el error, o su `cause` (como máximo 3 saltos), tiene `code === '23505'`.
 * - Con `indice`, además exige `constraint_name === indice`, o `constraint === indice`
 *   cuando no hay `constraint_name`.
 *
 * En fase roja el módulo AÚN NO EXISTE: el import no resuelve y TODS los tests del
 * spec FALLAN por la razón esperada (módulo inexistente). Cuando Claude lo implemente,
 * cada caso queda cubierto uno a uno.
 *
 * `esViolacionUnicidadCheckinDiario` (nutrición) sigue exportada desde su módulo actual;
 * al convivir con el util nuevo, su comportamiento debe seguir siendo el mismo (mismo
 * índice `uq_checkin_nutricional_diario`, la misma pausa por revisión de la causa y el
 * mismo rechazo de otros códigos) y delega en el detector común.
 */
/** Encadena `cause` n veces sobre el error base. */
function envuelto(base: unknown, saltos: number): unknown {
  let actual = base;
  for (let i = 0; i < saltos; i++) {
    actual = new Error(`envoltorio ${i + 1}`, { cause: actual });
  }
  return actual;
}

describe('M5 P1 · detector único de violaciones de unicidad (contrato B)', () => {
  it('B: sin índice, { code: 23505 } → true', () => {
    expect(esViolacionUnicidad({ code: '23505' })).toBe(true);
  });

  it('B: { code: 23505, constraint_name: "x" } con índice "x" → true y con "y" → false', () => {
    expect(esViolacionUnicidad({ code: '23505', constraint_name: 'x' }, 'x')).toBe(true);
    expect(esViolacionUnicidad({ code: '23505', constraint_name: 'x' }, 'y')).toBe(false);
  });

  it('B: { code: 23505, constraint: "x" } con índice "x" → true (clave de pg)', () => {
    expect(esViolacionUnicidad({ code: '23505', constraint: 'x' }, 'x')).toBe(true);
    expect(esViolacionUnicidad({ code: '23505', constraint: 'x' }, 'y')).toBe(false);
  });

  it('B: con ambas claves gana constraint_name sobre constraint', () => {
    expect(
      esViolacionUnicidad({ code: '23505', constraint_name: 'x', constraint: 'y' }, 'x')
    ).toBe(true);
    expect(
      esViolacionUnicidad({ code: '23505', constraint_name: 'x', constraint: 'y' }, 'y')
    ).toBe(false);
  });

  it('B: envuelto en cause a 1 salto → true', () => {
    const error = envuelto({ code: '23505', constraint_name: 'uq_x' }, 1);
    expect(esViolacionUnicidad(error, 'uq_x')).toBe(true);
    expect(esViolacionUnicidad(error)).toBe(true);
  });

  it('B: envuelto en cause a 3 saltos → true y a 4 saltos → false', () => {
    expect(esViolacionUnicidad(envuelto({ code: '23505' }, 3))).toBe(true);
    expect(esViolacionUnicidad(envuelto({ code: '23505' }, 4))).toBe(false);
  });

  it('B: un 23505 de OTRO índice se rechaza', () => {
    expect(
      esViolacionUnicidad(envuelto({ code: '23505', constraint_name: 'uq_ajeno' }, 1), 'uq_x')
    ).toBe(false);
  });

  it('B: no-violaciones → false: 23503, null, un string o un Error común', () => {
    expect(esViolacionUnicidad({ code: '23503' })).toBe(false);
    expect(esViolacionUnicidad(null)).toBe(false);
    expect(esViolacionUnicidad('23505')).toBe(false);
    expect(esViolacionUnicidad(new Error('fallo común'))).toBe(false);
  });

  it('B: el módulo de nutrición sigue ofreciendo esViolacionUnicidadCheckinDiario con SU índice y 1 salto', () => {
    expect(
      esViolacionUnicidadCheckinDiario({
        code: '23505',
        constraint_name: 'uq_checkin_nutricional_diario',
      })
    ).toBe(true);
    expect(
      esViolacionUnicidadCheckinDiario(
        envuelto({ code: '23505', constraint: 'uq_checkin_nutricional_diario' }, 1)
      )
    ).toBe(true);
    expect(
      esViolacionUnicidadCheckinDiario({ code: '23505', constraint_name: 'uq_otro' })
    ).toBe(false);
    expect(esViolacionUnicidadCheckinDiario({ code: '23503' })).toBe(false);
    expect(esViolacionUnicidadCheckinDiario(new Error('fallo común'))).toBe(false);
  });

  it('B: el detector vivo de nutrición delega en el util común (mismo resultado con su índice)', () => {
    // Regresión: lo que ya funciona en nutrición no se toca con este lote; el envoltorio es
    // una delegación con su índice, así que ambos detectores deben coincidir caso a caso.
    const casos: unknown[] = [
      { code: '23505', constraint_name: 'uq_checkin_nutricional_diario' },
      envuelto({ code: '23505', constraint: 'uq_checkin_nutricional_diario' }, 1),
      { code: '23505', constraint_name: 'uq_otro' },
      { code: '23503' },
      new Error('fallo común'),
    ];
    for (const caso of casos) {
      expect(esViolacionUnicidadCheckinDiario(caso)).toBe(
        esViolacionUnicidad(caso, 'uq_checkin_nutricional_diario')
      );
    }
  });
});
