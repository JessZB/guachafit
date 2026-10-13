/**
 * RF-018 · Ajustes del entrenador: modal crear/editar plan comercial.
 *
 * Extraído de `pages/entrenador/AjustesPage.tsx:86-102,242-278,280-330,928-1095`.
 * El formulario vive aquí (montaje condicional: el estado se inicializa al abrir);
 * `useDialogoAccesible` se usa en su interior con `abierto` siempre `true`.
 * Conserva `role="dialog"`, `aria-modal`, `aria-labelledby`, `tabIndex={-1}`,
 * los `alert()` de validación/error (sin cambiar comportamiento) y el cierre a 900 ms
 * (programado por el hook; `onCierreExito` cierra el modal).
 */
import { useState } from 'react';
import { CheckCircle, CreditCard, X } from 'lucide-react';
import type { PlanMembresiaDetalleDTO } from '@guachafit/shared';
import { triggerHaptic } from '../../../lib/haptics';
import { useDialogoAccesible } from '../../../lib/use-dialogo-accesible';
import type { DatosFormularioPlan } from '../../../lib/ajustes-entrenador-planes';

/** Valores con los que se abre el modal en modo crear (`abrirModalCrearPlan` original). */
const BENEFICIOS_CREAR = ['Rutina interactiva en app', 'Monitoreo diario'];

export interface ModalPlanComercialProps {
  /** `null` = crear; con plan = editar (precarga sus valores). */
  plan: PlanMembresiaDetalleDTO | null;
  isSubmitting: boolean;
  successMsg: string | null;
  onGuardar: (
    datos: DatosFormularioPlan,
    editingPlanId: string | null,
    onCierreExito: () => void
  ) => void;
  onCerrar: () => void;
}

export function ModalPlanComercial({
  plan,
  isSubmitting,
  successMsg,
  onGuardar,
  onCerrar,
}: ModalPlanComercialProps) {
  const [nombrePlan, setNombrePlan] = useState(plan?.nombre ?? '');
  const [descripcionPlan, setDescripcionPlan] = useState(plan?.descripcion ?? '');
  const [precioBaseUsd, setPrecioBaseUsd] = useState(plan?.precioBaseUsd ?? '40.00');
  const [duracionMeses, setDuracionMeses] = useState(plan?.duracionMeses ?? 1);
  const [beneficios, setBeneficios] = useState<string[]>(
    plan && Array.isArray(plan.beneficios) ? [...plan.beneficios] : [...BENEFICIOS_CREAR]
  );
  const [nuevoBeneficio, setNuevoBeneficio] = useState('');

  // U3b: semántica de diálogo, Escape, trampa de Tab y restore del foco.
  const refModalPlan = useDialogoAccesible({
    abierto: true,
    onCerrar,
  });

  const editingPlanId = plan?.id ?? null;

  function agregarBeneficio() {
    if (!nuevoBeneficio.trim()) return;
    triggerHaptic('selection');
    setBeneficios([...beneficios, nuevoBeneficio.trim()]);
    setNuevoBeneficio('');
  }

  function removerBeneficio(index: number) {
    triggerHaptic('selection');
    setBeneficios(beneficios.filter((_, i) => i !== index));
  }

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        ref={refModalPlan}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ajustes-plan-titulo"
        tabIndex={-1}
        className="w-full max-w-lg rounded-3xl bg-card border border-border p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200"
      >
        <div className="flex items-center justify-between border-b border-border/80 pb-3">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            <h3
              id="ajustes-plan-titulo"
              className="font-bold text-base text-foreground"
            >
              {editingPlanId ? 'Editar Plan Comercial' : 'Nuevo Plan Comercial'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar plan comercial"
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {successMsg && (
          <div className="p-3 rounded-2xl bg-success/10 border border-success/30 text-success text-xs flex items-center gap-2">
            <CheckCircle className="h-4 w-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onGuardar(
              { nombre: nombrePlan, descripcion: descripcionPlan, precioBaseUsd, duracionMeses, beneficios },
              editingPlanId,
              onCerrar
            );
          }}
          className="space-y-4"
        >
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Nombre del Plan</label>
            <input
              type="text"
              required
              value={nombrePlan}
              onChange={(e) => setNombrePlan(e.target.value)}
              placeholder="Ej. Plan Personalizado 4 Días"
              className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Precio Base (USD)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={precioBaseUsd}
                onChange={(e) => setPrecioBaseUsd(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Duración (Meses)</label>
              <select
                value={duracionMeses}
                onChange={(e) => setDuracionMeses(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
              >
                <option value={1}>1 Mes (Mensual)</option>
                <option value={2}>2 Meses (Bimestral)</option>
                <option value={3}>3 Meses (Trimestral)</option>
                <option value={6}>6 Meses (Semestral)</option>
                <option value={12}>12 Meses (Anual)</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Descripción General</label>
            <textarea
              rows={2}
              value={descripcionPlan}
              onChange={(e) => setDescripcionPlan(e.target.value)}
              placeholder="Describe brevemente el alcance del plan comercial..."
              className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-hidden focus:border-primary resize-none"
            />
          </div>

          {/* Beneficios */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground">Checklist de Beneficios</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={nuevoBeneficio}
                onChange={(e) => setNuevoBeneficio(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    agregarBeneficio();
                  }
                }}
                placeholder="Ej. Check-in semanal de peso..."
                className="flex-1 px-3 py-2 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-hidden focus:border-primary"
              />
              <button
                type="button"
                onClick={agregarBeneficio}
                className="px-3 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-xs cursor-pointer"
              >
                Añadir
              </button>
            </div>

            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {beneficios.map((b, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 rounded-xl bg-secondary/30 border border-border/60 text-xs"
                >
                  <span className="text-foreground">{b}</span>
                  <button
                    type="button"
                    onClick={() => removerBeneficio(idx)}
                    className="text-muted-foreground hover:text-destructive cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-3 flex justify-end gap-2 border-t border-border/80">
            <button
              type="button"
              onClick={onCerrar}
              className="px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-xs cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
            >
              {isSubmitting
                ? 'Guardando...'
                : editingPlanId
                ? 'Actualizar Plan'
                : 'Crear Plan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
