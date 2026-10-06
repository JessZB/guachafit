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
/**
 * Textos que acompañan a `CODIGO_CHECKIN_FUERA_DE_VENTANA` (LOTE API-N2: la hora que cuenta es la
 * de la zona horaria del perfil). El de horario conserva "18:00": la web publicada anterior al
 * código estable lo reconoce por ese texto.
 */
export const MENSAJE_CHECKIN_FUERA_DE_VENTANA =
  'Puedes enviar el reporte de hoy entre las 18:00 y las 23:59 (hora de la zona horaria de tu perfil). Fuera de ese horario el día queda como «No reportado».';
export const MENSAJE_CHECKIN_DIA_CAMBIADO =
  'El día de tu reporte ya cambió según la zona horaria de tu perfil. Actualiza la pantalla para ver el reporte de hoy.';

/**
 * Alumno pausado, suspendido o archivado intenta una acción bloqueada por su ciclo de
 * vida (RF-012). La web muestra la pantalla informativa del bloqueo en vez de un error genérico.
 */
export const CODIGO_ALUMNO_BLOQUEADO = 'ALUMNO_BLOQUEADO';

/**
 * LOTE API-N1: el alumno ya tiene el reporte nutricional de ese día (RF-002, unicidad diaria).
 * Lo emite tanto la verificación previa como la violación del índice único en un doble envío
 * concurrente. La web lo usa para dar por sincronizado un reintento cuyo éxito se perdió.
 */
export const CODIGO_CHECKIN_YA_REGISTRADO = 'CHECKIN_YA_REGISTRADO';
/** Texto que acompaña a `CODIGO_CHECKIN_YA_REGISTRADO` (API y web usan este mismo texto). */
export const MENSAJE_CHECKIN_YA_REGISTRADO = 'Ya registraste tu reporte de hoy.';

/**
 * LOTE API-N2 (RF-002, decisión del dueño 2026-10-05): el reporte se capturó dentro de la
 * ventana pero llegó al servidor después de las 12:00 del día siguiente (zona del perfil). Es un
 * rechazo definitivo: la web lo muestra con este texto y no lo reintenta.
 */
export const CODIGO_CHECKIN_FUERA_DE_PLAZO = 'CHECKIN_FUERA_DE_PLAZO';
/** Texto que acompaña a `CODIGO_CHECKIN_FUERA_DE_PLAZO` (API y web usan este mismo texto). */
export const MENSAJE_CHECKIN_FUERA_DE_PLAZO =
  'Este reporte llegó después del mediodía del día siguiente, así que ya no se puede registrar. El día quedó como «No reportado».';
