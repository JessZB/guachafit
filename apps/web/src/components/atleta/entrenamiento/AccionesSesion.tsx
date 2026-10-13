import { Timer } from 'lucide-react';
import type { UnidadPeso } from '../../../lib/weight-unit';

export interface AccionesSesionProps {
  cronometroAbierto: boolean;
  onAlternarCronometro: () => void;
  unidadPeso: UnidadPeso;
  onCambiarUnidad: (unidad: UnidadPeso) => void;
}

/** Cronómetro rápido + selector kg/lb (ÚNICO: solo esta vista). */
export function AccionesSesion({
  cronometroAbierto,
  onAlternarCronometro,
  unidadPeso,
  onCambiarUnidad,
}: AccionesSesionProps) {
  return (
    <>
      {/* Quick Rest Timer Trigger */}
      <button
        type="button"
        onClick={onAlternarCronometro}
        aria-label={cronometroAbierto ? 'Cerrar cronómetro de descanso' : 'Abrir cronómetro de descanso'}
        className="min-h-11 min-w-11 p-3 rounded-2xl bg-secondary/60 border border-border hover:border-primary/50 text-foreground transition-colors flex items-center gap-2 cursor-pointer"
        title="Cronómetro de descanso"
      >
        <Timer className="h-6 w-6 text-primary" />
        <span className="text-xs font-bold hidden sm:inline">Descanso</span>
      </button>

      {/* RN-01: preferencia de unidad de peso (kg/lb) persistida en el dispositivo */}
      <div
        role="group"
        aria-label="Unidad de peso"
        className="p-1 rounded-2xl bg-secondary/60 border border-border flex items-center gap-1"
      >
        {(['kg', 'lb'] as UnidadPeso[]).map((u) => (
          <button
            key={u}
            type="button"
            aria-pressed={unidadPeso === u}
            onClick={() => onCambiarUnidad(u)}
            title={`Mostrar y registrar pesos en ${u === 'kg' ? 'kilogramos' : 'libras'}`}
            className={`min-h-11 px-3.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer active:scale-95 ${
              unidadPeso === u
                ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/25'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {u}
          </button>
        ))}
      </div>
    </>
  );
}
