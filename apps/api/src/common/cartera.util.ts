/**
 * WU-I (RF-009): utilidades compartidas del tablero de control de cartera.
 *
 * Aquí vive la regla ÚNICA de cartera para que el dashboard (RF-013), el directorio de alumnos
 * (RF-011) y el tablero de cartera (RF-009) no divergan:
 * - `calcularVentanaMesUtc`: ventana del mes calendario UTC para el KPI "recaudado".
 * - `calcularRecaudadoMesUsd`: suma de pagos aprobados del mes en curso (KPI-01).
 * - `condicionCuotaEnMora` / `condicionCuotaPorVencer`: criterios SQL de deuda vencida y por venir.
 * - `calcularDiasAtraso`: días transcurridos desde una fecha de corte.
 */
import {
  TenantTransaction,
  and,
  eq,
  gt,
  gte,
  inArray,
  lt,
  lte,
  notInArray,
  or,
  sql,
  transaccionesPago,
  cuotasMembresia,
} from '@guachafit/database';
import { EstadoConciliacion, EstadoCuota } from '@guachafit/shared';

/**
 * Escapa `%`, `_` y `\` de un término de búsqueda para usarlo como patrón LIKE literal
 * (Postgres usa `\` como escape por defecto en `ILIKE`).
 */
export function escaparPatronLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (caracter) => `\\${caracter}`);
}

/** Días previos al corte en los que una cuota impaga cuenta como "por vencer" (RF-008 §4.A). */
export const DIAS_VENTANA_POR_VENCER = 5;

export const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * Ventana del mes calendario en UTC para los KPIs financieros (RF-013 / RF-009 KPI-01).
 *
 * "Cobros del Mes" se delimita con el mismo criterio en todo el sistema:
 * [inicio de mes UTC, inicio del mes siguiente UTC). Nunca se suma el histórico completo.
 */
export function calcularVentanaMesUtc(ahora: Date): {
  periodoActual: string;
  inicioMesUtc: Date;
  inicioMesSiguienteUtc: Date;
} {
  const anio = ahora.getUTCFullYear();
  const mes = ahora.getUTCMonth();
  return {
    periodoActual: `${anio}-${String(mes + 1).padStart(2, '0')}`,
    inicioMesUtc: new Date(Date.UTC(anio, mes, 1)),
    inicioMesSiguienteUtc: new Date(Date.UTC(anio, mes + 1, 1)),
  };
}

/**
 * KPI-01 (Total Recaudado en el Mes): suma de pagos aprobados en USD del mes UTC en curso.
 *
 * Se usa la fecha REAL de entrada del dinero (`fechaConciliacionUtc`) y, para filas legadas sin
 * ella, la fecha de reporte. `coalesce` se expresa con SQL: no existe como helper en
 * drizzle-orm 0.33.
 *
 * GOTCHA (verificado contra Postgres real): el lado izquierdo de la comparación es un fragmento
 * SQL crudo, por lo que drizzle NO aplica el encoder de la columna y un `Date` llegaría crudo a
 * postgres-js. Además, el driver de drizzle sobreescribe los serializers de timestamptz con una
 * identidad (`transparentParser`), así que postgres-js intentaría escribir el Date como texto y
 * falla con `ERR_INVALID_ARG_TYPE`. Los límites se envían como ISO string con cast explícito a
 * `timestamptz` (mismo instante, cero ambigüedad de tipos).
 *
 * RNF-003/ADR-011: `transacciones_pago` tiene RLS (etapa 2); la conexión debe ser el `tx` de
 * `withTenant` (coach con su `entrenadorId`), nunca el pool raíz.
 */
