import {
  and,
  asc,
  countDistinct,
  eq,
  ilike,
  inArray,
  min,
  or,
  sql,
  cuotasMembresia,
  perfilesAlumno,
} from '@guachafit/database';
import {
  type CarteraDTO,
  type FilaCarteraDTO,
  type ResumenCarteraDTO,
} from '@guachafit/shared';
import { toIsoSafe } from '../finanzas.service';
import {
  MS_POR_DIA,
  calcularDiasAtraso,
  condicionCuotaEnMora,
  condicionCuotaPorVencer,
} from '../../../common/cartera.util';
import type { ContextoCartera, ContextoTasa } from './contexto-cartera';
import { obtenerUltimasGestiones } from './obtener-ultimas-gestiones';
import { proyectarSaldoCon } from './proyectar-saldo-reglas';

export interface OpcionesListaUrgencia {
  entrenadorId: string;
  ahora: Date;
  limit: number;
  offset: number;
  patron: string | null;
  contexto: ContextoTasa;
  condicion: ReturnType<typeof condicionCuotaEnMora>;
  tipo: 'mora' | 'por_vencer';
  resumen: ResumenCarteraDTO;
}

/**
 * Lista agregada por alumno de las pestañas de cuotas (mora / por vencer).
 *
 * El orden es por la cuota más urgente (`MIN(fecha_corte_utc)` ascendente): en mora eso
 * equivale a días de atraso DESCENDENTE (RF-009 Escenario 2) y en por vencer al vencimiento
 * más próximo. El desempate por `cliente_id` mantiene la paginación estable.
 */
