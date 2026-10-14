import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { rutinas, perfilesAlumno, eq, and, desc } from '@guachafit/database';
import type {
  AsignarPlantillaDTO,
  AsignacionPlantillaResponseDTO,
  BloqueDiaRutinaDTO,
  ModoAsignacionPlantilla,
  ResultadoAsignacionAlumnoDTO,
} from '@guachafit/shared';
import { ModoAsignacionPlantilla as ModoAsignacion } from '@guachafit/shared';
import {
  MENSAJE_ALUMNO_FUERA_DE_LISTA,
  MENSAJE_ALUMNO_NO_ENCONTRADO,
} from '../../../common/mensajes-acceso';
import type { ContextoPlantillas, PerfilAlumnoRow, PlantillaRow } from './contexto-plantillas';
import { cargarPlantillaDelCoach } from './cargar-plantilla';
import { aplicarAjustesBloques } from './ajustes-reglas';
import { MAX_DIAS_RUTINA, asignarDiasLibres, clonarYRegenerarDiaIds } from './bloques-reglas';

/** LOTE API-2: fallo inesperado al asignar a un alumno del lote (el detalle va al log). */
export const MENSAJE_ASIGNACION_FALLIDA =
  'No pudimos asignar la rutina a este alumno. Inténtalo de nuevo.';
/** FUSIONAR dejaría la rutina del alumno por encima del máximo semanal. */
export const MENSAJE_FUSION_SUPERA_7_DIAS =
  'La rutina de este alumno quedaría con más de 7 días. Usa «Reemplazar» o quita días antes de añadir.';

/**
 * Coach + plantilla + clave + huella del cuerpo validado: la misma clave con otro cuerpo no
 * reutiliza la respuesta anterior.
 */
export function claveIdempotenciaAsignacion(
  entrenadorId: string,
  plantillaId: string,
  validado: AsignarPlantillaDTO,
  idempotencyKey?: string
): string | null {
  const key = (idempotencyKey ?? '').trim();
  if (!key) return null;
  const huella = createHash('sha256').update(JSON.stringify(validado)).digest('hex');
  return `asignar-plantilla:${entrenadorId}:${plantillaId}:${key}:${huella}`;
}

export async function ejecutarAsignacion(
  ctx: ContextoPlantillas,
  entrenadorId: string,
  plantillaId: string,
  validado: AsignarPlantillaDTO
): Promise<AsignacionPlantillaResponseDTO> {
  const plantilla = await cargarPlantillaDelCoach(ctx, entrenadorId, plantillaId);

  if (!plantilla.activa) {
    throw new BadRequestException(
      'La plantilla está desactivada. Reactívala antes de asignarla a un alumno.'
    );
  }

  // Validación global de ajustes: un ajuste que no corresponde a la plantilla es un
  // error del cliente, no un fallo por alumno. La copia profunda conserva los `diaId`
  // originales para poder localizar el ejercicio ajustado.
  const bloquesAjustados = structuredClone(plantilla.bloques) as BloqueDiaRutinaDTO[];
  aplicarAjustesBloques(bloquesAjustados, validado.ajustes);

  const resultados: ResultadoAsignacionAlumnoDTO[] = [];
  for (const alumnoId of validado.alumnoIds) {
    resultados.push(
      await asignarAAlumno(ctx, entrenadorId, plantilla, bloquesAjustados, validado.modo, alumnoId)
    );
  }

  const exitosos = resultados.filter((r) => r.exito).length;

  return {
    plantillaId: plantilla.id,
    modo: validado.modo,
    totalSolicitados: resultados.length,
    exitosos,
    fallidos: resultados.length - exitosos,
    resultados,
  };
}

