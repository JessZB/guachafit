/**
 * Hook del check-in antropométrico en sala (N3, RF-003 RN-02).
 *
 * Persiste en la API real (`POST /antropometria/checkin`, rol ENTRENADOR =>
 * presencial_verificado aprobado de inmediato). Mismo mecanismo que hoy (`apiClient` +
 * estado local; R9). Extraído de `pages/entrenador/AlumnoDetallePage.tsx` (SL-7).
 * En modo demo conserva el alta local con gate explícito; nunca un éxito falso.
 */
import { useState } from 'react';
import type {
  ControlAntropometricoDetalleDTO,
  FotoAntropometriaInputDTO,
} from '@guachafit/shared';
import { apiClient } from '../../../lib/api-client';
import { triggerHaptic } from '../../../lib/haptics';
import { rebanarPagina } from '../../../lib/paginacion';
import {
  construirPayloadCheckinAntropometrico,
  fechaLocalHoy,
} from '../../../lib/antropometria-checkin';
import {
  mapearControlAntro,
  type ControlAntroFila,
} from '../../../lib/alumno-detalle-controles';
import type { RetornoControlesAntropometricos } from './use-controles-antropometricos';

export interface ParametrosCheckinAntropometrico {
  isDemoMode: boolean;
  usuarioId: string | undefined;
  controles: RetornoControlesAntropometricos;
}

export function useCheckinAntropometrico({
  isDemoMode,
  usuarioId,
  controles,
}: ParametrosCheckinAntropometrico) {
  // Nuevo Control Antropométrico Modal State
  const [isAntroModalOpen, setIsAntroModalOpen] = useState(false);
  const [antroPeso, setAntroPeso] = useState('78.50');
  const [antroGrasa, setAntroGrasa] = useState('16.2');
  const [antroCintura, setAntroCintura] = useState('82.0');
  const [antroBrazo, setAntroBrazo] = useState('37.5');
  const [antroPecho, setAntroPecho] = useState('102.0');
  const [antroMuslo, setAntroMuslo] = useState('58.0');
  const [isSavingAntro, setIsSavingAntro] = useState(false);
  // RF-003 RN-02: fotos del control en sala (opcionales); el selector se monta vacío con el modal.
  const [fotosAntro, setFotosAntro] = useState<{
    fotos: FotoAntropometriaInputDTO[];
    subiendo: boolean;
  }>({ fotos: [], subiendo: false });
  // N3: el control antropométrico solo se declara guardado con 2xx del endpoint real.
  const [antroErrorMsg, setAntroErrorMsg] = useState<string | null>(null);

  const abrirCheckin = () => {
    setAntroErrorMsg(null);
    setIsAntroModalOpen(true);
  };

  // N3: "Registrar control" (control en sala) persiste en la API real (POST /antropometria/checkin,
  // rol ENTRENADOR => presencial_verificado aprobado de inmediato). En modo demo se conserva
  // el comportamiento local con gate explícito; nunca un éxito falso.
  const guardarCheckin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAntroErrorMsg(null);

    // MODO DEMO EXPLÍCITO: alta local simulada, solo con la bandera activa.
    if (isDemoMode) {
      const nuevo: ControlAntroFila = {
        id: 'antro-' + Date.now(),
        fecha: new Date().toISOString().split('T')[0],
        pesoKg: antroPeso,
        grasaPorcentaje: antroGrasa,
        cinturaCm: antroCintura,
        brazoCm: antroBrazo,
        pechoCm: antroPecho,
        musloCm: antroMuslo,
      };
      // WU25b: el fixture demo local conserva el alta para que siga visible al paginar.
      const actualizados = [nuevo, ...controles.controlesDemo];
      controles.setControlesDemo(actualizados);
      controles.setControlesTotal(actualizados.length);
      controles.setPaginaControles(1);
      controles.setControlesAntro(
        rebanarPagina(actualizados, 1, controles.tamanoControles)
      );
      setIsAntroModalOpen(false);
      return;
    }

    // El service resuelve el alumno por `perfiles_alumno.usuario_id`: se envía el usuarioId real.
    if (!usuarioId) {
      setAntroErrorMsg(
        'No se pudo identificar al alumno del expediente. Recarga la página e inténtalo de nuevo.'
      );
      return;
    }

    if (fotosAntro.subiendo) {
      setAntroErrorMsg('Espera a que terminen de subirse las fotos.');
      return;
    }

    setIsSavingAntro(true);
    try {
      const payload = construirPayloadCheckinAntropometrico(
        usuarioId,
        {
          pesoKg: antroPeso,
          porcentajeGrasa: antroGrasa,
          cinturaCm: antroCintura,
          brazoCm: antroBrazo,
          pechoCm: antroPecho,
          musloCm: antroMuslo,
        },
        fechaLocalHoy(),
        fotosAntro.fotos
      );
      const creado = await apiClient<ControlAntropometricoDetalleDTO>('/antropometria/checkin', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      // WU25b: refresco real de la página 1 (el control nuevo es el más reciente). El total
      // cacheado se invalida porque el COUNT cambió; si el refresco falla, se conserva el
      // control confirmado por el server.
      controles.invalidarTotalControles();
      controles.setPaginaControles(1);
      const refrescado = await controles.cargarControles(
        1,
        controles.tamanoControles,
        usuarioId
      );
      if (!refrescado) {
        controles.setControlesAntro((prev) => [
          mapearControlAntro(creado),
          ...prev.filter((c) => c.id !== creado.id),
        ]);
      }
      controles.setControlesErrorMsg(null);
      setIsAntroModalOpen(false);
      triggerHaptic('success');
    } catch (err: unknown) {
      // Sin éxito falso: el modal queda abierto y el error del contrato/API se muestra inline.
      setAntroErrorMsg(
        err instanceof Error
          ? err.message
          : 'No se pudo registrar el control antropométrico. Revisa los datos e inténtalo de nuevo.'
      );
    } finally {
      setIsSavingAntro(false);
    }
  };

  return {
    isAntroModalOpen,
    setIsAntroModalOpen,
    antroPeso,
    setAntroPeso,
    antroGrasa,
    setAntroGrasa,
    antroCintura,
    setAntroCintura,
    antroBrazo,
    setAntroBrazo,
    antroPecho,
    setAntroPecho,
    antroMuslo,
    setAntroMuslo,
    isSavingAntro,
    fotosAntro,
    setFotosAntro,
    antroErrorMsg,
    setAntroErrorMsg,
    abrirCheckin,
    guardarCheckin,
  };
}

export type RetornoCheckinAntropometrico = ReturnType<typeof useCheckinAntropometrico>;
