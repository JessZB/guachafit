import {
  and,
  asc,
  count,
  eq,
  ilike,
  lte,
  ne,
  or,
  cuotasMembresia,
  perfilesAlumno,
  planesMembresia,
} from '@guachafit/database';
import {
  EstadoCuota,
  type CarteraDTO,
  type ResumenCarteraDTO,
} from '@guachafit/shared';
import { toIsoSafe } from '../finanzas.service';
import { calcularVentanaMesUtc } from '../../../common/cartera.util';
import type { ContextoCartera, ContextoTasa } from './contexto-cartera';
import { proyectarSaldoCon } from './proyectar-saldo-reglas';

export interface OpcionesListaAlDia {
  entrenadorId: string;
  ahora: Date;
  limit: number;
  offset: number;
  patron: string | null;
  contexto: ContextoTasa;
  resumen: ResumenCarteraDTO;
}

/**
 * Pestaña "Al Día" (RF-009 §4.B): cuotas del ciclo en curso cubiertas al 100%.
 *
 * La lista es por cuota (un alumno con dos planes vigentes pagados aparece una vez por plan),
 * mientras que el contador de la pestaña cuenta cuotas — la misma magnitud que `total`.
 * "Próxima fecha de facturación" no existe como dato persistido: se expone el corte real del
 * ciclo cubierto (`fechaCorteUtc`) y nunca se inventa una fecha futura.
 */
export async function listarAlDiaCartera(
  ctx: ContextoCartera,
  opciones: OpcionesListaAlDia
): Promise<CarteraDTO> {
  const { entrenadorId, ahora, limit, offset, patron, contexto, resumen } = opciones;
  const { periodoActual } = calcularVentanaMesUtc(ahora);

  const filtroNombre = patron
    ? or(
        ilike(perfilesAlumno.nombres, patron),
        ilike(perfilesAlumno.apellidos, patron)
      )!
    : undefined;
  const whereLista = and(
    eq(cuotasMembresia.entrenadorId, entrenadorId),
    eq(cuotasMembresia.periodo, periodoActual),
    lte(cuotasMembresia.saldoPendienteUsd, '0'),
    ne(cuotasMembresia.estado, EstadoCuota.ANULADA),
    filtroNombre
  );

  // RNF-003/ADR-011 (etapa 2): `cuotas_membresia` + join a `planes_membresia` con el GUC del coach.
  const [filaTotal, filas] = await ctx.withTenant({ entrenadorId }, async (tx) =>
    Promise.all([
      tx
        .select({ total: count() })
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
          cuotaId: cuotasMembresia.id,
          clienteId: cuotasMembresia.clienteId,
          periodo: cuotasMembresia.periodo,
          fechaCorteUtc: cuotasMembresia.fechaCorteUtc,
          estado: cuotasMembresia.estado,
          perfilId: perfilesAlumno.id,
          proximoCorte: perfilesAlumno.proximoCorte,
          saldoAFavorUsd: perfilesAlumno.saldoAFavorUsd,
          nombres: perfilesAlumno.nombres,
          apellidos: perfilesAlumno.apellidos,
          telefonoWhatsapp: perfilesAlumno.telefonoWhatsapp,
          tasaOverride: perfilesAlumno.tasaFijadaOverride,
          planNombre: planesMembresia.nombre,
        })
        .from(cuotasMembresia)
        .innerJoin(
            perfilesAlumno,
            and(
              eq(perfilesAlumno.usuarioId, cuotasMembresia.clienteId),
              eq(perfilesAlumno.entrenadorId, cuotasMembresia.entrenadorId)
            )
          )
        .innerJoin(planesMembresia, eq(planesMembresia.id, cuotasMembresia.planId))
        .where(whereLista)
        .orderBy(
          asc(perfilesAlumno.apellidos),
          asc(perfilesAlumno.nombres),
          asc(cuotasMembresia.id)
        )
        .limit(limit)
        .offset(offset),
    ])
  );

  const items = filas.map((fila) => {
    // La cuota está cubierta: su proyección en Bs es 0 solo si existe tasa real; sin tasa el
    // dato se omite (misma honestidad que las demás pestañas).
    const proyeccionCero = proyectarSaldoCon(
      (saldo, tasa) => ctx.finanzasService.proyectarVES(saldo, tasa),
      '0.00',
      fila.tasaOverride,
      contexto.tasaBase
    );
    return {
      alumnoUsuarioId: fila.clienteId,
      alumnoPerfilId: fila.perfilId ?? null,
      proximoCorte: fila.proximoCorte ?? null,
      saldoAFavorUsd: fila.saldoAFavorUsd ?? '0.00',
      alumnoNombre: `${fila.nombres} ${fila.apellidos}`.trim(),
      telefonoWhatsapp: fila.telefonoWhatsapp ?? null,
      cuotaId: fila.cuotaId,
      estadoCuota: fila.estado,
      fechaCorteUtc: toIsoSafe(fila.fechaCorteUtc),
      saldoPendienteUsd: '0.00',
      saldoPendienteBs: proyeccionCero.saldoPendienteBs,
      tasaAplicada: proyeccionCero.tasaAplicada,
      diasAtraso: null,
      diasRestantes: null,
      ultimaGestionUtc: null,
      planNombre: fila.planNombre,
      periodo: fila.periodo,
      pagoId: null,
      montoReportado: null,
      monedaOriginal: null,
      metodoPago: null,
      referenciaBancaria: null,
      comprobanteUrl: null,
      fechaReporteUtc: null,
      diasEspera: null,
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
