import { EstadoAlumno, SemaforoAdherencia } from '@guachafit/shared';
import type { BloqueDiaRutinaDTO } from '@guachafit/shared';
import {
  contarBloquesPrescritosHasta,
  diferenciaDiasCalendario,
  evaluarAdherenciaSemanal,
  obtenerFechaLocalYyyyMmDd,
} from '../../../common/adherencia.util';
import type { AlumnoDashboard } from './dashboard-entrenador-reglas';

/** Alumno inactivo en entrenamiento con sus días sin entrenar. */
export interface AlumnoInactivoEntrenamiento {
  alumnoId: string;
  nombre: string;
  diasSinEntrenar: number;
}

/** Rutina activa leída del lote de alumnos. */
export interface RutinaActivaDashboard {
  alumnoId: string;
  bloques: unknown;
  createdAtUtc: Date | string;
}

/** Sesión completada dentro de la ventana semanal. */
export interface SesionVentanaDashboard {
  alumnoId: string;
}

/** Sesión del historial completado. */
export interface SesionHistorialDashboard {
  alumnoId: string;
  fechaProgramada: string;
  fechaFinUtc: Date | string | null;
}

/**
 * Indexa los datos de adherencia por alumno.
 *
 * El historial viene ordenado desc por fecha de fin: la primera aparición es la última sesión.
 */
export function indexarDatosAdherencia(
  rutinasActivas: RutinaActivaDashboard[],
  sesionesCompletadasVentana: SesionVentanaDashboard[],
  ultimasSesiones: SesionHistorialDashboard[]
): {
  rutinaPorAlumno: Map<string, { bloques: unknown }>;
  completadasVentanaPorAlumno: Map<string, number>;
  ultimaSesionPorAlumno: Map<string, { fechaFinUtc: Date | string | null }>;
} {
  const rutinaPorAlumno = new Map<string, { bloques: unknown }>();
  for (const r of rutinasActivas) {
    if (!rutinaPorAlumno.has(r.alumnoId)) rutinaPorAlumno.set(r.alumnoId, r);
  }

  const completadasVentanaPorAlumno = new Map<string, number>();
  for (const s of sesionesCompletadasVentana) {
    completadasVentanaPorAlumno.set(
      s.alumnoId,
      (completadasVentanaPorAlumno.get(s.alumnoId) ?? 0) + 1
    );
  }

  const ultimaSesionPorAlumno = new Map<string, { fechaFinUtc: Date | string | null }>();
  for (const s of ultimasSesiones) {
    if (s.fechaFinUtc && !ultimaSesionPorAlumno.has(s.alumnoId)) {
      ultimaSesionPorAlumno.set(s.alumnoId, s);
    }
  }

  return { rutinaPorAlumno, completadasVentanaPorAlumno, ultimaSesionPorAlumno };
}

/** Ventana semanal que necesita la evaluación del riesgo deportivo. */
export interface VentanaRiesgoDeportivo {
  isoDayHoy: number;
  hoyLocal: string;
}

/**
 * Calcula en un único recorrido el riesgo deportivo por alumno (inactividad + adherencia RN-03)
 * y los agregados semanales. Reutiliza el evaluador puro compartido.
 */
export function evaluarRiesgoDeportivo(
  alumnos: AlumnoDashboard[],
  rutinaPorAlumno: Map<string, { bloques: unknown }>,
  completadasVentanaPorAlumno: Map<string, number>,
  ultimaSesionPorAlumno: Map<string, { fechaFinUtc: Date | string | null }>,
  ventana: VentanaRiesgoDeportivo,
  ahora: Date
): {
  alumnosInactivosEntrenamiento: AlumnoInactivoEntrenamiento[];
  alumnosEnRiesgoDeportivo: number;
  totalPrescritas: number;
  totalCompletadas: number;
  tasaAdherenciaSemanal: string | null;
} {
  const alumnosInactivosEntrenamiento: AlumnoInactivoEntrenamiento[] = [];
  let alumnosEnRiesgoDeportivo = 0;
  let totalPrescritas = 0;
  let totalCompletadas = 0;

  for (const al of alumnos) {
    const esActivo = al.estadoActivacion === EstadoAlumno.ACTIVO;
    const rutina = rutinaPorAlumno.get(al.usuarioId);
    const bloques = Array.isArray(rutina?.bloques)
      ? (rutina!.bloques as BloqueDiaRutinaDTO[])
      : [];
    const tienePlanActivo = bloques.length > 0;
    const sesionesPrescritas = tienePlanActivo
      ? contarBloquesPrescritosHasta(bloques, ventana.isoDayHoy)
      : 0;
    const sesionesCompletadas = completadasVentanaPorAlumno.get(al.usuarioId) ?? 0;

    if (sesionesPrescritas > 0) {
      totalPrescritas += sesionesPrescritas;
      totalCompletadas += sesionesCompletadas;
    }

    // Inactividad: días de calendario desde la última sesión completada (o alta si nunca entrenó).
    const sesion = ultimaSesionPorAlumno.get(al.usuarioId);
    let diasSinEntrenar = 0;
    if (sesion?.fechaFinUtc) {
      const fechaLocalUltima = obtenerFechaLocalYyyyMmDd(sesion.fechaFinUtc);
      diasSinEntrenar = diferenciaDiasCalendario(fechaLocalUltima, ventana.hoyLocal);
    } else {
      const fechaCreacion = new Date(al.createdAtUtc);
      diasSinEntrenar = Math.max(
        0,
        Math.round((ahora.getTime() - fechaCreacion.getTime()) / (1000 * 60 * 60 * 24))
      );
    }

    if (esActivo && diasSinEntrenar >= 4) {
      alumnosInactivosEntrenamiento.push({
        alumnoId: al.id,
        nombre: `${al.nombres} ${al.apellidos}`,
        diasSinEntrenar,
      });
    }

    const adherencia = evaluarAdherenciaSemanal(
      sesionesPrescritas,
      sesionesCompletadas,
      diasSinEntrenar
    );
    const riesgoPorAdherencia =
      tienePlanActivo &&
      sesionesPrescritas > 0 &&
      adherencia.semaforoAdherencia === SemaforoAdherencia.ROJO;
    const riesgoPorInactividad = esActivo && diasSinEntrenar >= 4;

    if (riesgoPorAdherencia || riesgoPorInactividad) {
      alumnosEnRiesgoDeportivo++;
    }
  }

  // Agregado semanal: sin datos evaluables => null explícito (nunca un '85.00' hardcodeado).
  const tasaAdherenciaSemanal =
    totalPrescritas > 0 ? ((totalCompletadas / totalPrescritas) * 100).toFixed(2) : null;

  return {
    alumnosInactivosEntrenamiento,
    alumnosEnRiesgoDeportivo,
    totalPrescritas,
    totalCompletadas,
    tasaAdherenciaSemanal,
  };
}
