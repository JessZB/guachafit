/**
 * RF-018 · Ajustes del entrenador: calculadora USD ↔ VES con la tasa guardada (UX-19).
 *
 * Presentacional: los montos entran por props y el cálculo vive en `useTasasCambio`. Va plegada
 * (cerrada por defecto) y solo se monta cuando hay una tasa guardada.
 */
import { CampoAjustes } from '../../ajustes/CampoAjustes';

export interface ConversorTasasProps {
  /** Tasa guardada ya formateada (p. ej. `36,50`), para la nota de redondeo. */
  tasaTexto: string;
  calculadoraUsd: string;
  calculadoraVes: string;
  onCambiarUsd: (valor: string) => void;
  onCambiarVes: (valor: string) => void;
}

export function ConversorTasas({
  tasaTexto,
  calculadoraUsd,
  calculadoraVes,
  onCambiarUsd,
  onCambiarVes,
}: ConversorTasasProps) {
  return (
    <details className="rounded-2xl border border-border bg-secondary/20">
      <summary className="min-h-11 cursor-pointer flex items-center px-4 py-2 rounded-2xl font-bold text-sm text-foreground focus-visible:outline-2 focus-visible:outline-primary">
        Calculadora
      </summary>
      <div className="px-4 pb-4 pt-2 space-y-4">
        <CampoAjustes
          id="calculadora-usd"
          etiqueta="Monto en USD"
          valor={calculadoraUsd}
          onCambiar={onCambiarUsd}
          autoComplete="off"
          inputMode="decimal"
          sufijo="USD"
        />
        <CampoAjustes
          id="calculadora-ves"
          etiqueta="Monto en bolívares"
          valor={calculadoraVes}
          onCambiar={onCambiarVes}
          autoComplete="off"
          inputMode="decimal"
          sufijo="Bs"
        />
        <p className="text-xs text-muted-foreground">
          Se redondea al céntimo con la tasa guardada de {tasaTexto} Bs por dólar.
        </p>
      </div>
    </details>
  );
}
