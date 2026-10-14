import { EstadoAlumno } from '@guachafit/shared';
import { calcularDiasAtraso } from '../../../common/cartera.util';
import type { AlumnoInactivoEntrenamiento } from './riesgo-deportivo-reglas';

/** Fila mínima de alumno que necesita el cálculo del dashboard. */
export interface AlumnoDashboard {
  id: string;
  usuarioId: string;
  nombres: string;
  apellidos: string;
  estadoActivacion: string;
  createdAtUtc: Date | string;
}

/** Cuota en mora leída dentro del bloque `withTenant` del dashboard. */
export interface CuotaMoraDashboard {
  id: string;
  clienteId: string;
  saldoPendienteUsd: string | number;
  fechaCorteUtc: Date | string;
  estado: string;
}

/** Alumno en mora con los días de vencimiento ya calculados. */
export interface AlumnoEnMora {
  alumnoId: string;
  nombre: string;
  cuotaId: string;
  saldoPendienteUsd: string;
  diasVencido: number;
}

/**
 * Calcula los alumnos activos y el porcentaje de ocupación de la capacidad.
 */
export function calcularOcupacion(
  alumnos: AlumnoDashboard[],
  capacidadMaxima: number
): { alumnosActivos: number; porcentajeOcupacion: string } {
  const alumnosActivos = alumnos.filter(
    (a) => a.estadoActivacion === EstadoAlumno.ACTIVO
  ).length;

  const porcentajeOcupacion =
    capacidadMaxima > 0
      ? ((alumnosActivos / capacidadMaxima) * 100).toFixed(2)
      : '0.00';

  return { alumnosActivos, porcentajeOcupacion };
}

/**
 * Calcula la meta de cobranza del mes y su porcentaje de avance.
 *
 * §6 honestidad de presentación: la meta SOLO existe si hay cuotas emitidas del periodo que
 * la respalden. Sin meta real no se inventa un valor (antes: `alumnos * 35` o 2500 USD) y el
 * cliente muestra "Sin meta de cobranza configurada"; el porcentaje tampoco se calcula.
 */
export function calcularMetaCobranza(
  cuotasPeriodo: Array<{ montoTotalUsd: string | number | null }>,
  cobranzaMesUsd: string
): { metaCobranzaMesUsd: string | null; porcentajeCobranza: string | null } {
  const totalMetaUsd = cuotasPeriodo.reduce(
    (acc, c) => acc + Number(c.montoTotalUsd || 0),
    0
  );
  const metaCobranzaMesUsd = totalMetaUsd > 0 ? totalMetaUsd.toFixed(2) : null;

  const porcentajeCobranza =
    metaCobranzaMesUsd !== null
      ? ((Number(cobranzaMesUsd) / Number(metaCobranzaMesUsd)) * 100).toFixed(2)
      : null;

  return { metaCobranzaMesUsd, porcentajeCobranza };
}

/**
 * Mapea las cuotas en mora a la bandeja de alumnos en mora.
 *
 * WU-I: regla ÚNICA compartida (`condicionCuotaEnMora`). POR_VENCER es preventivo (ámbar),
 * nunca mora, y PENDIENTE_REVISION pausa la mora mientras el comprobante está en revisión.
 */
export function mapearAlumnosEnMora(
  cuotasMora: CuotaMoraDashboard[],
  alumnos: AlumnoDashboard[],
  ahora: Date
): AlumnoEnMora[] {
  return cuotasMora.map((c) => {
    const al = alumnos.find((a) => a.usuarioId === c.clienteId);
    const diasVencido = calcularDiasAtraso(new Date(c.fechaCorteUtc), ahora);
    return {
      alumnoId: al?.id || c.clienteId,
      nombre: al ? `${al.nombres} ${al.apellidos}` : 'Alumno Registrado',
      cuotaId: c.id,
      saldoPendienteUsd: Number(c.saldoPendienteUsd).toFixed(2),
      diasVencido,
    };
  });
}

/**
 * Contadores separados: riesgo deportivo vs mora financiera.
 * `alumnosEnRiesgo` se conserva como unión legacy por compatibilidad con consumidores previos.
 */
export function calcularContadoresRiesgo(
  alumnosEnMora: AlumnoEnMora[],
  alumnosInactivosEntrenamiento: AlumnoInactivoEntrenamiento[]
): { alumnosEnRiesgo: number; alumnosEnMoraFinanciera: number } {
  const idsEnRiesgo = new Set([
    ...alumnosEnMora.map((m) => m.alumnoId),
    ...alumnosInactivosEntrenamiento.map((i) => i.alumnoId),
  ]);
  return { alumnosEnRiesgo: idsEnRiesgo.size, alumnosEnMoraFinanciera: alumnosEnMora.length };
}
