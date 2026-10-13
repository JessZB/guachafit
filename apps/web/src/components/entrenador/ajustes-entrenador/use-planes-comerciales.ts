/**
 * RF-018 · Ajustes del entrenador: datos del catálogo de planes comerciales.
 *
 * Extraído de `pages/entrenador/AjustesPage.tsx:81-84,127-175,280-346`.
 * Mismo mecanismo que hoy (R9): `apiClient` + `useState` con carga eager al montar
 * (el contenedor dispara `cargarPlanes` en su efecto inicial). Sin TanStack.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlanMembresiaDetalleDTO } from '@guachafit/shared';
import { apiClient } from '../../../lib/api-client';
import { triggerHaptic } from '../../../lib/haptics';
import {
  construirPayloadActualizarPlan,
  construirPayloadCrearPlan,
  type DatosFormularioPlan,
} from '../../../lib/ajustes-entrenador-planes';
import { planesDemo } from '../../../lib/ajustes-entrenador-demo';

/** Cierre automático del modal tras guardar (mismo tiempo que la página original). */
const RETARDO_CIERRE_MODAL_MS = 900;

export function usePlanesComerciales(isDemoMode: boolean) {
  const [planes, setPlanes] = useState<PlanMembresiaDetalleDTO[]>([]);
  const [isLoadingPlanes, setIsLoadingPlanes] = useState(true);
  const [planesError, setPlanesError] = useState<string | null>(null);
  const [isSubmittingPlan, setIsSubmittingPlan] = useState(false);
  const [planSuccessMsg, setPlanSuccessMsg] = useState<string | null>(null);
  const temporizadorCierreRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // S4 del inventario: el timer de 900 ms se limpia al desmontar.
  useEffect(() => {
    return () => {
      if (temporizadorCierreRef.current) clearTimeout(temporizadorCierreRef.current);
    };
  }, []);

  const cargarPlanes = useCallback(async () => {
    setIsLoadingPlanes(true);
    setPlanesError(null);

    // MODO DEMO EXPLÍCITO (isDemoMode): catálogo de ejemplo solo con la bandera activa.
    if (isDemoMode) {
      setPlanes(planesDemo());
      setIsLoadingPlanes(false);
      return;
    }

    try {
      const data = await apiClient<PlanMembresiaDetalleDTO[]>('/finanzas/planes');
      setPlanes(Array.isArray(data) ? data : []);
    } catch (err) {
      // D2: sin planes demo en sesión real; vacío real + error visible con reintento.
      setPlanes([]);
      setPlanesError(
        err instanceof Error && err.message
          ? err.message
          : 'No se pudo cargar el catálogo de planes. Revisa tu conexión e inténtalo de nuevo.'
      );
    } finally {
      setIsLoadingPlanes(false);
    }
  }, [isDemoMode]);

  /**
   * Guarda (crea o actualiza) un plan. Devuelve `true` y programa el cierre del
   * modal al éxito; el `onCierreExito` lo aporta el modal para cerrar y limpiar.
   */
  const guardarPlan = useCallback(
    async (
      datos: DatosFormularioPlan,
      editingPlanId: string | null,
      onCierreExito: () => void
    ): Promise<boolean> => {
      if (datos.beneficios.length === 0) {
        alert('Debe incluir al menos un beneficio en el plan');
        return false;
      }

      setIsSubmittingPlan(true);
      setPlanSuccessMsg(null);
      try {
        if (editingPlanId) {
          // Actualizar
          const res = await apiClient<PlanMembresiaDetalleDTO>(
            `/finanzas/planes/${editingPlanId}`,
            {
              method: 'PATCH',
              body: JSON.stringify(construirPayloadActualizarPlan(datos)),
            }
          );
          setPlanes((prev) => prev.map((p) => (p.id === editingPlanId ? res : p)));
          setPlanSuccessMsg('Plan actualizado correctamente');
        } else {
          // Crear
          const res = await apiClient<PlanMembresiaDetalleDTO>('/finanzas/planes', {
            method: 'POST',
            body: JSON.stringify(construirPayloadCrearPlan(datos)),
          });
          setPlanes((prev) => [res, ...prev]);
          setPlanSuccessMsg('Plan comercial creado y añadido al catálogo');
        }
        triggerHaptic('success');
        if (temporizadorCierreRef.current) clearTimeout(temporizadorCierreRef.current);
        temporizadorCierreRef.current = setTimeout(() => {
          onCierreExito();
          setPlanSuccessMsg(null);
        }, RETARDO_CIERRE_MODAL_MS);
        return true;
      } catch (err) {
        alert(err instanceof Error && err.message ? err.message : 'Error al guardar el plan comercial');
        return false;
      } finally {
        setIsSubmittingPlan(false);
      }
    },
    []
  );

  const limpiarMensajePlan = useCallback(() => {
    setPlanSuccessMsg(null);
  }, []);

  const toggleActivoPlan = useCallback(async (plan: PlanMembresiaDetalleDTO) => {    triggerHaptic('light');
    const nuevoEstado = !plan.activo;
    try {
      const res = await apiClient<PlanMembresiaDetalleDTO>(`/finanzas/planes/${plan.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ activo: nuevoEstado }),
      });
      setPlanes((prev) => prev.map((p) => (p.id === plan.id ? res : p)));
      triggerHaptic('success');
    } catch (err) {
      // D5: sin cambio optimista silencioso: el switch refleja solo estados confirmados.
      setPlanesError(
        err instanceof Error && err.message
          ? err.message
          : 'No se pudo actualizar el plan. Inténtalo de nuevo.'
      );
    }
  }, []);

  return {
    planes,
    isLoadingPlanes,
    planesError,
    isSubmittingPlan,
    planSuccessMsg,
    limpiarMensajePlan,
    cargarPlanes,
    guardarPlan,
    toggleActivoPlan,
  };
}
