/**
 * Badge de estado de activación del alumno (cabecera de la ficha).
 *
 * Se apoya en `ui/BadgeEstado`: archivado = neutro, activo = primario (info), resto = ámbar.
 * El punto de color es decorativo (`aria-hidden`). Candidato a `common/` (fase D, matriz 48
 * fila 13). §6: 11px mínimo, pesos ≤ 700, tokens con variante oscura.
 */
import { EstadoAlumno } from '@guachafit/shared';
import { BadgeEstado } from '../../ui/BadgeEstado';
import { etiquetaEstadoActivacion } from '../../../lib/etiquetas-dominio';
import type { TonoSemaforo } from '../../../lib/adherencia';

interface BadgeEstadoActivacionAlumnoProps {
  estadoActivacion: EstadoAlumno;
  archivado: boolean;
}

export function BadgeEstadoActivacionAlumno({
  estadoActivacion,
  archivado,
}: BadgeEstadoActivacionAlumnoProps) {
  const activo = !archivado && estadoActivacion === EstadoAlumno.ACTIVO;
  const tono: TonoSemaforo = archivado ? 'neutral' : activo ? 'info' : 'warning';
  const clasePunto = archivado ? 'bg-muted-foreground' : activo ? 'bg-primary' : 'bg-warning';

  return (
    <BadgeEstado tono={tono}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${clasePunto}`} />
      {archivado ? 'Archivado' : etiquetaEstadoActivacion(estadoActivacion)}
    </BadgeEstado>
  );
}
