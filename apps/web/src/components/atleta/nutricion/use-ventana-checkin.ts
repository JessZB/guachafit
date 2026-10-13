/**
 * Módulo 6 · Nutrición: reloj del dispositivo y ventana RN-02 del reporte.
 *
 * Extraído de `pages/atleta/NutricionPage.tsx` (SL1, fase B) con el MISMO mecanismo
 * (R9: `useState`/`useEffect`/`useMemo`, sin TanStack). §6: sin cambios visuales; este hook
 * no rinde nada.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  evaluarVentanaCheckinLocal,
  zonaPerfilEfectiva,
  type ResultadoVentanaCheckinLocal,
} from '../../../lib/nutricion-checkin';
import { obtenerTimezoneDispositivo } from '../../../lib/date-format';

export interface VentanaCheckin {
  ahora: Date;
  zonaPerfil: string;
  ventana: ResultadoVentanaCheckinLocal;
  hoyLocal: string;
  timezoneCliente: string;
  puedeReportar: boolean;
}

export function useVentanaCheckin(zonaHorariaPerfil: string | null | undefined, isDemoMode: boolean): VentanaCheckin {
  // Reloj del dispositivo: la ventana RN-02 y el día local se reevalúan cada minuto para que un
  // cambio de hora no deje el formulario en un estado mentiroso.
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const intervalo = window.setInterval(() => setAhora(new Date()), 60_000);
    return () => window.clearInterval(intervalo);
  }, []);

  // ADR-019: el día y la ventana se cuentan con la zona horaria del PERFIL, resuelta igual que en el
  // servidor (sin zona válida, la zona por defecto), para que pantalla, texto y API coincidan.
  const zonaPerfil = zonaPerfilEfectiva(zonaHorariaPerfil);
  const ventana = evaluarVentanaCheckinLocal(ahora, zonaPerfil);
  const hoyLocal = ventana.fechaLocalHoy;
  const timezoneCliente = useMemo(() => obtenerTimezoneDispositivo(), []);
  // En modo demo la simulación no se bloquea por horario (el banner demo declara el contexto);
  // en sesión real, fuera de ventana no se envía ni se encola nada.
  const puedeReportar = isDemoMode || ventana.permitido;

  return { ahora, zonaPerfil, ventana, hoyLocal, timezoneCliente, puedeReportar };
}
