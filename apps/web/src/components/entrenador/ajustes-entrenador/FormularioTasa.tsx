/**
 * RF-018 · Ajustes del entrenador: bloque plegable para editar la tasa (UX-19).
 *
 * Presentacional: todo el estado y la red entran por props desde `useTasasCambio`.
 * El `<details>` es no controlado: se decide UNA vez al montar (abierto si no hay tasa guardada o
 * hay cambios sin guardar) y nunca se enlaza a un estado que cambie, o se cerraría mientras se
 * escribe. Se monta solo cuando la tasa ya cargó, para que esa decisión use datos reales.
 */
import { useState } from 'react';
import {
  AVISO_CAMBIOS_SIN_GUARDAR_TASA,
  ETIQUETAS_FUENTE_TASA,
  type ErroresTasa,
  type FuenteTasaAjustes,
} from '../../../lib/ajustes-entrenador-tasas';
import { AvisosAjustes, BotonAjustes, CampoAjustes } from '../../ajustes/CampoAjustes';

const FUENTES: readonly FuenteTasaAjustes[] = ['oficial_bcv', 'paralelo', 'manual'];

export interface FormularioTasaProps {
  /** Hay una tasa guardada (decide si el bloque arranca abierto). */
  hayTasaGuardada: boolean;
  hayCambios: boolean;
  fuenteSeleccionada: FuenteTasaAjustes;
  tasaOficialBcvInput: string;
  tasaParaleloInput: string;
  tasaActivaInput: string;
  errores: ErroresTasa;
  errorGuardado: string | null;
  tasaSuccessMsg: string | null;
  isSavingTasa: boolean;
  onSeleccionarFuente: (fuente: FuenteTasaAjustes) => void;
  onCambiarOficial: (valor: string) => void;
  onCambiarParalelo: (valor: string) => void;
  onCambiarActiva: (valor: string) => void;
  onGuardar: () => void;
}

export function FormularioTasa({
  hayTasaGuardada,
  hayCambios,
  fuenteSeleccionada,
  tasaOficialBcvInput,
  tasaParaleloInput,
  tasaActivaInput,
  errores,
  errorGuardado,
  tasaSuccessMsg,
  isSavingTasa,
  onSeleccionarFuente,
  onCambiarOficial,
  onCambiarParalelo,
  onCambiarActiva,
  onGuardar,
}: FormularioTasaProps) {
  const [abiertoAlMontar] = useState(() => !hayTasaGuardada || hayCambios);

  const valorPorFuente: Record<FuenteTasaAjustes, string> = {
    oficial_bcv: tasaOficialBcvInput,
    paralelo: tasaParaleloInput,
    manual: tasaActivaInput,
  };

  return (
    <details open={abiertoAlMontar} className="rounded-2xl border border-border bg-secondary/20">
      <summary className="min-h-11 cursor-pointer flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2 rounded-2xl font-bold text-sm text-foreground focus-visible:outline-2 focus-visible:outline-primary">
        <span>Editar tasa</span>
        {hayCambios && (
          <span className="text-xs font-semibold text-warning">
            {AVISO_CAMBIOS_SIN_GUARDAR_TASA}
          </span>
        )}
      </summary>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onGuardar();
        }}
        noValidate
        className="px-4 pb-4 pt-2 space-y-4"
      >
        <div className="space-y-2">
          <p aria-hidden="true" className="text-xs font-semibold text-muted-foreground">
            Fuente de la tasa
          </p>
          <div
            role="radiogroup"
            aria-label="Fuente de la tasa"
            className="grid grid-cols-1 sm:grid-cols-3 gap-2"
          >
            {FUENTES.map((fuente) => {
              const seleccionada = fuenteSeleccionada === fuente;
              const valor = valorPorFuente[fuente].trim();
              return (
                <label
                  key={fuente}
                  className={`min-h-11 px-3 py-2 rounded-xl border flex items-center gap-3 cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary ${
                    seleccionada
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border bg-background text-muted-foreground'
                  }`}
                >
                  <input
                    type="radio"
                    name="fuente-tasa"
                    checked={seleccionada}
                    disabled={isSavingTasa}
                    onChange={() => onSeleccionarFuente(fuente)}
                    className="h-5 w-5 shrink-0 accent-primary"
                  />
                  <span className="min-w-0">
                    <span className={`block text-sm ${seleccionada ? 'font-bold' : 'font-semibold'}`}>
                      {ETIQUETAS_FUENTE_TASA[fuente]}
                    </span>{' '}
                    <span className="block text-xs text-muted-foreground">
                      {valor ? `${valor} Bs` : 'Sin dato'}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <CampoAjustes
          id="tasa-oficial"
          etiqueta="Tasa BCV"
          valor={tasaOficialBcvInput}
          onCambiar={onCambiarOficial}
          autoComplete="off"
          inputMode="decimal"
          sufijo="Bs/USD"
          error={errores.tasaOficialBcv}
          deshabilitado={isSavingTasa}
        />
        <CampoAjustes
          id="tasa-paralelo"
          etiqueta="Tasa paralelo (opcional)"
          valor={tasaParaleloInput}
          onCambiar={onCambiarParalelo}
          autoComplete="off"
          inputMode="decimal"
          sufijo="Bs/USD"
          error={errores.tasaParalelo}
          deshabilitado={isSavingTasa}
        />
        <CampoAjustes
          id="tasa-activa"
          etiqueta="Tasa activa"
          descripcion="La que se usa en tus cobros."
          valor={tasaActivaInput}
          onCambiar={onCambiarActiva}
          autoComplete="off"
          inputMode="decimal"
          sufijo="Bs/USD"
          error={errores.tasaActiva}
          deshabilitado={isSavingTasa}
        />

        <AvisosAjustes error={errorGuardado} exito={tasaSuccessMsg} />

        <BotonAjustes ocupado={isSavingTasa}>Guardar tasa</BotonAjustes>
      </form>
    </details>
  );
}
