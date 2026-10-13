/**
 * Public contract constants of the antropometria module.
 * Imported by the facade (re-exported for specs) and by the use cases.
 * Moved verbatim from `antropometria.service.ts` (P1: the specs import two
 * of them from the service path).
 */

/** RF-003 Escenario 2 (cierre): aviso al coach del check-in remoto pendiente de validación. */
export const TIPO_EVENTO_CHECKIN_RECIBIDO = 'CHECKIN_ANTROPOMETRICO_RECIBIDO' as const;

/** Ruta real de la cola de revisión antropométrica del coach (router web). */
export const LINK_COLA_ANTROPOMETRIA_COACH = '/coach/antropometria';
