/**
 * Módulo `alumnos` (fase B, prompt 53) · cascarón del diálogo de inscripción manual.
 *
 * Extraído de `pages/entrenador/AlumnosPage.tsx:1068-1098, 1300-1303`.
 * Clasificación: ÚNICO (el alta manual en sala solo existe aquí: único
 * `POST /alumnos/manual` en `apps/web/src`; inventario 42 §3).
 *
 * R5: conserva `role="dialog"`, `aria-modal`, `aria-labelledby="modal-inscripcion-title"`,
 * título "Inscripción Manual en Sala", botón "Cerrar" y cierre por backdrop
 * (`e.target === e.currentTarget`). El ciclo Escape/Tab/foco lo gobierna
 * `useDialogoAccesible`, que el propio modal llama con `cerrar` (salida animada) y cuyo `ref` adjunta aquí.
 * §6: cierre de 44px, texto ≥ 12px. Presentacional: solo props (R1).
 */

import type { ReactNode } from 'react';
import { UserPlus, X } from 'lucide-react';
import { useDialogoAccesible } from '../../../lib/use-dialogo-accesible';
import { CLASES_SALIDA_MODAL, useSalidaModal } from '../../../lib/use-salida-modal';

export interface ModalInscripcionAlumnoProps {
  onCerrar: () => void;
  children: ReactNode;
}

export function ModalInscripcionAlumno({
  onCerrar,
  children,
}: ModalInscripcionAlumnoProps) {
  const { saliendo, cerrar } = useSalidaModal(onCerrar);
  const refDialogo = useDialogoAccesible({ abierto: true, onCerrar: cerrar });

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) cerrar();
      }}
      data-saliendo={saliendo || undefined}
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200 ${CLASES_SALIDA_MODAL}`}
    >
      <div
        ref={refDialogo}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-inscripcion-title"
        tabIndex={-1}
        className="p-6 rounded-3xl bg-card border border-border shadow-2xl w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between border-b border-border/80 pb-3">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            <h3 id="modal-inscripcion-title" className="font-bold text-base text-foreground">
              Inscripción Manual en Sala
            </h3>
          </div>
          <button
            type="button"
            onClick={cerrar}
            aria-label="Cerrar"
            className="min-h-11 min-w-11 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}
