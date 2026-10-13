/**
 * Hook de datos: las 10 medidas editables del check-in (SL4, fase B).
 *
 * Parte de `use-checkin-antropometrico` para respetar R2 (hook ≤ 250):
 * estado de medidas con valores iniciales D6, filtro del peso al teclear
 * (C3.4), validación `erroresMedidas` y precarga sin pisar lo escrito.
 * Sin JSX ni estilos. §6: sin UI.
 */
import { useMemo, useState } from 'react';
import {
  obtenerUltimaMedicionReal,
  validarMedidasCheckinAntropometrico,
} from '../../../lib/antropometria-checkin';
import { filtrarEntradaPesoCorporal } from '../../../lib/entrada-numerica';
import type { EvolucionCorporalDTO } from '@guachafit/shared';

/** Las 10 medidas editables del formulario (claves del objeto de estado). */
export type ClaveMedidaFormularioCheckin =
  | 'pesoKg'
  | 'porcentajeGrasa'
  | 'cinturaCm'
  | 'brazoRelajadoCm'
  | 'brazoContraidoCm'
  | 'musloMedioCm'
  | 'tricepsMm'
  | 'subescapularMm'
  | 'suprailiacoMm'
  | 'abdominalMm';

export type MedidasFormularioCheckin = Record<ClaveMedidaFormularioCheckin, string>;

/** Valores iniciales: en sesión real los campos arrancan VACÍOS (D6). */
function medidasIniciales(isDemoMode: boolean): MedidasFormularioCheckin {
  return {
    pesoKg: isDemoMode ? '74.50' : '',
    porcentajeGrasa: isDemoMode ? '14.80' : '',
    cinturaCm: isDemoMode ? '81.00' : '',
    // RN-02: brazo relajado (el alias legado `brazoCm` se resuelve en el helper del payload).
    brazoRelajadoCm: isDemoMode ? '37.50' : '',
    brazoContraidoCm: isDemoMode ? '40.10' : '',
    musloMedioCm: isDemoMode ? '58.20' : '',
    tricepsMm: isDemoMode ? '12.00' : '',
    subescapularMm: isDemoMode ? '11.50' : '',
    suprailiacoMm: isDemoMode ? '9.80' : '',
    abdominalMm: isDemoMode ? '14.20' : '',
  };
}

export function useMedidasCheckin(
  userId: string | undefined,
  isDemoMode: boolean
) {
  // D6: en sesión real los campos arrancan VACÍOS (los fixtures solo viven tras isDemoMode);
  // al abrir el formulario se precargan con la última medición real de la evolución cargada.
  const [medidas, setMedidas] = useState<MedidasFormularioCheckin>(() =>
    medidasIniciales(isDemoMode)
  );
  // Validación inline: los mensajes por campo se muestran al escribir o tras intentar enviar.
  const [intentoEnvio, setIntentoEnvio] = useState(false);

  /** Escribe una medida; solo el peso filtra al teclear (C3.4, tope 300 en vivo). */
  const actualizarMedida = (campo: ClaveMedidaFormularioCheckin, valor: string) => {
    if (campo === 'pesoKg') {
      setMedidas((prev) => {
        const filtrado = filtrarEntradaPesoCorporal(valor, prev.pesoKg);
        if (filtrado === prev.pesoKg) return prev;
        return { ...prev, pesoKg: filtrado };
      });
      return;
    }
    setMedidas((prev) => ({ ...prev, [campo]: valor }));
  };

  const erroresMedidas = useMemo(
    () =>
      validarMedidasCheckinAntropometrico(userId ?? '', {
        pesoKg: medidas.pesoKg,
        porcentajeGrasa: medidas.porcentajeGrasa,
        cinturaCm: medidas.cinturaCm,
        brazoRelajadoCm: medidas.brazoRelajadoCm,
        brazoContraidoCm: medidas.brazoContraidoCm,
        musloMedioCm: medidas.musloMedioCm,
        tricepsMm: medidas.tricepsMm,
        subescapularMm: medidas.subescapularMm,
        suprailiacoMm: medidas.suprailiacoMm,
        abdominalMm: medidas.abdominalMm,
      }),
    [userId, medidas]
  );

  /**
   * Precarga la última medición real disponible (sin pisar lo que el alumno
   * ya haya escrito); sin evolución, los campos quedan vacíos.
   */
  const precargarUltimaMedicion = (evolucion: EvolucionCorporalDTO | null) => {
    if (isDemoMode) return;
    const ultima = obtenerUltimaMedicionReal(evolucion);
    if (!ultima) return;
    setMedidas((prev) => ({
      pesoKg: prev.pesoKg || ultima.pesoKg,
      porcentajeGrasa: prev.porcentajeGrasa || ultima.porcentajeGrasa,
      cinturaCm: prev.cinturaCm || ultima.cinturaCm,
      brazoRelajadoCm: prev.brazoRelajadoCm || ultima.brazoRelajadoCm,
      brazoContraidoCm: prev.brazoContraidoCm || ultima.brazoContraidoCm,
      musloMedioCm: prev.musloMedioCm || ultima.musloMedioCm,
      tricepsMm: prev.tricepsMm || ultima.tricepsMm,
      subescapularMm: prev.subescapularMm || ultima.subescapularMm,
      suprailiacoMm: prev.suprailiacoMm || ultima.suprailiacoMm,
      abdominalMm: prev.abdominalMm || ultima.abdominalMm,
    }));
  };

  return {
    medidas,
    actualizarMedida,
    erroresMedidas,
    intentoEnvio,
    setIntentoEnvio,
    precargarUltimaMedicion,
  };
}
