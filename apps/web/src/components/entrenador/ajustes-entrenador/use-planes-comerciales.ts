/**
 * RF-018 · Ajustes del entrenador: datos del catálogo de planes comerciales.
 *
 * Extraído de `pages/entrenador/AjustesPage.tsx:81-84,127-175,280-346`.
 * Mismo mecanismo que hoy (R9): `apiClient` + `useState` con carga eager al montar
 * (el contenedor dispara `cargarPlanes` en su efecto inicial). Sin TanStack.
 *
 * UX-18: sin diálogos nativos. Cada canal de error tiene su estado: carga (`planesError`), guardado
 * (`errorGuardado`, lo muestra el modal) y activación (`errorToggle`, lo muestra el panel).
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
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);
  const [errorToggle, setErrorToggle] = useState<string | null>(null);
  const [planEnCurso, setPlanEnCurso] = useState<string | null>(null);
  // El ref bloquea un segundo PATCH aunque el re-render aún no haya llegado.
  const planEnCursoRef = useRef<string | null>(null);
  const temporizadorCierreRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guarda síncrona: true desde que sale la petición hasta que se cierra el modal tras el éxito.
  const guardandoRef = useRef(false);

  // S4 del inventario: el timer de 900 ms se limpia al desmontar.
  useEffect(() => {
    return () => {
      if (temporizadorCierreRef.current) clearTimeout(temporizadorCierreRef.current);
    };
  }, []);

  const cargarPlanes = useCallback(async () => {
    setIsLoadingPlanes(true);
    setPlanesError(null);
    setErrorToggle(null);

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
      // Un guardado o un cierre tras éxito pendiente: no se envía otra petición.
      if (guardandoRef.current) return false;
      setErrorGuardado(null);
      // Guarda defensiva: el modal ya valida los beneficios antes de llamar aquí.
      if (datos.beneficios.length === 0) {
        setErrorGuardado('Debe incluir al menos un beneficio en el plan');
        return false;
      }

      guardandoRef.current = true;
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
          temporizadorCierreRef.current = null;
          guardandoRef.current = false;
          onCierreExito();
          setPlanSuccessMsg(null);
        }, RETARDO_CIERRE_MODAL_MS);
        return true;
      } catch (err) {
        guardandoRef.current = false;
        setErrorGuardado(
          err instanceof Error && err.message
            ? err.message
            : 'No se pudo guardar el plan. Inténtalo de nuevo.'
        );
        return false;
      } finally {
        setIsSubmittingPlan(false);
      }
    },
    []
  );

  // Al abrir el modal se cancela un cierre tras éxito pendiente: no debe cerrar el modal nuevo.
  const limpiarMensajePlan = useCallback(() => {
    if (temporizadorCierreRef.current) clearTimeout(temporizadorCierreRef.current);
    temporizadorCierreRef.current = null;
    guardandoRef.current = false;
    setPlanSuccessMsg(null);
  }, []);

  const limpiarErrorGuardado = useCallback(() => {
    setErrorGuardado(null);
  }, []);

  const limpiarErrorToggle = useCallback(() => {
    setErrorToggle(null);
  }, []);

  const toggleActivoPlan = useCallback(async (plan: PlanMembresiaDetalleDTO) => {
    // Un solo cambio de activación a la vez: una llamada con otro en curso se ignora.
    if (planEnCursoRef.current !== null) return;
    planEnCursoRef.current = plan.id;
    setPlanEnCurso(plan.id);
    setErrorToggle(null);
    triggerHaptic('light');
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
      setErrorToggle(
        err instanceof Error && err.message
          ? err.message
          : 'No se pudo actualizar el plan. Inténtalo de nuevo.'
      );
    } finally {
      planEnCursoRef.current = null;
      setPlanEnCurso(null);
    }
  }, []);

  return {
    planes,
    isLoadingPlanes,
    planesError,
    isSubmittingPlan,
    planSuccessMsg,
    errorGuardado,
    limpiarErrorGuardado,
    errorToggle,
    limpiarErrorToggle,
    planEnCurso,
    limpiarMensajePlan,
    cargarPlanes,
    guardarPlan,
    toggleActivoPlan,
  };
}
