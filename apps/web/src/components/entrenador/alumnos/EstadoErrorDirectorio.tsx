/**
 * Módulo `alumnos` (fase B, prompt 53) · error de carga del directorio con reintento.
 *
 * Extraído de `pages/entrenador/AlumnosPage.tsx:764-777`.
 * Clasificación: REUTILIZABLE (R3-2 primitiva sin dominio + R3-1: bloque error +
 * "Reintentar" en `CarteraPage.tsx:424-434`, `DashboardPage.tsx:141-157`,
 * `MonitorAdherenciaPage.tsx:671-686`, `PlantillasPage.tsx:625-631`; guía 48 M3).
 *
 * Usa `ui/EstadoError` (consolidación 48 fila 2): impone `role="alert"` y reintento
 * de 44px vía `BotonTactil`. Divergencia deliberada documentada en el 48: el átomo
 * pinta un título ("No pudimos cargar la información") que la copia no tenía; el
 * mensaje de error viaja intacto como `mensaje` (R5: los specs consultan por texto).
 *
 * Presentacional: solo props, sin `useQuery` ni `api-client` (R1).
 */

import { EstadoError } from '../../ui/EstadoError';

export interface EstadoErrorDirectorioProps {
  mensaje: string;
  onReintentar: () => void;
}

export function EstadoErrorDirectorio({ mensaje, onReintentar }: EstadoErrorDirectorioProps) {
  return <EstadoError mensaje={mensaje} onReintentar={onReintentar} />;
}
