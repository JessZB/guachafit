import { describe, expect, it } from 'vitest';
import {
  MENSAJE_MINIMO_CANAL_FINANZAS,
  Rol,
  matrizPreferenciasPorRol,
  type CategoriaPreferenciasDTO,
} from '@guachafit/shared';
import {
  TEXTO_ADVERTENCIA_FINANZAS,
  aplicarCambioCanal,
  construirPayloadPreferencias,
  descripcionCategoriaNotificacion,
  esErrorConfirmacionFinanzas,
  hayCambiosPreferencias,
  requiereConfirmacionFinanzas,
} from './preferencias-notificacion';

function fila(
  id: CategoriaPreferenciasDTO['id'],
  push: boolean,
  email: boolean,
  canalesObligatorios: CategoriaPreferenciasDTO['canalesObligatorios'] = []
): CategoriaPreferenciasDTO {
  return { id, etiqueta: `Etiqueta ${id}`, push, email, canalesObligatorios };
}

const MATRIZ_ALUMNO: CategoriaPreferenciasDTO[] = [
  fila('FINANZAS', true, true),
  fila('PLANIFICACION_DEPORTIVA', true, false),
  fila('CHECKIN_ANTROPOMETRICO', true, false),
  fila('SEGURIDAD', false, true, ['email']),
];

const MATRIZ_COACH: CategoriaPreferenciasDTO[] = [
  fila('COBRANZAS', true, true),
  fila('NUEVOS_REGISTROS', true, true),
  fila('REPORTES_PROGRESO', true, false),
  fila('RESUMEN_SEMANAL', false, true),
  fila('SEGURIDAD', false, true, ['email']),
];

describe('preferencias-notificacion: cambios en la matriz', () => {
  it('aplica el cambio sobre una copia inmutable', () => {
    const cambiada = aplicarCambioCanal(MATRIZ_ALUMNO, 'FINANZAS', 'email', false);
    expect(cambiada.find((f) => f.id === 'FINANZAS')?.email).toBe(false);
    expect(MATRIZ_ALUMNO.find((f) => f.id === 'FINANZAS')?.email).toBe(true);
  });

  it('ignora canales bloqueados y filas inexistentes', () => {
    const bloqueado = aplicarCambioCanal(MATRIZ_ALUMNO, 'SEGURIDAD', 'email', false);
    expect(bloqueado.find((f) => f.id === 'SEGURIDAD')?.email).toBe(true);
    const inexistente = aplicarCambioCanal(MATRIZ_ALUMNO, 'RESUMEN_SEMANAL', 'push', false);
    expect(inexistente).toEqual(MATRIZ_ALUMNO);
  });

  it('detecta cambios reales solo en canales (no en etiquetas)', () => {
    expect(hayCambiosPreferencias(MATRIZ_ALUMNO, MATRIZ_ALUMNO)).toBe(false);
    const conCambio = aplicarCambioCanal(MATRIZ_ALUMNO, 'PLANIFICACION_DEPORTIVA', 'email', true);
    expect(hayCambiosPreferencias(MATRIZ_ALUMNO, conCambio)).toBe(true);
    expect(hayCambiosPreferencias(MATRIZ_ALUMNO, [...MATRIZ_ALUMNO, fila('FINANZAS', true, true)])).toBe(
      true
    );
  });
});

