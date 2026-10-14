import { NotFoundException } from '@nestjs/common';
import { parsearContrato } from '../../../common/errores/parsear-contrato';
import {
  ConciliarTransaccionSchema,
  RevertirPagoSchema,
  UUID_REGEX,
} from '@guachafit/shared';
import type { FinanzasService } from '../finanzas.service';
import { resolverEntrenadorId, type UsuarioActor } from './contexto-actor';
import { parsearPaginacionBandeja } from './paginacion-bandeja-reglas';

/**
 * Lógica de transporte de la conciliación: pagina la bandeja, valida
 * identificador y cuerpo, resuelve el actor y delega en el servicio.
 */
export function listarBandejaConciliacionControlador(
  servicio: FinanzasService,
  usuario: UsuarioActor,
  limit?: string,
  offset?: string,
) {
  const entrenadorId = resolverEntrenadorId(usuario);
  const { limite, desplazamiento } = parsearPaginacionBandeja(limit, offset);
  return servicio.listarBandejaConciliacion(entrenadorId, limite, desplazamiento);
}

export function conciliarTransaccionControlador(
  servicio: FinanzasService,
  usuario: UsuarioActor,
  transaccionId: string,
  body: unknown,
) {
  const dto = parsearContrato(ConciliarTransaccionSchema, body);
  const entrenadorId = resolverEntrenadorId(usuario);
  return servicio.conciliarTransaccion(transaccionId, entrenadorId, dto);
}

export function revertirTransaccionControlador(
  servicio: FinanzasService,
  usuario: UsuarioActor,
  transaccionId: string,
  body: unknown,
) {
  if (!UUID_REGEX.test(transaccionId)) {
    throw new NotFoundException('No encontramos ese pago. Actualiza la pantalla.');
  }
  const dto = parsearContrato(RevertirPagoSchema, body);
  const entrenadorId = resolverEntrenadorId(usuario);
  return servicio.revertirTransaccion(transaccionId, entrenadorId, dto);
}
