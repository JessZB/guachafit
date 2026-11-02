/**
 * Opción "Actualizar mis medidas y fotos" del hub (SL3, fase B).
 *
 * De `ProgresoPage.tsx:585-641`: solo lectura → `PanelSoloLecturaProgreso`;
 * ventana abierta → tarjeta destacada (`role="button"`, h3 y copy idénticos,
 * exigidos por los 4 specs); ventana cerrada → tarjeta `aria-disabled` con
 * badge "Cerrada". Presentacional: props tipadas y callbacks, sin datos (R1).
 * §6: foco visible, 11px mínimo.
 */
import { CalendarX, Camera } from 'lucide-react';
import { PanelSoloLecturaProgreso } from './PanelSoloLecturaProgreso';
import { TarjetaOpcionHubProgreso } from './TarjetaOpcionHubProgreso';

interface OpcionCheckinProgresoProps {
  esSoloLectura: boolean;
  accesoPresencialServidor: string | null;
  permiteRegistrar: boolean;
  motivoBloqueo: string | null;
  onAbrirFormulario: () => void;
  onVerHistorial: () => void;
}

export function OpcionCheckinProgreso({
  esSoloLectura,
  accesoPresencialServidor,
  permiteRegistrar,
  motivoBloqueo,
  onAbrirFormulario,
  onVerHistorial,
}: OpcionCheckinProgresoProps) {
  if (esSoloLectura || accesoPresencialServidor) {
    return (
      <PanelSoloLecturaProgreso
        mensajeServidor={accesoPresencialServidor}
        onVerHistorial={onVerHistorial}
      />
    );
  }

  if (permiteRegistrar) {
    return (
      <TarjetaOpcionHubProgreso
        destacada
        onActivar={onAbrirFormulario}
        icono={
          <div className="p-3.5 rounded-2xl bg-info text-info-foreground shadow-md shadow-info/20">
            <Camera className="h-6 w-6" />
          </div>
        }
        titulo="Actualizar mis medidas y fotos"
        descripcion="Registra tu peso actual, perímetros de cintura o brazo y envía tu check-in al entrenador."
      />
    );
  }

  return (
    <div
      aria-disabled="true"
      className="p-5 rounded-3xl bg-card border border-border/60 opacity-80"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div className="p-3.5 rounded-2xl bg-secondary text-muted-foreground">
            <CalendarX className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground">
              Actualizar mis medidas y fotos
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-sm">
              {motivoBloqueo ??
                'Tu check-in está fuera de la ventana activa.'}
            </p>
          </div>
        </div>
        <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-warning/15 text-warning border border-warning/25 uppercase shrink-0">
          Cerrada
        </span>
      </div>
    </div>
  );
}
