/**
 * Módulo `bloques-rutina-editor` (Ola 2, prompt 74) · resumen del pie del editor.
 *
 * Lógica pura extraída verbatim de `BloquesRutinaEditor.tsx:109-116` (R1): el `useMemo`
 * de `totales`. Los tipos de dominio vienen de `@guachafit/shared` vía `BloqueEdicion`
 * de `rutina-bloques` (R4).
 */
import type { BloqueEdicion } from './rutina-bloques';

export interface ResumenEditorBloques {
  totalDias: number;
  totalEjercicios: number;
  totalSeries: number;
}

/** Cuenta días, ejercicios y series prescritas (`series || 0`, igual que el original). */
export function calcularResumenEditor(bloques: BloqueEdicion[]): ResumenEditorBloques {
  const totalEjercicios = bloques.reduce((total, b) => total + b.ejercicios.length, 0);
  const totalSeries = bloques.reduce(
    (total, b) => total + b.ejercicios.reduce((suma, ej) => suma + (ej.series || 0), 0),
    0
  );
  return { totalDias: bloques.length, totalEjercicios, totalSeries };
}
