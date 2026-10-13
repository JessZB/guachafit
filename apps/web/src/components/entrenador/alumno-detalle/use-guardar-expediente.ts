/**
 * Hook de guardado del expediente, plan y tarifa (RF-005, M5-L1B).
 *
 * Encapsula la secuencia de escrituras con el MISMO mecanismo que usa hoy la vista
 * (`apiClient` + estado local; R9). Extraído de `pages/entrenador/AlumnoDetallePage.tsx` (SL-3).
 *
 * M5-L1B: plan (suscripción) y tarifa (override) se deciden ANTES de escribir nada. Si la
 * suscripción no cargó, el plan no se toca; si el override no cargó, la tarifa no se toca.
 */
import { useState } from 'react';
import type React from 'react';
import type {
  Modalidad,
  PerfilAlumnoDetalleDTO,
  PlanMembresiaDetalleDTO,
  SuscripcionAlumnoDTO,
  TipoDocumento,
} from '@guachafit/shared';
import { apiClient } from '../../../lib/api-client';
import {
  decidirGuardadoSuscripcion,
  suscripcionDemoAlumno,
} from '../../../lib/suscripcion-alumno';
import { fechaCalendarioLocal } from '../../../lib/date-format';
import type { RetornoPlanSuscripcion } from './use-plan-suscripcion-alumno';

export interface ValoresFormularioExpediente {
  nombres: string;
  apellidos: string;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  fechaNacimiento: string;
  telefonoWhatsapp: string;
  modalidad: Modalidad;
  fichaSaludPrivada: string;
}

export interface ParametrosGuardarExpediente {
  alumnoId: string | undefined;
  isDemoMode: boolean;
  alumno: PerfilAlumnoDetalleDTO | null;
  setAlumno: React.Dispatch<React.SetStateAction<PerfilAlumnoDetalleDTO | null>>;
  formulario: ValoresFormularioExpediente;
  plan: RetornoPlanSuscripcion;
  planesCatalogo: PlanMembresiaDetalleDTO[];
  notificarExito: (mensaje: string) => void;
  notificarError: (mensaje: string) => void;
}

