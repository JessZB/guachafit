/**
 * RF-018 P2 · regresión: tiempo límite de los guardados de Ajustes.
 *
 * Contratos 5-6:
 * 5. `TIEMPO_LIMITE_GUARDADO_AJUSTES_MS === 15000`.
 * 6. `mensajeErrorAjustes(new ErrorTiempoAgotado(), 'x') === MENSAJE_TIEMPO_AGOTADO`.
 */
import { describe, expect, it } from 'vitest';
import { ErrorTiempoAgotado, MENSAJE_TIEMPO_AGOTADO } from './api-client';
import { TIEMPO_LIMITE_GUARDADO_AJUSTES_MS, mensajeErrorAjustes } from './mi-perfil';

describe('mi-perfil: tiempo límite de los guardados de Ajustes (RF-018 P2)', () => {
  it('5: TIEMPO_LIMITE_GUARDADO_AJUSTES_MS es 15000', () => {
    expect(TIEMPO_LIMITE_GUARDADO_AJUSTES_MS).toBe(15000);
  });

  it('6: mensajeErrorAjustes devuelve MENSAJE_TIEMPO_AGOTADO ante ErrorTiempoAgotado', () => {
    expect(mensajeErrorAjustes(new ErrorTiempoAgotado(), 'x')).toBe(MENSAJE_TIEMPO_AGOTADO);
  });
});
