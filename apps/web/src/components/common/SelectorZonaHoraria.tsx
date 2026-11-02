import { nombreZonaHoraria, textoHoraActualEnZona } from '../../lib/zona-horaria';

/**
 * Selector de la zona horaria del perfil (RF-002 RN-02 / ADR-019). Presentacional: el estado y el
 * guardado viven en quien lo usa. Cada opción muestra un nombre comprensible ("Hora de Caracas")
 * y guarda el identificador IANA.
 */
export function SelectorZonaHoraria({
  id,
  valor,
  opciones,
  onCambiar,
  onGuardar,
  guardando = false,
  error = null,
  exito = null,
  etiqueta = 'Zona horaria',
}: {
  id: string;
  valor: string;
  opciones: string[];
  onCambiar: (zona: string) => void;
  onGuardar: () => void;
  guardando?: boolean;
  error?: string | null;
  exito?: string | null;
  etiqueta?: string;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-xs font-semibold text-muted-foreground">{etiqueta}</label>
      <div className="flex flex-col sm:flex-row gap-2">
        <select
          id={id}
          value={valor}
          onChange={(e) => onCambiar(e.target.value)}
          disabled={guardando}
          className="flex-1 min-h-11 px-3 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
        >
          {opciones.map((zona) => (
            <option key={zona} value={zona}>
              {nombreZonaHoraria(zona)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onGuardar}
          disabled={guardando}
          aria-busy={guardando}
          className={`min-h-11 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-bold ${
            guardando ? 'opacity-60 cursor-wait' : 'hover:bg-primary/90'
          }`}
        >
          Guardar zona horaria
        </button>
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        {textoHoraActualEnZona(valor)}
      </p>
      {error && (
        <p
          role="alert"
          className="text-xs font-semibold text-destructive bg-destructive/10 border border-destructive/25 rounded-2xl px-3 py-2"
        >
          {error}
        </p>
      )}
      {exito && (
        <p
          role="status"
          className="text-xs font-semibold text-success bg-success/10 border border-success/25 rounded-2xl px-3 py-2"
        >
          {exito}
        </p>
      )}
    </div>
  );
}
