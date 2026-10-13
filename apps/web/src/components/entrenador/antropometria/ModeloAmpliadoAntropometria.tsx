/**
 * Bloque del modelo ampliado RN-02 (brazos, muslo medio y pliegues) de un control pendiente.
 *
 * Recorte verbatim: solo se pinta cuando el control trae perimetros ampliados o pliegues.
 * Componente presentacional: recibe el control y no pide datos.
 */
import type { ControlAntropometricoDetalleDTO } from "@guachafit/shared";

interface ModeloAmpliadoAntropometriaProps {
  control: ControlAntropometricoDetalleDTO;
}

export function ModeloAmpliadoAntropometria({
  control,
}: ModeloAmpliadoAntropometriaProps) {
  if (!(
    control.perimetros?.brazoRelajadoCm ||
    control.perimetros?.brazoContraidoCm ||
    control.perimetros?.musloMedioCm ||
    control.pliegues
  )) {
    return null;
  }

  return (
    <div className="p-3.5 rounded-2xl bg-secondary/20 border border-border/60 space-y-2">
      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        Modelo ampliado (RN-02)
      </span>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Brazo relajado</span>
          <span className="font-mono font-bold text-foreground">
            {(control.perimetros?.brazoRelajadoCm ??
            control.perimetros?.brazoCm)
              ? `${control.perimetros?.brazoRelajadoCm ?? control.perimetros?.brazoCm} cm`
              : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Brazo contraído</span>
          <span className="font-mono font-bold text-foreground">
            {control.perimetros?.brazoContraidoCm
              ? `${control.perimetros.brazoContraidoCm} cm`
              : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Muslo medio</span>
          <span className="font-mono font-bold text-foreground">
            {(control.perimetros?.musloMedioCm ?? control.perimetros?.musloCm)
              ? `${control.perimetros?.musloMedioCm ?? control.perimetros?.musloCm} cm`
              : "—"}
          </span>
        </div>
        {control.pliegues && (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Pliegue tríceps</span>
              <span className="font-mono font-bold text-foreground">
                {control.pliegues.tricepsMm
                  ? `${control.pliegues.tricepsMm} mm`
                  : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">
                Pliegue subescapular
              </span>
              <span className="font-mono font-bold text-foreground">
                {control.pliegues.subescapularMm
                  ? `${control.pliegues.subescapularMm} mm`
                  : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Pliegue suprailíaco</span>
              <span className="font-mono font-bold text-foreground">
                {control.pliegues.suprailiacoMm
                  ? `${control.pliegues.suprailiacoMm} mm`
                  : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Pliegue abdominal</span>
              <span className="font-mono font-bold text-foreground">
                {control.pliegues.abdominalMm
                  ? `${control.pliegues.abdominalMm} mm`
                  : "—"}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
