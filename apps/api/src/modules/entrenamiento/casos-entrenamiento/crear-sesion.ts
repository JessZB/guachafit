import { ForbiddenException } from '@nestjs/common';
import { and, eq } from '@guachafit/database';
import { ejerciciosSesion, perfilesAlumno, seriesRegistro, sesionesEntrenamiento } from '@guachafit/database';
import { EstadoSesion, Rol } from '@guachafit/shared';
import type {
  CrearSesionEntrenamientoDTO,
  SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';
import { CrearSesionEntrenamientoSchema } from '@guachafit/shared';
import { MENSAJE_SIN_ACCESO_ALUMNO } from '../../../common/mensajes-acceso';
import { parsearContrato } from '../../../common/errores/parsear-contrato';
import type { ContextoEntrenamiento } from './contexto-entrenamiento';
import { obtenerSesionPorId } from './obtener-sesion-por-id';

// ---------------------------------------------------------------------------
// 2. PRESCRIPCIÓN DE SESIÓN DE ENTRENAMIENTO
// (Movido sin cambios desde `EntrenamientoService.crearSesion`: misma
// validación de tenancy, misma `db.transaction` atómica, misma delegación
// final a `obtenerSesionPorId` con rol ALUMNO.)
// ---------------------------------------------------------------------------

/**
 * Prescribir una nueva sesión de entrenamiento para un alumno con sus ejercicios y series.
 * Valida aislamiento de tenancy entre entrenador y alumno.
 */
export async function crearSesion(
  ctx: ContextoEntrenamiento,
  entrenadorId: string,
  input: CrearSesionEntrenamientoDTO
): Promise<SesionEntrenamientoDetalleDTO> {
  const { db, withTenant } = ctx;
  const validado = parsearContrato(CrearSesionEntrenamientoSchema, input);

  // Validar Tenancy: El alumno debe pertenecer a este entrenador.
  // RNF-003/ADR-011 (etapa 3): `perfiles_alumno` tiene RLS; lectura con el GUC del coach.
  const [perfilAlumno] = await withTenant({ entrenadorId }, (tx) =>
    tx
      .select()
      .from(perfilesAlumno)
      .where(
        and(
          eq(perfilesAlumno.usuarioId, validado.alumnoId),
          eq(perfilesAlumno.entrenadorId, entrenadorId)
        )
      )
      .limit(1)
  );

  if (!perfilAlumno) {
    throw new ForbiddenException(MENSAJE_SIN_ACCESO_ALUMNO);
  }

  const targetAlumnoUserId = perfilAlumno.usuarioId;

  // Crear sesión en transacción atómica
  const sesionId = await db.transaction(async (tx) => {
    const [sesion] = await tx
      .insert(sesionesEntrenamiento)
      .values({
        alumnoId: targetAlumnoUserId,
        rutinaId: validado.rutinaId ?? null,
        fechaProgramada: validado.fechaProgramada,
        timezoneCliente: validado.timezoneCliente ?? 'America/Caracas',
        estado: EstadoSesion.PLANIFICADA,
        porcentajeCumplimiento: '0.00',
        fechaInicioUtc: null,
        fechaFinUtc: null,
        notasAlumno: null,
        createdAtUtc: new Date(),
        updatedAtUtc: new Date(),
      })
      .returning();

    for (let i = 0; i < validado.ejercicios.length; i++) {
      const ejInput = validado.ejercicios[i];
      const orden = ejInput.orden ?? i + 1;

      const [ejSesion] = await tx
        .insert(ejerciciosSesion)
        .values({
          sesionId: sesion.id,
          ejercicioId: ejInput.ejercicioId,
          orden,
          notasCoach: ejInput.notasCoach ?? null,
          descansoPrescritoSegundos: ejInput.descansoSegundos ?? 90,
        })
        .returning();

      for (let j = 0; j < ejInput.series.length; j++) {
        const sInput = ejInput.series[j];
        const numeroSerie = sInput.numeroSerie ?? j + 1;

        await tx.insert(seriesRegistro).values({
          ejercicioSesionId: ejSesion.id,
          numeroSerie,
          repsObjetivo: sInput.repsObjetivo,
          repsLogradas: null,
          // `pesoKg` es SIEMPRE el peso real; arranca vacío hasta que el alumno sincronice.
          pesoKg: null,
          pesoPrescritoKg: sInput.pesoPrescritoKg ?? sInput.pesoSugeridoKg ?? null,
          rpe: sInput.rpeObjetivo ?? null,
          completada: false,
          timestampCompletadaUtc: null,
        });
      }
    }

    return sesion.id;
  });

  return obtenerSesionPorId(ctx, sesionId, targetAlumnoUserId, Rol.ALUMNO);
}
