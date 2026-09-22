import { describe, expect, it } from 'vitest';
import {
  CANALES_OBLIGATORIOS_NOTIFICACION,
  Rol,
  matrizPreferenciasPorRol,
} from '@guachafit/shared';
import {
  buildDemoNotificacionesInApp,
  buildDemoPreferenciasNotificacion,
} from './demo-notificaciones';
import { categoriaVisualNotificacion } from './notificaciones-in-app';

describe('demo-notificaciones: bandeja demo', () => {
  it('el alumno ve 4 avisos variados con 2 sin leer y fechas válidas', () => {
    const items = buildDemoNotificacionesInApp(Rol.ALUMNO);
    expect(items).toHaveLength(4);
    expect(items.filter((item) => !item.leida)).toHaveLength(2);
    expect(new Set(items.map((item) => categoriaVisualNotificacion(item.tipoEvento))).size).toBeGreaterThanOrEqual(3);
    for (const item of items) {
      expect(Number.isNaN(Date.parse(item.createdAtUtc))).toBe(false);
      expect(item.id).toMatch(/^demo-notif-/);
    }
  });

  it('el coach ve avisos de su operación (cobranzas, registros y resumen)', () => {
    const items = buildDemoNotificacionesInApp(Rol.ENTRENADOR);
    expect(items).toHaveLength(4);
    const tipos = items.map((item) => item.tipoEvento);
    expect(tipos).toContain('PAGO_REPORTADO');
    expect(tipos).toContain('ALUMNO_REGISTRADO');
    expect(tipos).toContain('RESUMEN_SEMANAL_COACH');
    expect(items.some((item) => item.linkAccion === '/coach/alumnos/al-demo-1')).toBe(true);
  });

  it('un rol desconocido cae en la bandeja del alumno (nunca una lista vacía)', () => {
    expect(buildDemoNotificacionesInApp(null)).toHaveLength(4);
  });
});

describe('demo-notificaciones: preferencias demo', () => {
  it('la matriz del alumno replica las filas del contrato §A con Seguridad bloqueada', () => {
    const demo = buildDemoPreferenciasNotificacion(Rol.ALUMNO);
    expect(demo.rol).toBe(Rol.ALUMNO);
    expect(demo.matriz.map((fila) => fila.id)).toEqual(
      matrizPreferenciasPorRol(Rol.ALUMNO).map((fila) => fila.id)
    );

    const seguridad = demo.matriz.find((fila) => fila.id === 'SEGURIDAD');
    expect(seguridad?.email).toBe(true);
    expect(seguridad?.canalesObligatorios).toEqual(['email']);
    expect(demo.canalesObligatorios).toEqual([...CANALES_OBLIGATORIOS_NOTIFICACION]);
    expect(demo.notifySeguridadEmail).toBe(true);
  });

  it('la matriz del coach replica las filas del contrato §B (sin filas del alumno)', () => {
    const demo = buildDemoPreferenciasNotificacion(Rol.ENTRENADOR);
    expect(demo.matriz.map((fila) => fila.id)).toEqual(
      matrizPreferenciasPorRol(Rol.ENTRENADOR).map((fila) => fila.id)
    );
    expect(demo.matriz.some((fila) => fila.id === 'FINANZAS')).toBe(false);
    expect(demo.matriz.some((fila) => fila.id === 'COBRANZAS')).toBe(true);
  });

  it('los canales no bloqueados reflejan los valores planos del fixture', () => {
    const demo = buildDemoPreferenciasNotificacion(Rol.ALUMNO);
    const finanzas = demo.matriz.find((fila) => fila.id === 'FINANZAS');
    expect(finanzas?.push).toBe(demo.notifyPaymentsPush);
    expect(finanzas?.email).toBe(demo.notifyPaymentsEmail);
    // Variación demo explícita: el alumno activó el correo de entrenamiento.
    expect(demo.notifyWorkoutsEmail).toBe(true);
  });

  it('el superadmin hereda la matriz del entrenador', () => {
    const demo = buildDemoPreferenciasNotificacion(Rol.SUPERADMIN);
    expect(demo.rol).toBe(Rol.SUPERADMIN);
    expect(demo.matriz.map((fila) => fila.id)).toEqual(
      matrizPreferenciasPorRol(Rol.ENTRENADOR).map((fila) => fila.id)
    );
  });
});
