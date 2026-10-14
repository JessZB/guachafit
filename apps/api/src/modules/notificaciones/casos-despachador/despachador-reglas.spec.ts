import { describe, it, expect } from 'vitest';
import {
  construirHuellaCorreoCuenta,
  construirJobIdCorreoCuenta,
  construirMotivoFalloEncolado,
  esFalloCriticoCorreoCuenta,
  mapearNotificacionInApp,
  resolverPaginacionBandeja,
} from './despachador-reglas';
import { LIMITE_IN_APP_POR_DEFECTO } from '@guachafit/shared';

/**
 * Reglas puras del despachador: mapeo de la bandeja, paginación, motivos de
 * fallo e idempotencia del correo de cuenta.
 */
describe('Reglas puras del despachador', () => {
  it('mapea la fila con fecha Date a ISO', () => {
    const dto = mapearNotificacionInApp({
      id: 'n-1',
      usuarioId: 'u-1',
      titulo: 'Título',
      cuerpo: 'Cuerpo',
      tipoEvento: 'CUOTA_POR_VENCER',
      leida: false,
      linkAccion: '/app/pagos',
      createdAtUtc: new Date('2026-09-22T10:00:00.000Z'),
    } as any);
    expect(dto).toMatchObject({ id: 'n-1', leida: false });
    expect(dto.createdAtUtc).toBe('2026-09-22T10:00:00.000Z');
  });

  it('mapea la fila con fecha en texto a ISO', () => {
    const dto = mapearNotificacionInApp({
      id: 'n-2',
      usuarioId: 'u-1',
      titulo: 'Título',
      cuerpo: 'Cuerpo',
      tipoEvento: 'CUOTA_POR_VENCER',
      leida: true,
      linkAccion: null,
      createdAtUtc: '2026-09-21T10:00:00.000Z',
    } as any);
    expect(dto.createdAtUtc).toBe('2026-09-21T10:00:00.000Z');
  });

  it('aplica los defaults de paginación cuando el filtro viene vacío', () => {
    expect(resolverPaginacionBandeja({})).toEqual({
      limit: LIMITE_IN_APP_POR_DEFECTO,
      offset: 0,
      soloNoLeidas: false,
    });
  });

  it('respeta limit, offset y soloNoLeidas del filtro', () => {
    expect(resolverPaginacionBandeja({ limit: 10, offset: 20, soloNoLeidas: true })).toEqual({
      limit: 10,
      offset: 20,
      soloNoLeidas: true,
    });
  });

  it('el motivo por tiempo menciona el límite configurado', () => {
    expect(construirMotivoFalloEncolado({ ok: false, motivo: 'tiempo' })).toContain('ms');
  });

  it('el motivo por error usa el mensaje del error original', () => {
    expect(
      construirMotivoFalloEncolado({ ok: false, motivo: 'error', error: new Error('caído') }),
    ).toBe('caído');
    expect(construirMotivoFalloEncolado({ ok: false, motivo: 'error', error: 'plano' })).toBe(
      'plano',
    );
  });

  it('la huella del enlace es estable y nunca es el código en claro', () => {
    const a = construirHuellaCorreoCuenta('codigo-secreto', 'uuid-1');
    const b = construirHuellaCorreoCuenta('codigo-secreto', 'uuid-2');
    expect(a).toBe(b);
    expect(a).toHaveLength(16);
    expect(a).not.toContain('codigo-secreto');
    expect(construirHuellaCorreoCuenta('otro-codigo', 'uuid-1')).not.toBe(a);
  });

  it('el aviso sin enlace lleva identificador propio con el uuid dado', () => {
    expect(construirHuellaCorreoCuenta(undefined, 'uuid-9')).toBe('aviso_uuid-9');
  });

  it('el identificador de trabajo del correo de cuenta sigue el formato cuenta', () => {
    expect(construirJobIdCorreoCuenta('RECUPERACION_PASSWORD', 'u-1', 'huella123')).toBe(
      'cuenta_RECUPERACION_PASSWORD_u-1_huella123',
    );
  });

  it('solo la recuperación de contraseña es fallo crítico (error; el resto aviso)', () => {
    expect(esFalloCriticoCorreoCuenta('RECUPERACION_PASSWORD')).toBe(true);
    expect(esFalloCriticoCorreoCuenta('BIENVENIDA_ALUMNO')).toBe(false);
  });
});
