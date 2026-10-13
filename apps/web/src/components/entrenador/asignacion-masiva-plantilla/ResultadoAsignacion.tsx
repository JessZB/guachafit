/**
 * Ola 3 · módulo `asignacion-masiva-plantilla` (lote B, presentacional).
 *
 * Resumen del resultado por alumno. Recorte verbatim de
 * `AsignacionMasivaPlantilla.tsx:287-339`. No pide datos.
 *
 * CANDIDATO (R3): el `role="status"` con el conteo se parece al de
 * `selector-plantilla-asignacion/PasoConfirmar.tsx:102-116`, pero el contrato difiere
 * (N filas `FilaResultadoAsignacion` vs 1 alumno); sustitución no mecánica.
 */
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import type { FilaResultadoAsignacion } from '../../../lib/asignacion-masiva';

export function ResultadoAsignacion({
  resultados,
  exitosos,
  onCerrar,
}: {
  resultados: FilaResultadoAsignacion[];
  exitosos: number;
  onCerrar: () => void;
}) {
  return (
    <div className="space-y-3">
      <div
        role="status"
        aria-live="polite"
        className={`p-3 rounded-2xl border text-xs font-semibold flex items-center gap-2 ${
          exitosos > 0
            ? 'bg-success/10 border-success/30 text-success'
            : 'bg-destructive/10 border-destructive/30 text-destructive'
        }`}
      >
        {exitosos > 0 ? (
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
        ) : (
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
        )}
        <span>
          Plantilla asignada a {exitosos} de {resultados.length} alumno
          {resultados.length === 1 ? '' : 's'}.
        </span>
      </div>
      <ul className="space-y-2">
        {resultados.map((fila) => (
          <li
            key={fila.alumnoId}
            className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
              fila.exito ? 'border-success/30 bg-success/5' : 'border-destructive/30 bg-destructive/5'
            }`}
          >
            {fila.exito ? (
              <CheckCircle2 className="h-4 w-4 text-success shrink-0" aria-hidden="true" />
            ) : (
              <AlertCircle className="h-4 w-4 text-destructive shrink-0" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <span className="block font-bold text-foreground">{fila.nombre}</span>
              <span className={`block ${fila.exito ? 'text-success' : 'text-destructive'}`}>
                {fila.mensaje}
              </span>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onCerrar}
          className="min-h-11 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs cursor-pointer"
        >
          Listo
        </button>
      </div>
    </div>
  );
}

