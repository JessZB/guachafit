import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { and, eq } from '@guachafit/database';
import { perfilesAlumno, rutinas } from '@guachafit/database';
import { GuardarRutinaSemanalSchema } from '@guachafit/shared';
import type {
  BloqueDiaRutinaDTO,
  GuardarRutinaSemanalDTO,
  RutinaSemanalDetalleDTO,
} from '@guachafit/shared';
import {
  MENSAJE_ALUMNO_NO_ENCONTRADO,
  MENSAJE_SIN_ACCESO_ALUMNO,
} from '../../../common/mensajes-acceso';
import { parsearContrato } from '../../../common/errores/parsear-contrato';
import { validarEjerciciosDeBloques } from '../catalogo-ejercicios';
import type { ContextoEntrenamiento } from './contexto-entrenamiento';
import { toIsoUtcString } from './reglas-racha';

// ---------------------------------------------------------------------------
// 3. RUTINA SEMANAL — prescripción y activación
// (Movido sin cambios desde `EntrenamientoService.guardarRutinaSemanal`.)
// ---------------------------------------------------------------------------

/**
 * Prescripción y activación de la planificación semanal por bloques de días.
 * Desactiva de forma atómica cualquier rutina previa del alumno.
 */
export async function guardarRutinaSemanal(
  ctx: ContextoEntrenamiento,
  entrenadorId: string,
  alumnoId: string,
  input: GuardarRutinaSemanalDTO
): Promise<RutinaSemanalDetalleDTO> {
  const { db, withTenant } = ctx;
  const validado = parsearContrato(GuardarRutinaSemanalSchema, input);

  // RNF-003/ADR-011 (etapa 3): `perfiles_alumno` tiene RLS; lectura con el GUC del coach.
  const perfil = await withTenant({ entrenadorId }, async (tx) => {
    let [perfil] = await tx
      .select()
      .from(perfilesAlumno)
      .where(eq(perfilesAlumno.id, alumnoId));

    if (!perfil) {
      [perfil] = await tx
        .select()
        .from(perfilesAlumno)
        .where(eq(perfilesAlumno.usuarioId, alumnoId));
    }

    return perfil;
  });

  if (!perfil) {
    throw new NotFoundException(MENSAJE_ALUMNO_NO_ENCONTRADO);
  }

  if (perfil.entrenadorId !== entrenadorId) {
    throw new ForbiddenException(MENSAJE_SIN_ACCESO_ALUMNO);
  }

  const usuarioAlumnoId = perfil.usuarioId;

  // Cada ejercicio debe ser global o del propio coach (nunca el privado de otro
  // coach); se guarda con el `ejercicioId` resuelto. Mismo criterio que las plantillas (RF-017).
  const bloques = await validarEjerciciosDeBloques(db, entrenadorId, validado.bloques);

  const ahora = new Date();
  const nuevaRutinaId = crypto.randomUUID();
  const nombre = validado.nombreRutina?.trim() || 'Planificación Semanal Activa';

  // RNF-003/ADR-009: `rutinas` tiene RLS habilitado; desactivación + alta corren en
  // una única transacción con el GUC del tenant (además, ahora son atómicas).
  const nuevaRutina = await withTenant({ entrenadorId }, async (tx) => {
    // Desactivar rutinas previas
    await tx
      .update(rutinas)
      .set({
        activa: false,
        updatedAtUtc: ahora,
      })
      .where(
        and(
          eq(rutinas.alumnoId, usuarioAlumnoId),
          eq(rutinas.activa, true)
        )
      );

    const [creada] = await tx
      .insert(rutinas)
      .values({
        id: nuevaRutinaId,
        alumnoId: usuarioAlumnoId,
        entrenadorId,
        nombre,
        bloques,
        activa: true,
        createdAtUtc: ahora,
        updatedAtUtc: ahora,
      })
      .returning();

    return creada;
  });

  return {
    id: nuevaRutina.id,
    alumnoId: nuevaRutina.alumnoId,
    entrenadorId: nuevaRutina.entrenadorId,
    nombre: nuevaRutina.nombre,
    activa: nuevaRutina.activa,
    bloques: nuevaRutina.bloques as BloqueDiaRutinaDTO[],
    createdAtUtc: toIsoUtcString(nuevaRutina.createdAtUtc)!,
    updatedAtUtc: toIsoUtcString(nuevaRutina.updatedAtUtc)!,
  };
}
