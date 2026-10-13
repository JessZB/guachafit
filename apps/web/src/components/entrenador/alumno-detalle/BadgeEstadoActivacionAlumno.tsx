/**
 * Badge de estado de activación del alumno (cabecera de la ficha).
 *
 * CANDIDATO a `common/` sobre `ui/BadgeEstado` (fase D, matriz 48 fila 13): copia verificable en
 * `pages/entrenador/AlumnosPage.tsx:996-1007` (R3.3). Se conserva el markup exacto porque la
 * sustitución no es mecánica (ramas archivado/activo/no-activo + `etiquetaEstadoActivacion`).
 * §6: 11px mínimo, pesos ≤ 700, tokens con variante oscura.
 */
import { EstadoAlumno } from '@guachafit/shared';
import { etiquetaEstadoActivacion } from '../../../lib/etiquetas-dominio';

interface BadgeEstadoActivacionAlumnoProps {
  estadoActivacion: EstadoAlumno;
  archivado: boolean;
}

export function BadgeEstadoActivacionAlumno({
  estadoActivacion,
  archivado,
}: BadgeEstadoActivacionAlumnoProps) {
  return (
    <span
      className={`px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase border flex items-center gap-1.5 shadow-2xs ${
        archivado
          ? 'bg-secondary text-muted-foreground border-border/80'
          : estadoActivacion === EstadoAlumno.ACTIVO
          ? 'bg-primary/15 text-primary border-primary/30'
          : 'bg-warning/15 text-warning border-warning/30'
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          archivado
            ? 'bg-muted-foreground'
            : estadoActivacion === EstadoAlumno.ACTIVO
            ? 'bg-primary'
            : 'bg-warning'
        }`}
      />
      {archivado ? 'Archivado' : etiquetaEstadoActivacion(estadoActivacion)}
    </span>
  );
}
