import { BadRequestException } from '@nestjs/common';
import {
  and,
  checkinsNutricionales,
  eq,
  fotosComida,
} from '@guachafit/database';
import {
  CheckinNutricionalSchema,
  MAX_FOTOS_PLATOS_DIA,
  MENSAJE_FOTO_COMIDA_NO_ASOCIABLE,
  MENSAJE_MAX_FOTOS_PLATOS_DIA,
  type CheckinNutricionalDetalleDTO,
  type CheckinNutricionalDTO,
} from '@guachafit/shared';
import { parsearContrato } from '../../../common/errores/parsear-contrato';
import { evaluarRecepcionCheckinNutricional } from '../nutricion-tiempo.util';
import type { ContextoNutricion } from './contexto-nutricion';
import {
  obtenerMetasVigentes,
  obtenerZonaHorariaAlumno,
  rechazoDeRecepcion,
} from './acceso-nutricion';
import { esClaveDeFotoComidaDelAlumno } from './claves-nutricion-reglas';
import { obtenerCheckinPorId } from './obtener-checkin-por-id.caso';
import { evaluarToleranciaNutricional } from './tolerancia-nutricional-reglas';
import {
  conflictoCheckinYaRegistrado,
  esViolacionUnicidadCheckinDiario,
} from './unicidad-checkin-reglas';

/**
 * Registrar check-in nutricional diario 1-Tap.
 * Valida semáforo, notas (hasta 280 caracteres), agua, calorías, proteínas
 * y hasta 4 fotografías de platos principales.
 * Aplica unicidad diaria por (alumno_id, fecha) y la ventana horaria RN-02
 * (18:00–23:59 hora local del alumno; fuera de ventana el día ya cerró).
 * La tolerancia ±10% se evalúa contra las metas REALES del coach persistidas
 * (RN-01): si el alumno no tiene metas, el resultado queda "sin evaluar".
 *
 * @param ahora instante de evaluación inyectable (tests); por defecto el reloj real.
 */
export async function registrarCheckinDiario(
  ctx: ContextoNutricion,
  alumnoId: string,
  input: CheckinNutricionalDTO,
  ahora: Date = new Date()
): Promise<{
  checkin: CheckinNutricionalDetalleDTO;
  dentroMargenTolerancia?: boolean;
  desviacionCaloriasPct?: number;
  desviacionProteinasPct?: number;
}> {
  const validado = parsearContrato(CheckinNutricionalSchema, { ...input, alumnoId });

  // LOTE API-N2: la zona que decide es la del PERFIL del alumno (`timezoneCliente` está
  // @deprecated y no se usa).
  const zonaHoraria = await obtenerZonaHorariaAlumno(ctx, alumnoId, {
    usuarioId: alumnoId,
  });

  // Reglas RN-02 + LOTE API-N2: captura (hora del servidor − segundos informados) en 18:00–23:59
  // del día `fecha` y recepción hasta las 12:00 del día siguiente (todo en la zona del perfil).
  const recepcion = evaluarRecepcionCheckinNutricional({
    fecha: validado.fecha,
    zonaHoraria,
    recibidoEn: ahora,
    segundosDesdeCaptura: validado.segundosDesdeCaptura,
  });
  if (!recepcion.permitido) {
    throw rechazoDeRecepcion(ctx, recepcion.motivo, recepcion.ventana, validado.fecha);
  }

  // Regla RN-03: máximo de fotos por día. Defensa en profundidad: el contrato ya lo limita con la
  // misma constante y el mismo texto.
  if (validado.fotosPlatos && validado.fotosPlatos.length > MAX_FOTOS_PLATOS_DIA) {
    throw new BadRequestException(MENSAJE_MAX_FOTOS_PLATOS_DIA);
  }

  // LOTE API-N1 (RNF-001): cada foto debe ser del alumno autenticado. Una clave ajena nunca se
  // guarda (y por eso nunca se firma al leer el reporte).
  for (const foto of validado.fotosPlatos ?? []) {
    if (!esClaveDeFotoComidaDelAlumno(foto.storageKey, alumnoId)) {
      ctx.logger.warn(`Foto de plato rechazada: la clave no pertenece al alumno '${alumnoId}'.`);
      throw new BadRequestException(MENSAJE_FOTO_COMIDA_NO_ASOCIABLE);
    }
  }

  // Verificar unicidad diaria por (alumno_id, fecha)
  const [existente] = await ctx.db
    .select()
    .from(checkinsNutricionales)
    .where(
      and(
        eq(checkinsNutricionales.alumnoId, alumnoId),
        eq(checkinsNutricionales.fecha, validado.fecha)
      )
    )
    .limit(1);

  if (existente) {
    throw conflictoCheckinYaRegistrado();
  }

  // LOTE API-N2: copia de las metas vigentes al registrar (el coach puede cambiarlas después).
  const metasVigentes = await obtenerMetasVigentes(ctx, alumnoId);

  // Insertar en transacción atómica. Un doble envío concurrente pasa la verificación previa y
  // choca con el índice único: ese caso es el mismo 409, no un 500 (LOTE API-N1).
  let checkinId: string;
  try {
    checkinId = await ctx.db.transaction(async (tx) => {
      const [nuevoCheckin] = await tx
        .insert(checkinsNutricionales)
        .values({
          alumnoId,
          fecha: validado.fecha,
          semaforo: validado.semaforo,
          caloriasReportadas: validado.caloriasReportadas ?? null,
          proteinaGramosReportada: validado.proteinaGramosReportada ?? null,
          aguaLitros: validado.aguaLitros ?? null,
          notasAlumno: validado.notasAlumno ?? null,
          capturadoEnUtc: recepcion.capturadoEn,
          metasVigentes,
          createdAtUtc: new Date(),
          updatedAtUtc: new Date(),
        })
        .returning();

      if (validado.fotosPlatos && validado.fotosPlatos.length > 0) {
        for (const f of validado.fotosPlatos) {
          await tx.insert(fotosComida).values({
            checkinId: nuevoCheckin.id,
            tipoComida: f.tipoComida,
            storageKey: f.storageKey,
            createdAtUtc: new Date(),
          });
        }
      }

      return nuevoCheckin.id;
    });
  } catch (error) {
    if (esViolacionUnicidadCheckinDiario(error)) {
      throw conflictoCheckinYaRegistrado();
    }
    throw error;
  }

  const checkinDetalle = await obtenerCheckinPorId(ctx, checkinId);

  // RF-002 Escenario 3: metas REALES del coach (RN-01), las mismas copiadas en el reporte (LOTE
  // API-N2). Sin metas el resultado queda sin evaluar (campos `undefined`): nunca un falso OK.
  const tolerancia = evaluarToleranciaNutricional(
    validado.caloriasReportadas,
    validado.proteinaGramosReportada,
    metasVigentes
  );

  return {
    checkin: checkinDetalle,
    dentroMargenTolerancia: tolerancia.dentroMargenTolerancia,
    desviacionCaloriasPct: tolerancia.desviacionCaloriasPct,
    desviacionProteinasPct: tolerancia.desviacionProteinasPct,
  };
}