export function useGuardarExpediente({
  alumnoId,
  isDemoMode,
  alumno,
  setAlumno,
  formulario,
  plan,
  planesCatalogo,
  notificarExito,
  notificarError,
}: ParametrosGuardarExpediente) {
  const [isSavingPerfil, setIsSavingPerfil] = useState(false);
  const [isGuardandoPlan, setIsGuardandoPlan] = useState(false);

  // Guardar Cambios de Perfil & Ficha Médica + Plan/Tarifa (RF-005)
  const guardarExpediente = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alumnoId) return;
    setIsSavingPerfil(true);

    // M5-L1B: plan (suscripción) y tarifa (override) se deciden ANTES de escribir nada. Si la
    // suscripción no cargó, el plan no se toca.
    const decisionSuscripcion = plan.suscripcionError
      ? ({ accion: 'ninguna' } as const)
      : decidirGuardadoSuscripcion({
          suscripcionActual: plan.suscripcion,
          planSeleccionadoId: plan.selectedPlanId,
          fechaInicio: plan.fechaInicioPlan,
          hoyLocal: plan.hoyDelAlumno(alumno?.zonaHoraria),
        });

    if (decisionSuscripcion.accion === 'error') {
      notificarError(decisionSuscripcion.mensaje);
      setIsSavingPerfil(false);
      return;
    }

    // WU-J (RF-005): se decide ANTES de escribir nada (validación local de precio/tasa). Si el
    // override no cargó, la tarifa no se toca: el campo vacío borraría el precio acordado real.
    const decisionPlanTarifa = plan.decidirTarifaLocal();

    if (decisionPlanTarifa.accion === 'error') {
      notificarError(decisionPlanTarifa.mensaje);
      setIsSavingPerfil(false);
      return;
    }

    // La tasa especial viaja por el POST del override cuando hay plan elegido (el override la
    // sincroniza en `perfiles_alumno`); sin plan elegido, el PATCH conserva el contrato legado.
    const payload: Record<string, unknown> = {
      nombres: formulario.nombres.trim(),
      apellidos: formulario.apellidos.trim(),
      tipoDocumento: formulario.tipoDocumento,
      numeroDocumento: formulario.numeroDocumento.trim(),
      fechaNacimiento: formulario.fechaNacimiento,
      telefonoWhatsapp: formulario.telefonoWhatsapp.trim(),
      modalidad: formulario.modalidad,
      fichaSaludPrivada: formulario.fichaSaludPrivada.trim()
        ? formulario.fichaSaludPrivada.trim()
        : null,
    };
    if (decisionPlanTarifa.accion !== 'guardar_override') {
      payload.tasaFijadaOverride = plan.tasaFijadaOverride.trim()
        ? plan.tasaFijadaOverride.trim()
        : null;
    }

    // MODO DEMO EXPLÍCITO: el guardado vive en estado local, sin llamadas reales (el banner
    // demo visible lo declara). Nunca se declara éxito de un servidor que no respondió.
    if (isDemoMode) {
      if (decisionSuscripcion.accion !== 'ninguna') {
        const planDemo = planesCatalogo.find((p) => p.id === decisionSuscripcion.payload.planId);
        plan.setSuscripcion((prev) => {
          const base =
            prev ??
            suscripcionDemoAlumno(fechaCalendarioLocal(), {
              id: decisionSuscripcion.payload.planId,
              nombre: planDemo?.nombre ?? 'Plan',
              duracionMeses: planDemo?.duracionMeses ?? 1,
            });
          return {
            ...base,
            planId: decisionSuscripcion.payload.planId,
            planNombre: planDemo?.nombre ?? base.planNombre,
            duracionMeses: planDemo?.duracionMeses ?? base.duracionMeses,
          };
        });
      }
      if (decisionPlanTarifa.accion !== 'ninguna') {
        plan.aplicarDecisionPlanTarifaDemo(
          decisionPlanTarifa,
          alumno?.usuarioId ?? 'user-demo',
          planesCatalogo
        );
        const planDemo = planesCatalogo.find((p) => p.id === plan.selectedPlanId) ?? null;
        setAlumno((prev) =>
          prev
            ? {
                ...prev,
                planActivoId: plan.selectedPlanId || null,
                planActivoNombre:
                  decisionPlanTarifa.accion === 'guardar_override'
                    ? planDemo?.nombre ?? prev.planActivoNombre
                    : null,
                precioAcordadoOverride:
                  decisionPlanTarifa.accion === 'guardar_override'
                    ? decisionPlanTarifa.payload.precioAcordadoUsd
                    : null,
              }
            : prev
        );
      }
      notificarExito('Expediente, plan y tarifa actualizados con éxito (demo).');
      setIsSavingPerfil(false);
      return;
    }

    try {
      const res = await apiClient.patch<PerfilAlumnoDetalleDTO>(`/alumnos/${alumnoId}`, payload);
      setAlumno((prev) => (prev ? { ...prev, ...res } : res));

      setIsGuardandoPlan(true);
      const clienteUsuarioId = alumno?.usuarioId ?? res.usuarioId;

      /** Plan (suscripción): de ella salen las cuotas. Devuelve el error o `null`. */
      const guardarSuscripcion = async (): Promise<string | null> => {
        if (decisionSuscripcion.accion === 'ninguna') return null;
        try {
          const vigente = await apiClient.put<SuscripcionAlumnoDTO>(
            `/finanzas/suscripciones/${clienteUsuarioId}`,
            decisionSuscripcion.payload
          );
          plan.setSuscripcion(vigente);
          return null;
        } catch (err: unknown) {
          await plan.reconciliarSuscripcion(clienteUsuarioId, alumno?.zonaHoraria);
          return err instanceof Error ? err.message : 'inténtalo de nuevo.';
        }
      };

      // Honestidad: cada aviso nombra exactamente lo que se guardó y lo que no.
      if (decisionSuscripcion.accion === 'asignar') {
        // Primer plan: la API emite la primera cuota DENTRO del PUT con el precio vigente en ese
        // instante, así que la tarifa (precio acordado o becado) se escribe ANTES.
        const resultadoTarifa = await plan.aplicarDecisionPlanTarifa(
          decisionPlanTarifa,
          clienteUsuarioId
        );
        if (!resultadoTarifa.ok) {
          notificarError(
            `Los datos del expediente se guardaron, pero no se pudo guardar la tarifa acordada y por eso no se asignó el plan: ${resultadoTarifa.error}`
          );
          return;
        }
        const errorPlan = await guardarSuscripcion();
        if (errorPlan) {
          notificarError(
            decisionPlanTarifa.accion === 'ninguna'
              ? `Los datos del expediente se guardaron, pero no se pudo guardar el plan: ${errorPlan}`
              : `Los datos del expediente y la tarifa se guardaron, pero no se pudo guardar el plan: ${errorPlan}`
          );
          return;
        }
      } else {
        const errorPlan = await guardarSuscripcion();
        if (errorPlan) {
          notificarError(
            `Los datos del expediente se guardaron, pero no se pudo guardar el plan: ${errorPlan}`
          );
          return;
        }
        // RF-005: la tarifa (precio acordado y tasa especial) se persiste por los endpoints de
        // override, la vía que alimenta la precedencia RN-03 al emitir cuotas.
        const resultadoTarifa = await plan.aplicarDecisionPlanTarifa(
          decisionPlanTarifa,
          clienteUsuarioId
        );
        if (!resultadoTarifa.ok) {
          notificarError(
            decisionSuscripcion.accion === 'ninguna'
              ? `Los datos del expediente se guardaron, pero no se pudo guardar la tarifa: ${resultadoTarifa.error}`
              : `Los datos del expediente y el plan se guardaron, pero no se pudo guardar la tarifa: ${resultadoTarifa.error}`
          );
          return;
        }
      }

      // El éxito nombra solo lo que se escribió de verdad.
      const partes = ['Expediente'];
      if (decisionSuscripcion.accion !== 'ninguna') partes.push('plan');
      if (decisionPlanTarifa.accion !== 'ninguna') partes.push('tarifa');
      const listado =
        partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
      notificarExito(`${listado} ${partes.length === 1 ? 'actualizado' : 'actualizados'} con éxito.`);
    } catch (err: unknown) {
      // D5: el expediente solo cambia con respuesta OK; nunca éxito falso ni mutación local.
      notificarError(
        err instanceof Error
          ? err.message
          : 'No se pudo guardar el expediente. Revisa los datos e inténtalo de nuevo.'
      );
    } finally {
      setIsGuardandoPlan(false);
      setIsSavingPerfil(false);
    }
  };

  return { isSavingPerfil, isGuardandoPlan, guardarExpediente };
}

export type RetornoGuardarExpediente = ReturnType<typeof useGuardarExpediente>;
