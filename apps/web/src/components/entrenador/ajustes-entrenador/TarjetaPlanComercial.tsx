/**
 * RF-018 · Ajustes del entrenador: tarjeta de un plan comercial del catálogo.
 *
 * Extraído de `pages/entrenador/AjustesPage.tsx:525-604`.
 * Presentacional: el plan entra por props; editar y activar/desactivar son callbacks.
 * ÚNICO con duda R3.3 (CANDIDATO): la entidad plan también se muestra en
 * `AlumnoDetallePage.tsx:2754-2769` con otra representación (resumen inline, no tarjeta).
 */
import { CheckCircle, Pencil, Power } from 'lucide-react';
import type { PlanMembresiaDetalleDTO } from '@guachafit/shared';
import { pluralizar } from '../../../lib/pluralizar';

export interface TarjetaPlanComercialProps {
  plan: PlanMembresiaDetalleDTO;
  onEditar: (plan: PlanMembresiaDetalleDTO) => void;
  onToggleActivo: (plan: PlanMembresiaDetalleDTO) => void;
}

export function TarjetaPlanComercial({ plan, onEditar, onToggleActivo }: TarjetaPlanComercialProps) {
  return (
    <div
      className={`p-5 rounded-3xl bg-card border transition-all flex flex-col justify-between ${
        plan.activo
          ? 'border-border hover:border-primary/40 shadow-xs'
          : 'border-dashed border-border/70 opacity-65 bg-secondary/15'
      }`}
    >
      <div>
        <div className="flex items-start justify-between gap-2 mb-3">
          <span
            className={`text-[11px] font-bold font-mono px-2 py-0.5 rounded-full uppercase ${
              plan.activo
                ? 'bg-success/15 text-success border border-success/30'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {plan.activo ? 'Activo en Catálogo' : 'Inactivo'}
          </span>
          <span className="text-xs font-semibold text-muted-foreground">
            {pluralizar(plan.duracionMeses, 'Mes', 'Meses')}
          </span>
        </div>

        <h3 className="text-lg font-bold text-foreground">{plan.nombre}</h3>
        <div className="flex items-baseline gap-1 mt-1 mb-2">
          <span className="text-2xl font-bold font-mono text-primary">
            ${plan.precioBaseUsd}
          </span>
          <span className="text-xs text-muted-foreground">USD / mes</span>
        </div>

        {plan.descripcion && (
          <p className="text-xs text-muted-foreground mb-4 line-clamp-2 leading-relaxed">
            {plan.descripcion}
          </p>
        )}

        {/* Checklist de Beneficios */}
        <div className="space-y-1.5 pt-2 border-t border-border/60">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
            Beneficios incluidos:
          </span>
          {Array.isArray(plan.beneficios) &&
            plan.beneficios.map((b, idx) => (
              <div key={idx} className="flex items-center gap-1.5 text-xs text-foreground">
                <CheckCircle className="h-3.5 w-3.5 text-success shrink-0" />
                <span className="line-clamp-1">{b}</span>
              </div>
            ))}
        </div>
      </div>

      {/* Acciones de Tarjeta */}
      <div className="mt-5 pt-3 border-t border-border/60 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onEditar(plan)}
          className="px-3 py-1.5 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <Pencil className="h-3.5 w-3.5 text-primary" />
          <span>Editar Plan</span>
        </button>

        <button
          type="button"
          onClick={() => onToggleActivo(plan)}
          className={`px-3 py-1.5 rounded-xl font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer ${
            plan.activo
              ? 'bg-destructive/10 text-destructive hover:bg-destructive/20'
              : 'bg-success/10 text-success hover:bg-success/20'
          }`}
        >
          <Power className="h-3.5 w-3.5" />
          <span>{plan.activo ? 'Desactivar' : 'Reactivar'}</span>
        </button>
      </div>
    </div>
  );
}
