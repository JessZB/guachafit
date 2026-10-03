/**
 * LOTE API-2: códigos máquina estables del cable (`code` en el cuerpo del error, campo canónico
 * RFC 7807 §1 del doc de contratos). Fuente única para el API y la web: la web clasifica ciertos
 * rechazos por estos códigos en vez de por el texto del mensaje, así el texto puede mejorar sin
 * romper la lógica del cliente. Cambiar un valor rompe a los clientes ya publicados.
 */

/** Series enviadas a una sesión que aún no se inició (la web las reactiva al iniciar). */
export const CODIGO_SESION_NO_INICIADA = 'SESION_NO_INICIADA';

/** Cierre de una sesión sin series completadas (la web abre el modal de cierre vacío). */
export const CODIGO_SESION_VACIA = 'SESION_VACIA';

/** Reporte nutricional fuera de la ventana horaria o del día local (RF-002 RN-02). */
export const CODIGO_CHECKIN_FUERA_DE_VENTANA = 'CHECKIN_FUERA_DE_VENTANA';