export async function listarCuotasPorUrgencia(
  ctx: ContextoCartera,
  opciones: OpcionesListaUrgencia
): Promise<CarteraDTO> {
  const { entrenadorId, ahora, limit, offset, patron, contexto, condicion, tipo, resumen } =
    opciones;

  const filtroNombre = patron
    ? or(
        ilike(perfilesAlumno.nombres, patron),
        ilike(perfilesAlumno.apellidos, patron)
      )!
    : undefined;
  const whereLista = and(
    eq(cuotasMembresia.entrenadorId, entrenadorId),
    condicion,
    filtroNombre
  );

  // RNF-003/ADR-011 (etapa 2): todas las lecturas de `cuotas_membresia` (+ join a perfiles)
  // de esta pestaña corren en UNA transacción con el GUC del coach. Las gestiones manuales
  // (`notificaciones_in_app`, sin RLS) quedan fuera.
  const { filaTotal, filas, cuotasPagina } = await ctx.withTenant(
    { entrenadorId },
    async (tx) => {
      const [filaTotal, filas] = await Promise.all([
        tx
          .select({ total: countDistinct(cuotasMembresia.clienteId) })
          .from(cuotasMembresia)
          .innerJoin(
            perfilesAlumno,
            and(
              eq(perfilesAlumno.usuarioId, cuotasMembresia.clienteId),
              eq(perfilesAlumno.entrenadorId, cuotasMembresia.entrenadorId)
            )
          )
          .where(whereLista),
        tx
          .select({
            clienteId: cuotasMembresia.clienteId,
            perfilId: perfilesAlumno.id,
            nombres: perfilesAlumno.nombres,
            apellidos: perfilesAlumno.apellidos,
            telefonoWhatsapp: perfilesAlumno.telefonoWhatsapp,
            tasaOverride: perfilesAlumno.tasaFijadaOverride,
            proximoCorte: perfilesAlumno.proximoCorte,
            saldoAFavorUsd: perfilesAlumno.saldoAFavorUsd,
            saldoTotalUsd: sql<string>`sum(${cuotasMembresia.saldoPendienteUsd})`,
            corteMasUrgente: min(cuotasMembresia.fechaCorteUtc),
          })
          .from(cuotasMembresia)
          .innerJoin(
            perfilesAlumno,
            and(
              eq(perfilesAlumno.usuarioId, cuotasMembresia.clienteId),
              eq(perfilesAlumno.entrenadorId, cuotasMembresia.entrenadorId)
            )
          )
          .where(whereLista)
          .groupBy(
            cuotasMembresia.clienteId,
            perfilesAlumno.id,
            perfilesAlumno.nombres,
            perfilesAlumno.apellidos,
            perfilesAlumno.telefonoWhatsapp,
            perfilesAlumno.tasaFijadaOverride,
            perfilesAlumno.proximoCorte,
            perfilesAlumno.saldoAFavorUsd
          )
          .orderBy(asc(min(cuotasMembresia.fechaCorteUtc)), asc(cuotasMembresia.clienteId))
          .limit(limit)
          .offset(offset),
      ]);

      // Detalle de la cuota más urgente de cada alumno de la página (una sola consulta en lote).
      const idsPagina = filas.map((fila) => fila.clienteId);
      const cuotasPagina =
        idsPagina.length > 0
          ? await tx
              .select({
                id: cuotasMembresia.id,
                clienteId: cuotasMembresia.clienteId,
                estado: cuotasMembresia.estado,
                fechaCorteUtc: cuotasMembresia.fechaCorteUtc,
                saldoPendienteUsd: cuotasMembresia.saldoPendienteUsd,
              })
              .from(cuotasMembresia)
              .where(
                and(
                  eq(cuotasMembresia.entrenadorId, entrenadorId),
                  condicion,
                  inArray(cuotasMembresia.clienteId, idsPagina)
                )
              )
              .orderBy(asc(cuotasMembresia.fechaCorteUtc))
          : [];

      return { filaTotal, filas, cuotasPagina };
    }
  );

  const idsPagina = filas.map((fila) => fila.clienteId);
  const gestiones = await obtenerUltimasGestiones(ctx, idsPagina);

  const cuotaPorAlumno = new Map<string, (typeof cuotasPagina)[number]>();
  for (const cuota of cuotasPagina) {
    if (!cuotaPorAlumno.has(cuota.clienteId)) cuotaPorAlumno.set(cuota.clienteId, cuota);
  }

  const items = filas.map((fila) => {
    const cuota = cuotaPorAlumno.get(fila.clienteId);
    const fechaCorte = cuota?.fechaCorteUtc ?? fila.corteMasUrgente;
    const saldoUsd = Number(fila.saldoTotalUsd ?? 0).toFixed(2);
    const proyeccion = proyectarSaldoCon(
      (saldo, tasa) => ctx.finanzasService.proyectarVES(saldo, tasa),
      saldoUsd,
      fila.tasaOverride,
      contexto.tasaBase
    );
    const base: FilaCarteraDTO = {
      alumnoUsuarioId: fila.clienteId,
      alumnoPerfilId: fila.perfilId ?? null,
      proximoCorte: fila.proximoCorte ?? null,
      saldoAFavorUsd: fila.saldoAFavorUsd ?? '0.00',
      alumnoNombre: `${fila.nombres} ${fila.apellidos}`.trim(),
      telefonoWhatsapp: fila.telefonoWhatsapp ?? null,
      cuotaId: cuota?.id ?? null,
      estadoCuota: cuota?.estado ?? null,
      fechaCorteUtc: fechaCorte ? toIsoSafe(fechaCorte) : null,
      saldoPendienteUsd: saldoUsd,
      saldoPendienteBs: proyeccion.saldoPendienteBs,
      tasaAplicada: proyeccion.tasaAplicada,
      diasAtraso: null,
      diasRestantes: null,
      ultimaGestionUtc: gestiones.get(fila.clienteId) ?? null,
      planNombre: null,
      periodo: null,
      pagoId: null,
      montoReportado: null,
      monedaOriginal: null,
      metodoPago: null,
      referenciaBancaria: null,
      comprobanteUrl: null,
      fechaReporteUtc: null,
      diasEspera: null,
    };

    if (tipo === 'mora') {
      return {
        ...base,
        diasAtraso: fechaCorte ? calcularDiasAtraso(new Date(fechaCorte), ahora) : null,
      };
    }

    return {
      ...base,
      diasRestantes: fechaCorte
        ? Math.max(0, Math.round((new Date(fechaCorte).getTime() - ahora.getTime()) / MS_POR_DIA))
        : null,
    };
  });

  return {
    items,
    total: Number(filaTotal[0]?.total ?? 0),
    limit,
    offset,
    resumen,
  };
}
