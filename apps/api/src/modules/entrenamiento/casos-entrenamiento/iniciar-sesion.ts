import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { eq } from '@guachafit/database';
import { sesionesEntrenamiento } from '@guachafit/database';
import { EstadoSesion, IniciarSesionSchema, Rol } from '@guachafit/shared';
import type { IniciarSesionDTO, SesionEntrenamientoDetalleDTO } from '@guachafit/shared';
import { parsearContrato } from '../../../common/errores/parsear-contrato';
import type { ContextoEntrenamiento } from './contexto-entrenamiento';
import { MENSAJE_HORA_INVALIDA, MENSAJE_SESION_NO_ENCONTRADA } from './contexto-entrenamiento';
import { obtenerSesionPorId } from './obtener-sesion-por-id';

// ---------------------------------------------------------------------------
// 4. INICIO DE SESIÓN (ACCIÓN EXPLÍCITA, RN-04, RN-05, ADR-002)
// (Movido sin cambios desde `EntrenamientoService.ejecutarIniciarSesion`.
// La envoltura idempotente RNF-002 §4 queda en la fachada.)
// ---------------------------------------------------------------------------

/**
 * Iniciar sesión conscientemente: transiciona de 'planificada' a 'en_progreso'.
 * Captura fechaInicioUtc con 'Z' y timezoneCliente.
 */
export async function ejecutarIniciarSesion(
  ctx: ContextoEntrenamiento,
  sesionId: string,
  alumnoId: string,
  input: IniciarSesionDTO
): Promise<SesionEntrenamientoDetalleDTO> {
  const { db } = ctx;
  const validado = parsearContrato(IniciarSesionSchema, input);

  const [sesion] = await db
    .select()
    .from(sesionesEntrenamiento)
    .where(eq(sesionesEntrenamiento.id, sesionId))
    .limit(1);

  if (!sesion) {
    throw new NotFoundException(MENSAJE_SESION_NO_ENCONTRADA);
  }

  if (sesion.alumnoId !== alumnoId) {
    throw new ForbiddenException('No tienes autorización para iniciar esta sesión.');
  }

  if (sesion.estado !== EstadoSesion.PLANIFICADA) {
    throw new BadRequestException('Este entrenamiento ya fue iniciado o terminado.');
  }

  const fechaInicioUtc = validado.fechaInicioUtc ?? new Date().toISOString();
  if (!fechaInicioUtc.endsWith('Z')) {
    throw new BadRequestException(MENSAJE_HORA_INVALIDA);
  }

  await db
    .update(sesionesEntrenamiento)
    .set({
      estado: EstadoSesion.EN_PROGRESO,
      fechaInicioUtc: new Date(fechaInicioUtc),
      timezoneCliente: validado.timezoneCliente,
      updatedAtUtc: new Date(),
    })
    .where(eq(sesionesEntrenamiento.id, sesionId));

  return obtenerSesionPorId(ctx, sesionId, alumnoId, Rol.ALUMNO);
}
