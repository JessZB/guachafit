import { parsearContrato } from '../../../common/errores/parsear-contrato';
import {
  ActualizarTasaCambioSchema,
  CalcularConversionSchema,
  Rol,
} from '@guachafit/shared';
import type { FinanzasService } from '../finanzas.service';
import {
  resolverContextoTasaVigente,
  resolverEntrenadorId,
  resolverEntrenadorParaCalculo,
  type UsuarioActor,
} from './contexto-actor';

/**
 * Lógica de transporte de las rutas de tasas: resuelve el actor, valida el cuerpo
 * y delega en el servicio. El controlador conserva verbo, ruta, guards y firma.
 */
export function obtenerTasaVigenteControlador(
  servicio: FinanzasService,
  usuario: UsuarioActor,
  clienteId?: string,
) {
  const { entrenadorId, objetivoClienteId, contextoRls } = resolverContextoTasaVigente(
    usuario,
    clienteId,
  );

  // RNF-003/ADR-011 (etapa 3): la tasa override lee `perfiles_alumno` (RLS); el contexto RLS
  // es el del actor (self del alumno, tenant del coach).
  return servicio.obtenerTasaVigente(
    entrenadorId,
    objetivoClienteId,
    undefined,
    contextoRls,
  );
}

export function actualizarTasaControlador(
  servicio: FinanzasService,
  usuario: UsuarioActor,
  body: unknown,
) {
  const dto = parsearContrato(ActualizarTasaCambioSchema, body);
  const entrenadorId = resolverEntrenadorId(usuario);
  return servicio.actualizarTasa(entrenadorId, dto);
}

export function calcularConversionControlador(
  servicio: FinanzasService,
  usuario: UsuarioActor & { sub: string; rol: Rol },
  body: unknown,
) {
  const dto = parsearContrato(CalcularConversionSchema, body);
  const entrenadorId = resolverEntrenadorParaCalculo(usuario);

  return servicio.calcularConversion(dto, entrenadorId, usuario.sub, usuario.rol);
}
