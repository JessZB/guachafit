import { pluralizar } from './pluralizar';
import type { PendientesNavegacion } from './use-pendientes-navegacion';

/** Clave de caché de los pendientes de navegación; las mutaciones que los cambian la invalidan. */
export const CLAVE_PENDIENTES_NAVEGACION = 'pendientes-navegacion' as const;

/** Destino del entrenador que puede mostrar una insignia de pendientes. */
export type ClaveInsignia = 'panel' | 'seguimiento' | 'evaluaciones' | 'controlCobros' | 'pagosPorValidar';

/** Conteo visible (null = sin insignia) y texto accesible de la insignia. */
export interface InsigniaDestino {
  conteo: number | null;
  descripcion: string;
}

const SIN_INSIGNIA: InsigniaDestino = { conteo: null, descripcion: '' };

/** Insignias por destino a partir de los pendientes; sin datos ninguna insignia. */
export function insigniasPendientes(
  pendientes: PendientesNavegacion | null
): Record<ClaveInsignia, InsigniaDestino> {
  if (!pendientes) {
    return {
      panel: SIN_INSIGNIA,
      seguimiento: SIN_INSIGNIA,
      evaluaciones: SIN_INSIGNIA,
      controlCobros: SIN_INSIGNIA,
      pagosPorValidar: SIN_INSIGNIA,
    };
  }

  const { pagosPorValidar, evaluaciones, enRiesgo, enMora } = pendientes;
  const porRevisar = pagosPorValidar + evaluaciones;

  return {
    panel: { conteo: porRevisar, descripcion: `${porRevisar} por revisar` },
    seguimiento: {
      conteo: enRiesgo,
      descripcion: pluralizar(enRiesgo, 'alumno en riesgo', 'alumnos en riesgo'),
    },
    evaluaciones: { conteo: evaluaciones, descripcion: `${evaluaciones} por revisar` },
    controlCobros: { conteo: enMora, descripcion: `${enMora} en mora` },
    pagosPorValidar: { conteo: pagosPorValidar, descripcion: `${pagosPorValidar} por validar` },
  };
}
