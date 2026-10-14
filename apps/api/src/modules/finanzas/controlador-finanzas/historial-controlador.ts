import { BadRequestException } from '@nestjs/common';
import { MENSAJE_ALUMNO_NO_ENCONTRADO } from '../../../common/mensajes-acceso';
import { parsearContrato } from '../../../common/errores/parsear-contrato';
import { CobroDirectoInteligenteSchema, Rol, UUID_REGEX } from '@guachafit/shared';
import type { FinanzasService } from '../finanzas.service';
import {
  resolverEntrenadorId,
  resolverEntrenadorParaHistorial,
  type UsuarioActor,
} from './contexto-actor';
import { parsearPaginacionHistorial } from './paginacion-historial-reglas';

/**
 * Lógica de transporte del historial y del cobro inteligente: valida el cliente,
 * pagina la consulta, resuelve el actor y delega en el servicio.
 */
export function obtenerHistorialClienteControlador(
  servicio: FinanzasService,
  usuario: UsuarioActor & { sub: string; rol: Rol },
  clienteId: string,
  txLimit?: string,
  txOffset?: string,
) {
  if (!UUID_REGEX.test(clienteId)) {
    throw new BadRequestException(MENSAJE_ALUMNO_NO_ENCONTRADO);
  }
  const entrenadorId = resolverEntrenadorParaHistorial(usuario);

  // WU24b: un valor ausente o no numérico de `txLimit` conserva el default "todas".
  const { limiteTx, desplazamientoTx } = parsearPaginacionHistorial(txLimit, txOffset);

  return servicio.obtenerHistorialCliente(
    entrenadorId as string,
    clienteId,
    usuario.sub,
    usuario.rol,
    limiteTx,
    desplazamientoTx,
  );
}

export function cobroDirectoInteligenteControlador(
  servicio: FinanzasService,
  usuario: UsuarioActor,
  clienteId: string,
  idempotencyHeader: string | undefined,
  body: unknown,
) {
  if (!UUID_REGEX.test(clienteId)) {
    throw new BadRequestException(MENSAJE_ALUMNO_NO_ENCONTRADO);
  }
  const dto = parsearContrato(CobroDirectoInteligenteSchema, body);
  const entrenadorId = resolverEntrenadorId(usuario);
  return servicio.cobroDirectoInteligente(entrenadorId, clienteId, dto, idempotencyHeader);
}
