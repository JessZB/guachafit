/**
 * Hook de datos del plan y la tarifa del alumno (RF-005, M5-L1B ADR-020).
 *
 * Encapsula la carga y las mutaciones con el MISMO mecanismo que usa hoy la vista
 * (`apiClient` + estado local, paginación manual; R9: sin TanStack ni `usePaginacionServidor`).
 * Extraído de `pages/entrenador/AlumnoDetallePage.tsx` (SL-3).
 *
 * El plan del alumno es su suscripción (de ella salen las cuotas) y la tarifa es su override
 * (precio/tasa pactados). Los mensajes de guardado los posee el contenedor y llegan como
 * `notificarExito/notificarError` (también los usa el guardado del expediente).
 */
import { useState } from 'react';
import type React from 'react';
import {
  type OverridePlanDetalleDTO,
  type PerfilAlumnoDetalleDTO,
  type PlanMembresiaDetalleDTO,
  type SuscripcionAlumnoDTO,
} from '@guachafit/shared';
import { apiClient } from '../../../lib/api-client';
import { decidirGuardadoPlanTarifa, type DecisionPlanTarifa } from '../../../lib/plan-tarifa';
import { partesEnZona } from '../../../lib/zona-horaria';
import { fechaCalendarioLocal } from '../../../lib/date-format';
import type { ConfirmacionFicha } from '../../../lib/alumno-detalle-textos';
import { separarPreguntaYDetalle } from '../../../lib/alumno-detalle-textos';

export interface ParametrosPlanSuscripcion {
  isDemoMode: boolean;
  solicitarConfirmacion: (confirmacion: ConfirmacionFicha) => void;
}

