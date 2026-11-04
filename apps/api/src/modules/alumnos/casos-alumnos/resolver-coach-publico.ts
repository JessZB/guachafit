import type { CoachPublicoDTO } from '@guachafit/shared';
import {
  buscarCoachPublico,
  coachAdmiteCaptacion,
  enlaceNoDisponible,
  leerCupoOcupado,
} from './captacion-publica';
import type { ContextoAlumnos } from './contexto-alumnos';

/**
 * Resolución Pública del `coach_code` para el Deep Link de captación (RF-011, RN-06/RN-07.1).
 *
 * Solo devuelve identidad comercial del coach cuando el código existe Y el coach está operable
 * (cuenta habilitada y licencia vigente), la captación está activa (D17) y queda cupo. Un código
 * inexistente o rotado, uno deshabilitado, uno con licencia suspendida, una captación pausada y
 * un cupo lleno responden igual (404): nunca se filtra qué códigos existen ni cuál de los
 * interruptores falló. No expone datos sensibles (teléfono, capacidad, cartera, etc.).
 * Orden: código → cuenta/licencia → captación → cupo.
 */
export async function resolverCoachPublico(
  ctx: Pick<ContextoAlumnos, 'db' | 'withTenant'>,
  code: string
): Promise<CoachPublicoDTO> {
  const codigoNormalizado = code.trim().toUpperCase();

  const coach = await buscarCoachPublico(ctx.db, codigoNormalizado);

  if (!coach || !coachAdmiteCaptacion(coach)) {
    throw enlaceNoDisponible();
  }

  const cupoOcupado = await ctx.withTenant({ entrenadorId: coach.usuarioId }, (tx) =>
    leerCupoOcupado(tx, coach.usuarioId)
  );
  if (cupoOcupado >= coach.capacidadMaxima) {
    throw enlaceNoDisponible();
  }

  return {
    coachCode: coach.coachCode,
    nombre: `${coach.nombres} ${coach.apellidos}`.trim(),
    nombreComercial: coach.nombreComercial,
  };
}
