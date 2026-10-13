/**
 * Fila de un ejercicio en el paso de revisión: nombre, texto prescrito, botón
 * "Ajustar {nombre}", inputs de ajuste y error inline.
 *
 * Recorte verbatim del módulo `selector-plantilla-asignacion` (prompt 71, lote B).
 * Presentacional: no pide datos; recibe el estado de ajustes y callbacks.
 * CANDIDATO (R3): edita series/peso/reps como `BloquesRutinaEditor.tsx`
 * (convergencia del prompt 76, no de este módulo).
 */
import { SlidersHorizontal } from 'lucide-react';
import type { BloqueDiaRutinaDTO } from '@guachafit/shared';
import { textoEjercicioPlantilla } from '../../../lib/asignacion-pasos';
import {
  claveOverrideEjercicio,
  overrideTieneCambios,
  validarOverrideEjercicio,
  type ErrorAjuste,
  type OverrideAjusteEjercicio,
} from '../../../lib/plantillas-rutina';
import { CAMPOS_AJUSTE, CampoAjuste, type CampoAjusteCampo } from './CampoAjuste';

type EjercicioPlantilla = BloqueDiaRutinaDTO['ejercicios'][number];

export function FilaEjercicioAjuste({
  idBase,
  bloque,
  ejercicio,
  ejIdx,
  overrides,
  erroresAjustes,
  ajustando,
  deshabilitado,
  onAlternarAjuste,
  onActualizarCampo,
  onLimpiar,
}: {
  idBase: string;
  bloque: BloqueDiaRutinaDTO;
  ejercicio: EjercicioPlantilla;
  ejIdx: number;
  overrides: Record<string, OverrideAjusteEjercicio>;
  erroresAjustes: ErrorAjuste[];
  ajustando: Set<string>;
  /** Tras un éxito no se permite editar: cada asignación crea/fusiona bloques reales. */
  deshabilitado: boolean;
  onAlternarAjuste: (clave: string) => void;
  onActualizarCampo: (
    bloque: BloqueDiaRutinaDTO,
    ejercicio: EjercicioPlantilla,
    campo: CampoAjusteCampo,
    valorFiltrado: string
  ) => void;
  onLimpiar: (clave: string) => void;
}) {
  const clave = claveOverrideEjercicio(bloque.diaId, ejercicio.ejercicioId, ejercicio.nombre);
  const override = overrides[clave];
  const erroresCampo = override ? validarOverrideEjercicio(override) : {};
  const ajustado = Boolean(override && overrideTieneCambios(override));
  const errorAjuste = erroresAjustes.find((e) => e.clave === clave);
  const editando = ajustando.has(clave);
  const errorVisible =
    erroresCampo.peso || erroresCampo.series || erroresCampo.reps || errorAjuste?.mensaje;
  const idErrorFila = `${idBase}-${bloque.diaId}-${ejIdx}-error`;

  return (
    <li key={ejercicio.id || clave || ejIdx} className="py-2.5 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground break-words">
            {ejercicio.nombre}
            {ajustado && (
              <span className="ml-2 inline-block px-1.5 py-0.5 rounded-md bg-primary/15 text-primary text-xs font-semibold align-middle">
                Ajustado
              </span>
            )}
          </p>
          <p className="text-sm text-muted-foreground">{textoEjercicioPlantilla(ejercicio)}</p>
          {ejercicio.notas && (
            <p className="text-xs text-muted-foreground break-words">Nota técnica: {ejercicio.notas}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onAlternarAjuste(clave)}
          disabled={deshabilitado}
          aria-expanded={editando}
          aria-label={`Ajustar ${ejercicio.nombre}`}
          className="min-h-11 shrink-0 px-3 rounded-xl border border-border text-sm font-medium text-foreground hover:border-primary/40 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <SlidersHorizontal className="h-4 w-4 text-primary" aria-hidden="true" />
          Ajustar
        </button>
      </div>

      {editando && (
        <div className="flex items-end gap-3 flex-wrap pl-0.5">
          {CAMPOS_AJUSTE.map((campo) => (
            <CampoAjuste
              key={campo.campo}
              id={`${idBase}-${bloque.diaId}-${ejIdx}-${campo.campo}`}
              etiqueta={campo.etiqueta}
              inputMode={campo.inputMode}
              anchoClase={campo.anchoClase}
              valor={override?.[campo.campo] ?? ''}
              invalido={Boolean(erroresCampo[campo.campo])}
              idError={errorVisible ? idErrorFila : undefined}
              deshabilitado={deshabilitado}
              pegarConUnidad={campo.campo === 'peso'}
              onCambio={(texto) => {
                const anterior = override?.[campo.campo] ?? '';
                const filtrado = campo.filtrar(texto, anterior);
                if (filtrado !== anterior) onActualizarCampo(bloque, ejercicio, campo.campo, filtrado);
              }}
            />
          ))}
          {ajustado && (
            <button
              type="button"
              onClick={() => onLimpiar(clave)}
              disabled={deshabilitado}
              className="min-h-11 px-2 text-sm font-medium text-muted-foreground hover:text-foreground underline cursor-pointer disabled:opacity-50"
            >
              Restablecer
            </button>
          )}
        </div>
      )}

      {errorVisible && (
        <p id={idErrorFila} className="text-sm font-medium text-destructive">
          {errorVisible}
        </p>
      )}
    </li>
  );
}
