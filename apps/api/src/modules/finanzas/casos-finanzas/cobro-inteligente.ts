import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  CobroDirectoDTO,
  CobroDirectoInteligenteDTO,
  EstadoCuota,
  MENSAJE_FECHA_PAGO_FUTURA,
  Moneda,
  ZONA_HORARIA_ALUMNO_POR_DEFECTO,
} from '@guachafit/shared';
import {
  and,
  asc,
  cuotasMembresia,
  eq,
  notInArray,
  planesMembresia,
} from '@guachafit/database';
import { obtenerFechaLocalYyyyMmDd } from '../../../common/adherencia.util';
import { esViolacionUnicidad } from '../../../common/violacion-unicidad.util';
import {
  esFechaPagoFutura,
  esMetodoEfectivo,
  INDICE_CUOTA_POR_PERIODO,
  MENSAJE_CUOTA_EN_PREPARACION,
  zonaDelAlumno,
  type EmisionCiclo,
  type PerfilAlumnoFila,
} from './finanzas-reglas';
import { buscarPerfilDeCarteraCaso, programarRecordatoriosDeEmisionCaso } from './emision-programada.caso';
import { emitirCuotaDeCicloEnTxCaso } from './emision-ciclo.caso';
import { obtenerTasaVigenteCaso } from './tasas-conversion.caso';
import { cobroDirectoCaso } from './cobro-directo.caso';
import type { ContextoFinanzas } from './contexto-finanzas';

// ===========================================================================
// 10. COBRO DIRECTO INTELIGENTE (RF-009 RN-01)
// ===========================================================================

/**
 * Cobro directo inteligente en 1 paso (RF-009 RN-01): cobra sobre la cuota abierta más antigua
 * del alumno; si no tiene ninguna, adelanta la próxima cuota de su suscripción y cobra sobre ella.
 *
 * Con `idempotencyKey` (header `x-idempotency-key`), un reintento o doble clic con la misma
 * clave devuelve el mismo cobro en vez de cobrar el ciclo siguiente (RNF-002 §4).
 */
export async function cobroDirectoInteligenteCaso(
  ctx: ContextoFinanzas,
  entrenadorId: string,
  clienteId: string,
  dto: CobroDirectoInteligenteDTO | CobroDirectoDTO,
  idempotencyKey?: string,
  ahora: Date = new Date()
) {
  const cacheKey = idempotencyKey
    ? `cobro-sala:${entrenadorId}:${clienteId}:${idempotencyKey}`
    : undefined;
  return ctx.idempotencia.ejecutar(cacheKey, () =>
    registrarCobroDirectoInteligenteCaso(ctx, entrenadorId, clienteId, dto, ahora)
  );
}

