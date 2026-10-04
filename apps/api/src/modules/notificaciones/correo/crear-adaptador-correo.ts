/**
 * Elige el adaptador de correo según la configuración (ver `common/config/correo.ts`).
 *
 * Se ejecuta al arrancar (factory del `NotificacionesModule`): los problemas de configuración se
 * registran en ese momento. En producción son `logger.error` (sin bloquear el arranque: el resto
 * del API sigue funcionando y los correos quedan en el log).
 */
import { Logger } from '@nestjs/common';
import {
  leerConfigCorreo,
  obtenerUrlWeb,
  tieneUrlWebConfigurada,
} from '../../../common/config/correo';
import { AdaptadorCorreo } from './adaptador-correo';
import { AdaptadorCorreoBrevo } from './adaptador-correo-brevo';
import { AdaptadorCorreoSimulado } from './adaptador-correo-simulado';

type EntornoCrearAdaptador = Parameters<typeof leerConfigCorreo>[0] &
  Partial<Record<'NODE_ENV', string | undefined>>;

type RegistroArranque = Pick<Logger, 'error' | 'warn' | 'log'>;

export function crearAdaptadorCorreo(
  entorno: EntornoCrearAdaptador = process.env,
  logger: RegistroArranque = new Logger('CorreoTransaccional')
): AdaptadorCorreo {
  const produccion = entorno?.NODE_ENV === 'production';
  const config = leerConfigCorreo(entorno);

  for (const aviso of config.avisos) {
    if (produccion) logger.error(`[Configuración] ${aviso}`);
    else logger.warn(`[Configuración] ${aviso}`);
  }

  if (produccion && !tieneUrlWebConfigurada(entorno)) {
    logger.error(
      `[Configuración] Falta APP_URL (URL pública de la web): los enlaces de los correos usarán ${obtenerUrlWeb(entorno)}.`
    );
  }

  if (config.modo === 'brevo' && config.apiKey) {
    logger.log(`Correo transaccional con Brevo (remitente ${config.remitente.email}).`);
    return new AdaptadorCorreoBrevo({ apiKey: config.apiKey, remitente: config.remitente });
  }
  return new AdaptadorCorreoSimulado();
}
