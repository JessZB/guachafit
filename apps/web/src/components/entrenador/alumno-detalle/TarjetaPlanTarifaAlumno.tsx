/**
 * Tarjeta de plan comercial y tarifa acordada del alumno (RF-005, organismo ÚNICO candidato).
 *
 * Presentacional: recibe el estado del plan y callbacks, sin `api-client` ni `useQuery` (R1).
 * Extraída de `pages/entrenador/AlumnoDetallePage.tsx` (SL-3). No se halló equivalente en
 * otra vista. Conserva idénticos los textos que consultan los specs (`Precio Acordado ($ USD)`,
 * `Sin plan asignado`, `Fecha de inicio`, `Quitar plan`, `Próxima cuota: vence el…`).
 *
 * §6: 11px mínimo, pesos ≤ 700, tokens con variante oscura, estados honestos (`role="alert"`).
 */
import type React from 'react';
import type {
  OverridePlanDetalleDTO,
  PlanMembresiaDetalleDTO,
  SuscripcionAlumnoDTO,
} from '@guachafit/shared';
import { AlertCircle, CreditCard, Trash2 } from 'lucide-react';
import { textoPrecioVigente } from '../../../lib/plan-tarifa';
import {
  rangoFechaInicioSuscripcion,
  textoProximaCuota,
} from '../../../lib/suscripcion-alumno';

export interface PlanTarjetaAlumno {
  suscripcion: SuscripcionAlumnoDTO | null;
  suscripcionError: string | null;
  overrideError: string | null;
  overridesAlumno: OverridePlanDetalleDTO[];
  selectedPlanId: string;
  precioOverride: string;
  tasaFijadaOverride: string;
  fechaInicioPlan: string;
  hoyDelAlumno: (zona: string | null | undefined) => string;
  setSelectedPlanId: (valor: string) => void;
  setPrecioOverride: (valor: string) => void;
  setTasaFijadaOverride: (valor: string) => void;
  setFechaInicioPlan: (valor: string) => void;
}

export interface TarjetaPlanTarifaAlumnoProps {
  plan: PlanTarjetaAlumno;
  planesCatalogo: PlanMembresiaDetalleDTO[];
  /** Zona del alumno para el "hoy" con el que la API valida la fecha de inicio. */
  zonaHoraria: string | null | undefined;
  onQuitarPlan: () => void;
  onQuitarOverride: () => void;
  refSelectorPlan: React.RefObject<HTMLSelectElement | null>;
}

