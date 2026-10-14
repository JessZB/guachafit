import { NotFoundException } from '@nestjs/common';
import { EstadoAlumno, EstadoCuota, ZONA_HORARIA_ALUMNO_POR_DEFECTO } from '@guachafit/shared';
import {
  and,
  cuotasMembresia,
  desc,
  eq,
  gt,
  isNotNull,
  isNull,
  ne,
  notInArray,
  perfilesAlumno,
  planesMembresia,
  type TenantTransaction,
} from '@guachafit/database';
import { MENSAJE_ALUMNO_FUERA_DE_LISTA } from '../../../common/mensajes-acceso';
import {
  obtenerFechaLocalYyyyMmDd,
} from '../../../common/adherencia.util';
import {
  zonaDelAlumno,
  type EmisionCiclo,
  type PerfilAlumnoFila,
} from './finanzas-reglas';
import { sumarMesesCalendario } from '../suscripcion-ciclo';
import { emitirCuotaDeSuscripcionSiCorrespondeCaso } from './emision-ciclo.caso';
import type { ContextoFinanzas } from './contexto-finanzas';

// ===========================================================================
// 4d. BARRIDOS PROGRAMADOS (RF-008): emisión y reposición de recordatorios
// ===========================================================================

/**
 * Barrido diario (RF-008): emite la cuota de cada alumno activo cuyo próximo vencimiento cae
 * dentro de los próximos 5 días y avanza su ciclo. Alumnos pausados, suspendidos o archivados
 * no generan cuotas; al volver, se emite solo la del ciclo en curso (`corteVigente`).
 *
 * RUTA DE SISTEMA: la lectura de candidatos cruza todos los tenants con el bypass explícito
 * `is_superadmin`; cada emisión corre en su propia transacción con el GUC del coach, así que el
 * error de un alumno no afecta a los demás.
 */