async function asignarAAlumno(
  ctx: ContextoPlantillas,
  entrenadorId: string,
  plantilla: PlantillaRow,
  bloquesAjustados: BloqueDiaRutinaDTO[],
  modo: ModoAsignacionPlantilla,
  alumnoId: string
): Promise<ResultadoAsignacionAlumnoDTO> {
  try {
    const perfil = await resolverPerfilAlumno(ctx, alumnoId, entrenadorId);
    if (!perfil) {
      return {
        alumnoId,
        exito: false,
        error: MENSAJE_ALUMNO_NO_ENCONTRADO,
      };
    }
    if (perfil.entrenadorId !== entrenadorId) {
      return {
        alumnoId,
        usuarioId: perfil.usuarioId,
        exito: false,
        error: MENSAJE_ALUMNO_FUERA_DE_LISTA,
      };
    }

    // Cada alumno recibe su propia copia profunda (diaIds nuevos e independientes).
    const bloquesClonados = clonarYRegenerarDiaIds(bloquesAjustados);
    const ahora = new Date();

    if (modo === ModoAsignacion.FUSIONAR) {
      // Lectura de la rutina activa + actualización en UNA transacción con el
      // GUC del coach (RNF-003/ADR-009) y la fila bloqueada (`FOR UPDATE`): dos fusiones
      // simultáneas no se pisan los días.
      const fusion = await ctx.withTenant({ entrenadorId }, async (tx) => {
        const [activa] = await tx
          .select()
          .from(rutinas)
          .where(and(eq(rutinas.alumnoId, perfil.usuarioId), eq(rutinas.activa, true)))
          .orderBy(desc(rutinas.createdAtUtc))
          .limit(1)
          .for('update');
        if (!activa) return null;

        const existentes = (activa.bloques as BloqueDiaRutinaDTO[]) ?? [];
        if (existentes.length + bloquesClonados.length > MAX_DIAS_RUTINA) {
          return { activa, excedeMaximo: true as const, bloquesTotal: existentes.length };
        }

        const bloquesFusionados = [
          ...existentes,
          ...asignarDiasLibres(existentes, bloquesClonados),
        ];
        await tx
          .update(rutinas)
          .set({ bloques: bloquesFusionados, updatedAtUtc: ahora })
          .where(eq(rutinas.id, activa.id));
        return { activa, excedeMaximo: false as const, bloquesTotal: bloquesFusionados.length };
      });

      if (fusion?.excedeMaximo) {
        return {
          alumnoId,
          usuarioId: perfil.usuarioId,
          exito: false,
          error: MENSAJE_FUSION_SUPERA_7_DIAS,
        };
      }
      if (fusion) {
        return {
          alumnoId,
          usuarioId: perfil.usuarioId,
          exito: true,
          rutinaId: fusion.activa.id,
          rutinaNombre: fusion.activa.nombre,
          bloquesTotal: fusion.bloquesTotal,
        };
      }
      // Sin rutina activa: la fusión degenera en reemplazo (primera rutina del alumno).
    }

    // REEMPLAZAR (o FUSIONAR sin rutina activa): desactivar vigente + crear nueva
    // rutina activa en una transacción atómica con el GUC del tenant (RLS);
    // el historial previo queda intacto.
    const nueva = await ctx.withTenant({ entrenadorId }, async (tx) => {
      await tx
        .update(rutinas)
        .set({ activa: false, updatedAtUtc: ahora })
        .where(and(eq(rutinas.alumnoId, perfil.usuarioId), eq(rutinas.activa, true)));

      const [creada] = await tx
        .insert(rutinas)
        .values({
          id: crypto.randomUUID(),
          alumnoId: perfil.usuarioId,
          entrenadorId,
          nombre: plantilla.nombre,
          bloques: bloquesClonados,
          activa: true,
          createdAtUtc: ahora,
          updatedAtUtc: ahora,
        })
        .returning();

      return creada;
    });

    return {
      alumnoId,
      usuarioId: perfil.usuarioId,
      exito: true,
      rutinaId: nueva.id,
      rutinaNombre: nueva.nombre,
      bloquesTotal: bloquesClonados.length,
    };
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    ctx.logger.warn(`Asignación de plantilla falló para alumno ${alumnoId}: ${detalle}`);
    // LOTE API-2: el detalle técnico (BD, red) queda en el log; al coach, un texto claro.
    return { alumnoId, exito: false, error: MENSAJE_ASIGNACION_FALLIDA };
  }
}

async function resolverPerfilAlumno(
  ctx: ContextoPlantillas,
  alumnoId: string,
  entrenadorId: string
): Promise<PerfilAlumnoRow | undefined> {
  // Acepta `perfiles_alumno.id` o `usuarios.id`, igual que el resto del módulo.
  // RNF-003/ADR-011 (etapa 3): `perfiles_alumno` tiene RLS; lectura con el GUC del coach
  // (un perfil de otro tenant no es visible: se reporta como alumno no encontrado).
  return ctx.withTenant({ entrenadorId }, async (tx) => {
    let [perfil] = await tx
      .select()
      .from(perfilesAlumno)
      .where(eq(perfilesAlumno.id, alumnoId))
      .limit(1);

    if (!perfil) {
      [perfil] = await tx
        .select()
        .from(perfilesAlumno)
        .where(eq(perfilesAlumno.usuarioId, alumnoId))
        .limit(1);
    }
    return perfil as PerfilAlumnoRow | undefined;
  });
}