export async function calcularRecaudadoMesUsd(
  db: TenantTransaction,
  entrenadorId: string,
  ventana: { inicioMesUtc: Date; inicioMesSiguienteUtc: Date }
): Promise<string> {
  const fechaCobroEfectiva = sql`coalesce(${transaccionesPago.fechaConciliacionUtc}, ${transaccionesPago.fechaReporteUtc})`;
  const inicioMesIso = ventana.inicioMesUtc.toISOString();
  const inicioMesSiguienteIso = ventana.inicioMesSiguienteUtc.toISOString();
  const pagosAprobados = await db
    .select({
      montoEquivalenteUsd: transaccionesPago.montoEquivalenteUsd,
    })
    .from(transaccionesPago)
    .where(
      and(
        eq(transaccionesPago.entrenadorId, entrenadorId),
        eq(transaccionesPago.estadoConciliacion, EstadoConciliacion.APROBADO),
        sql`${fechaCobroEfectiva} >= ${inicioMesIso}::timestamptz`,
        sql`${fechaCobroEfectiva} < ${inicioMesSiguienteIso}::timestamptz`
      )
    );

  const totalCobradoUsd = pagosAprobados.reduce(
    (acc, p) => acc + Number(p.montoEquivalenteUsd || 0),
    0
  );
  return totalCobradoUsd.toFixed(2);
}

/**
 * Regla ÚNICA de "cuota en mora" (RF-009 §4.B) usada por el dashboard, el directorio y la cartera:
 * - la cuota está marcada como VENCIDA, o
 * - su fecha de corte ya pasó, tiene saldo pendiente y su estado no es AL_DIA/ANULADA.
 *
 * Exclusiones coherentes con la máquina de estados (RF-008 §4.A):
 * - `POR_VENCER` es preventivo (ámbar), nunca mora; el barrido diario lo degrada a VENCIDA
 *   cuando la fecha de corte realmente pasa.
 * - `PENDIENTE_REVISION` PAUSA la mora mientras el comprobante está en verificación: RF-009
 *   lista esa situación como su propia pestaña y no como deuda vencida.
 */
export function condicionCuotaEnMora(ahora: Date) {
  return or(
    eq(cuotasMembresia.estado, EstadoCuota.VENCIDA),
    and(
      lt(cuotasMembresia.fechaCorteUtc, ahora),
      gt(cuotasMembresia.saldoPendienteUsd, '0'),
      notInArray(cuotasMembresia.estado, [
        EstadoCuota.AL_DIA,
        EstadoCuota.ANULADA,
        EstadoCuota.POR_VENCER,
        EstadoCuota.PENDIENTE_REVISION,
      ])
    )
  )!;
}

/**
 * WU-H (RF-008 §4.A): regla de "cuota por vencer" para el semáforo y la cartera.
 *
 * Cubre tanto el estado persistido `POR_VENCER` (producido por el barrido) como las cuotas
 * EMITIDA/ABONADA_PARCIAL cuyo corte cae dentro de la ventana y el barrido aún no corrió.
 *
 * `PENDIENTE_REVISION` no cuenta como por vencer: un pago en revisión pausa el cobro.
 */
export function condicionCuotaPorVencer(ahora: Date) {
  const limite = new Date(ahora.getTime() + DIAS_VENTANA_POR_VENCER * MS_POR_DIA);
  return or(
    eq(cuotasMembresia.estado, EstadoCuota.POR_VENCER),
    and(
      inArray(cuotasMembresia.estado, [EstadoCuota.EMITIDA, EstadoCuota.ABONADA_PARCIAL]),
      gt(cuotasMembresia.saldoPendienteUsd, '0'),
      gte(cuotasMembresia.fechaCorteUtc, ahora),
      lte(cuotasMembresia.fechaCorteUtc, limite)
    )
  )!;
}

/**
 * Días de atraso de una cuota vencida respecto de `ahora` (mínimo 1: vencer es vencer).
 *
 * Misma semántica del dashboard RF-013 para que la fila de la cartera y su bandeja rápida
 * muestren el mismo número.
 */
export function calcularDiasAtraso(fechaCorteUtc: Date, ahora: Date): number {
  return Math.max(
    1,
    Math.round((ahora.getTime() - fechaCorteUtc.getTime()) / MS_POR_DIA)
  );
}
