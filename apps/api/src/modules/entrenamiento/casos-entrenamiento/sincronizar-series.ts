import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { eq } from '@guachafit/database';
import { ejerciciosSesion, seriesRegistro, sesionesEntrenamiento } from '@guachafit/database';
import {
  CODIGO_SESION_NO_INICIADA,
  DECIMAL_STRING_REGEX,
  EstadoSesion,
  Rol,
  SincronizarSeriesBatchSchema,
} from '@guachafit/shared';
import type {
  SesionEntrenamientoDetalleDTO,
  SincronizarSeriesBatchDTO,
} from '@guachafit/shared';
import { parsearContrato } from '../../../common/errores/parsear-contrato';
import type { ContextoEntrenamiento } from './contexto';
import { MENSAJE_SESION_NO_ENCONTRADA } from './contexto';
import { obtenerSesionPorId } from './obtener-sesion-por-id';

// ---------------------------------------------------------------------------
// 5. REGISTRO DE SERIES Y SINCRONIZACIÓN BATCH (RN-01, OFFLINE-FIRST)
// (Movido sin cambios desde `EntrenamientoService.ejecutarSincronizarSeries`.
// La envoltura idempotente RNF-002 §4 queda en la fachada.)
// ---------------------------------------------------------------------------

/**
 * Sincronizar lote de series completadas en una sesión en progreso.
 * Valida estado 'en_progreso', pesoKg con hasta 2 decimales y reps >= 0.
 */
export async function ejecutarSincronizarSeries(
  ctx: ContextoEntrenamiento,
  sesionId: string,
  alumnoId: string,
  input: SincronizarSeriesBatchDTO
): Promise<SesionEntrenamientoDetalleDTO> {
  const { db } = ctx;
  const validado = parsearContrato(SincronizarSeriesBatchSchema, input);

  const [sesion] = await db
    .select()
    .from(sesionesEntrenamiento)
    .where(eq(sesionesEntrenamiento.id, sesionId))
    .limit(1);

  if (!sesion) {
    throw new NotFoundException(MENSAJE_SESION_NO_ENCONTRADA);
  }

  if (sesion.alumnoId !== alumnoId) {
    throw new ForbiddenException('No tienes permiso para actualizar esta sesión.');
  }

  if (sesion.estado !== EstadoSesion.EN_PROGRESO) {
    // LOTE API-2: código estable para que la web reactive las series encoladas cuando el
    // alumno inicie la sesión (`offline-sync.ts`), sin depender del texto del mensaje.
    throw new BadRequestException({
      statusCode: 400,
      error: 'Bad Request',
      code: CODIGO_SESION_NO_INICIADA,
      message: 'Para marcar series, primero pulsa «Comenzar a entrenar».',
    });
  }

  // Obtener los ejercicios de la sesión para validar pertenencia de las series
  const ejSesiones = await db
    .select()
    .from(ejerciciosSesion)
    .where(eq(ejerciciosSesion.sesionId, sesionId));

  const ejSesionIds = ejSesiones.map((e) => e.id);
  if (ejSesionIds.length === 0) {
    throw new BadRequestException('La sesión no contiene ejercicios asociados.');
  }

  const seriesExistentes: any[] = [];
  for (const ejId of ejSesionIds) {
    const rows = await db
      .select()
      .from(seriesRegistro)
      .where(eq(seriesRegistro.ejercicioSesionId, ejId));
    seriesExistentes.push(...rows);
  }

  const seriesMap = new Map(seriesExistentes.map((s) => [s.id, s]));

  for (const sInput of validado.series) {
    const serie = seriesMap.get(sInput.serieId);
    if (!serie) {
      throw new BadRequestException(
        'Esta serie ya no está en tu entrenamiento. Actualiza la pantalla.'
      );
    }

    let pesoKgFinal = '0.00';
    if (sInput.pesoKg !== null && sInput.pesoKg !== undefined && sInput.pesoKg !== '') {
      if (!DECIMAL_STRING_REGEX.test(sInput.pesoKg)) {
        throw new BadRequestException('Escribe el peso con números, por ejemplo 60 o 62,5.');
      }
      pesoKgFinal = sInput.pesoKg;
    }

    let rpeFinal: string | null = null;
    if (sInput.rpe !== null && sInput.rpe !== undefined && sInput.rpe !== '') {
      rpeFinal = sInput.rpe;
    }

    if (sInput.repsLogradas < 0) {
      throw new BadRequestException('Las repeticiones logradas no pueden ser negativas.');
    }

    const timestampUtc = sInput.timestampCompletadaUtc
      ? new Date(sInput.timestampCompletadaUtc)
      : new Date();

    // WU17: el inicio real solo se escribe cuando el cliente lo envía; si no llega
    // (cliente previo o re-sync sin la marca), se conserva lo ya persistido y nunca
    // se inventa. El cliente jamás retro-marca series ya completadas.
    const timestampInicioUtc = sInput.timestampInicioUtc
      ? new Date(sInput.timestampInicioUtc)
      : serie.timestampInicioUtc ?? null;

    await db
      .update(seriesRegistro)
      .set({
        repsLogradas: sInput.repsLogradas,
        pesoKg: pesoKgFinal,
        rpe: rpeFinal,
        descansoSegundos: sInput.descansoSegundos !== undefined ? sInput.descansoSegundos : (serie.descansoSegundos ?? null),
        completada: sInput.completada,
        timestampInicioUtc,
        timestampCompletadaUtc: timestampUtc,
      })
      .where(eq(seriesRegistro.id, sInput.serieId));
  }

  return obtenerSesionPorId(ctx, sesionId, alumnoId, Rol.ALUMNO);
}
