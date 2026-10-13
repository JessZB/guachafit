import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { eq } from '@guachafit/database';
import {
  ejerciciosSesion,
  perfilesAlumno,
  seriesRegistro,
  sesionesEntrenamiento,
} from '@guachafit/database';
import {
  CODIGO_SESION_VACIA,
  EstadoSesion,
  FinalizarSesionSchema,
  MotivoOmision,
  Rol,
  TipoCierreSesion,
} from '@guachafit/shared';
import type { FinalizarSesionDTO, FinalizarSesionResponseDTO } from '@guachafit/shared';
import { obtenerFechaLocalYyyyMmDd } from '../../../common/adherencia.util';
import { parsearContrato } from '../../../common/errores/parsear-contrato';
import type { ContextoEntrenamiento } from './contexto';
import { MENSAJE_HORA_INVALIDA, MENSAJE_SESION_NO_ENCONTRADA } from './contexto';
import { obtenerSesionPorId } from './obtener-sesion-por-id';
import { notificarEntrenadorSesionFinalizada } from './notificar-sesion-finalizada';
import {
  actualizarRacha,
  calcularDuracionMinutos,
  calcularRachaEfectiva,
  evaluarCumplimientoRachaPorVolumen,
} from './reglas-racha';
import type { RachaEstado } from './reglas-racha';

// ---------------------------------------------------------------------------
// 6. FINALIZACIÓN DE SESIÓN Y REGLA DE RACHA (RN-02)
// (Movido sin cambios desde `EntrenamientoService.ejecutarFinalizarSesion` +
// `notificarEntrenadorSesionFinalizada`. La envoltura idempotente RNF-002 §4
// queda en la fachada.)
// ---------------------------------------------------------------------------

/**
 * Finalizar sesión de entrenamiento.
 *
 * - porcentajeCumplimiento sigue siendo (series completadas / series totales * 100).
 * - RN-02: la racha se evalúa por VOLUMEN (ver `evaluarCumplimientoRachaPorVolumen`) y se
 *   persiste en `perfiles_alumno.racha_dias` / `racha_ultima_fecha`.
 * - RF-001 Escenario 5: si no hay NINGUNA serie completada se exige `tipoCierre`
 *   (DESCANSADA/INCOMPLETA → estado OMITIDA + motivo; COMPLETADA se rechaza).
 */
