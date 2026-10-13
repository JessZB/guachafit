/**
 * Módulo 6 · Nutrición: diario fotográfico RN-03 (ÚNICO de vista).
 *
 * Extraído de `pages/atleta/NutricionPage.tsx` (SL2, fase B). Su selector interno es el
 * CANDIDATO compartido con `PagosPage` y `SelectorFotosCheckin` (forma distinta por vista,
 * R3: se queda aquí y se promueve en la fase D).
 * §6: botón e inputs `min-h-11`, error con `role="alert"`, quitar con nombre accesible.
 */
import type { RefObject } from 'react';
import { Camera, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { TipoComida } from '@guachafit/shared';
import { etiquetaTipoComida } from '../../../lib/nutricion-metas';
import {
  MAX_FOTOS_CHECKIN_NUTRICIONAL,
  formatearPeso,
  type FotoPlatoSeleccionada,
} from '../../../lib/nutricion-fotos';

export interface DiarioFotograficoProps {
  fotos: FotoPlatoSeleccionada[];
  isProcesandoFotos: boolean;
  fotosError: string | null;
  formularioBloqueado: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onElegirArchivos: (archivos: FileList | null) => void;
  onQuitarFoto: (id: string) => void;
  onCambiarTipoComida: (id: string, tipo: TipoComida) => void;
}

export function DiarioFotografico({
  fotos,
  isProcesandoFotos,
  fotosError,
  formularioBloqueado,
  inputRef,
  onElegirArchivos,
  onQuitarFoto,
  onCambiarTipoComida,
}: DiarioFotograficoProps) {
  return (
    <section className="p-5 sm:p-6 rounded-3xl bg-card border border-border shadow-xs space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-primary" />
          <h3 className="font-bold text-sm text-foreground">Diario fotográfico del día</h3>
        </div>
        <span className="text-xs font-semibold text-muted-foreground">
          {fotos.length}/{MAX_FOTOS_CHECKIN_NUTRICIONAL} fotos
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Adjunta de 1 a {MAX_FOTOS_CHECKIN_NUTRICIONAL} fotos de tus comidas principales. Se optimizan en tu dispositivo antes de
        subirse.
      </p>

      {!formularioBloqueado && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => onElegirArchivos(e.target.files)}
          />
          <button
            type="button"
            disabled={fotos.length >= MAX_FOTOS_CHECKIN_NUTRICIONAL || isProcesandoFotos}
            onClick={() => inputRef.current?.click()}
            className="w-full min-h-11 py-2.5 px-4 rounded-xl bg-secondary border border-border text-foreground font-bold text-xs hover:bg-secondary/70 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcesandoFotos ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ImagePlus className="h-4 w-4" />
            )}
            <span>
              {isProcesandoFotos
                ? 'Optimizando fotos…'
                : fotos.length >= MAX_FOTOS_CHECKIN_NUTRICIONAL
                ? `Máximo de ${MAX_FOTOS_CHECKIN_NUTRICIONAL} fotos alcanzado`
                : 'Añadir foto de una comida'}
            </span>
          </button>
        </>
      )}

      {fotosError && (
        <p
          role="alert"
          className="text-xs font-semibold text-destructive bg-destructive/10 border border-destructive/25 rounded-2xl px-3 py-2"
        >
          {fotosError}
        </p>
      )}

      {fotos.length > 0 && (
        <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {fotos.map((foto) => (
            <li key={foto.id} className="space-y-1.5">
              <div className="relative aspect-3/4 rounded-2xl overflow-hidden border border-border bg-background/60">
                <img
                  src={foto.previewUrl}
                  alt={`Vista previa de ${etiquetaTipoComida(foto.tipoComida)}`}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              </div>
              <label className="sr-only" htmlFor={`tipo-comida-${foto.id}`}>
                Comida de la foto
              </label>
              <select
                id={`tipo-comida-${foto.id}`}
                value={foto.tipoComida}
                disabled={formularioBloqueado}
                onChange={(e) => onCambiarTipoComida(foto.id, e.target.value as TipoComida)}
                className="w-full min-h-11 px-2 rounded-xl bg-background border border-border text-xs font-semibold text-foreground focus:outline-hidden focus:border-primary disabled:opacity-60"
              >
                {Object.values(TipoComida).map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {etiquetaTipoComida(tipo)}
                  </option>
                ))}
              </select>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground font-mono">
                  {formatearPeso(foto.archivo.size)}
                </span>
                <button
                  type="button"
                  disabled={formularioBloqueado}
                  onClick={() => onQuitarFoto(foto.id)}
                  aria-label={`Quitar foto de ${etiquetaTipoComida(foto.tipoComida)}`}
                  className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
