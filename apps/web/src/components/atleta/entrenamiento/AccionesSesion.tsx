import type { UnidadPeso } from '../../../lib/weight-unit';

export interface AccionesSesionProps {
  unidadPeso: UnidadPeso;
  onCambiarUnidad: (unidad: UnidadPeso) => void;
}

/** Selector kg/lb (ÚNICO: solo esta vista). El cronómetro vive en su botón flotante (`RestTimer`). */
export function AccionesSesion({ unidadPeso, onCambiarUnidad }: AccionesSesionProps) {
  return (
    <>
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
