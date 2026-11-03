/**
 * Vista 3 · Historial de medidas (SL4, fase B).
 *
 * De `ProgresoPage.tsx:1050-1174`: título + lista de
 * `TarjetaEvaluacionAntropometrica` o vacío honesto "No hay evaluaciones
 * registradas aún." (se conserva el `<p>` original: la guía 48 §6 M5 solo
 * adopta `ui/EstadoVacio` en el vacío de fotos). Textos idénticos (R5).
 * Presentacional: props tipadas y callbacks, sin datos (R1). §6: 11–14px.
 */
import type {
  ControlAntropometricoDetalleDTO,
  FotoAntropometriaDetalleDTO,
} from '@guachafit/shared';
import { TarjetaEvaluacionAntropometrica } from './TarjetaEvaluacionAntropometrica';

interface HistorialEvaluacionesProgresoProps {
  evaluaciones: ControlAntropometricoDetalleDTO[];
  fotosConError: string[];
  onFotoError: (fotoId: string) => void;
  onVerFoto: (foto: FotoAntropometriaDetalleDTO, fecha: string) => void;
}

export function HistorialEvaluacionesProgreso({
  evaluaciones,
  fotosConError,
  onFotoError,
  onVerFoto,
}: HistorialEvaluacionesProgresoProps) {
  return (
    <div className="space-y-3">
      <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground px-1">
        Historial de medidas
      </h3>

      {evaluaciones.length > 0 ? (
        evaluaciones.map((item) => (
          <TarjetaEvaluacionAntropometrica
            key={item.id}
            item={item}
            fotosConError={fotosConError}
            onFotoError={onFotoError}
            onVerFoto={onVerFoto}
          />
        ))
      ) : (
        <p className="text-xs text-muted-foreground py-6 text-center">
          No hay evaluaciones registradas aún.
        </p>
      )}
    </div>
  );
}
