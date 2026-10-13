/**
 * Módulo `alumnos` (fase B, prompt 53) · estado vacío honesto del directorio.
 *
 * Extraído de `pages/entrenador/AlumnosPage.tsx:790-823` (vacío dual: "sin resultados"
 * con filtros vs "cartera vacía" sin filtros).
 * Clasificación: REUTILIZABLE (R3-2 + R3-1: bloque `border-dashed` con icono+título+CTA
 * en `TablaCartera.tsx:256-265`, `PlantillasPage.tsx:636-652`,
 * `MonitorAdherenciaPage.tsx:688-725`, `AntropometriaPage.tsx:319`,
 * `ConciliacionPage.tsx:416`, `PagosPage.tsx:590`; guía 48 M3).
 *
 * Usa `ui/EstadoVacio` (consolidación 48 fila 3; acción vía `BotonTactil` 44px).
 * R5: conserva idénticos los textos que consultan los specs ("Sin resultados",
 * "Ningún alumno coincide con la búsqueda o los filtros aplicados.",
 * "Limpiar filtros", "Todavía no hay alumnos en tu cartera..."). La rama sin filtros
 * parte el mensaje vigente en título + detalle sin perder ni una palabra.
 *
 * Presentacional: solo props, sin `useQuery` ni `api-client` (R1).
 */

import { Search, Users } from 'lucide-react';
import { triggerHaptic } from '../../../lib/haptics';
import { EstadoVacio } from '../../ui/EstadoVacio';

export interface EstadoVacioDirectorioProps {
  hayFiltrosActivos: boolean;
  onLimpiarFiltros: () => void;
}

export function EstadoVacioDirectorio({
  hayFiltrosActivos,
  onLimpiarFiltros,
}: EstadoVacioDirectorioProps) {
  if (hayFiltrosActivos) {
    return (
      <EstadoVacio
        titulo="Sin resultados"
        detalle="Ningún alumno coincide con la búsqueda o los filtros aplicados."
        icono={Search}
        accion={{
          texto: 'Limpiar filtros',
          onAccion: () => {
            triggerHaptic('light');
            onLimpiarFiltros();
          },
        }}
      />
    );
  }

  return (
    <EstadoVacio
      titulo="Todavía no hay alumnos en tu cartera"
      detalle="Inscribe al primero o comparte tu enlace de registro."
      icono={Users}
    />
  );
}
