/**
 * Paso 2 del selector: resumen de la plantilla, resumen de errores de ajuste
 * y acordeón de días con sus ejercicios.
 *
 * Recorte verbatim del módulo `selector-plantilla-asignacion` (prompt 71, lote B).
 * Presentacional: no pide datos; recibe el detalle, los ajustes y callbacks.
 */
import type { RefObject } from 'react';
import { AlertCircle, ChevronDown } from 'lucide-react';
import type { BloqueDiaRutinaDTO, PlantillaRutinaDTO } from '@guachafit/shared';
import { overrideTieneCambios, type ErrorAjuste, type OverrideAjusteEjercicio } from '../../../lib/plantillas-rutina';
import { pluralizar } from '../../../lib/pluralizar';
import { FilaEjercicioAjuste } from './FilaEjercicioAjuste';
import type { CampoAjusteCampo } from './CampoAjuste';

type EjercicioPlantilla = BloqueDiaRutinaDTO['ejercicios'][number];

export function PasoRevisar({
  idBase,
  detalle,
  bloquesPreview,
  overrides,
  erroresAjustes,
  diaAbierto,
  ajustando,
  asignacionCompletada,
  resumenErroresRef,
  onSeleccionarDia,
  onAlternarAjuste,
  onActualizarCampo,
  onLimpiar,
  onIrAlCampoConError,
}: {
  idBase: string;
  detalle: PlantillaRutinaDTO;
  bloquesPreview: BloqueDiaRutinaDTO[];
  overrides: Record<string, OverrideAjusteEjercicio>;
  erroresAjustes: ErrorAjuste[];
  diaAbierto: string | null;
  ajustando: Set<string>;
  /** Tras un éxito no se permite editar: cada asignación crea/fusiona bloques reales. */
  asignacionCompletada: boolean;
  resumenErroresRef: RefObject<HTMLDivElement | null>;
  onSeleccionarDia: (diaId: string | null) => void;
  onAlternarAjuste: (clave: string) => void;
  onActualizarCampo: (
    bloque: BloqueDiaRutinaDTO,
    ejercicio: EjercicioPlantilla,
    campo: CampoAjusteCampo,
    valorFiltrado: string
  ) => void;
  onLimpiar: (clave: string) => void;
  onIrAlCampoConError: (clave: string) => void;
}) {
  const totalEjercicios = detalle.bloques.reduce((t, b) => t + b.ejercicios.length, 0);
  const ajustesPendientes = Object.values(overrides).filter(overrideTieneCambios).length;

  return (
    <>
      <p className="text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{detalle.nombre}</span> ·{' '}
        {pluralizar(detalle.bloques.length, 'día', 'días')} ·{' '}
        {pluralizar(totalEjercicios, 'ejercicio', 'ejercicios')}
        {ajustesPendientes > 0 && (
          <span className="text-primary font-semibold">
            {' '}
            · {pluralizar(ajustesPendientes, 'ajuste', 'ajustes')}
          </span>
        )}
      </p>

      {erroresAjustes.length > 0 && (
        <div
          ref={resumenErroresRef}
          role="alert"
          tabIndex={-1}
          className="p-3 rounded-xl bg-warning/10 border border-warning/30 text-sm text-foreground space-y-1 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-warning"
        >
          <p className="font-semibold flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4 text-warning shrink-0" aria-hidden="true" />
            Revisa estos ajustes antes de asignar:
          </p>
          <ul className="list-disc pl-6 space-y-0.5">
            {erroresAjustes.map((error) => (
              <li key={error.clave}>
                <button
                  type="button"
                  onClick={() => onIrAlCampoConError(error.clave)}
                  className="text-left underline underline-offset-2 hover:text-primary cursor-pointer"
                >
                  {error.mensaje}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="divide-y divide-border/70 border-y border-border/70">
        {bloquesPreview.map((bloque) => {
          const abierto = diaAbierto === bloque.diaId;
          const idPanel = `${idBase}-dia-${bloque.diaId}`;
          return (
            <section key={bloque.diaId}>
              <h3>
                <button
                  type="button"
                  aria-expanded={abierto}
                  aria-controls={idPanel}
                  onClick={() => onSeleccionarDia(abierto ? null : bloque.diaId)}
                  className="w-full min-h-12 py-3 flex items-center justify-between gap-3 text-left cursor-pointer"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-foreground break-words">
                      {bloque.titulo}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {pluralizar(bloque.ejercicios.length, 'ejercicio', 'ejercicios')}
                    </span>
                  </span>
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${
                      abierto ? 'rotate-180' : ''
                    }`}
                    aria-hidden="true"
                  />
                </button>
              </h3>

              {abierto && (
                <ul id={idPanel} className="pb-3 space-y-1">
                  {bloque.ejercicios.map((ej, ejIdx) => (
                    <FilaEjercicioAjuste
                      key={ej.id || ejIdx}
                      idBase={idBase}
                      bloque={bloque}
                      ejercicio={ej}
                      ejIdx={ejIdx}
                      overrides={overrides}
                      erroresAjustes={erroresAjustes}
                      ajustando={ajustando}
                      deshabilitado={asignacionCompletada}
                      onAlternarAjuste={onAlternarAjuste}
                      onActualizarCampo={onActualizarCampo}
                      onLimpiar={onLimpiar}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
