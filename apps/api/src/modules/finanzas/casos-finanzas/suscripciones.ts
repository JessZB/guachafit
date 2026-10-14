import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  AsignarSuscripcionDTO,
  SuscripcionAlumnoDTO,
} from '@guachafit/shared';
import {
  and,
  eq,
  perfilesAlumno,
  planesMembresia,
} from '@guachafit/database';
import { obtenerFechaLocalYyyyMmDd,
  sumarDiasCalendario,
} from '../../../common/adherencia.util';
import {
  DIAS_MAXIMOS_INICIO_FUTURO,
  DIAS_MAXIMOS_INICIO_PASADO,
  formatearFechaCorta,
  MENSAJE_SIN_PLAN_ASIGNADO,
  zonaDelAlumno,
  type PerfilAlumnoFila,
  type PlanFila,
} from './finanzas-reglas';
import { buscarPerfilDeCarteraCaso, calcularCoberturaVigenteCaso, programarRecordatoriosDeEmisionCaso } from './emision-programada';
import { emitirCuotaDeSuscripcionSiCorrespondeCaso } from './emision-ciclo';
import type { ContextoFinanzas } from './contexto-finanzas';

// ===========================================================================
// 4b. SUSCRIPCIÓN DEL ALUMNO (M5-L1, RF-005 / RF-008)
// ===========================================================================

/**
 * Asigna o cambia el plan del alumno. Las cuotas se emiten solas a partir de esta suscripción.
 * - Primer plan: `fechaInicio` (día local del alumno) fija el día de vencimiento de todos los
 *   ciclos, en meses de calendario. Si el primer vencimiento cae dentro de los próximos 5 días,
 *   su cuota se emite en el acto.
 * - Cambio de plan: el nuevo aplica desde la próxima cuota y el día de vencimiento no cambia.
 */
export async function asignarSuscripcionCaso(
  ctx: ContextoFinanzas,
  entrenadorId: string,
  clienteId: string,
  dto: AsignarSuscripcionDTO,
  ahora: Date = new Date()
): Promise<SuscripcionAlumnoDTO> {
  const resultado = await ctx.withTenant({ entrenadorId }, async (tx) => {
    // Bloqueo de fila: el barrido o un cobro en sala simultáneos esperan a esta asignación.
    const perfil = await buscarPerfilDeCarteraCaso(tx, entrenadorId, clienteId, {
      bloquear: true,
    });

    const [plan] = await tx
      .select()
      .from(planesMembresia)
      .where(
        and(eq(planesMembresia.id, dto.planId), eq(planesMembresia.entrenadorId, entrenadorId))
      );

    if (!plan) {
      throw new NotFoundException('Ese plan no está en tu catálogo. Actualiza la pantalla.');
    }
    if (!plan.activo) {
      throw new BadRequestException('Ese plan está desactivado. Actívalo en Ajustes o elige otro.');
    }

    if (perfil.planSuscritoId) {
      if (dto.fechaInicio !== undefined) {
        throw new BadRequestException(
          'La fecha de inicio solo se elige al asignar el plan por primera vez. Quita el plan para empezar un ciclo nuevo.'
        );
      }
      await tx
        .update(perfilesAlumno)
        .set({ planSuscritoId: plan.id, updatedAtUtc: ahora })
        .where(eq(perfilesAlumno.id, perfil.id));
      return { perfil: { ...perfil, planSuscritoId: plan.id }, plan, emision: null };
    }

    if (!dto.fechaInicio) {
      throw new BadRequestException('Elige la fecha de inicio del plan.');
    }
    const hoyLocal = obtenerFechaLocalYyyyMmDd(ahora, zonaDelAlumno(perfil));
    const inicioMinimo = sumarDiasCalendario(hoyLocal, -DIAS_MAXIMOS_INICIO_PASADO);
    const inicioMaximo = sumarDiasCalendario(hoyLocal, DIAS_MAXIMOS_INICIO_FUTURO);
    if (dto.fechaInicio < inicioMinimo || dto.fechaInicio > inicioMaximo) {
      throw new BadRequestException(
        `Elige una fecha de inicio entre el ${formatearFechaCorta(inicioMinimo)} y el ${formatearFechaCorta(inicioMaximo)}.`
      );
    }

    // Decisión del dueño (M5-L1): un plan nuevo no puede empezar dentro de un periodo ya
    // cubierto por una cuota anterior; si no, el mismo mes quedaría cobrado dos veces.
    const cubiertoHasta = await calcularCoberturaVigenteCaso(tx, perfil);
    if (cubiertoHasta && dto.fechaInicio < cubiertoHasta) {
      throw new BadRequestException(
        `Este alumno ya tiene cubierto hasta el ${formatearFechaCorta(cubiertoHasta)}. Elige esa fecha o una posterior, o cambia el plan sin quitarlo.`
      );
    }

    const suscrito: PerfilAlumnoFila = {
      ...perfil,
      planSuscritoId: plan.id,
      cicloAncla: dto.fechaInicio,
      proximoCorte: dto.fechaInicio,
    };
    await tx
      .update(perfilesAlumno)
      .set({
        planSuscritoId: plan.id,
        cicloAncla: dto.fechaInicio,
        proximoCorte: dto.fechaInicio,
        updatedAtUtc: ahora,
      })
      .where(eq(perfilesAlumno.id, perfil.id));

    const emision = await emitirCuotaDeSuscripcionSiCorrespondeCaso(tx, suscrito, plan, ahora);
    return {
      perfil: emision ? { ...suscrito, proximoCorte: emision.proximoCorte } : suscrito,
      plan,
      emision,
    };
  });

  // Los recordatorios (Redis) se agendan DESPUÉS del commit: un fallo no revierte la asignación.
  await programarRecordatoriosDeEmisionCaso(ctx, resultado.emision, resultado.perfil);
  return construirSuscripcionDTOCaso(
    resultado.perfil,
    resultado.plan,
    resultado.emision?.cuota?.id ?? null
  );
}

