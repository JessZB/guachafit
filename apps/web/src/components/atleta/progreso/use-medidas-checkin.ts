/**
 * Hook de datos: las 10 medidas editables del check-in (SL4, fase B).
 *
 * Parte de `use-checkin-antropometrico` para respetar R2 (hook ≤ 250):
 * estado de medidas con valores iniciales D6, filtro del peso al teclear
 * (C3.4), validación `erroresMedidas` y precarga sin pisar lo escrito.
 * Sin JSX ni estilos. §6: sin UI.
 */
import { useMemo, useRef, useState } from 'react';
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
  // Referencia de "sin cambios": valores con los que se abrió el formulario (precarga o vacío).
  const baseRef = useRef<MedidasFormularioCheckin>(medidasIniciales(isDemoMode));

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
    // La precarga no cuenta como cambio del alumno: la nueva base es lo precargado.
    const next: MedidasFormularioCheckin = {
      pesoKg: medidas.pesoKg || ultima.pesoKg,
      porcentajeGrasa: medidas.porcentajeGrasa || ultima.porcentajeGrasa,
      cinturaCm: medidas.cinturaCm || ultima.cinturaCm,
      brazoRelajadoCm: medidas.brazoRelajadoCm || ultima.brazoRelajadoCm,
      brazoContraidoCm: medidas.brazoContraidoCm || ultima.brazoContraidoCm,
      musloMedioCm: medidas.musloMedioCm || ultima.musloMedioCm,
      tricepsMm: medidas.tricepsMm || ultima.tricepsMm,
      subescapularMm: medidas.subescapularMm || ultima.subescapularMm,
      suprailiacoMm: medidas.suprailiacoMm || ultima.suprailiacoMm,
      abdominalMm: medidas.abdominalMm || ultima.abdominalMm,
    };
    baseRef.current = next;
    setMedidas(next);
  };

  /** Hay cambios si algún campo (sin espacios) difiere de la base con la que se abrió. */
  const hayCambiosMedidas = (Object.keys(medidas) as ClaveMedidaFormularioCheckin[]).some(
    (campo) => medidas[campo].trim() !== baseRef.current[campo].trim()
  );

  /** Descarta lo escrito: vuelve a los valores iniciales y los fija como nueva base. */
  const descartarMedidas = () => {
    const iniciales = medidasIniciales(isDemoMode);
    baseRef.current = iniciales;
    setMedidas(iniciales);
  };

  return {
    medidas,
    actualizarMedida,
    erroresMedidas,
    intentoEnvio,
    setIntentoEnvio,
    precargarUltimaMedicion,
    hayCambiosMedidas,
    descartarMedidas,
  };
}
