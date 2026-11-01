/**
 * RF-018 · Ajustes del entrenador: resumen de la tasa guardada y aviso de «sin tasa».
 *
 * UX-19. Presentacional: el texto de la tasa llega ya formateado desde el contenedor
 * (`PestanaTasa`), que es quien usa `useFormatoNumero`.
 */
import { AlertTriangle } from 'lucide-react';

export interface ResumenTasaProps {
  /** Tasa guardada ya formateada (p. ej. `36,50`). */
  tasaTexto: string;
  /** Etiqueta de la fuente guardada; vacía si no se conoce. */
  fuenteEtiqueta: string;
}

/** Lo que está guardado y se usa hoy en los cobros. */
export function ResumenTasa({ tasaTexto, fuenteEtiqueta }: ResumenTasaProps) {
  return (
    <div
      role="group"
      aria-label="Tasa guardada"
      className="p-4 rounded-2xl bg-secondary/40 border border-border space-y-1"
    >
      <p className="text-xs font-semibold text-muted-foreground">Tasa activa</p>
      <p className="text-foreground">
        <span className="text-2xl font-bold">{tasaTexto}</span>{' '}
        <span className="text-sm font-semibold">Bs por dólar</span>
      </p>
      {fuenteEtiqueta && (
        <p className="text-xs text-muted-foreground">Fuente: {fuenteEtiqueta}</p>
      )}
    </div>
  );
}

/** CFG-17: aún no hay tasa guardada; los cobros en bolívares no pueden calcularse. */
export function AvisoSinTasa() {
  return (
    <div className="p-4 rounded-2xl bg-warning/10 border border-warning/30 flex items-start gap-3">
      <AlertTriangle aria-hidden="true" className="h-5 w-5 shrink-0 text-warning" />
      <div className="space-y-0.5">
        <p className="text-sm font-bold text-warning">Sin tasa configurada</p>
        <p className="text-xs text-warning">
          Los cobros en bolívares quedan en pausa hasta que guardes una tasa.
        </p>
      </div>
    </div>
  );
}