export async function emitirCuotasProgramadasCaso(
  ctx: ContextoFinanzas,
  ahora: Date = new Date()
): Promise<{ evaluadas: number; emitidas: number; omitidas: number }> {
  const candidatos = await ctx.withTenant({ isSuperadmin: true }, (tx) =>
    tx
      .select({ id: perfilesAlumno.id, entrenadorId: perfilesAlumno.entrenadorId })
      .from(perfilesAlumno)
      .where(
        and(
          isNotNull(perfilesAlumno.planSuscritoId),
          isNull(perfilesAlumno.deletedAtUtc),
          eq(perfilesAlumno.estadoActivacion, EstadoAlumno.ACTIVO)
        )
      )
  );

  let emitidas = 0;
  let omitidas = 0;

  for (const candidato of candidatos) {
    try {
      const resultado = await ctx.withTenant(
        { entrenadorId: candidato.entrenadorId },
        async (tx) => {
          // Relectura con bloqueo de fila: dos barridos simultáneos no emiten dos veces el ciclo.
          // Se revalida todo el filtro: el alumno pudo pausarse o archivarse tras la lectura.
          const [perfil] = await tx
            .select()
            .from(perfilesAlumno)
            .where(eq(perfilesAlumno.id, candidato.id))
            .for('update');
          if (
            !perfil?.planSuscritoId ||
            perfil.deletedAtUtc ||
            perfil.estadoActivacion !== EstadoAlumno.ACTIVO
          ) {
            return null;
          }

          const [plan] = await tx
            .select()
            .from(planesMembresia)
            .where(
              and(
                eq(planesMembresia.id, perfil.planSuscritoId),
                eq(planesMembresia.entrenadorId, perfil.entrenadorId)
              )
            );
          if (!plan) {
            throw new Error(
              `El plan suscrito ${perfil.planSuscritoId} no está en el catálogo del entrenador.`
            );
          }

          const emision = await emitirCuotaDeSuscripcionSiCorrespondeCaso(tx, perfil, plan, ahora);
          return emision ? { emision, perfil } : null;
        }
      );

      if (resultado?.emision.cuota) {
        emitidas += 1;
        await programarRecordatoriosDeEmisionCaso(ctx, resultado.emision, resultado.perfil);
      }
    } catch (error) {
      omitidas += 1;
      ctx.logger.error(
        `No se pudo emitir la cuota programada del alumno ${candidato.id}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  ctx.logger.log(
    `Emisión automática de cuotas: ${candidatos.length} suscripciones evaluadas, ${emitidas} emitidas, ${omitidas} con error.`
  );
  return { evaluadas: candidatos.length, emitidas, omitidas };
}

/**
 * Reposición diaria de recordatorios (RF-008): vuelve a agendar los hitos FUTUROS de las cuotas
 * abiertas. Repara los recordatorios que no se agendaron porque Redis falló al emitir. BullMQ
 * ignora un `jobId` que ya existe, así que no duplica avisos; con `incluirMismoDia: false`
 * tampoco repite el aviso de hoy si ya salió.
 *
 * Solo alumnos ACTIVOS: archivados, pausados o suspendidos no reciben recordatorios automáticos
 * (decisión del dueño, 2026-10-10); su deuda sigue visible en Control de Cobros.
 *
 * Empieza levantando la pausa de la cola: si una emisión de este mismo barrido la abrió y Redis
 * ya volvió, la reparación no se aplaza un día. Si sigue caído, el primer intento la reabre.
 *
 * Límite aceptado: no repone un hito del mismo día (no repetir un aviso que quizá ya salió) y el
 * volumen es lineal (hasta 4 `add` por cuota abierta y día).
 *
 * RUTA DE SISTEMA: lectura transversal con `is_superadmin` (solo lectura; el planificador no
 * toca la base de datos).
 */
export async function reconciliarRecordatoriosCaso(
  ctx: ContextoFinanzas,
  ahora: Date = new Date()
): Promise<{ evaluadas: number; agendadas: number }> {
  if (!ctx.billingSchedulerService) return { evaluadas: 0, agendadas: 0 };
  ctx.billingSchedulerService.reanudarCola();

  // Una cuota vencida hace más de 3 días ya no tiene hitos futuros (el último es T+2).
  const limiteCorte = new Date(ahora.getTime() - 3 * 24 * 60 * 60 * 1000);
  const cuotas = await ctx.withTenant({ isSuperadmin: true }, (tx) =>
    tx
      .select({
        id: cuotasMembresia.id,
        fechaCorteUtc: cuotasMembresia.fechaCorteUtc,
        zonaHoraria: perfilesAlumno.zonaHoraria,
      })
      .from(cuotasMembresia)
      .innerJoin(perfilesAlumno, eq(perfilesAlumno.usuarioId, cuotasMembresia.clienteId))
      .where(
        and(
          notInArray(cuotasMembresia.estado, [EstadoCuota.AL_DIA, EstadoCuota.ANULADA]),
          gt(cuotasMembresia.saldoPendienteUsd, '0'),
          gt(cuotasMembresia.fechaCorteUtc, limiteCorte),
          isNull(perfilesAlumno.deletedAtUtc),
          eq(perfilesAlumno.estadoActivacion, EstadoAlumno.ACTIVO)
        )
      )
  );

  let agendadas = 0;
  for (const cuota of cuotas) {
    const hitos = await ctx.billingSchedulerService.programarRecordatoriosCuota(
      {
        id: cuota.id,
        fechaCorteUtc: cuota.fechaCorteUtc,
        zonaHoraria: cuota.zonaHoraria || ZONA_HORARIA_ALUMNO_POR_DEFECTO,
      },
      ahora,
      { incluirMismoDia: false }
    );
    if (hitos.length > 0) agendadas += 1;
  }

  ctx.logger.log(
    `Reposición de recordatorios: ${cuotas.length} cuotas abiertas evaluadas, ${agendadas} con hitos futuros agendados.`
  );
  return { evaluadas: cuotas.length, agendadas };
}

/**
 * Perfil del alumno dentro de la cartera del coach (acepta `usuarioId` o id de perfil). Un
 * alumno de otro coach, inexistente o archivado responde el mismo 404 (RNF-003 §3.1: no se
 * revela si el alumno existe en otra cartera). Opciones:
 * - `bloquear`: la fila queda tomada (`FOR UPDATE`) hasta el fin de la transacción;
 * - `incluirArchivados`: un alumno archivado SÍ se devuelve (consulta de su historial).
 *
 * Es la única búsqueda del perfil para el entrenador en este servicio (suscripción, cobro en
 * sala e historial).
 */
export async function buscarPerfilDeCarteraCaso(
  tx: TenantTransaction,
  entrenadorId: string,
  clienteId: string,
  opciones: { bloquear?: boolean; incluirArchivados?: boolean } = {}
): Promise<PerfilAlumnoFila> {
  const buscar = (columna: typeof perfilesAlumno.usuarioId | typeof perfilesAlumno.id) => {
    const consulta = tx.select().from(perfilesAlumno).where(eq(columna, clienteId));
    return opciones.bloquear ? consulta.for('update') : consulta;
  };

  let [perfil] = await buscar(perfilesAlumno.usuarioId);
  if (!perfil) {
    [perfil] = await buscar(perfilesAlumno.id);
  }

  if (
    !perfil ||
    perfil.entrenadorId !== entrenadorId ||
    (perfil.deletedAtUtc && !opciones.incluirArchivados)
  ) {
    throw new NotFoundException(MENSAJE_ALUMNO_FUERA_DE_LISTA);
  }
  return perfil;
}

/**
 * Día local hasta el que el alumno ya está cubierto: fin del periodo de su cuota no anulada más
 * reciente (vencimiento + duración de su plan, en meses de calendario). `null` sin cuotas.
 *
 * RF-008 (decisión del dueño 2026-10-12): las ANULADAS no cuentan, para que el entrenador pueda
 * corregir una cuota mal emitida (anular, quitar el plan y reasignarlo con la fecha correcta).
 */
export async function calcularCoberturaVigenteCaso(
  tx: TenantTransaction,
  perfil: PerfilAlumnoFila
): Promise<string | null> {
  const [ultima] = await tx
    .select({
      fechaCorteUtc: cuotasMembresia.fechaCorteUtc,
      duracionMeses: planesMembresia.duracionMeses,
    })
    .from(cuotasMembresia)
    .innerJoin(planesMembresia, eq(planesMembresia.id, cuotasMembresia.planId))
    .where(
      and(
        eq(cuotasMembresia.clienteId, perfil.usuarioId),
        eq(cuotasMembresia.entrenadorId, perfil.entrenadorId),
        ne(cuotasMembresia.estado, EstadoCuota.ANULADA)
      )
    )
    .orderBy(desc(cuotasMembresia.fechaCorteUtc))
    .limit(1);

  if (!ultima) return null;
  return sumarMesesCalendario(
    obtenerFechaLocalYyyyMmDd(ultima.fechaCorteUtc, zonaDelAlumno(perfil)),
    Math.max(1, ultima.duracionMeses)
  );
}

/** Agenda los recordatorios T-5/T-1/T/T+2 a las 09:00 locales del alumno (best-effort). */
export async function programarRecordatoriosDeEmisionCaso(
  ctx: ContextoFinanzas,
  emision: EmisionCiclo | null,
  perfil: Pick<PerfilAlumnoFila, 'zonaHoraria'>
): Promise<void> {
  // Una cuota que nace pagada (becado o cubierta por el saldo a favor) no lleva recordatorios.
  if (
    !emision?.cuota ||
    emision.esBecado ||
    emision.cuota.estado === EstadoCuota.AL_DIA ||
    !ctx.billingSchedulerService
  ) {
    return;
  }
  try {
    await ctx.billingSchedulerService.programarRecordatoriosCuota({
      id: emision.cuota.id,
      fechaCorteUtc: emision.cuota.fechaCorteUtc,
      zonaHoraria: zonaDelAlumno(perfil),
    });
  } catch (error) {
    ctx.logger.error(
      `No se pudieron programar los recordatorios de la cuota ${emision.cuota.id}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
