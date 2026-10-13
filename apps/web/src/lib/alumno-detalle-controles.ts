/**
 * Modelo de vista de los controles antropométricos de la ficha del alumno.
 *
 * Lógica pura extraída de `pages/entrenador/AlumnoDetallePage.tsx` (SL-1, R1).
 * No redefine tipos de `@guachafit/shared`: normaliza el DTO real a la fila de la tabla.
 */
import type { ControlAntropometricoDetalleDTO } from '@guachafit/shared';

/**
 * WU25b: tamaño de página por defecto de los listados paginados de la ficha (historial de
 * sesiones, transacciones y controles antropométricos). La API acota los límites a 1..100; 10
 * mantiene la ficha escaneable sin obligar a saltar páginas.
 */
export const TAMANO_PAGINA_FICHA = 10;

/** Fila de la tabla de controles de la ficha (normalizada desde el DTO real o el fixture demo). */
export type ControlAntroFila = {
  id: string;
  fecha: string;
  pesoKg: string;
  grasaPorcentaje: string | null;
  cinturaCm: string | null;
  brazoCm: string | null;
  pechoCm: string | null;
  musloCm: string | null;
};

/**
 * N3: normaliza un control antropométrico real de la API a la fila de la tabla del expediente.
 * Los perímetros opcionales sin dato quedan en null y la tabla los muestra como "—".
 */
export function mapearControlAntro(control: ControlAntropometricoDetalleDTO): ControlAntroFila {
  return {
    id: control.id,
    fecha: control.fechaEvaluacion,
    pesoKg: control.pesoKg,
    grasaPorcentaje: control.porcentajeGrasa ?? null,
    cinturaCm: control.perimetros?.cinturaCm ?? null,
    brazoCm: control.perimetros?.brazoCm ?? null,
    pechoCm: control.perimetros?.pechoCm ?? null,
    musloCm: control.perimetros?.musloCm ?? null,
  };
}

/** Fixture demo de controles antropométricos de la ficha (más reciente primero). */
export function controlesDemoAlumno(): ControlAntroFila[] {
  return [
    {
      id: 'antro-1',
      fecha: '2026-09-01',
      pesoKg: '78.50',
      grasaPorcentaje: '16.2',
      cinturaCm: '82.0',
      brazoCm: '37.5',
      pechoCm: '102.0',
      musloCm: '58.0',
    },
    {
      id: 'antro-0',
      fecha: '2026-08-01',
      pesoKg: '80.80',
      grasaPorcentaje: '17.8',
      cinturaCm: '84.5',
      brazoCm: '37.0',
      pechoCm: '101.0',
      musloCm: '57.5',
    },
  ];
}
