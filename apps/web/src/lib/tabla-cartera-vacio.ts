/**
 * WU-I (RF-009 §4.B): textos honestos del estado vacío de la tabla de cartera.
 *
 * Lógica pura extraída de `components/entrenador/TablaCartera.tsx` (prompt 85,
 * Ola 3): cada pestaña declara su vacío propio y la búsqueda activa lo sustituye
 * por "sin resultados". Sin JSX ni datos (R1).
 */
import type { PestanaCarteraDTO } from '@guachafit/shared';

export interface VacioTablaCartera {
  titulo: string;
  detalle: string;
}

const VACIO_POR_PESTANA: Record<PestanaCarteraDTO, VacioTablaCartera> = {
  mora: {
    titulo: 'Sin cuotas vencidas',
    detalle: 'Ningún alumno tiene deuda vencida por ahora.',
  },
  por_vencer: {
    titulo: 'Sin vencimientos próximos',
    detalle: 'Nadie tiene una cuota por vencer en los próximos 5 días.',
  },
  revision: {
    titulo: 'Sin pagos por validar',
    detalle: 'No hay comprobantes esperando revisión en la bandeja.',
  },
  al_dia: {
    titulo: 'Sin cuotas cubiertas en el ciclo',
    detalle: 'Cuando un alumno cubra al 100% su cuota del mes aparecerá aquí.',
  },
};

const VACIO_BUSQUEDA: VacioTablaCartera = {
  titulo: 'Sin resultados',
  detalle: 'Ningún alumno coincide con la búsqueda en esta pestaña.',
};

/** Vacío a mostrar: con búsqueda activa siempre es "sin resultados". */
export function vacioTablaCartera(
  pestana: PestanaCarteraDTO,
  buscando = false,
): VacioTablaCartera {
  if (buscando) return VACIO_BUSQUEDA;
  return VACIO_POR_PESTANA[pestana];
}
