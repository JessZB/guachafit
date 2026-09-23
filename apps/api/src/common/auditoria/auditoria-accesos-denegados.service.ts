/**
 * RF-003 Escenario 3 (WU "RF-003 · cierre"): log de auditoría de mutaciones no autorizadas.
 *
 * Los guards (`RolesGuard` y `AlumnoHabilitadoGuard`) lo invocan al denegar con 403. Es
 * BEST-EFFORT: `registrar()` captura cualquier fallo (BD caída, tabla ausente) y jamás altera la
 * respuesta 403 ni lanza hacia el guard. Solo persiste metadatos mínimos de la petición — sin
 * payloads, cuerpos ni PII adicional.
 */
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { DRIZZLE_DB } from '../../database/database.module';
import { Database, auditoriaAccesosDenegados } from '@guachafit/database';

/** Datos mínimos de un intento de acceso denegado (columnas de `auditoria_accesos_denegados`). */
export interface RegistroAccesoDenegado {
  usuarioId?: string | null;
  rol?: string | null;
  ruta: string;
  metodo: string;
  motivo: string;
}

/**
 * Ruta/método mínimos de la petición HTTP. La ruta prefiere el patrón del router (sin valores) y
 * descarta el query string: un parámetro de consulta podría arrastrar PII innecesaria al log.
 */
export function contextoPeticionHttp(request: any): { ruta: string; metodo: string } {
  const rutaCruda = request?.route?.path ?? request?.url ?? request?.originalUrl;
  const ruta =
    typeof rutaCruda === 'string' && rutaCruda.length > 0
      ? rutaCruda.split('?')[0]
      : 'desconocida';
  const metodo =
    typeof request?.method === 'string' && request.method.length > 0
      ? request.method
      : 'SIN_METODO';
  return { ruta: ruta.slice(0, 255), metodo: metodo.slice(0, 10) };
}

@Injectable()
export class AuditoriaAccesosDenegadosService {
  private readonly logger = new Logger(AuditoriaAccesosDenegadosService.name);

  constructor(
    // `@Optional()`: los tests construyen los guards directamente y no siempre pasan auditoría; en
    // producción `DatabaseModule` (global) siempre provee la conexión.
    @Optional() @Inject(DRIZZLE_DB) private readonly db?: Database
  ) {}

  /** Persiste el intento denegado. NUNCA lanza: un fallo de auditoría no cambia la respuesta 403. */
  async registrar(datos: RegistroAccesoDenegado): Promise<void> {
    if (!this.db) return;
    try {
      await this.db.insert(auditoriaAccesosDenegados).values({
        usuarioId: datos.usuarioId ?? null,
        rol: datos.rol ?? null,
        ruta: datos.ruta,
        metodo: datos.metodo,
        motivo: datos.motivo,
        fechaUtc: new Date(),
      });
    } catch (error) {
      this.logger.warn(
        `No se pudo registrar el acceso denegado (${datos.metodo} ${datos.ruta}): ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}