export async function ejecutarFinalizarSesion(
  ctx: ContextoEntrenamiento,
  sesionId: string,
  alumnoId: string,
  input: FinalizarSesionDTO
): Promise<FinalizarSesionResponseDTO> {
  const { db, withTenant } = ctx;
  const validado = parsearContrato(FinalizarSesionSchema, input);

  const [sesion] = await db
    .select()
    .from(sesionesEntrenamiento)
    .where(eq(sesionesEntrenamiento.id, sesionId))
    .limit(1);

  if (!sesion) {
    throw new NotFoundException(MENSAJE_SESION_NO_ENCONTRADA);
  }

  if (sesion.alumnoId !== alumnoId) {
    throw new ForbiddenException('No tienes permiso para finalizar esta sesión.');
  }

  if (sesion.estado !== EstadoSesion.EN_PROGRESO) {
    throw new BadRequestException('Este entrenamiento no está en curso; no se puede finalizar.');
  }

  // Contar series totales y completadas
  const ejSesiones = await db
    .select()
    .from(ejerciciosSesion)
    .where(eq(ejerciciosSesion.sesionId, sesionId));

  const ejSesionIds = ejSesiones.map((e) => e.id);
  let totalSeries = 0;
  let seriesCompletadas = 0;
  let volumenTotalKgStr = '0.00';
  const allSeries: any[] = [];

  if (ejSesionIds.length > 0) {
    for (const ejId of ejSesionIds) {
      const rows = await db
        .select()
        .from(seriesRegistro)
        .where(eq(seriesRegistro.ejercicioSesionId, ejId));
      allSeries.push(...rows);
    }

    totalSeries = allSeries.length;
    let volumenAcumuladoKg = 0;
    for (const s of allSeries) {
      if (s.completada) {
        seriesCompletadas++;
        const reps = s.repsLogradas ?? s.repsObjetivo ?? 0;
        const peso = parseFloat(s.pesoKg || '0') || 0;
        volumenAcumuladoKg += reps * peso;
      }
    }

    volumenTotalKgStr = volumenAcumuladoKg.toFixed(2);
  }

  const porcentajeNumero = totalSeries > 0 ? (seriesCompletadas / totalSeries) * 100 : 0;
  const porcentajeCumplimientoStr = porcentajeNumero.toFixed(2);

  // RF-001 Escenario 5: cierre de sesión vacía exige decisión explícita del alumno.
  // El 400 viaja con un código máquina estable (`code: CODIGO_SESION_VACIA`, campo canónico
  // del esquema de error RFC 7807 §1 del doc de contratos) para que la UI abra el
  // modal de cierre vacío solo ante ESTE caso y trate cualquier otro 400 como error normal.
  if (seriesCompletadas === 0) {
    if (!validado.tipoCierre) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: CODIGO_SESION_VACIA,
        message:
          'La sesión no registra series completadas. Indica si el día fue descansado o incompleto.',
      });
    }
    if (validado.tipoCierre === TipoCierreSesion.COMPLETADA) {
      throw new BadRequestException(
        'No puedes marcarlo como completado sin series hechas. Indica si fue día de descanso o quedó incompleto.'
      );
    }
  }

  const esOmision =
    validado.tipoCierre === TipoCierreSesion.DESCANSADA ||
    validado.tipoCierre === TipoCierreSesion.INCOMPLETA;
  const motivoOmision: MotivoOmision | null = esOmision
    ? validado.tipoCierre === TipoCierreSesion.DESCANSADA
      ? MotivoOmision.DESCANSO
      : MotivoOmision.INCOMPLETO
    : null;

  const fechaFinUtc = validado.fechaFinUtc ?? new Date().toISOString();
  if (!fechaFinUtc.endsWith('Z')) {
    throw new BadRequestException(MENSAJE_HORA_INVALIDA);
  }

  const duracionMinutos = calcularDuracionMinutos(sesion.fechaInicioUtc, fechaFinUtc);

  // RN-02: la omisión explícita nunca incrementa racha.
  const evaluacion = evaluarCumplimientoRachaPorVolumen(allSeries);
  const cumpleReglaRacha = !esOmision && evaluacion.cumple;

  // Racha persistida del alumno (antes se pasaba 0 fijo desde el controller).
  // RNF-003/ADR-011 (etapa 3): lectura + escritura de la racha en UNA transacción con el
  // contexto self del alumno (`perfiles_alumno` tiene RLS).
  const { perfilRacha, nuevaRacha } = await withTenant(
    { usuarioId: alumnoId },
    async (tx) => {
      const [perfilRacha] = await tx
        .select()
        .from(perfilesAlumno)
        .where(eq(perfilesAlumno.usuarioId, alumnoId))
        .limit(1);

      const rachaEstado: RachaEstado = {
        rachaDias: perfilRacha?.rachaDias ?? 0,
        rachaUltimaFecha: perfilRacha?.rachaUltimaFecha ?? null,
      };

      // RN-05: la fecha de la racha es la fecha LOCAL del alumno (timezone capturada al iniciar).
      const fechaLocal = obtenerFechaLocalYyyyMmDd(fechaFinUtc, sesion.timezoneCliente);
      const rachaActualizada = actualizarRacha(rachaEstado, fechaLocal, cumpleReglaRacha);
      const nuevaRacha = calcularRachaEfectiva(
        rachaActualizada.rachaDias,
        rachaActualizada.rachaUltimaFecha,
        fechaLocal
      );

      // cumple=false (o mismo día) NO modifica la racha almacenada.
      if (perfilRacha && rachaActualizada.incrementada) {
        await tx
          .update(perfilesAlumno)
          .set({
            rachaDias: rachaActualizada.rachaDias,
            rachaUltimaFecha: rachaActualizada.rachaUltimaFecha,
            updatedAtUtc: new Date(),
          })
          .where(eq(perfilesAlumno.id, perfilRacha.id));
      }

      return { perfilRacha, nuevaRacha };
    }
  );

  const notasFinales =
    validado.notasAlumno !== undefined ? validado.notasAlumno : sesion.notasAlumno;

  await db
    .update(sesionesEntrenamiento)
    .set({
      estado: esOmision ? EstadoSesion.OMITIDA : EstadoSesion.COMPLETADA,
      motivoOmision,
      fechaFinUtc: new Date(fechaFinUtc),
      porcentajeCumplimiento: porcentajeCumplimientoStr,
      volumenTotalKg: volumenTotalKgStr,
      notasAlumno: notasFinales,
      updatedAtUtc: new Date(),
    })
    .where(eq(sesionesEntrenamiento.id, sesionId));

  const sesionDetalle = await obtenerSesionPorId(ctx, sesionId, alumnoId, Rol.ALUMNO);
  sesionDetalle.cumpleReglaRacha = cumpleReglaRacha;
  sesionDetalle.duracionMinutos = duracionMinutos;
  sesionDetalle.volumenTotalKg = volumenTotalKgStr;

  // RF-014 / ADR-010: el coach recibe el feedback de la sesión finalizada (no en omisiones).
  if (!esOmision) {
    await notificarEntrenadorSesionFinalizada(ctx, {
      sesion,
      perfilAlumno: perfilRacha,
      sesionId,
      porcentajeCumplimiento: porcentajeCumplimientoStr,
      volumenTotalKg: volumenTotalKgStr,
      series: allSeries,
      notasAlumno: notasFinales,
    });
  }

  const respuesta: FinalizarSesionResponseDTO = {
    sesion: sesionDetalle,
    cumpleReglaRacha,
    cumpleRacha: cumpleReglaRacha,
    nuevaRacha,
    duracionMinutos,
    volumenTotalKg: volumenTotalKgStr,
  };
  return respuesta;
}