export function usePlanSuscripcionAlumno({
  isDemoMode,
  solicitarConfirmacion,
}: ParametrosPlanSuscripcion) {
  // WU-J (RF-005): override vigente del alumno (precio/tasa pactados) y su error de carga.
  const [overridesAlumno, setOverridesAlumno] = useState<OverridePlanDetalleDTO[]>([]);
  const [overrideError, setOverrideError] = useState<string | null>(null);
  // M5-L1B (ADR-020): el plan del alumno es su suscripción; de ella salen las cuotas.
  const [suscripcion, setSuscripcion] = useState<SuscripcionAlumnoDTO | null>(null);
  const [suscripcionError, setSuscripcionError] = useState<string | null>(null);
  const [fechaInicioPlan, setFechaInicioPlan] = useState(() => fechaCalendarioLocal());
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [precioOverride, setPrecioOverride] = useState('');
  const [tasaFijadaOverride, setTasaFijadaOverride] = useState('');
  // D5: mensajes del guardado de expediente/plan/tarifa (los escriben este hook y el de
  // guardado; el éxito se declara solo con 2xx y se libera a los 2500 ms).
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null);
  const notificarExito = (mensaje: string) => {
    setSaveErrorMsg(null);
    setSaveSuccessMsg(mensaje);
    setTimeout(() => setSaveSuccessMsg(null), 2500);
  };
  const notificarError = (mensaje: string) => {
    setSaveSuccessMsg(null);
    setSaveErrorMsg(mensaje);
  };

  /**
   * M5-L1B: "hoy" en la zona del alumno, la misma con la que la API valida la fecha de inicio
   * (sin zona, la del perfil por defecto). Evita bordes desplazados un día si el entrenador está
   * en otra zona.
   */
  const hoyDelAlumno = (zona: string | null | undefined): string =>
    partesEnZona(new Date(), zona).fecha;

  /**
   * WU-J (RF-005): carga los overrides del alumno. Un fallo NO se disfraza de "sin override":
   * se expone `overrideError` y la tarjeta lo advierte (nunca se afirma un estado falso).
   */
  const cargarOverrides = async (
    clienteUsuarioId: string
  ): Promise<OverridePlanDetalleDTO[]> => {
    setOverrideError(null);
    try {
      const res = await apiClient<OverridePlanDetalleDTO[]>(
        `/finanzas/planes/override?clienteId=${clienteUsuarioId}`
      );
      const overrides = Array.isArray(res) ? res : [];
      setOverridesAlumno(overrides);
      return overrides;
    } catch (err: unknown) {
      const mensaje =
        err instanceof Error ? err.message : 'No se pudo cargar el override vigente del alumno.';
      setOverrideError(mensaje);
      return [];
    }
  };

  /**
   * M5-L1B: carga la suscripción (plan asignado). Sin plan la API responde vacío (`null`). Un
   * fallo NO se trata como "sin plan": se avisa y el selector queda bloqueado, para no asignar
   * por error un plan a quien ya lo tiene.
   */
  const cargarSuscripcion = async (
    clienteUsuarioId: string,
    overrides: OverridePlanDetalleDTO[],
    zonaAlumno: string | null | undefined
  ) => {
    setSuscripcionError(null);
    setFechaInicioPlan(hoyDelAlumno(zonaAlumno));
    try {
      const res = await apiClient<SuscripcionAlumnoDTO | null>(
        `/finanzas/suscripciones/${clienteUsuarioId}`
      );
      const vigente = res?.planId ? res : null;
      setSuscripcion(vigente);
      setSelectedPlanId(vigente?.planId ?? '');
      setPrecioOverride(
        overrides.find((o) => o.planId === vigente?.planId)?.precioAcordadoUsd ?? ''
      );
    } catch {
      setSuscripcion(null);
      setSelectedPlanId('');
      setPrecioOverride('');
      setSuscripcionError(
        'No se pudo cargar el plan del alumno. Recarga la página para verlo o cambiarlo.'
      );
    }
  };

  /**
   * M5-L1B: tras un fallo de PUT/DELETE, vuelve a leer la suscripción. Si el servidor sí aplicó
   * el cambio (respuesta perdida), la tarjeta muestra el estado real y el reintento no choca con
   * un 400/404. El selector se alinea con el servidor: si conservara la elección anterior, el
   * siguiente guardado podría reasignar un plan recién quitado (y emitir su cuota).
   */
  const reconciliarSuscripcion = async (
    clienteUsuarioId: string,
    zonaAlumno?: string | null
  ) => {
    try {
      const res = await apiClient<SuscripcionAlumnoDTO | null>(
        `/finanzas/suscripciones/${clienteUsuarioId}`
      );
      const vigente = res?.planId ? res : null;
      setSuscripcion(vigente);
      setSelectedPlanId(vigente?.planId ?? '');
      setFechaInicioPlan(hoyDelAlumno(zonaAlumno ?? null));
    } catch {
      // Sin respuesta no se afirma nada nuevo: se conserva el estado anterior.
    }
  };

  /**
   * WU-J (RF-005): aplica la decisión de plan/tarifa contra los endpoints de override.
   * - `guardar_override`: POST upsert (201) y luego DELETE de overrides de otros planes.
   * - `eliminar_override`: DELETE de los overrides vigentes.
   * Solo se declara éxito con respuestas 2xx; el primer fallo se devuelve con su mensaje.
   */
  const aplicarDecisionPlanTarifa = async (
    decision: DecisionPlanTarifa,
    clienteUsuarioId: string
  ): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      if (decision.accion === 'guardar_override') {
        await apiClient.post<OverridePlanDetalleDTO>('/finanzas/planes/override', {
          planId: decision.payload.planId,
          clienteId: clienteUsuarioId,
          precioAcordadoUsd: decision.payload.precioAcordadoUsd,
          tasaFijadaOverride: decision.payload.tasaFijadaOverride,
        });
        for (const overrideId of decision.overridesAEliminar) {
          await apiClient.delete(`/finanzas/planes/override/${overrideId}`);
        }
      } else if (decision.accion === 'eliminar_override') {
        for (const overrideId of decision.overridesAEliminar) {
          await apiClient.delete(`/finanzas/planes/override/${overrideId}`);
        }
      }

      if (decision.accion !== 'ninguna') {
        await cargarOverrides(clienteUsuarioId);
      }
      return { ok: true };
    } catch (err: unknown) {
      return {
        ok: false,
        error:
          err instanceof Error ? err.message : 'No se pudo guardar el override del alumno.',
      };
    }
  };

  /** MODO DEMO: la misma decisión, aplicada al estado local (sin llamadas a la API). */
  const aplicarDecisionPlanTarifaDemo = (
    decision: DecisionPlanTarifa,
    clienteUsuarioId: string,
    planes: PlanMembresiaDetalleDTO[]
  ) => {
    if (decision.accion === 'guardar_override') {
      const plan = planes.find((p) => p.id === decision.payload.planId) ?? null;
      const ahora = new Date().toISOString();
      setOverridesAlumno((prev) => {
        const base = prev.find((o) => o.planId === decision.payload.planId);
        return [
          {
            id: base?.id ?? `override-demo-${Date.now()}`,
            planId: decision.payload.planId,
            clienteId: clienteUsuarioId,
            precioAcordadoUsd: decision.payload.precioAcordadoUsd,
            tasaFijadaOverride: decision.payload.tasaFijadaOverride,
            beneficiosPersonalizados: base?.beneficiosPersonalizados ?? null,
            motivoOverride: base?.motivoOverride ?? null,
            planNombre: plan?.nombre ?? base?.planNombre ?? null,
            planPrecioBaseUsd: plan?.precioBaseUsd ?? base?.planPrecioBaseUsd ?? null,
            clienteNombre: base?.clienteNombre ?? null,
            createdAtUtc: base?.createdAtUtc ?? ahora,
            updatedAtUtc: ahora,
          },
        ];
      });
    } else if (decision.accion === 'eliminar_override') {
      setOverridesAlumno([]);
    }
  };

  /** Decide localmente la tarifa ANTES de escribir nada (validación de precio/tasa). */
  const decidirTarifaLocal = (): DecisionPlanTarifa =>
    overrideError
      ? { accion: 'ninguna' }
      : decidirGuardadoPlanTarifa({
          planSeleccionadoId: selectedPlanId,
          precioAcordado: precioOverride,
          tasaEspecial: tasaFijadaOverride,
          overridesVigentes: overridesAlumno,
        });

  /** M5-L1B: quitar el plan (suscripción). Deja de generar cuotas; las emitidas no cambian. */
  const solicitarQuitarPlan = (perfil: PerfilAlumnoDetalleDTO | null) => {
    if (!perfil || !suscripcion) return;
    solicitarConfirmacion({
      ...separarPreguntaYDetalle(
        '¿Quitar el plan de este alumno? Dejarán de generarse sus cuotas. Las cuotas ya emitidas no cambian.'
      ),
      boton: 'Quitar plan',
      accion: () => quitarPlanConfirmado(perfil),
    });
  };

  const quitarPlanConfirmado = async (perfil: PerfilAlumnoDetalleDTO) => {
    if (!suscripcion) return;

    if (!isDemoMode) {
      try {
        await apiClient.delete(`/finanzas/suscripciones/${perfil.usuarioId}`);
      } catch (err: unknown) {
        await reconciliarSuscripcion(perfil.usuarioId, perfil.zonaHoraria);
        notificarError(
          err instanceof Error ? err.message : 'No se pudo quitar el plan. Inténtalo de nuevo.'
        );
        return;
      }
    }

    setSuscripcion(null);
    setSelectedPlanId('');
    // Sin plan no hay precio acordado que guardar (el override sigue y se quita aparte).
    setPrecioOverride('');
    setFechaInicioPlan(hoyDelAlumno(perfil.zonaHoraria));
    notificarExito(
      isDemoMode
        ? 'Plan quitado: no se generarán más cuotas para este alumno (demo).'
        : 'Plan quitado: no se generarán más cuotas para este alumno.'
    );
  };

  /** WU-J (RF-005): quitar el override vigente (el alumno vuelve al catálogo). */
  const solicitarQuitarOverride = async (
    perfil: PerfilAlumnoDetalleDTO | null,
    setAlumno: React.Dispatch<React.SetStateAction<PerfilAlumnoDetalleDTO | null>>
  ) => {
    if (!perfil || overridesAlumno.length === 0) return;
    solicitarConfirmacion({
      ...separarPreguntaYDetalle(
        '¿Quitar el override de este alumno? Volverá a los valores del plan del catálogo y a la tasa global.'
      ),
      boton: 'Quitar override',
      accion: () => quitarOverrideConfirmado(perfil, setAlumno),
    });
  };

  const quitarOverrideConfirmado = async (
    perfil: PerfilAlumnoDetalleDTO,
    setAlumno: React.Dispatch<React.SetStateAction<PerfilAlumnoDetalleDTO | null>>
  ) => {
    if (overridesAlumno.length === 0) return;

    if (isDemoMode) {
      setOverridesAlumno([]);
      setPrecioOverride('');
      setTasaFijadaOverride('');
      setAlumno((prev) => (prev ? { ...prev, precioAcordadoOverride: null } : prev));
      notificarExito('Override eliminado: el alumno vuelve a los valores del catálogo (demo).');
      return;
    }

    try {
      for (const override of overridesAlumno) {
        await apiClient.delete(`/finanzas/planes/override/${override.id}`);
      }
      // La API limpia la tasa global del alumno si venía de este override (ADR-003 §3.2).
      const tasasEliminadas = overridesAlumno
        .map((o) => o.tasaFijadaOverride)
        .filter((tasa): tasa is string => Boolean(tasa));
      if (tasasEliminadas.includes(tasaFijadaOverride.trim())) {
        setTasaFijadaOverride('');
      }
      setPrecioOverride('');
      await cargarOverrides(perfil.usuarioId);
      notificarExito('Override eliminado: el alumno vuelve a los valores del catálogo.');
    } catch (err: unknown) {
      notificarError(
        err instanceof Error ? err.message : 'No se pudo quitar el override. Inténtalo de nuevo.'
      );
    }
  };

  /** WU-J (RF-005): override vigente (el más reciente) y plan elegido del catálogo. */
  const overrideVigente = overridesAlumno.length > 0 ? overridesAlumno[0] : null;

  return {
    overridesAlumno,
    overrideError,
    overrideVigente,
    suscripcion,
    suscripcionError,
    fechaInicioPlan,
    selectedPlanId,
    precioOverride,
    tasaFijadaOverride,
    saveSuccessMsg,
    saveErrorMsg,
    notificarExito,
    notificarError,
    setOverridesAlumno,
    setOverrideError,
    setSuscripcion,
    setSuscripcionError,
    setFechaInicioPlan,
    setSelectedPlanId,
    setPrecioOverride,
    setTasaFijadaOverride,
    hoyDelAlumno,
    cargarOverrides,
    cargarSuscripcion,
    reconciliarSuscripcion,
    decidirTarifaLocal,
    aplicarDecisionPlanTarifa,
    aplicarDecisionPlanTarifaDemo,
    solicitarQuitarPlan,
    solicitarQuitarOverride,
  };
}

export type RetornoPlanSuscripcion = ReturnType<typeof usePlanSuscripcionAlumno>;
