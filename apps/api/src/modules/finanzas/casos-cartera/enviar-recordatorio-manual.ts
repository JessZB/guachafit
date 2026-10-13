import {
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
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
import { RecordatorioManualCobroEvent } from '../../notificaciones/events/eventos-notificacion';
import type { ContextoCartera } from './contexto-cartera';
import {
  HORAS_COOLDOWN_RECORDATORIO_MANUAL,
  TIPO_EVENTO_RECORDATORIO_MANUAL,
  construirMensajeRecordatorioManual,
} from './mensaje-recordatorio-reglas';

/**
 * RN-02: recordatorio manual de un clic al alumno.
 *
 * Despacha por el Despachador (categoría FINANZAS: In-App universal garantizado y canales
 * Push/Email según las preferencias del alumno) con el saldo exacto y su proyección en Bs.
 * No dispara si no hay saldo pendiente, si el pago está en revisión (pausa de cobro, WU-H) o
 * si ya se envió un recordatorio manual dentro del cooldown anti-spam.
 */
export async function enviarRecordatorioManual(
  ctx: ContextoCartera,
  entrenadorId: string,
  clienteId: string
): Promise<RecordatorioManualResultadoDTO> {
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
      enviado: false,
      motivo: 'sin_saldo_pendiente',
      mensaje: `${nombreCompleto} no tiene saldo pendiente: no hay nada que recordar.`,
      mensajeSugerido: null,
      saldoPendienteUsd: null,
      saldoPendienteBs: null,
      ultimaGestionUtc: null,
      proximoPermitidoUtc: null,
    };
  }

  if (cuotaAbierta.estado === EstadoCuota.PENDIENTE_REVISION) {
    return {
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

  if (!ctx.eventEmitter) {
    throw new ServiceUnavailableException(
      'El servicio de notificaciones no está disponible en este momento.'
    );
  }

  // RF-014 RN-01: se emite el evento y se ESPERA su resultado (emitAsync) porque la respuesta
  // del endpoint describe si hubo push; el despachador sigue siendo el único que encola.
  const resultados = await ctx.eventEmitter.emitAsync(
    RecordatorioManualCobroEvent.NOMBRE,
    new RecordatorioManualCobroEvent({
      tipoEvento: TIPO_EVENTO_RECORDATORIO_MANUAL,
      destinatarioUserId: clienteId,
      entrenadorId,
      categoria: 'FINANZAS',
      titulo: mensaje.titulo,
      cuerpo: mensaje.cuerpo,
      linkAccion: '/app/pagos',
      datosAdicionales: {
        cuotaId: cuotaAbierta.id,
        saldoPendienteUsd: cuotaAbierta.saldoPendienteUsd,
        saldoPendienteBs,
        origen: 'recordatorio_manual',
      },
      esCriticoSeguridad: false,
      // RNF-004 §3: ref de origen del jobId determinista.
      referenciaId: cuotaAbierta.id,
    })
  );

  const despacho = (resultados?.[0] ?? null) as { pushEnqueued?: boolean } | null;

  ctx.logger.log(
    `Recordatorio manual despachado a ${clienteId} (cuota ${cuotaAbierta.id}) por coach ${entrenadorId}.`
  );

  return {
    enviado: true,
    motivo: 'despachado',
    mensaje: despacho?.pushEnqueued
      ? `Recordatorio enviado a ${nombreCompleto} (notificación in-app + push).`
      : `Recordatorio enviado a ${nombreCompleto} (notificación in-app).`,
    mensajeSugerido: mensaje.cuerpo,
    saldoPendienteUsd: cuotaAbierta.saldoPendienteUsd,
    saldoPendienteBs,
    ultimaGestionUtc: ahora.toISOString(),
    proximoPermitidoUtc: new Date(ahora.getTime() + cooldownMs).toISOString(),
  };
}
