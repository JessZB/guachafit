/**
 * Tarjeta "Resumen de Evolución" del hub (SL3, fase B).
 *
 * De `ProgresoPage.tsx:543-577`: 3 tiles (cambio de peso, grasa, evaluaciones).
 * Copy idéntico, incluido `{totalEvaluaciones} aprobadas` (el WARNING del
 * inventario 44 sobre `pluralizar` es cambio de copy: no se toca en B por R5).
 * Presentacional: props tipadas, sin datos (R1). §6: 11px mínimo, mono en datos.
 */
import type { EvolucionCorporalDTO } from '@guachafit/shared';

interface TarjetaResumenEvolucionProps {
  evolucion: EvolucionCorporalDTO;
}

export function TarjetaResumenEvolucion({ evolucion }: TarjetaResumenEvolucionProps) {
  return (
    <div className="p-6 rounded-3xl bg-card border border-border/80 shadow-md space-y-3">
      <span className="text-xs font-bold text-primary uppercase tracking-wider block">
        Resumen de Evolución
      </span>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
        <div className="p-3.5 rounded-2xl bg-secondary/40 border border-border">
          <span className="text-[11px] font-semibold uppercase text-muted-foreground">
            Cambio de Peso
          </span>
          <p className="text-xl font-bold font-mono text-success mt-0.5">
            {evolucion.cambioNetoPesoKg} kg
          </p>
        </div>
        <div className="p-3.5 rounded-2xl bg-secondary/40 border border-border">
          <span className="text-[11px] font-semibold uppercase text-muted-foreground">
            Grasa Corporal
          </span>
          <p className="text-xl font-bold font-mono text-success mt-0.5">
            {evolucion.cambioNetoGrasaPorcentaje}%
          </p>
        </div>
        <div className="p-3.5 rounded-2xl bg-secondary/40 border border-border col-span-2 sm:col-span-1">
          <span className="text-[11px] font-semibold uppercase text-muted-foreground">
            Evaluaciones
          </span>
          <p className="text-xl font-bold font-mono text-foreground mt-0.5">
            {evolucion.totalEvaluaciones} aprobadas
          </p>
        </div>
      </div>
    </div>
  );
}
