/**
 * Badge del estado de un control antropométrico (SL2, fase B).
 *
 * De `ProgresoPage.tsx:62-69 + 1069-1073`: el mapa local tono→clases se
 * sustituye por el átomo consolidado `ui/BadgeEstado` (guía 48 §6 M5).
 * Divergencia deliberada: el átomo usa el token `danger` y suma
 * `tracking-wide`; el texto y el tono se conservan idénticos (R5).
 * Presentacional: props tipadas, sin datos (R1). §6: 11px, peso 700, AA.
 */
import { BadgeEstado } from '../../ui/BadgeEstado';
import type { TonoSemaforo } from '../../../lib/adherencia';

interface BadgeEstadoMedicionProps {
  tono: TonoSemaforo;
  texto: string;
}

export function BadgeEstadoMedicion({ tono, texto }: BadgeEstadoMedicionProps) {
  return <BadgeEstado tono={tono}>{texto}</BadgeEstado>;
}
