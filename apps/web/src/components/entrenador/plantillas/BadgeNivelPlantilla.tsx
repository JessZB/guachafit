/**
 * M8 plantillas (fase B, prompt 58) · badge del nivel objetivo de la plantilla.
 *
 * Origen: `PlantillasPage.tsx:76-84` (`CLASES_NIVEL`) + `:701-707`.
 * REUTILIZABLE (R3.3 + fila 31 de la consolidación 48: la entidad plantilla se
 * muestra en `PlantillasPage` y en `SelectorPlantillaAsignacion.tsx:511`).
 * Se queda en la carpeta del módulo por R6 (`common/` intocable en paralelo);
 * D decide la promoción. Envuelve `ui/BadgeEstado` en lugar de la copia local
 * de clases (consolidación 48 §M8).
 *
 * §6: piso exacto 11px y peso 700 heredados del átomo, tokens con variante
 * claro/oscuro, sin dominio salvo el enum compartido de `@guachafit/shared`.
 */
import { NivelObjetivoPlantilla } from '@guachafit/shared';
import { ETIQUETAS_NIVEL_PLANTILLA } from '../../../lib/plantillas-rutina';
import type { TonoSemaforo } from '../../../lib/adherencia';
import { BadgeEstado } from '../../ui/BadgeEstado';

const TONO_POR_NIVEL: Record<NivelObjetivoPlantilla, TonoSemaforo> = {
  [NivelObjetivoPlantilla.PRINCIPIANTE]: 'info',
  [NivelObjetivoPlantilla.INTERMEDIO]: 'warning',
  [NivelObjetivoPlantilla.AVANZADO]: 'danger',
};

export interface BadgeNivelPlantillaProps {
  nivel: NivelObjetivoPlantilla;
}

export function BadgeNivelPlantilla({ nivel }: BadgeNivelPlantillaProps) {
  return <BadgeEstado tono={TONO_POR_NIVEL[nivel]}>{ETIQUETAS_NIVEL_PLANTILLA[nivel]}</BadgeEstado>;
}

