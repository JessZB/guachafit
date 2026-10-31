/**
 * RF-018 · Ajustes del entrenador: tarjeta de un plan comercial del catálogo.
 *
 * Extraído de `pages/entrenador/AjustesPage.tsx:525-604`.
 * Presentacional: el plan entra por props; editar y activar/desactivar son callbacks.
 * UX-18: el precio es el total de la duración (decisión D7); desactivar pide confirmación
 * inline (como Plantillas) y reactivar es directo.
 * ÚNICO con duda R3.3 (CANDIDATO): la entidad plan también se muestra en
 * `AlumnoDetallePage.tsx:2754-2769` con otra representación (resumen inline, no tarjeta).
 */
import { useState } from 'react';
import { CheckCircle, Loader2, Pencil, Power } from 'lucide-react';
import type { PlanMembresiaDetalleDTO } from '@guachafit/shared';
import { pluralizar } from '../../../lib/pluralizar';
import { useFormatoNumero } from '../../../lib/use-formato-numero';
import { BadgeEstado } from '../../ui/BadgeEstado';
import { BotonTactil } from '../../ui/BotonTactil';

export interface TarjetaPlanComercialProps {
  plan: PlanMembresiaDetalleDTO;
  onEditar: (plan: PlanMembresiaDetalleDTO) => void;
  onToggleActivo: (plan: PlanMembresiaDetalleDTO) => void;
  /** Hay un cambio de activación en curso para este plan: los botones se bloquean. */
  procesando?: boolean;
}

export function TarjetaPlanComercial({
  plan,
  onEditar,
  onToggleActivo,
  procesando = false,
}: TarjetaPlanComercialProps) {
  const { formatMonto } = useFormatoNumero();
  const [confirmandoDesactivar, setConfirmandoDesactivar] = useState(false);
  const [activoPrevio, setActivoPrevio] = useState(plan.activo);

  // Cuando la API confirma el cambio de estado, la confirmación pendiente se cierra.
  if (activoPrevio !== plan.activo) {
    setActivoPrevio(plan.activo);
    setConfirmandoDesactivar(false);
  }

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
          <BadgeEstado tono={plan.activo ? 'success' : 'neutral'}>
            {plan.activo ? 'Activo' : 'Inactivo'}
          </BadgeEstado>
          <span className="text-xs font-semibold text-muted-foreground">
            {pluralizar(plan.duracionMeses, 'mes', 'meses')}
          </span>
        </div>

        <h3 className="text-lg font-bold text-foreground break-words">{plan.nombre}</h3>
        <div className="flex flex-wrap items-baseline gap-x-2 mt-1 mb-2">
          <span className="text-2xl font-bold font-mono text-primary">
            {formatMonto(plan.precioBaseUsd, 'USD')}
          </span>
          <span className="text-xs text-muted-foreground">
            {plan.duracionMeses === 1 ? 'al mes' : `cada ${plan.duracionMeses} meses`}
          </span>
        </div>

        {plan.descripcion && (
          <p className="text-xs text-muted-foreground mb-4 line-clamp-2 leading-relaxed">
            {plan.descripcion}
          </p>
        )}

        {/* Checklist de Beneficios */}
        <div className="space-y-1.5 pt-2 border-t border-border/60">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
            Incluye
          </span>
          {Array.isArray(plan.beneficios) &&
            plan.beneficios.map((b) => (
              <div key={b} className="flex items-center gap-1.5 text-xs text-foreground">
                <CheckCircle className="h-3.5 w-3.5 text-success shrink-0" aria-hidden="true" />
                <span className="line-clamp-1">{b}</span>
              </div>
            ))}
        </div>
      </div>

      {/* Acciones de Tarjeta */}
      <div className="mt-5 pt-3 border-t border-border/60">
        {confirmandoDesactivar && plan.activo ? (
          <div
            role="group"
            aria-label={`Confirmar desactivación de ${plan.nombre}`}
            className="space-y-3"
          >
            <p className="text-xs text-foreground">
              No podrás asignarlo a alumnos nuevos. Quienes ya lo tienen siguen con sus cuotas.
            </p>
            <div className="flex flex-wrap gap-2">
              <BotonTactil
                variante="peligro"
                disabled={procesando}
                onClick={() => onToggleActivo(plan)}
              >
                {procesando && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                Sí, desactivar
              </BotonTactil>
              <BotonTactil
                variante="secundaria"
                disabled={procesando}
                onClick={() => setConfirmandoDesactivar(false)}
              >
                Cancelar
              </BotonTactil>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <BotonTactil
              variante="secundaria"
              etiquetaAccesible={`Editar ${plan.nombre}`}
              onClick={() => onEditar(plan)}
            >
              <Pencil className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              Editar
            </BotonTactil>

            {plan.activo ? (
              <BotonTactil
                variante="peligro-contorno"
                disabled={procesando}
                onClick={() => setConfirmandoDesactivar(true)}
              >
                <Power className="h-3.5 w-3.5" aria-hidden="true" />
                Desactivar
              </BotonTactil>
            ) : (
              <BotonTactil
                variante="primaria"
                disabled={procesando}
                onClick={() => onToggleActivo(plan)}
              >
                <Power className="h-3.5 w-3.5" aria-hidden="true" />
                Reactivar
              </BotonTactil>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
