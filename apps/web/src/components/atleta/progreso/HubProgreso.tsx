/**
 * Vista 1 · Hub principal, selector de 2 caminos (SL3, fase B).
 *
 * De `ProgresoPage.tsx:538-672`: tarjeta de métricas + "Selecciona qué
 * deseas hacer" + opción de check-in + opción de historial. Copy y roles
 * idénticos (R5). Presentacional: props tipadas y callbacks, sin datos (R1).
 * §6: foco visible, 11–14px.
 */
import { TrendingUp } from 'lucide-react';
import type { EvolucionCorporalDTO } from '@guachafit/shared';
import { TarjetaResumenEvolucion } from './TarjetaResumenEvolucion';
import { OpcionCheckinProgreso } from './OpcionCheckinProgreso';
import { TarjetaOpcionHubProgreso } from './TarjetaOpcionHubProgreso';

interface HubProgresoProps {
  evolucion: EvolucionCorporalDTO | null;
  esSoloLectura: boolean;
  accesoPresencialServidor: string | null;
  permiteRegistrar: boolean;
  motivoBloqueo: string | null;
  onAbrirFormulario: () => void;
  onVerEvolucion: () => void;
}

export function HubProgreso({
  evolucion,
  esSoloLectura,
  accesoPresencialServidor,
  permiteRegistrar,
  motivoBloqueo,
  onAbrirFormulario,
  onVerEvolucion,
}: HubProgresoProps) {
  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      {/* Tarjeta de Métricas Netas */}
      {evolucion && <TarjetaResumenEvolucion evolucion={evolucion} />}

      {/* Selector de Acciones */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider px-1">
          Selecciona qué deseas hacer:
        </h2>

        {/* Opción A: Actualizar Medidas — solo lectura (presencial) o ventana cerrada */}
        <OpcionCheckinProgreso
          esSoloLectura={esSoloLectura}
          accesoPresencialServidor={accesoPresencialServidor}
          permiteRegistrar={permiteRegistrar}
          motivoBloqueo={motivoBloqueo}
          onAbrirFormulario={onAbrirFormulario}
          onVerHistorial={onVerEvolucion}
        />

        {/* Opción B: Ver Evolución e Historial */}
        <TarjetaOpcionHubProgreso
          onActivar={onVerEvolucion}
          icono={
            <div className="p-3.5 rounded-2xl bg-secondary text-foreground">
              <TrendingUp className="h-6 w-6" />
            </div>
          }
          titulo="Ver mi antes y después"
          descripcion="Consulta tu registro cronológico de mediciones corporales y evolución en el tiempo."
        />
      </div>
    </div>
  );
}
