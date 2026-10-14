import { BadRequestException } from '@nestjs/common';
import { MENSAJE_ALUMNO_NO_ENCONTRADO } from '../../../common/mensajes-acceso';
import { parsearContrato } from '../../../common/errores/parsear-contrato';
import { AsignarSuscripcionSchema, UUID_REGEX } from '@guachafit/shared';
import type { FinanzasService } from '../finanzas.service';
import { resolverEntrenadorId, type UsuarioActor } from './contexto-actor';

/**
 * Lógica de transporte de las rutas de suscripciones: valida el cliente y el cuerpo,
 * resuelve el actor y delega en el servicio.
 */
export function obtenerSuscripcionControlador(
  servicio: FinanzasService,
  usuario: UsuarioActor,
  clienteId: string,
) {
  if (!UUID_REGEX.test(clienteId)) {
    throw new BadRequestException(MENSAJE_ALUMNO_NO_ENCONTRADO);
  }
  const entrenadorId = resolverEntrenadorId(usuario);
  return servicio.obtenerSuscripcion(entrenadorId, clienteId);
}

export function asignarSuscripcionControlador(
  servicio: FinanzasService,
  usuario: UsuarioActor,
  clienteId: string,
  body: unknown,
) {
  if (!UUID_REGEX.test(clienteId)) {
    throw new BadRequestException(MENSAJE_ALUMNO_NO_ENCONTRADO);
  }
  const dto = parsearContrato(AsignarSuscripcionSchema, body);
  const entrenadorId = resolverEntrenadorId(usuario);
  return servicio.asignarSuscripcion(entrenadorId, clienteId, dto);
}

export function quitarSuscripcionControlador(
  servicio: FinanzasService,
  usuario: UsuarioActor,
  clienteId: string,
) {
  if (!UUID_REGEX.test(clienteId)) {
    throw new BadRequestException(MENSAJE_ALUMNO_NO_ENCONTRADO);
  }
  const entrenadorId = resolverEntrenadorId(usuario);
  return servicio.quitarSuscripcion(entrenadorId, clienteId);
}