/** Quita el plan del alumno: deja de renovarse. Las cuotas ya emitidas no cambian. */
export async function quitarSuscripcionCaso(
  ctx: ContextoFinanzas,
  entrenadorId: string,
  clienteId: string,
  ahora: Date = new Date()
): Promise<{ desactivada: true }> {
  return ctx.withTenant({ entrenadorId }, async (tx) => {
    const perfil = await buscarPerfilDeCarteraCaso(tx, entrenadorId, clienteId, {
      bloquear: true,
    });
    if (!perfil.planSuscritoId) {
      throw new NotFoundException(MENSAJE_SIN_PLAN_ASIGNADO);
    }
    await tx
      .update(perfilesAlumno)
      .set({ planSuscritoId: null, cicloAncla: null, proximoCorte: null, updatedAtUtc: ahora })
      .where(eq(perfilesAlumno.id, perfil.id));
    return { desactivada: true as const };
  });
}

/** Suscripción vigente del alumno, o `null` si no tiene plan asignado. */
export async function obtenerSuscripcionCaso(
  ctx: ContextoFinanzas,
  entrenadorId: string,
  clienteId: string
): Promise<SuscripcionAlumnoDTO | null> {
  return ctx.withTenant({ entrenadorId }, async (tx) => {
    const perfil = await buscarPerfilDeCarteraCaso(tx, entrenadorId, clienteId);
    if (!perfil.planSuscritoId) return null;

    const [plan] = await tx
      .select()
      .from(planesMembresia)
      .where(
        and(
          eq(planesMembresia.id, perfil.planSuscritoId),
          eq(planesMembresia.entrenadorId, entrenadorId)
        )
      );
    return plan ? construirSuscripcionDTOCaso(perfil, plan, null) : null;
  });
}

export function construirSuscripcionDTOCaso(
  perfil: PerfilAlumnoFila,
  plan: PlanFila,
  cuotaEmitidaId: string | null
): SuscripcionAlumnoDTO {
  return {
    clienteId: perfil.usuarioId,
    planId: plan.id,
    planNombre: plan.nombre,
    duracionMeses: plan.duracionMeses,
    fechaInicio: perfil.cicloAncla ?? '',
    proximoCorte: perfil.proximoCorte ?? '',
    cuotaEmitidaId,
  };
}
