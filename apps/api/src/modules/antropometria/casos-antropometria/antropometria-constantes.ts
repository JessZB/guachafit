/**
 * Constantes del contrato público del módulo de antropometría.
 * La fachada las importa (y las reexporta para los specs) y también los casos de uso.
 * Movido sin cambios desde `antropometria.service.ts` (P1: los specs importan dos
 * de ellas desde la ruta del servicio).
 */

/** RF-003 Escenario 2 (cierre): aviso al coach del check-in remoto pendiente de validación. */
export const TIPO_EVENTO_CHECKIN_RECIBIDO = 'CHECKIN_ANTROPOMETRICO_RECIBIDO' as const;

/** Ruta real de la cola de revisión antropométrica del coach (router web). */
export const LINK_COLA_ANTROPOMETRIA_COACH = '/coach/antropometria';
