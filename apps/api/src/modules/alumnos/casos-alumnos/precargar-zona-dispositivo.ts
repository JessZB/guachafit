import { Logger } from '@nestjs/common';
import { and, eq, perfilesAlumno } from '@guachafit/database';
import { esZonaHorariaIanaValida } from '@guachafit/shared';
import type { ContextoAlumnos } from './contexto-alumnos';

const logger = new Logger('PrecargarZonaDispositivo');

/**
 * ADR-025 (ZH-1): precarga ÚNICA de la zona horaria del dispositivo en el perfil del alumno.
 * Una sola sentencia atómica: solo escribe si el perfil aún no tiene la zona definida
 * (`zona_horaria_definida = false`), así dos accesos simultáneos no se pisan y, una vez definida,
 * ningún dispositivo la vuelve a cambiar. Corre con el contexto self (RLS `current_usuario_id`).
 *
 * Devuelve la zona guardada o `null` cuando no se escribió nada (zona inválida, perfil ya definido,
 * sin perfil o fallo de la base). Una zona inválida nunca llega a la base y jamás debe bloquear el acceso.
 * Un fallo de la escritura se registra como advertencia y se ignora: la precarga es una conveniencia
 * y nunca debe bloquear el inicio de sesión ni la activación de la cuenta.
 */
export async function precargarZonaDispositivo(
  ctx: Pick<ContextoAlumnos, 'withTenant'>,
  usuarioId: string,
  zonaDispositivo: string
): Promise<string | null> {
  if (!esZonaHorariaIanaValida(zonaDispositivo)) return null;

  try {
    const [fila] = await ctx.withTenant({ usuarioId }, (tx) =>
      tx
        .update(perfilesAlumno)
        .set({ zonaHoraria: zonaDispositivo, zonaHorariaDefinida: true, updatedAtUtc: new Date() })
        .where(and(eq(perfilesAlumno.usuarioId, usuarioId), eq(perfilesAlumno.zonaHorariaDefinida, false)))
        .returning({ zonaHoraria: perfilesAlumno.zonaHoraria })
    );

    return fila?.zonaHoraria ?? null;
  } catch (error) {
    const motivo = error instanceof Error ? error.message : String(error);
    logger.warn(`No se pudo precargar la zona del dispositivo del usuario ${usuarioId}: ${motivo}`);
    return null;
  }
}
