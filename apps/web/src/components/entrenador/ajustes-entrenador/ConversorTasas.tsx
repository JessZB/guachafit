/**
 * RF-018 · Ajustes del entrenador: conversor inmediato USD ↔ VES (ADR-003).
 *
 * Extraído de `pages/entrenador/AjustesPage.tsx:832-902`.
 * Presentacional: montos y tasa entran por props; el cálculo vive en `useTasasCambio`.
 * Sin otra copia en el front (verificación del inventario §4).
 */
import { ArrowRightLeft, Calculator } from 'lucide-react';

export interface ConversorTasasProps {
  tasaActivaInput: string;
  calculadoraUsd: string;
  calculadoraVes: string;
  onCambiarUsd: (valor: string) => void;
  onCambiarVes: (valor: string) => void;
}

export function ConversorTasas({
  tasaActivaInput,
  calculadoraUsd,
  calculadoraVes,
  onCambiarUsd,
  onCambiarVes,
}: ConversorTasasProps) {
  return (
    <div className="p-6 rounded-3xl bg-card border border-border shadow-xs space-y-4">
      <div className="flex items-center gap-2 border-b border-border/80 pb-3">
        <Calculator className="h-4 w-4 text-primary" />
        <h3 className="font-bold text-sm text-foreground">
          Conversor Inmediato USD ↔ VES
        </h3>
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground">Monto en USD</label>
          <div className="relative">
            <input
              type="number"
              step="0.01"
              min="0"
              value={calculadoraUsd}
              onChange={(e) => onCambiarUsd(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary pr-12"
            />
            <span className="absolute right-3 top-2.5 text-xs font-bold text-muted-foreground font-mono">
              USD
            </span>
          </div>
        </div>

        <div className="flex justify-center text-muted-foreground">
          <ArrowRightLeft className="h-4 w-4 opacity-50" />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground">Monto Equivalente en VES</label>
          <div className="relative">
            <input
              type="number"
              step="0.01"
              min="0"
              value={calculadoraVes}
              onChange={(e) => onCambiarVes(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary pr-12"
            />
            <span className="absolute right-3 top-2.5 text-xs font-bold text-muted-foreground font-mono">
              Bs
            </span>
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-secondary/40 border border-border/60 text-[11px] text-muted-foreground">
          {parseFloat(tasaActivaInput) > 0 ? (
            <p>
              Calculado con redondeo bancario exacto (ADR-003) a la tasa de{' '}
              <strong className="text-foreground font-mono">{tasaActivaInput} Bs/USD</strong>.
            </p>
          ) : (
            <p>
              Sin tasa configurada no hay conversión: define y guarda tu tasa activa para
              calcular equivalentes en bolívares.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
