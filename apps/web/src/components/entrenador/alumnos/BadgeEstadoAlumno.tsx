/**
 * Módulo `alumnos` (fase B, prompt 53) · badge de estado de activación del alumno.
 *
 * Extraído de `pages/entrenador/AlumnosPage.tsx:996-1007` (celda "Estado" de la tabla).
 * Clasificación: REUTILIZABLE (R3-3 entidad en ≥2 vistas + R3-1: mismo badge
 * estado/`Archivado` en `AlumnoDetallePage.tsx:2283-2303`; `Badge` local duplicado en
 * `TablaCartera.tsx:72-82` y `TablaEntrenadoresAdmin.tsx:51-60`; guía 48 fila 13).
 *
 * Usa `ui/BadgeEstado` (consolidación 48 fila 4): archivado → `neutral`, activo →
 * `success`, pausado → `warning`. El texto viene de `etiquetaEstadoActivacion`
 * (lib existente, sin redefinir).
 *
 * §6: 11px mínimo, peso 700, tokens con variante dark (vía `BadgeEstado`).
 * Presentacional: solo props, sin `useQuery` ni `api-client` (R1).
 */

import { EstadoAlumno, type PerfilAlumnoDetalleDTO } from '@guachafit/shared';
import { etiquetaEstadoActivacion } from '../../../lib/etiquetas-dominio';
import { BadgeEstado } from '../../ui/BadgeEstado';

export interface BadgeEstadoAlumnoProps {
  estadoActivacion: PerfilAlumnoDetalleDTO['estadoActivacion'];
  archivado: boolean;
}

export function BadgeEstadoAlumno({ estadoActivacion, archivado }: BadgeEstadoAlumnoProps) {
  if (archivado) return <BadgeEstado tono="neutral">Archivado</BadgeEstado>;
  return (
    <BadgeEstado tono={estadoActivacion === EstadoAlumno.ACTIVO ? 'success' : 'warning'}>
      {etiquetaEstadoActivacion(estadoActivacion)}
    </BadgeEstado>
  );
}
