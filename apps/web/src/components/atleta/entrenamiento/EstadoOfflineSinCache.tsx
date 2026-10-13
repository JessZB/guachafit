import { RefreshCw, WifiOff } from 'lucide-react';
import { textoUltimoEntrenamientoGuardado } from '../../../lib/entrenamiento-textos';

export interface EstadoOfflineSinCacheProps {
  ultimoGuardadoOtroDia: string | null;
  onReintentar: () => void;
}

/**
 * Offline sin cache: estado vacío honesto (nunca datos demo).
 * CANDIDATO (R3 duda): patrón `EstadoVacio` + reintento; par más cercano
 * `PagosPage.tsx:589-598` con copy distinto. Se promueve en fase D.
 */
export function EstadoOfflineSinCache({
  ultimoGuardadoOtroDia,
  onReintentar,
}: EstadoOfflineSinCacheProps) {
  return (
    <div className="p-6 sm:p-8 rounded-3xl bg-card border border-border/80 shadow-md text-center space-y-4">
      <div className="h-16 w-16 rounded-3xl bg-secondary text-muted-foreground flex items-center justify-center mx-auto">
        <WifiOff className="h-8 w-8" />
      </div>
      <div className="max-w-md mx-auto space-y-1.5">
        <h3 className="text-xl font-bold text-foreground">Sin conexión</h3>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
          {/* D3: lo guardado de otro día se informa, nunca se presenta como el de hoy */}
          {ultimoGuardadoOtroDia
            ? `No hay un entrenamiento de hoy guardado en este teléfono. ${textoUltimoEntrenamientoGuardado(
                ultimoGuardadoOtroDia
              )}. Cuando vuelvas a tener internet podrás cargar el de hoy.`
            : 'No hay datos de entrenamiento guardados en este teléfono. Cuando vuelvas a tener internet podrás cargar tu rutina.'}
        </p>
      </div>
      <button
        type="button"
        onClick={onReintentar}
        className="mx-auto min-h-11 py-2.5 px-5 rounded-xl bg-secondary text-foreground border border-border font-bold text-xs hover:bg-secondary/80 active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
      >
        <RefreshCw className="h-4 w-4" />
        <span>Reintentar</span>
      </button>
    </div>
  );
}
