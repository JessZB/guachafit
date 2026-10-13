import { SesionAlumnoFinalizadaEvent } from '../../notificaciones/events/eventos-notificacion';
import type { ContextoEntrenamiento } from './contexto';

// ---------------------------------------------------------------------------
// NOTIFICACIÓN AL COACH TRAS FINALIZAR SESIÓN (RF-014 / ADR-010)
// (Movido sin cambios desde `EntrenamientoService.notificarEntrenadorSesionFinalizada`.)
// ---------------------------------------------------------------------------

/**
 * RF-014 / ADR-010: emite el evento de dominio `SesionAlumnoFinalizadaEvent` hacia el coach.
 *
 * Decisiones de diseño:
 * - Se publica en el bus (`emitAsync`) y el `NotificationDispatcherService` (suscriptor)
 *   persiste In-App + encola Push/Email según preferencias del coach; ningún proveedor externo
 *   ni el despachador se invocan desde el servicio de negocio (RN-01).
 * - El despacho se espera dentro de try/catch: la persistencia In-App es obligatoria y barata,
 *   mientras que un fallo de infraestructura de colas JAMÁS debe romper la finalización (RNF-004).
 * - Idempotencia: la máquina de estados de la sesión (`en_progreso` -> `completada`) garantiza una
 *   única transición, por lo que no puede emitirse el evento dos veces para la misma sesión.
 */
export async function notificarEntrenadorSesionFinalizada(
  ctx: ContextoEntrenamiento,
  params: {
    sesion: { alumnoId: string; fechaProgramada: string; bloqueId: string | null };
    perfilAlumno:
      | { id: string; entrenadorId: string; nombres: string; apellidos: string }
      | undefined;
    sesionId: string;
    porcentajeCumplimiento: string;
    volumenTotalKg: string;
    series: any[];
    notasAlumno?: string | null;
  }
): Promise<void> {
  const { eventEmitter, logger } = ctx;
  if (!eventEmitter || !params.perfilAlumno?.entrenadorId) return;

  const { sesion, perfilAlumno, sesionId } = params;
  const nombreAlumno = `${perfilAlumno.nombres} ${perfilAlumno.apellidos}`.trim();

  const rpes = params.series
    .map((s) => parseFloat(s.rpe ?? ''))
    .filter((n) => Number.isFinite(n));
  const rpePromedio =
    rpes.length > 0
      ? (rpes.reduce((acc, n) => acc + n, 0) / rpes.length).toFixed(1)
      : null;
  const dejoNota = !!(params.notasAlumno && params.notasAlumno.trim().length > 0);

  let cuerpo = `${nombreAlumno} finalizó su sesión del ${sesion.fechaProgramada} con ${params.porcentajeCumplimiento}% de cumplimiento.`;
  if (rpePromedio) cuerpo += ` RPE promedio: ${rpePromedio}.`;
  if (dejoNota) cuerpo += ' Dejó una nota en la sesión.';

  try {
    await eventEmitter.emitAsync(
      SesionAlumnoFinalizadaEvent.NOMBRE,
      new SesionAlumnoFinalizadaEvent({
        tipoEvento: 'SESION_ALUMNO_FINALIZADA',
        destinatarioUserId: perfilAlumno.entrenadorId,
        entrenadorId: perfilAlumno.entrenadorId,
        categoria: 'ENTRENAMIENTO',
        titulo: 'Sesión finalizada por tu alumno',
        cuerpo,
        linkAccion: `/coach/alumnos/${perfilAlumno.id}`,
        datosAdicionales: {
          sesionId,
          alumnoId: sesion.alumnoId,
          perfilAlumnoId: perfilAlumno.id,
          fechaProgramada: sesion.fechaProgramada,
          bloqueId: sesion.bloqueId,
          porcentajeCumplimiento: params.porcentajeCumplimiento,
          volumenTotalKg: params.volumenTotalKg,
          rpePromedio,
          dejoNota,
        },
        esCriticoSeguridad: false,
        // RNF-004 §3: ref de origen del jobId determinista.
        referenciaId: sesionId,
      })
    );
  } catch (error) {
    logger?.warn(
      `No se pudo notificar al entrenador ${perfilAlumno.entrenadorId} la finalización de la sesión ${sesionId}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