export function TarjetaPlanTarifaAlumno({
  plan,
  planesCatalogo,
  zonaHoraria,
  onQuitarPlan,
  onQuitarOverride,
  refSelectorPlan,
}: TarjetaPlanTarifaAlumnoProps) {
  const {
    suscripcion,
    suscripcionError,
    overrideError,
    overridesAlumno,
    selectedPlanId,
    precioOverride,
    tasaFijadaOverride,
    fechaInicioPlan,
    setSelectedPlanId,
    setPrecioOverride,
    setTasaFijadaOverride,
    setFechaInicioPlan,
  } = plan;
  const hoyLocal = plan.hoyDelAlumno(zonaHoraria);
  /** WU-J (RF-005): override vigente (el más reciente) y plan elegido del catálogo. */
  const overrideVigente = overridesAlumno.length > 0 ? overridesAlumno[0] : null;
  const planSeleccionado = planesCatalogo.find((plan) => plan.id === selectedPlanId) ?? null;

  return (
    <div className="p-6 rounded-3xl bg-card border border-border shadow-xs space-y-4">
      <div className="flex items-center justify-between border-b border-border/80 pb-3">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-primary" />
          <h3 className="font-bold text-sm text-foreground">Plan Comercial & Tarifa (RF-005)</h3>
        </div>
        {/* M5-L1B: el badge dice la verdad sobre el plan (suscripción) o que no hay dato. */}
        {suscripcionError ? (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-secondary text-muted-foreground uppercase">
            Sin dato
          </span>
        ) : suscripcion ? (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary uppercase">
            Plan asignado
          </span>
        ) : (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-secondary text-muted-foreground uppercase">
            Sin plan asignado
          </span>
        )}
      </div>

      {suscripcionError && (
        <p
          role="alert"
          className="text-[11px] font-bold text-destructive flex items-start gap-1.5"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          {suscripcionError}
        </p>
      )}

      {overrideError && (
        <p
          role="alert"
          className="text-[11px] font-bold text-destructive flex items-start gap-1.5"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          {overrideError}
        </p>
      )}

      {overrideVigente && (
        <div className="rounded-2xl border border-primary/25 bg-primary/5 p-3 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-foreground">
              {textoPrecioVigente(
                overrideVigente,
                planesCatalogo.find((p) => p.id === overrideVigente.planId) ??
                  planSeleccionado
              )}
            </span>
            <button
              type="button"
              onClick={onQuitarOverride}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-destructive hover:underline cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
              title="Quitar el override y volver a los valores del catálogo"
            >
              <Trash2 className="h-3 w-3" />
              Quitar override
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {overrideVigente.planNombre ??
              planSeleccionado?.nombre ??
              'Plan del catálogo'}
            {' · '}
            {overrideVigente.tasaFijadaOverride
              ? `Tasa especial ${overrideVigente.tasaFijadaOverride} Bs/USD`
              : 'Tasa global del entrenador'}
          </p>
          {overrideVigente.motivoOverride && (
            <p className="text-[11px] text-muted-foreground italic">
              Motivo: {overrideVigente.motivoOverride}
            </p>
          )}
        </div>
      )}

      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground">Plan Asignado del Catálogo</label>
          <select
            ref={refSelectorPlan}
            value={selectedPlanId}
            disabled={Boolean(suscripcionError)}
            onChange={(e) => {
              const nuevoPlanId = e.target.value;
              setSelectedPlanId(nuevoPlanId);
              // Al cambiar de plan se limpia el precio: vacío = hereda el del plan.
              // Si ya existe un override para el plan elegido, se precarga su valor real.
              const overrideDelPlan = overridesAlumno.find(
                (o) => o.planId === nuevoPlanId
              );
              setPrecioOverride(overrideDelPlan?.precioAcordadoUsd ?? '');
              if (overrideDelPlan?.tasaFijadaOverride) {
                setTasaFijadaOverride(overrideDelPlan.tasaFijadaOverride);
              }
            }}
            className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary disabled:opacity-60"
          >
            {/* Con plan vigente no hay opción vacía: quitarlo es "Quitar plan". */}
            {!suscripcion && <option value="">Elige un plan…</option>}
            {planesCatalogo.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} (${p.precioBaseUsd} USD)
              </option>
            ))}
          </select>
          {planSeleccionado && (
            <div className="rounded-xl bg-secondary/50 border border-border/60 px-3 py-2 space-y-1">
              <p className="text-[11px] text-muted-foreground">
                Precio base:{' '}
                <span className="font-mono font-bold text-foreground">
                  ${planSeleccionado.precioBaseUsd} USD
                </span>
                {' · '}
                {planSeleccionado.duracionMeses}{' '}
                {planSeleccionado.duracionMeses === 1 ? 'mes' : 'meses'}
              </p>
              {planSeleccionado.beneficios.length > 0 && (
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Incluye: {planSeleccionado.beneficios.join(' · ')}
                </p>
              )}
            </div>
          )}
        </div>

        {/* M5-L1B (ADR-020): la suscripción genera las cuotas. Primer plan → fecha de
            inicio (hoy por defecto); con plan vigente → próxima cuota y "Quitar plan". */}
        {suscripcion ? (
          <div className="rounded-xl border border-border/60 bg-secondary/30 px-3 py-2 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-bold text-foreground">
                {textoProximaCuota(suscripcion)}
              </p>
              <button
                type="button"
                onClick={onQuitarPlan}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-destructive hover:underline cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
              >
                <Trash2 className="h-3 w-3" />
                Quitar plan
              </button>
            </div>
            {selectedPlanId && selectedPlanId !== suscripcion.planId && (
              <p className="text-[11px] text-muted-foreground">
                El plan nuevo se cobra desde la próxima cuota; el día de vencimiento no
                cambia.
              </p>
            )}
          </div>
        ) : (
          !suscripcionError &&
          selectedPlanId && (
            <div className="space-y-1">
              <label
                htmlFor="ficha-plan-fecha-inicio"
                className="text-xs font-semibold text-muted-foreground"
              >
                Fecha de inicio
              </label>
              <input
                id="ficha-plan-fecha-inicio"
                type="date"
                value={fechaInicioPlan}
                min={rangoFechaInicioSuscripcion(hoyLocal).minimo}
                max={rangoFechaInicioSuscripcion(hoyLocal).maximo}
                onChange={(e) => setFechaInicioPlan(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
              />
              <p className="text-[11px] text-muted-foreground">
                Ese día vence la primera cuota; las siguientes vencen cada{' '}
                {planSeleccionado && planSeleccionado.duracionMeses > 1
                  ? `${planSeleccionado.duracionMeses} meses`
                  : 'mes'}
                . Si vence en 5 días o menos, la cuota se genera al guardar.
              </p>
            </div>
          )
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">
              Precio Acordado ($ USD)
            </label>
            <input
              type="text"
              value={precioOverride}
              disabled={Boolean(overrideError)}
              onChange={(e) => setPrecioOverride(e.target.value)}
              placeholder="Vacío = precio del plan"
              className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground font-mono font-bold focus:outline-hidden focus:border-primary"
            />
            <p className="text-[11px] text-muted-foreground">
              Vacío hereda el precio del plan. 0.00 = becado.
            </p>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">
              Tasa Especial Override (VES)
            </label>
            <input
              type="text"
              value={tasaFijadaOverride}
              onChange={(e) => setTasaFijadaOverride(e.target.value)}
              placeholder="Vacío = tasa global"
              className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground font-mono focus:outline-hidden focus:border-primary"
            />
            <p className="text-[11px] text-muted-foreground">
              Vacío usa la tasa global del entrenador.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
