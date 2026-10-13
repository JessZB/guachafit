/**
 * Paso 3 del selector: elección entre reemplazar o añadir a la rutina actual,
 * resumen de la asignación y resultado (éxito o error).
 *
 * Recorte verbatim del módulo `selector-plantilla-asignacion` (prompt 71, lote B).
 * Presentacional: no pide datos; recibe el detalle, el modo y callbacks.
 * CANDIDATO (R3): el par de radios Reemplazar/Fusionar duplica
 * `AsignacionMasivaPlantilla.tsx:349-360`; la sustitución no es mecánica
 * (distinto copy y contrato de props).
 */
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  ModoAsignacionPlantilla,
  type AsignacionPlantillaResponseDTO,
  type PlantillaRutinaDTO,
} from '@guachafit/shared';
import { resumenAsignacion } from '../../../lib/asignacion-pasos';

export function PasoConfirmar({
  idBase,
  detalle,
  alumnoNombre,
  modo,
  ajustesPendientes,
  resultado,
  errorAsignacion,
  asignacionCompletada,
  onCambiarModo,
}: {
  idBase: string;
  detalle: PlantillaRutinaDTO;
  alumnoNombre: string;
  modo: ModoAsignacionPlantilla;
  ajustesPendientes: number;
  resultado: AsignacionPlantillaResponseDTO | null;
  errorAsignacion: string | null;
  /** Tras un éxito no se permite re-confirmar: cada asignación crea/fusiona bloques reales. */
  asignacionCompletada: boolean;
  onCambiarModo: (modo: ModoAsignacionPlantilla) => void;
}) {
  return (
    <>
      <fieldset className="space-y-2" disabled={asignacionCompletada}>
        <legend className="text-sm font-semibold text-foreground mb-2">
          ¿Qué hacemos con la rutina actual?
        </legend>
        {[
          {
            valor: ModoAsignacionPlantilla.REEMPLAZAR,
            titulo: 'Reemplazar la rutina actual',
            detalle: `La rutina vigente de ${alumnoNombre} deja de estar activa; su historial no se borra.`,
          },
          {
            valor: ModoAsignacionPlantilla.FUSIONAR,
            titulo: 'Añadir a la rutina actual',
            detalle: 'Agrega los días de la plantilla a los que ya tiene, sin borrar ninguno.',
          },
        ].map((opcion) => {
          const idOpcion = `${idBase}-modo-${opcion.valor}`;
          const marcado = modo === opcion.valor;
          return (
            <label
              key={opcion.valor}
              htmlFor={idOpcion}
              className={`flex items-start gap-3 min-h-11 p-3 rounded-xl border transition-colors cursor-pointer ${
                marcado ? 'border-primary/60 bg-primary/5' : 'border-border hover:border-primary/40'
              }`}
            >
              <input
                id={idOpcion}
                type="radio"
                name={`${idBase}-modo`}
                value={opcion.valor}
                checked={marcado}
                onChange={() => onCambiarModo(opcion.valor)}
                aria-labelledby={`${idOpcion}-titulo`}
                aria-describedby={`${idOpcion}-detalle`}
                className="mt-0.5 h-5 w-5 accent-primary cursor-pointer"
              />
              <span className="min-w-0">
                <span id={`${idOpcion}-titulo`} className="block text-sm font-semibold text-foreground">
                  {opcion.titulo}
                </span>
                <span id={`${idOpcion}-detalle`} className="block text-sm text-muted-foreground">
                  {opcion.detalle}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>

      <p className="text-base text-foreground break-words">
        {resumenAsignacion({
          plantillaNombre: detalle.nombre,
          alumnoNombre,
          numeroAjustes: ajustesPendientes,
          modo,
        })}
      </p>

      {resultado && resultado.exitosos > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="p-3 rounded-xl bg-success/10 border border-success/30 text-sm text-foreground flex items-start gap-2"
        >
          <CheckCircle2 className="h-5 w-5 shrink-0 text-success-strong" aria-hidden="true" />
          <span className="min-w-0 break-words">
            <span className="font-semibold">Rutina asignada a {alumnoNombre}.</span>{' '}
            {resultado.modo === ModoAsignacionPlantilla.REEMPLAZAR
              ? 'Reemplazó su rutina activa.'
              : 'Los días se añadieron a su rutina actual.'}
          </span>
        </div>
      )}

      {errorAsignacion && (
        <div
          role="alert"
          className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-sm text-destructive flex items-start gap-2"
        >
          <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span>{errorAsignacion}</span>
        </div>
      )}
    </>
  );
}
