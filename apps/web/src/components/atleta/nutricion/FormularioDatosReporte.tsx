/**
 * Módulo 6 · Nutrición: datos opcionales del reporte (ÚNICO de vista).
 *
 * Extraído de `pages/atleta/NutricionPage.tsx` (SL2, fase B). Los ids `nutricion-*` están
 * fijados por el spec (§6.1) y no cambian. §6: controles `min-h-11`, contador de notas 280.
 */
import { Droplets } from 'lucide-react';

export interface FormularioDatosReporteProps {
  aguaLitros: string;
  calorias: string;
  proteina: string;
  notas: string;
  deshabilitado: boolean;
  onCambiarAgua: (valor: string) => void;
  onCambiarCalorias: (valor: string) => void;
  onCambiarProteina: (valor: string) => void;
  onCambiarNotas: (valor: string) => void;
}

export function FormularioDatosReporte({
  aguaLitros,
  calorias,
  proteina,
  notas,
  deshabilitado,
  onCambiarAgua,
  onCambiarCalorias,
  onCambiarProteina,
  onCambiarNotas,
}: FormularioDatosReporteProps) {
  return (
    <div className="p-5 sm:p-6 rounded-3xl bg-card border border-border shadow-xs space-y-4">
      <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
        <Droplets className="h-4 w-4 text-primary" />
        <span>Agua, calorías y proteína (opcional)</span>
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1">
          <label htmlFor="nutricion-agua" className="text-xs font-semibold text-muted-foreground">
            Agua (Litros)
          </label>
          <input
            id="nutricion-agua"
            type="text"
            inputMode="decimal"
            disabled={deshabilitado}
            value={aguaLitros}
            onChange={(e) => onCambiarAgua(e.target.value)}
            placeholder="2.50"
            className="w-full min-h-11 px-3 py-2 rounded-xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary disabled:opacity-60"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="nutricion-calorias" className="text-xs font-semibold text-muted-foreground">
            Calorías (kcal)
          </label>
          <input
            id="nutricion-calorias"
            type="text"
            inputMode="numeric"
            disabled={deshabilitado}
            value={calorias}
            onChange={(e) => onCambiarCalorias(e.target.value)}
            placeholder="2200"
            className="w-full min-h-11 px-3 py-2 rounded-xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary disabled:opacity-60"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="nutricion-proteina" className="text-xs font-semibold text-muted-foreground">
            Proteína (g)
          </label>
          <input
            id="nutricion-proteina"
            type="text"
            inputMode="numeric"
            disabled={deshabilitado}
            value={proteina}
            onChange={(e) => onCambiarProteina(e.target.value)}
            placeholder="160"
            className="w-full min-h-11 px-3 py-2 rounded-xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary disabled:opacity-60"
          />
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between items-center">
          <label htmlFor="nutricion-notas" className="text-xs font-semibold text-muted-foreground">
            Notas breves
          </label>
          <span className="text-xs text-muted-foreground">{notas.length}/280</span>
        </div>
        <textarea
          id="nutricion-notas"
          rows={2}
          maxLength={280}
          disabled={deshabilitado}
          value={notas}
          onChange={(e) => onCambiarNotas(e.target.value)}
          placeholder="Ej: Mucha energía hoy, cena fuera de casa pero cuidé proteína."
          className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary resize-none disabled:opacity-60"
        />
      </div>
    </div>
  );
}
