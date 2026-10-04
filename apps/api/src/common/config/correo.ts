/**
 * Configuración del correo transaccional (proveedor Brevo por su API HTTP, ADR-018).
 *
 * Variables de entorno (no hay `.env.example` que las liste; quedan documentadas aquí):
 * - `BREVO_API_KEY`: clave de la API de Brevo (cabecera `api-key`). Sin ella el worker de correo
 *   queda en modo SIMULADO (solo escribe en el log). En producción su ausencia se registra como
 *   error al arrancar, sin bloquear el arranque.
 * - `EMAIL_REMITENTE`: correo remitente; debe ser un remitente o dominio verificado en Brevo.
 *   Con clave pero sin remitente el worker también queda en modo simulado (Brevo rechazaría
 *   todos los envíos con 400).
 * - `EMAIL_REMITENTE_NOMBRE`: nombre visible del remitente (por defecto "GUACHAFIT").
 * - `APP_URL`: URL pública de la web (p. ej. `https://app.guachafit.com`) para armar los enlaces
 *   de los correos (`/activar`, `/restablecer`, enlaces de notificaciones). Si falta se usa el
 *   primer origen de `CORS_ORIGINS` y, en último caso, `http://localhost:3000`. En producción su
 *   ausencia se registra como error.
 */

type EntornoCorreo = Partial<
  Record<
    | 'NODE_ENV'
    | 'BREVO_API_KEY'
    | 'EMAIL_REMITENTE'
    | 'EMAIL_REMITENTE_NOMBRE'
    | 'APP_URL'
    | 'CORS_ORIGINS',
    string | undefined
  >
>;

export const NOMBRE_REMITENTE_POR_DEFECTO = 'GUACHAFIT';
export const URL_WEB_POR_DEFECTO = 'http://localhost:3000';

export interface ConfigCorreo {
  modo: 'brevo' | 'simulado';
  apiKey: string | null;
  remitente: { email: string; nombre: string };
  /** Problemas de configuración para el log de arranque (sin secretos). */
  avisos: string[];
}

function limpio(valor: string | undefined): string {
  return (valor ?? '').trim();
}

export function leerConfigCorreo(entorno: EntornoCorreo = process.env): ConfigCorreo {
  const apiKey = limpio(entorno.BREVO_API_KEY);
  const email = limpio(entorno.EMAIL_REMITENTE);
  const nombre = limpio(entorno.EMAIL_REMITENTE_NOMBRE) || NOMBRE_REMITENTE_POR_DEFECTO;
  const avisos: string[] = [];

  if (!apiKey) {
    avisos.push(
      'Falta BREVO_API_KEY: los correos (bienvenidas, recuperación de contraseña y avisos) NO se envían; el worker solo los registra en el log.'
    );
    return { modo: 'simulado', apiKey: null, remitente: { email, nombre }, avisos };
  }
  if (!email) {
    avisos.push(
      'Hay BREVO_API_KEY pero falta EMAIL_REMITENTE (remitente verificado en Brevo): los correos NO se envían hasta configurarlo.'
    );
    return { modo: 'simulado', apiKey: null, remitente: { email, nombre }, avisos };
  }
  return { modo: 'brevo', apiKey, remitente: { email, nombre }, avisos };
}

/** URL pública de la web sin barra final (base de los enlaces de los correos). */
export function obtenerUrlWeb(entorno: EntornoCorreo = process.env): string {
  const appUrl = limpio(entorno.APP_URL);
  const primerOrigenCors = limpio(entorno.CORS_ORIGINS?.split(',')[0]);
  return (appUrl || primerOrigenCors || URL_WEB_POR_DEFECTO).replace(/\/+$/, '');
}

/** `true` si `APP_URL` está definida (en producción es obligatoria para enlaces correctos). */
export function tieneUrlWebConfigurada(entorno: EntornoCorreo = process.env): boolean {
  return limpio(entorno.APP_URL).length > 0;
}
