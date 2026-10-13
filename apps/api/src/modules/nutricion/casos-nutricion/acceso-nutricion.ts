import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  CODIGO_CHECKIN_FUERA_DE_PLAZO,
  CODIGO_CHECKIN_FUERA_DE_VENTANA,
  MENSAJE_CHECKIN_DIA_CAMBIADO,
  MENSAJE_CHECKIN_FUERA_DE_PLAZO,
  MENSAJE_CHECKIN_FUERA_DE_VENTANA,
  type MetasVigentesCheckinDTO,
} from '@guachafit/shared';
import {
  eq,
  and,
  metasNutricionales,
  perfilesAlumno,
  type TenantRlsContext,
} from '@guachafit/database';
import { MENSAJE_SIN_ACCESO_ALUMNO } from '../../../common/mensajes-acceso';
import {
  resolverTimezoneNutricion,
  type MotivoRechazoRecepcionCheckin,
  type ResultadoVentanaCheckinNutricional,
} from '../nutricion-tiempo.util';
import type { ContextoNutricion } from './contexto-nutricion';

// =============================================================================
// ACCESO Y TENANCY (RNF-003/ADR-011, LOTE API-N2) — lecturas con `withTenant`
// =============================================================================

/**
 * 400 con código estable para cada motivo de rechazo de la recepción (LOTE API-2 / API-N2): la
 * web clasifica por `code`, nunca por el texto.
 */
export function rechazoDeRecepcion(
  ctx: ContextoNutricion,
  motivo: MotivoRechazoRecepcionCheckin,
  ventana: ResultadoVentanaCheckinNutricional,
  fecha: string
): BadRequestException {
  switch (motivo) {
    case 'FUERA_DE_PLAZO':
      ctx.logger.warn(`Check-in del ${fecha} recibido después del plazo (${ventana.timezone}).`);
      return new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: CODIGO_CHECKIN_FUERA_DE_PLAZO,
        message: MENSAJE_CHECKIN_FUERA_DE_PLAZO,
      });
    case 'FECHA_DISTINTA_AL_DIA_LOCAL':
      ctx.logger.warn(
        `Check-in con fecha ${fecha} fuera del día local ${ventana.fechaLocalHoy} (${ventana.timezone}).`
      );
      return new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: CODIGO_CHECKIN_FUERA_DE_VENTANA,
        message: MENSAJE_CHECKIN_DIA_CAMBIADO,
      });
    case 'FUERA_DE_VENTANA':
      // LOTE API-2: código estable para la web (`offline-sync.ts`), sin depender del texto.
      return new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: CODIGO_CHECKIN_FUERA_DE_VENTANA,
        message: MENSAJE_CHECKIN_FUERA_DE_VENTANA,
      });
    default: {
      // Exhaustivo: un motivo nuevo sin su respuesta no compila.
      const motivoSinRespuesta: never = motivo;
      throw new Error(`Motivo de rechazo sin respuesta: ${String(motivoSinRespuesta)}`);
    }
  }
}

/**
 * LOTE API-N2: zona horaria del perfil del alumno (o la zona por defecto si el perfil no existe o
 * guarda un valor no válido). `perfiles_alumno` tiene RLS: se lee con el contexto del actor.
 */
export async function obtenerZonaHorariaAlumno(
  ctx: ContextoNutricion,
  alumnoId: string,
  contexto: TenantRlsContext
): Promise<string> {
  const [perfil] = await ctx.withTenant(contexto, (tx) =>
    tx
      .select({ zonaHoraria: perfilesAlumno.zonaHoraria })
      .from(perfilesAlumno)
      .where(eq(perfilesAlumno.usuarioId, alumnoId))
      .limit(1)
  );
  return resolverTimezoneNutricion(perfil?.zonaHoraria);
}

/** LOTE API-N2: metas del alumno a copiar en el reporte (`null` si no tiene metas). */
export async function obtenerMetasVigentes(
  ctx: ContextoNutricion,
  alumnoId: string
): Promise<MetasVigentesCheckinDTO | null> {
  const [fila] = await ctx.db
    .select()
    .from(metasNutricionales)
    .where(eq(metasNutricionales.alumnoId, alumnoId))
    .limit(1);

  if (!fila) return null;
  return {
    caloriasObjetivo: fila.caloriasObjetivo ?? null,
    proteinaGramosObjetivo: fila.proteinaGramosObjetivo ?? null,
    carbohidratosGramosObjetivo: fila.carbohidratosGramosObjetivo ?? null,
    grasasGramosObjetivo: fila.grasasGramosObjetivo ?? null,
    aguaLitrosObjetivo: fila.aguaLitrosObjetivo ?? null,
  };
}

/**
 * Tenancy: el alumno debe pertenecer a la cartera del coach autenticado. Devuelve la zona
 * horaria del perfil ya leído (LOTE API-N2) para no consultarlo dos veces.
 */
export async function validarAlumnoDelCoach(
  ctx: ContextoNutricion,
  coachId: string,
  alumnoId: string
): Promise<string> {
  // RNF-003/ADR-011 (etapa 3): `perfiles_alumno` tiene RLS; lectura con el GUC del coach.
  const [perfil] = await ctx.withTenant({ entrenadorId: coachId }, (tx) =>
    tx
      .select()
      .from(perfilesAlumno)
      .where(
        and(
          eq(perfilesAlumno.usuarioId, alumnoId),
          eq(perfilesAlumno.entrenadorId, coachId)
        )
      )
      .limit(1)
  );

  if (!perfil) {
    throw new ForbiddenException(MENSAJE_SIN_ACCESO_ALUMNO);
  }
  return resolverTimezoneNutricion(perfil.zonaHoraria);
}
