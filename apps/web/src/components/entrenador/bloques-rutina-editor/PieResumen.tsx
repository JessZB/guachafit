/**
 * Módulo `bloques-rutina-editor` (Ola 2, prompt 74) · pie con el resumen del editor.
 *
 * Origen: `BloquesRutinaEditor.tsx:799-805`. Componente único de la vista (R3: solo
 * tiene sentido aquí). Solo props (R1): sin `useQuery` ni `api-client` (R9).
 * Conserva los textos que usan los specs (R5).
 *
 * §6: `pluralizar` para el copy, piso 11px, pesos ≤ 700.
 */
import { pluralizar } from '../../../lib/pluralizar';
import type { ResumenEditorBloques } from '../../../lib/bloques-rutina-editor-resumen';

export function PieResumen({ resumen }: { resumen: ResumenEditorBloques }) {
  return (
    <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
      <span>
        {resumen.totalDias} día{resumen.totalDias === 1 ? '' : 's'} · {resumen.totalEjercicios}{' '}
        ejercicio{resumen.totalEjercicios === 1 ? '' : 's'}
      </span>
      <span>{pluralizar(resumen.totalSeries, 'serie prescrita', 'series prescritas')}</span>
    </div>
  );
}