/** Cobro en sala sin idempotencia: resuelve (o adelanta) la cuota y cobra sobre ella. */
async function registrarCobroDirectoInteligenteCaso(
  ctx: ContextoFinanzas,
  entrenadorId: string,
  clienteId: string,
  dto: CobroDirectoInteligenteDTO | CobroDirectoDTO,
  ahora: Date
) {
  // Se valida el método ANTES de emitir nada: `cobroDirecto` lo rechazaría después y dejaría
  // emitida una cuota adelantada que nadie pidió.
  if (!esMetodoEfectivo(dto.metodoPago)) {
    throw new BadRequestException('El cobro en sala solo acepta efectivo (dólares o bolívares).');
  }
  // La fecha futura se rechaza ANTES de emitir nada (no deja una cuota adelantada huérfana).
  if (dto.fechaOperacion && esFechaPagoFutura(dto.fechaOperacion, ahora)) {
    throw new BadRequestException(MENSAJE_FECHA_PAGO_FUTURA);
  }
  let zonaAlumno: string = ZONA_HORARIA_ALUMNO_POR_DEFECTO;

  // RNF-003/ADR-011 (etapa 2): la resolución (alumno + cuota abierta o adelantada) lee y escribe
  // tablas con RLS en UNA transacción con el GUC del coach; `cobroDirecto` abre después su
  // propia transacción (secuencial, nunca anidada).
  let resolucion: {
    targetCuotaId: string;
    emision: { emision: EmisionCiclo; perfil: PerfilAlumnoFila } | null;
  };
  try {
    resolucion = await ctx.withTenant({ entrenadorId }, async (tx) => {
      // 1. Alumno de la cartera (otro coach, inexistente o archivado → 404) con la fila
      //    bloqueada: el barrido diario y una asignación de plan esperan, así que la cuota
      //    abierta y el próximo vencimiento que se leen abajo no cambian bajo nuestros pies.
      const perfil = await buscarPerfilDeCarteraCaso(tx, entrenadorId, clienteId, {
        bloquear: true,
      });
      zonaAlumno = zonaDelAlumno(perfil);

      const clienteUsuarioId = perfil.usuarioId;

      // 2. Un cobro en VES exige tasa configurada ANTES de emitir cualquier cuota: así la
      //    operación falla entera y no deja una cuota emitida como efecto colateral.
      if (dto.monedaOriginal === Moneda.VES) {
        // RNF-003/ADR-011 (etapa 3): tasa override en la MISMA tx con el GUC del coach.
        const tasa = await obtenerTasaVigenteCaso(ctx, entrenadorId, clienteUsuarioId, tx);
        if (!tasa.tasaEfectiva || parseFloat(tasa.tasaEfectiva) <= 0) {
          throw new BadRequestException(
            'Aún no has configurado la tasa de cambio. Configura tu tasa activa en Ajustes → Tasas para cobrar en bolívares.'
          );
        }
      }

      // 3. Cuota abierta MÁS ANTIGUA por vencimiento: la deuda vieja se cobra primero y una
      //    cuota anulada jamás recibe cobros (M5-L1).
      const [cuotaAbierta] = await tx
        .select()
        .from(cuotasMembresia)
        .where(
          and(
            eq(cuotasMembresia.clienteId, clienteUsuarioId),
            eq(cuotasMembresia.entrenadorId, entrenadorId),
            notInArray(cuotasMembresia.estado, [EstadoCuota.AL_DIA, EstadoCuota.ANULADA])
          )
        )
        .orderBy(asc(cuotasMembresia.fechaCorteUtc), asc(cuotasMembresia.id))
        .limit(1);

      if (cuotaAbierta?.id) {
        return { targetCuotaId: cuotaAbierta.id, emision: null };
      }

      // 4. Sin cuota abierta: cobro por adelantado de la próxima cuota de la suscripción
      //    (M5-L1). Sin plan asignado no se inventa una cuota.
      if (!perfil.planSuscritoId || !perfil.cicloAncla || !perfil.proximoCorte) {
        throw new BadRequestException(
          'Este alumno no tiene un plan asignado. Asígnale un plan en su ficha para registrar el cobro.'
        );
      }

      const [plan] = await tx
        .select()
        .from(planesMembresia)
        .where(
          and(
            eq(planesMembresia.id, perfil.planSuscritoId),
            eq(planesMembresia.entrenadorId, entrenadorId)
          )
        );

      if (!plan) {
        throw new BadRequestException(
          'El plan asignado al alumno ya no está en tu catálogo. Asígnale otro plan en su ficha.'
        );
      }

      // Si la cuota de ese vencimiento ya existía (saldada), el ciclo avanza y se adelanta la
      // siguiente; el tope evita un bucle ante datos inconsistentes.
      let suscrito: PerfilAlumnoFila = perfil;
      for (let intento = 0; intento < 3; intento++) {
        const emision = await emitirCuotaDeCicloEnTxCaso(
          tx,
          suscrito,
          plan,
          suscrito.proximoCorte!,
          ahora
        );
        suscrito = { ...suscrito, proximoCorte: emision.proximoCorte };
        if (emision.cuota) {
          return {
            targetCuotaId: emision.cuota.id,
            emision: { emision, perfil: suscrito },
          };
        }
      }

      throw new ConflictException(MENSAJE_CUOTA_EN_PREPARACION);
    });
  } catch (error) {
    // Defensa en profundidad: todos los caminos que emiten cuotas bloquean la fila del alumno,
    // pero si la cuota de ese periodo ya existe por otra vía, un 409 claro en vez de un 500.
    if (esViolacionUnicidad(error, INDICE_CUOTA_POR_PERIODO)) {
      throw new ConflictException(MENSAJE_CUOTA_EN_PREPARACION);
    }
    throw error;
  }
  const { targetCuotaId, emision } = resolucion;

  // 5. La cuota adelantada ya quedó emitida: se agendan sus recordatorios (se cancelan solos si
  //    el cobro la deja saldada) y se cobra sobre ella.
  if (emision) {
    await programarRecordatoriosDeEmisionCaso(ctx, emision.emision, emision.perfil);
  }

  // Sin fecha, el día LOCAL del alumno (no el día UTC).
  const fechaOperacion = dto.fechaOperacion ?? obtenerFechaLocalYyyyMmDd(ahora, zonaAlumno);
  return cobroDirectoCaso(ctx, targetCuotaId, entrenadorId, { ...dto, fechaOperacion } as CobroDirectoDTO);
}
