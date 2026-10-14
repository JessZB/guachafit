import { NotFoundException } from '@nestjs/common';
import { parsearContrato } from '../../../common/errores/parsear-contrato';
import {
  AnularCuotaSchema,
  CobroDirectoSchema,
  ReportarPagoSchema,
  Rol,
  UUID_REGEX,
} from '@guachafit/shared';
import type { FinanzasService } from '../finanzas.service';
import { resolverEntrenadorId, type UsuarioActor } from './contexto-actor';

/**
 * Lógica de transporte de las rutas de cuotas: valida identificador y cuerpo,
 * resuelve el actor y delega en el servicio.
 */
export function obtenerCuotaControlador(
  servicio: FinanzasService,
  usuario: UsuarioActor & { sub: string; rol: Rol; entrenadorId?: string },
  cuotaId: string,
) {
  return servicio.obtenerCuotaPorId(cuotaId, usuario.sub, usuario.rol, usuario.entrenadorId);
}

export function reportarPagoControlador(
  servicio: FinanzasService,
  usuario: UsuarioActor & { sub: string },
  cuotaId: string,
  idempotencyHeader: string | undefined,
  body: unknown,
) {
  const dto = parsearContrato(ReportarPagoSchema, body);
  const alumnoUserId = usuario.sub;
  return servicio.reportarPago(cuotaId, alumnoUserId, dto, idempotencyHeader);
}

export function cobroDirectoControlador(
  servicio: FinanzasService,
  usuario: UsuarioActor,
  cuotaId: string,
  body: unknown,
) {
  const dto = parsearContrato(CobroDirectoSchema, body);
  const entrenadorId = resolverEntrenadorId(usuario);
  return servicio.cobroDirecto(cuotaId, entrenadorId, dto);
}

export function anularCuotaControlador(
  servicio: FinanzasService,
  usuario: UsuarioActor,
  cuotaId: string,
  body: unknown,
) {
  if (!UUID_REGEX.test(cuotaId)) {
    throw new NotFoundException('No encontramos esa cuota. Actualiza la pantalla.');
  }
  const dto = parsearContrato(AnularCuotaSchema, body);
  const entrenadorId = resolverEntrenadorId(usuario);
  return servicio.anularCuota(cuotaId, entrenadorId, dto);
}
