/**
 * Pestaña Perfil del alumno (contenedor de pestaña ÚNICO).
 *
 * Compone, dentro del `<form>` de guardado, los datos personales, la ficha médica y la tarjeta de
 * plan/tarifa; la zona horaria del alumno va fuera del formulario (no anida formularios). Avisa
 * de los datos personales sin guardar junto al botón. Presentacional: `onGuardar` y panel APG por
 * props (R1). Extraída de `pages/entrenador/AlumnoDetallePage.tsx` (SL-3).
 *
 * §6: 11px mínimo, pesos ≤ 700, tokens con variante oscura, error honesto (`role="alert"`).
 */
import type React from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import type { PropsPanel } from '../../../lib/use-tabs-accesibles';
import { zonaPerfilEfectiva } from '../../../lib/nutricion-checkin';
import {
  FormularioDatosAlumno,
  type FormularioDatosAlumnoProps,
} from './FormularioDatosAlumno';
import {
  TarjetaPlanTarifaAlumno,
  type PlanTarjetaAlumno,
} from './TarjetaPlanTarifaAlumno';
import { FichaMedicaConfidencial } from './FichaMedicaConfidencial';
import { SeccionZonaHorariaAlumno } from './SeccionZonaHorariaAlumno';
import type { PlanMembresiaDetalleDTO } from '@guachafit/shared';

interface PestanaResumenAlumnoProps {
  propsPanel: PropsPanel;
  onGuardar: (e: React.FormEvent) => void;
  formulario: FormularioDatosAlumnoProps;
  plan: PlanTarjetaAlumno;
  planesCatalogo: PlanMembresiaDetalleDTO[];
  zonaHoraria: string | null | undefined;
  onQuitarPlan: () => void;
  onQuitarOverride: () => void;
  refSelectorPlan: React.RefObject<HTMLSelectElement | null>;
  fichaSaludPrivada: string;
  onCambiarFichaSalud: (valor: string) => void;
  mensajeExito: string | null;
  mensajeError: string | null;
  guardando: boolean;
  alumnoPerfilId: string | undefined;
  zonaHorariaAlumno: string | null | undefined;
  isDemoMode: boolean;
  onZonaHorariaGuardada: (zonaHoraria: string) => void;
  hayCambiosSinGuardar: boolean;
}

export function PestanaResumenAlumno({
  propsPanel,
  onGuardar,
  formulario,
  plan,
  planesCatalogo,
  zonaHoraria,
  onQuitarPlan,
  onQuitarOverride,
  refSelectorPlan,
  fichaSaludPrivada,
  onCambiarFichaSalud,
  mensajeExito,
  mensajeError,
  guardando,
  alumnoPerfilId,
  zonaHorariaAlumno,
  isDemoMode,
  onZonaHorariaGuardada,
  hayCambiosSinGuardar,
}: PestanaResumenAlumnoProps) {
  return (
    <div {...propsPanel} className="space-y-6 animate-in fade-in-50 duration-200 slide-in-from-bottom-1">
      <form onSubmit={onGuardar} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Columna izquierda: datos personales y salud y limitaciones */}
          <div className="space-y-6">
            <FormularioDatosAlumno {...formulario} />

            {/* Salud y limitaciones */}
            <FichaMedicaConfidencial valor={fichaSaludPrivada} onCambiar={onCambiarFichaSalud} />
          </div>

          {/* Columna derecha: Plan y Tarifa Acordada (RF-005) */}
          <TarjetaPlanTarifaAlumno
            plan={plan}
            planesCatalogo={planesCatalogo}
            zonaHoraria={zonaHoraria}
            onQuitarPlan={onQuitarPlan}
            onQuitarOverride={onQuitarOverride}
            refSelectorPlan={refSelectorPlan}
          />
        </div>

        {/* Botón Guardar cambios: en móvil apila mensajes y botón a ancho completo */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-3 pt-2">
          {hayCambiosSinGuardar && (
            <p role="status" className="text-xs font-bold text-warning">
              Cambios sin guardar
            </p>
          )}
          {mensajeExito && (
            <span className="text-xs font-bold text-success flex items-center gap-1.5 animate-in fade-in">
              <CheckCircle2 className="h-4 w-4" />
              {mensajeExito}
            </span>
          )}
          {mensajeError && (
            <span
              role="alert"
              className="text-xs font-bold text-destructive flex items-center gap-1.5 animate-in fade-in max-w-md sm:text-right"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              {mensajeError}
            </span>
          )}
          <button
            type="submit"
            disabled={guardando}
            className="w-full sm:w-auto min-h-11 py-3 px-6 rounded-2xl bg-primary text-primary-foreground font-bold text-sm tracking-wide shadow-md shadow-primary/20 hover:brightness-110 active:scale-98 transition-all disabled:opacity-50 cursor-pointer"
          >
            {guardando ? 'Guardando expediente...' : 'Guardar cambios'}
          </button>
        </div>
      </form>

      {/* Zona horaria del alumno: fuera del formulario, después de Guardar cambios */}
      <SeccionZonaHorariaAlumno
        zonaHorariaAlumno={zonaPerfilEfectiva(zonaHorariaAlumno)}
        alumnoPerfilId={alumnoPerfilId}
        isDemoMode={isDemoMode}
        onZonaHorariaGuardada={onZonaHorariaGuardada}
      />
    </div>
  );
}
