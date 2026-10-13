import { describe, it, expect } from 'vitest';
import { ConflictException } from '@nestjs/common';
import {
  INDICE_UNICO_CHECKIN_DIARIO,
  conflictoCheckinYaRegistrado,
  esViolacionUnicidadCheckinDiario,
} from './unicidad-checkin-reglas';

/** Prompt 106: unitarias de la unicidad diaria del reporte (LOTE API-N1). */
describe('unicidad-checkin-reglas', () => {
  it('expone el índice del DDL', () => {
    expect(INDICE_UNICO_CHECKIN_DIARIO).toBe('uq_checkin_nutricional_diario');
  });

  it('detecta la violación del índice propio y rechaza otras', () => {
    expect(
      esViolacionUnicidadCheckinDiario({
        code: '23505',
        constraint_name: 'uq_checkin_nutricional_diario',
      })
    ).toBe(true);
    expect(esViolacionUnicidadCheckinDiario({ code: '23505', constraint_name: 'uq_otro' })).toBe(
      false
    );
    expect(esViolacionUnicidadCheckinDiario({ code: '23503' })).toBe(false);
    expect(esViolacionUnicidadCheckinDiario(new Error('fallo común'))).toBe(false);
  });

  it('el 409 lleva el código y texto estables del contrato', () => {
    const error = conflictoCheckinYaRegistrado();
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({
      statusCode: 409,
      error: 'Conflict',
      code: 'CHECKIN_YA_REGISTRADO',
    });
  });
});
