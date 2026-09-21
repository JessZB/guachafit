import { describe, expect, it } from 'vitest';
import {
  decidirAccionErrorCheckinNutricional,
  MENSAJE_YA_REGISTRADO_HOY,
  obtenerStatusError,
} from './nutricion-checkin';

/** Error con la forma de ApiError del cliente web (status HTTP + message). */
function apiError(status: number, message = 'Error del servidor'): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

describe('decidirAccionErrorCheckinNutricional (RF-002: sin éxito fabricado)', () => {
  it('409 (ya existe el reporte de hoy) refresca el estado real; nunca encola ni muestra éxito', () => {
    const decision = decidirAccionErrorCheckinNutricional(
      apiError(409, 'Violación de unicidad'),
      true
    );
    expect(decision.accion).toBe('refrescar');
    expect(decision.mensaje).toBe(MENSAJE_YA_REGISTRADO_HOY);
  });

  it('400/422 (rechazo de negocio) muestra el mensaje del servidor sin encolar', () => {
    const decision400 = decidirAccionErrorCheckinNutricional(apiError(400, 'Datos inválidos'), true);
    expect(decision400.accion).toBe('mostrar_error');
    expect(decision400.mensaje).toBe('Datos inválidos');

    expect(decidirAccionErrorCheckinNutricional(apiError(422, 'Semáforo inválido'), true).accion).toBe(
      'mostrar_error'
    );
  });

  it('error de red sin status (fetch caído) usa la cola offline reintentable', () => {
    expect(decidirAccionErrorCheckinNutricional(new TypeError('Failed to fetch'), true).accion).toBe(
      'encolar'
    );
  });

  it('5xx (servidor caído) también queda en cola: no es un rechazo concluyente', () => {
    expect(decidirAccionErrorCheckinNutricional(apiError(500, 'Internal'), true).accion).toBe(
      'encolar'
    );
  });

  it('sin conexión observada encola incluso si el error pareciera definitivo', () => {
    const decision = decidirAccionErrorCheckinNutricional(apiError(409), false);
    expect(decision.accion).toBe('encolar');
  });

  it('obtenerStatusError devuelve 0 cuando no hay status numérico', () => {
    expect(obtenerStatusError(new Error('sin status'))).toBe(0);
    expect(obtenerStatusError({ status: 409 })).toBe(409);
  });
});
