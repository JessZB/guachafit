import { NotFoundException } from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  gt,
  ne,
  cuotasMembresia,
  notificacionesInApp,
  perfilesAlumno,
} from '@guachafit/database';
import {
  EstadoCuota,
  type RecordatorioManualResultadoDTO,
} from '@guachafit/shared';
import { toIsoSafe } from '../finanzas.service';
import type { ContextoCartera } from './contexto-cartera';
import {
  HORAS_COOLDOWN_RECORDATORIO_MANUAL,
  TIPO_EVENTO_RECORDATORIO_MANUAL,
  construirMensajeRecordatorioManual,
} from './mensaje-recordatorio-reglas';

/**
 * Resultado de un bloqueo de negocio: nunca es `despachado`. Así la vista previa puede mapear
 * el motivo sin conversiones.
 */
export type ResultadoBloqueoRecordatorio = RecordatorioManualResultadoDTO & {
  motivo: Exclude<RecordatorioManualResultadoDTO['motivo'], 'despachado'>;
};

/**
 * UX-09a (RF-009 D2): evaluación compartida del recordatorio manual (RN-02).
 *
 * `listo = false` expresa un bloqueo de negocio con su `resultado` completo. `listo = true`
 * entrega lo necesario para enviar: el mensaje compuesto, la cuota y el saldo en Bs.
 */
export type EvaluacionRecordatorioManual =
  | { listo: false; resultado: ResultadoBloqueoRecordatorio }
  | {
      listo: true;
      nombreCompleto: string;
      cuotaAbierta: { id: string; periodo: string; saldoPendienteUsd: string };
      saldoPendienteBs: string | null;
      mensaje: { titulo: string; cuerpo: string };
      ahora: Date;
      cooldownMs: number;
    };

/**
 * UX-09a (RF-009 D2): evalúa el recordatorio manual sin emitir eventos ni escribir datos.
 *
 * Reúne las comprobaciones de negocio (alumno en la cartera del coach, saldo, pausa por pago en
 * revisión y cooldown anti-spam), calcula la tasa y compone el mensaje exacto. Lo consumen el
 * envío (`enviarRecordatorioManual`) y la vista previa (`obtenerVistaPreviaRecordatorio`), que
 * así muestran el mismo texto.
 */