describe('preferencias-notificacion: payload del PUT', () => {
  it('el alumno envía solo sus campos planos', () => {
    const payload = construirPayloadPreferencias(Rol.ALUMNO, MATRIZ_ALUMNO);
    expect(payload).toEqual({
      notifyPaymentsPush: true,
      notifyPaymentsEmail: true,
      notifyWorkoutsPush: true,
      notifyWorkoutsEmail: false,
      notifyCheckinsPush: true,
      notifyCheckinsEmail: false,
      notifySeguridadPush: false,
      notifySeguridadEmail: true,
    });
    expect(payload).not.toHaveProperty('notifyCobranzasPush');
  });

  it('el coach envía solo sus campos planos', () => {
    const payload = construirPayloadPreferencias(Rol.ENTRENADOR, MATRIZ_COACH);
    expect(payload).toEqual({
      notifyCobranzasPush: true,
      notifyCobranzasEmail: true,
      notifyNuevosRegistrosPush: true,
      notifyNuevosRegistrosEmail: true,
      notifyReportesProgresoPush: true,
      notifyReportesProgresoEmail: false,
      digestWeeklyPush: false,
      digestWeeklyEmail: true,
      notifySeguridadPush: false,
      notifySeguridadEmail: true,
    });
    expect(payload).not.toHaveProperty('notifyPaymentsPush');
  });

  it('solo incluye filas presentes en la matriz visible', () => {
    const payload = construirPayloadPreferencias(Rol.ALUMNO, [fila('FINANZAS', false, true)]);
    expect(payload).toEqual({ notifyPaymentsPush: false, notifyPaymentsEmail: true });
  });
});

describe('preferencias-notificacion: RN-02', () => {
  it('el alumno sin canales de Finanzas requiere confirmación', () => {
    const sinCanales = aplicarCambioCanal(
      aplicarCambioCanal(MATRIZ_ALUMNO, 'FINANZAS', 'push', false),
      'FINANZAS',
      'email',
      false
    );
    expect(requiereConfirmacionFinanzas(Rol.ALUMNO, sinCanales)).toBe(true);
    expect(requiereConfirmacionFinanzas(Rol.ALUMNO, MATRIZ_ALUMNO)).toBe(false);
    const soloPush = aplicarCambioCanal(MATRIZ_ALUMNO, 'FINANZAS', 'email', false);
    expect(requiereConfirmacionFinanzas(Rol.ALUMNO, soloPush)).toBe(false);
  });

  it('en el coach la fila de Finanzas es "Cobranzas Entrantes"', () => {
    const sinCanales = aplicarCambioCanal(
      aplicarCambioCanal(MATRIZ_COACH, 'COBRANZAS', 'push', false),
      'COBRANZAS',
      'email',
      false
    );
    expect(requiereConfirmacionFinanzas(Rol.ENTRENADOR, sinCanales)).toBe(true);
  });

  it('la advertencia visible es la parte humana del mensaje del contrato (sin jerga técnica)', () => {
    expect(MENSAJE_MINIMO_CANAL_FINANZAS.startsWith(TEXTO_ADVERTENCIA_FINANZAS)).toBe(true);
    expect(TEXTO_ADVERTENCIA_FINANZAS).not.toContain('confirmarSinCanalesFinanzas');
  });

  it('detecta el 400 de confirmación en sus dos formas y descarta errores ajenos', () => {
    expect(
      esErrorConfirmacionFinanzas({
        error: 'RN-02',
        message: MENSAJE_MINIMO_CANAL_FINANZAS,
        requiereConfirmacion: true,
      })
    ).toBe(true);
    expect(
      esErrorConfirmacionFinanzas({
        error: 'PREFERENCIAS_INVALIDAS',
        errores: [{ campo: 'notifyPaymentsPush', mensaje: MENSAJE_MINIMO_CANAL_FINANZAS }],
      })
    ).toBe(true);
    expect(esErrorConfirmacionFinanzas({ error: 'RN-01', message: 'otra cosa' })).toBe(false);
    expect(esErrorConfirmacionFinanzas({ message: 'Error de red' })).toBe(false);
    expect(esErrorConfirmacionFinanzas(null)).toBe(false);
  });
});

describe('preferencias-notificacion: copy de las categorías', () => {
  it('todas las filas del contrato (ambos roles) tienen descripción humana', () => {
    for (const rol of [Rol.ALUMNO, Rol.ENTRENADOR]) {
      for (const definicion of matrizPreferenciasPorRol(rol)) {
        const descripcion = descripcionCategoriaNotificacion(definicion.id);
        expect(descripcion.length).toBeGreaterThan(10);
        expect(descripcion).not.toMatch(/notify|digest|push|email/i);
      }
    }
  });

  it('una fila desconocida no queda sin copy', () => {
    expect(descripcionCategoriaNotificacion('FILA_FUTURA')).toBe('Avisos de esta categoría.');
  });
});
