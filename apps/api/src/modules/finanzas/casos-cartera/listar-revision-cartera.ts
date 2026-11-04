import {
  and,
  asc,
  count,
  eq,
  ilike,
  or,
  perfilesAlumno,
  transaccionesPago,
} from '@guachafit/database';
import {
  EstadoConciliacion,
  type CarteraDTO,
  type FilaCarteraDTO,
  type ResumenCarteraDTO,
} from '@guachafit/shared';
import { toIsoSafe } from '../finanzas.service';
import { MS_POR_DIA } from '../../../common/cartera.util';
import type { ContextoCartera } from './contexto-cartera';

export interface OpcionesListaRevision {
  entrenadorId: string;
  ahora: Date;
  limit: number;
  offset: number;
  patron: string | null;
  resumen: ResumenCarteraDTO;
}

/**
 * Pestaña "Pendiente de Revisión" (RF-009 §4.B): comprobantes en verificación, en orden FIFO.
 * Reenvía la misma fuente de verdad de la bandeja de conciliación (`transacciones_pago`),
 * con búsqueda server-side por nombre del alumno.
 */
export async function listarRevisionCartera(
  ctx: ContextoCartera,
  opciones: OpcionesListaRevision
): Promise<CarteraDTO> {
  const { entrenadorId, ahora, limit, offset, patron, resumen } = opciones;

  const filtroNombre = patron
    ? or(
        ilike(perfilesAlumno.nombres, patron),
        ilike(perfilesAlumno.apellidos, patron)
      )!
    : undefined;
  const whereLista = and(
    eq(transaccionesPago.entrenadorId, entrenadorId),
    eq(transaccionesPago.estadoConciliacion, EstadoConciliacion.PENDIENTE),
    filtroNombre
  );

  // RNF-003/ADR-011 (etapa 2): `transacciones_pago` (+ join a perfiles) con el GUC del coach.
  const [filaTotal, registros] = await ctx.withTenant({ entrenadorId }, async (tx) =>
    Promise.all([
      tx
        .select({ total: count() })
        .from(transaccionesPago)
        .innerJoin(
          perfilesAlumno,
          and(
            eq(perfilesAlumno.usuarioId, transaccionesPago.clienteId),
            eq(perfilesAlumno.entrenadorId, transaccionesPago.entrenadorId)
          )
        )
        .where(whereLista),
      tx
        .select({
          tx: transaccionesPago,
          perfilId: perfilesAlumno.id,
          proximoCorte: perfilesAlumno.proximoCorte,
          saldoAFavorUsd: perfilesAlumno.saldoAFavorUsd,
          nombres: perfilesAlumno.nombres,
          apellidos: perfilesAlumno.apellidos,
          telefonoWhatsapp: perfilesAlumno.telefonoWhatsapp,
        })
        .from(transaccionesPago)
        .innerJoin(
          perfilesAlumno,
          and(
            eq(perfilesAlumno.usuarioId, transaccionesPago.clienteId),
            eq(perfilesAlumno.entrenadorId, transaccionesPago.entrenadorId)
          )
        )
        .where(whereLista)
        .orderBy(asc(transaccionesPago.fechaReporteUtc), asc(transaccionesPago.id))
        .limit(limit)
        .offset(offset),
    ])
  );

  const items = await Promise.all(
    registros.map(async (registro) => {
      const { tx, perfilId, proximoCorte, saldoAFavorUsd, nombres, apellidos, telefonoWhatsapp } =
        registro;
      const comprobanteUrl = await ctx.finanzasService.resolverComprobanteUrl(
        tx.comprobanteStorageKey,
        tx.clienteId
      );
      const fila: FilaCarteraDTO = {
        alumnoUsuarioId: tx.clienteId,
        alumnoPerfilId: perfilId ?? null,
        proximoCorte: proximoCorte ?? null,
        saldoAFavorUsd: saldoAFavorUsd ?? '0.00',
        alumnoNombre: `${nombres} ${apellidos}`.trim(),
        telefonoWhatsapp: telefonoWhatsapp ?? null,
        cuotaId: tx.cuotaId,
        estadoCuota: null,
        fechaCorteUtc: null,
        saldoPendienteUsd: null,
        saldoPendienteBs: null,
        tasaAplicada: null,
        diasAtraso: null,
        diasRestantes: null,
        ultimaGestionUtc: null,
        planNombre: null,
        periodo: null,
        pagoId: tx.id,
        montoReportado: tx.montoOriginal,
        monedaOriginal: tx.monedaOriginal,
        metodoPago: tx.metodoPago,
        referenciaBancaria: tx.referenciaBancaria,
        comprobanteUrl,
        fechaReporteUtc: toIsoSafe(tx.fechaReporteUtc),
        diasEspera: Math.max(
          0,
          Math.floor((ahora.getTime() - new Date(tx.fechaReporteUtc).getTime()) / MS_POR_DIA)
        ),
      };
      return fila;
    })
  );

  return {
    items,
    total: Number(filaTotal[0]?.total ?? 0),
    limit,
    offset,
    resumen,
  };
}