export async function evaluarRecordatorioManual(
  ctx: ContextoCartera,
  entrenadorId: string,
  clienteId: string
): Promise<EvaluacionRecordatorioManual> {
  // RNF-003/ADR-011 (etapa 2): perfil + cuota abierta del alumno en UNA transacción con el
  // GUC del coach (`cuotas_membresia` tiene RLS; el join implícito por tenancy es explícito).
  const { perfil, cuotaAbierta } = await ctx.withTenant({ entrenadorId }, async (tx) => {
    const [perfil] = await tx
      .select({
        id: perfilesAlumno.id,
        nombres: perfilesAlumno.nombres,
        apellidos: perfilesAlumno.apellidos,
      })
      .from(perfilesAlumno)
      .where(
        and(
          eq(perfilesAlumno.usuarioId, clienteId),
          eq(perfilesAlumno.entrenadorId, entrenadorId)
        )
      );

    if (!perfil) {
      return { perfil: undefined, cuotaAbierta: undefined };
    }

    // Cuota abierta más urgente: la que primero debería pagarse.
    const [cuotaAbierta] = await tx
      .select({
        id: cuotasMembresia.id,
        periodo: cuotasMembresia.periodo,
        estado: cuotasMembresia.estado,
        saldoPendienteUsd: cuotasMembresia.saldoPendienteUsd,
      })
      .from(cuotasMembresia)
      .where(
        and(
          eq(cuotasMembresia.clienteId, clienteId),
          eq(cuotasMembresia.entrenadorId, entrenadorId),
          ne(cuotasMembresia.estado, EstadoCuota.ANULADA),
          gt(cuotasMembresia.saldoPendienteUsd, '0')
        )
      )
      .orderBy(asc(cuotasMembresia.fechaCorteUtc))
      .limit(1);

    return { perfil, cuotaAbierta };
  });

  if (!perfil) {
    throw new NotFoundException('El alumno no existe o no pertenece a tu cartera.');
  }

  const nombreCompleto = `${perfil.nombres} ${perfil.apellidos}`.trim();
  const ahora = new Date();

  if (!cuotaAbierta) {
    return {
      listo: false,
      resultado: {
        enviado: false,
        motivo: 'sin_saldo_pendiente',
        mensaje: `${nombreCompleto} no tiene saldo pendiente: no hay nada que recordar.`,
        mensajeSugerido: null,
        saldoPendienteUsd: null,
        saldoPendienteBs: null,
        ultimaGestionUtc: null,
        proximoPermitidoUtc: null,
      },
    };
  }

  if (cuotaAbierta.estado === EstadoCuota.PENDIENTE_REVISION) {
    return {
      listo: false,
      resultado: {
        enviado: false,
        motivo: 'pausa_revision',
        mensaje:
          `${nombreCompleto} tiene un pago en verificación: los recordatorios se pausan mientras ` +
          'se revisa el comprobante.',
        mensajeSugerido: null,
        saldoPendienteUsd: cuotaAbierta.saldoPendienteUsd,
        saldoPendienteBs: null,
        ultimaGestionUtc: null,
        proximoPermitidoUtc: null,
      },
    };
  }

  // Cooldown anti-spam: se mide solo contra recordatorios MANUALES (los automáticos de WU-H
  // son otra cosa y no cuentan como gestión del coach).
  const [ultimaGestion] = await ctx.db
    .select({ createdAtUtc: notificacionesInApp.createdAtUtc })
    .from(notificacionesInApp)
    .where(
      and(
        eq(notificacionesInApp.usuarioId, clienteId),
        eq(notificacionesInApp.tipoEvento, TIPO_EVENTO_RECORDATORIO_MANUAL)
      )
    )
    .orderBy(desc(notificacionesInApp.createdAtUtc))
    .limit(1);

  const ultimaGestionUtc = ultimaGestion ? toIsoSafe(ultimaGestion.createdAtUtc) : null;
  const cooldownMs = HORAS_COOLDOWN_RECORDATORIO_MANUAL * 60 * 60 * 1000;

  if (ultimaGestion && ahora.getTime() - new Date(ultimaGestion.createdAtUtc).getTime() < cooldownMs) {
    const proximoPermitido = new Date(new Date(ultimaGestion.createdAtUtc).getTime() + cooldownMs);
    return {
      listo: false,
      resultado: {
        enviado: false,
        motivo: 'cooldown_activo',
        mensaje:
          `Ya enviaste un recordatorio manual a ${nombreCompleto} hace menos de ` +
          `${HORAS_COOLDOWN_RECORDATORIO_MANUAL} horas. Espera para no saturar al alumno.`,
        mensajeSugerido: null,
        saldoPendienteUsd: cuotaAbierta.saldoPendienteUsd,
        saldoPendienteBs: null,
        ultimaGestionUtc,
        proximoPermitidoUtc: proximoPermitido.toISOString(),
      },
    };
  }

  // RNF-003/ADR-011 (etapa 3): la tasa override lee `perfiles_alumno` (RLS); transacción con
  // el GUC del coach.
  const tasa = await ctx.withTenant({ entrenadorId }, (tx) =>
    ctx.finanzasService.obtenerTasaVigente(entrenadorId, clienteId, tx)
  );
  const saldoPendienteBs = tasa.tasaEfectiva
    ? ctx.finanzasService.proyectarVES(cuotaAbierta.saldoPendienteUsd, tasa.tasaEfectiva)
    : null;

  const mensaje = construirMensajeRecordatorioManual({
    nombre: perfil.nombres,
    saldoPendienteUsd: cuotaAbierta.saldoPendienteUsd,
    saldoPendienteBs,
    periodo: cuotaAbierta.periodo,
  });

  return {
    listo: true,
    nombreCompleto,
    cuotaAbierta: {
      id: cuotaAbierta.id,
      periodo: cuotaAbierta.periodo,
      saldoPendienteUsd: cuotaAbierta.saldoPendienteUsd,
    },
    saldoPendienteBs,
    mensaje,
    ahora,
    cooldownMs,
  };
}
