/**
 * Datos clave de la franja bajo la cabecera de la ficha del alumno (L7.7).
 *
 * Decisión del owner (2026-10-26, lote L7 de la ficha del alumno): la franja resume saldo,
 * próxima cuota, último entreno y peso fuera de las pestañas, y cada dato lleva a su pestaña.
 *
 * Función pura: recibe los DTO reales (o `null` mientras no llegan) y devuelve los cuatro
 * valores ya formateados para mostrar. Reutiliza `describirUltimoEntreno` y `formatFechaLocal`
 * (mismo formato que `TarjetaCuotaMensual`); no duplica su lógica. Sin React, sin red.
 */
import {
  EstadoSesion,
  type ResumenFinancieroAlumnoDTO,
  type SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';
import type { ControlAntroFila } from './alumno-detalle-controles';
import { esSesionRealizada } from './alumno-detalle-metricas';
import { describirUltimoEntreno } from './alumnos-directorio-actividad';
import { formatFechaLocal } from './date-format';

export interface EntradaDatosClaveAlumno {
  finanzas: ResumenFinancieroAlumnoDTO | null;
  /**
   * Último entreno ya resuelto con el mismo respaldo que la pestaña Entrenos
   * (`resolverUltimoEntrenamiento`).
   */
  ultimaSesion: SesionEntrenamientoDetalleDTO | null;
  /** Controles antropométricos; solo el primero (el más reciente) se usa para el peso. */
  controles: ControlAntroFila[];
  ahora: Date;
}

export interface DatosClaveAlumno {
  saldo: string;
  proximaCuota: string;
  ultimoEntreno: string;
  peso: string;
}

const SIN_DATO = '—';
const ENTRENO_EN_CURSO = 'Entrenamiento en curso';

/** Saldo > 0 en dos decimales con `$`; 0 o negativo, "Sin deuda"; sin dato, "—". */
function formatearSaldo(saldoPendienteUsd: string | undefined): string {
  if (!saldoPendienteUsd || !Number.isFinite(Number(saldoPendienteUsd))) return SIN_DATO;
  const importe = Number(saldoPendienteUsd);
  return importe > 0 ? `$${importe.toFixed(2)}` : 'Sin deuda';
}

/**
 * En curso: texto fijo. Realizada: fecha de fin o, si no la trae, la de inicio.
 * Sin sesión realizada: "Sin entrenos registrados".
 */
function describirUltimoEntrenoResuelto(
  sesion: SesionEntrenamientoDetalleDTO | null,
  ahora: Date
): string {
  if (!esSesionRealizada(sesion)) return describirUltimoEntreno(null, ahora).texto;
  if (sesion?.estado === EstadoSesion.EN_PROGRESO) return ENTRENO_EN_CURSO;
  return describirUltimoEntreno(sesion?.fechaFinUtc ?? sesion?.fechaInicioUtc, ahora).texto;
}

export function datosClaveAlumno({
  finanzas,
  ultimaSesion,
  controles,
  ahora,
}: EntradaDatosClaveAlumno): DatosClaveAlumno {
  const pesoMasReciente = controles[0]?.pesoKg;

  return {
    saldo: formatearSaldo(finanzas?.saldoPendienteTotalUsd),
    // La cuota llega como timestamp ISO (`toISOString`), no como 'YYYY-MM-DD'.
    proximaCuota: formatFechaLocal(finanzas?.cuotaMesActual?.fechaVencimiento) ?? SIN_DATO,
    ultimoEntreno: describirUltimoEntrenoResuelto(ultimaSesion, ahora),
    peso: pesoMasReciente ? `${pesoMasReciente} kg` : SIN_DATO,
  };
}
