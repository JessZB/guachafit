import { BadRequestException } from '@nestjs/common';
import { MENSAJE_ALUMNO_NO_ENCONTRADO } from '../../../common/mensajes-acceso';
import { parsearContrato } from '../../../common/errores/parsear-contrato';
import {
  ActualizarPlanMembresiaSchema,
  CrearOverridePlanSchema,
  CrearPlanMembresiaSchema,
  UUID_REGEX,
} from '@guachafit/shared';
import type { FinanzasService } from '../finanzas.service';
import { resolverEntrenadorId, type UsuarioActor } from './contexto-actor';

/**
 * Lógica de transporte de las rutas del catálogo comercial: resuelve el actor,
 * valida identificadores y cuerpo, y delega en el servicio.
 */
export function crearPlanControlador(
  servicio: FinanzasService,
  usuario: UsuarioActor,
  body: unknown,
) {
  const dto = parsearContrato(CrearPlanMembresiaSchema, body);
  const entrenadorId = resolverEntrenadorId(usuario);
  return servicio.crearPlan(entrenadorId, dto);
}

export function listarPlanesControlador(servicio: FinanzasService, usuario: UsuarioActor) {
  const entrenadorId = resolverEntrenadorId(usuario);
  return servicio.listarPlanesPorEntrenador(entrenadorId);
}

export function actualizarPlanControlador(
  servicio: FinanzasService,
  usuario: UsuarioActor,
  planId: string,
  body: unknown,
) {
  if (!UUID_REGEX.test(planId)) {
    throw new BadRequestException('No encontramos ese plan. Puede que se haya eliminado.');
  }
  const dto = parsearContrato(ActualizarPlanMembresiaSchema, body);
  const entrenadorId = resolverEntrenadorId(usuario);
  return servicio.actualizarPlan(entrenadorId, planId, dto);
}

export function crearOverrideControlador(
  servicio: FinanzasService,
  usuario: UsuarioActor,
  body: unknown,
) {
  const dto = parsearContrato(CrearOverridePlanSchema, body);
  const entrenadorId = resolverEntrenadorId(usuario);
  return servicio.crearOverride(entrenadorId, dto);
}

export function listarOverridesControlador(
  servicio: FinanzasService,
  usuario: UsuarioActor,
  clienteId?: string,
) {
  if (clienteId !== undefined && !UUID_REGEX.test(clienteId)) {
    throw new BadRequestException(MENSAJE_ALUMNO_NO_ENCONTRADO);
  }
  const entrenadorId = resolverEntrenadorId(usuario);
  return servicio.listarOverrides(entrenadorId, clienteId || undefined);
}

export function eliminarOverrideControlador(
  servicio: FinanzasService,
  usuario: UsuarioActor,
  overrideId: string,
) {
  if (!UUID_REGEX.test(overrideId)) {
    throw new BadRequestException('No encontramos ese precio especial. Puede que se haya eliminado.');
  }
  const entrenadorId = resolverEntrenadorId(usuario);
  return servicio.eliminarOverride(entrenadorId, overrideId);
}
