import { describe, it, expect } from 'vitest';
import { EstadoAlumno } from '@guachafit/shared';
import { ApiError } from './api-client';
import { resolverBloqueoAlumno, CODIGO_ALUMNO_BLOQUEADO } from './acceso-alumno';

/**
 * RF-012 / WU-D: la pantalla de bloqueo se decide por el código máquina `ALUMNO_BLOQUEADO`,
 * nunca por el texto del mensaje. Estos tests fijan ese contrato.
 */

function apiError(status: number, extra: Record<string, unknown> = {}, detail = '') {
  return new ApiError(status, {
    type: 'https://api.guachafit.com/errors/forbidden',
    title: 'Forbidden',
    status,
    detail,
    message: detail,
    timestampUtc: new Date().toISOString(),
    ...extra,
  } as any);
}

describe('resolverBloqueoAlumno (RF-012): código máquina → pantalla de bloqueo', () => {
  it('suspendido_pago: muestra el texto de RF-012 y ofrece "Reportar pago" hacia /app/pagos', () => {
    const bloqueo = resolverBloqueoAlumno(
      apiError(403, {
        code: CODIGO_ALUMNO_BLOQUEADO,
        estado: EstadoAlumno.SUSPENDIDO_PAGO,
        motivo: 'ESTADO_ACTIVACION',
      })
    );

    expect(bloqueo).not.toBeNull();
    expect(bloqueo!.estado).toBe(EstadoAlumno.SUSPENDIDO_PAGO);
    expect(bloqueo!.motivo).toBe('ESTADO_ACTIVACION');
    expect(bloqueo!.mensaje).toContain('Tu acceso a la planificación se encuentra pausado por mensualidad pendiente');
    expect(bloqueo!.rutaAccion).toBe('/app/pagos');
    expect(bloqueo!.textoAccion).toBe('Reportar pago');
  });

  it('inactivo_pausado: pantalla informativa con acceso al historial en modo lectura', () => {
    const bloqueo = resolverBloqueoAlumno(
      apiError(403, {
        code: CODIGO_ALUMNO_BLOQUEADO,
        estado: EstadoAlumno.INACTIVO_PAUSADO,
        motivo: 'ESTADO_ACTIVACION',
      })
    );

    expect(bloqueo!.estado).toBe(EstadoAlumno.INACTIVO_PAUSADO);
    expect(bloqueo!.mensaje).toMatch(/no puedes iniciar nuevas sesiones ni enviar reportes/i);
    expect(bloqueo!.rutaAccion).toBe('/app/progreso');
  });

  it('archivado: cuenta archivada sin acción de pago (solo contactar al entrenador, B14)', () => {
    const bloqueo = resolverBloqueoAlumno(
      apiError(403, {
        code: CODIGO_ALUMNO_BLOQUEADO,
        estado: 'archivado',
        motivo: 'CUENTA_ARCHIVADA',
      })
    );

    expect(bloqueo!.estado).toBe('archivado');
    expect(bloqueo!.motivo).toBe('CUENTA_ARCHIVADA');
    expect(bloqueo!.titulo).toBe('Cuenta archivada');
    expect(bloqueo!.mensaje).toMatch(/archivó tu cuenta/i);
    expect(bloqueo!.mensaje).not.toMatch(/baja/i);
    expect(bloqueo!.rutaAccion).toBeNull();
    expect(bloqueo!.textoAccion).toBeNull();
  });

  it('estado desconocido: usa el mensaje humano real de la API como respaldo', () => {
    const bloqueo = resolverBloqueoAlumno(
      apiError(403, {
        code: CODIGO_ALUMNO_BLOQUEADO,
        estado: 'estado_futuro',
        message: 'Tu cuenta está en revisión administrativa.',
      })
    );

    expect(bloqueo!.estado).toBe('desconocido');
    expect(bloqueo!.mensaje).toBe('Tu cuenta está en revisión administrativa.');
  });

  it('403 de otro código (p. ej. RBAC) NO abre la pantalla de bloqueo', () => {
    expect(
      resolverBloqueoAlumno(
        apiError(403, { message: 'Acceso denegado: rol insuficiente.' }, 'Acceso denegado')
      )
    ).toBeNull();
    expect(resolverBloqueoAlumno(apiError(403, { code: 'OTRO_CODIGO' }))).toBeNull();
  });

  it('otros status (401/404/500) y errores de red devuelven null', () => {
    expect(
      resolverBloqueoAlumno(
        apiError(401, { code: CODIGO_ALUMNO_BLOQUEADO, estado: 'archivado' })
      )
    ).toBeNull();
    expect(
      resolverBloqueoAlumno(
        apiError(500, { code: CODIGO_ALUMNO_BLOQUEADO, estado: 'archivado' })
      )
    ).toBeNull();
    expect(resolverBloqueoAlumno(new Error('Failed to fetch'))).toBeNull();
    expect(resolverBloqueoAlumno(null)).toBeNull();
    expect(resolverBloqueoAlumno(undefined)).toBeNull();
  });
});
