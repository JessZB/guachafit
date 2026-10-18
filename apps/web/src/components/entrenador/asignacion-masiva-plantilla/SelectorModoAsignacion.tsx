/**
 * Ola 3 · módulo `asignacion-masiva-plantilla` (lote B, presentacional).
 *
 * Radios de modo (añadir/reemplazar). Recorte verbatim de
 * `AsignacionMasivaPlantilla.tsx:342-380`. No pide datos.
 *
 * CANDIDATO (R3): el par de radios duplica `selector-plantilla-asignacion/PasoConfirmar.tsx:47-91`;
 * la sustitución no es mecánica (distinto copy y contrato: N alumnos vs 1 alumno con nombre).
 */
import { ModoAsignacionPlantilla } from '@guachafit/shared';

export function SelectorModoAsignacion({
  modo,
  onCambiarModo,
  deshabilitado = false,
}: {
  modo: ModoAsignacionPlantilla;
  onCambiarModo: (modo: ModoAsignacionPlantilla) => void;
  /** Bloquea el cambio de modo (asignación masiva tras un fallo ambiguo). */
  deshabilitado?: boolean;
}) {
  return (
    <fieldset className={deshabilitado ? 'space-y-2 opacity-60' : 'space-y-2'}>
      <legend className="text-xs font-bold text-foreground mb-2">
        ¿Qué hacemos con la rutina actual?
      </legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {[
          {
            valor: ModoAsignacionPlantilla.FUSIONAR,
            titulo: 'Añadir a la rutina actual',
            detalle: 'Agrega los días de la plantilla sin borrar los que ya tienen.',
          },
          {
            valor: ModoAsignacionPlantilla.REEMPLAZAR,
            titulo: 'Reemplazar la rutina actual',
            detalle: 'La rutina actual deja de estar activa; su historial se conserva.',
          },
        ].map((opcion) => (
          <label
            key={opcion.valor}
            className={`min-h-11 p-3 rounded-2xl border cursor-pointer transition-all ${
              modo === opcion.valor
                ? 'bg-primary/10 border-primary/50'
                : 'bg-card border-border/70 hover:border-primary/30'
            }`}
          >
            <input
              type="radio"
              name="modo-asignacion-masiva"
              value={opcion.valor}
              checked={modo === opcion.valor}
              onChange={() => onCambiarModo(opcion.valor)}
              disabled={deshabilitado}
              className="sr-only"
            />
            <span className="text-xs font-bold text-foreground block">{opcion.titulo}</span>
            <span className="text-xs text-muted-foreground block mt-1">{opcion.detalle}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

