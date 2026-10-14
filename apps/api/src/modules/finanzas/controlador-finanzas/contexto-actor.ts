import { BadRequestException } from '@nestjs/common';
import { Rol } from '@guachafit/shared';

/** Usuario mínimo que el controlador recibe en `req.user`. */
export interface UsuarioActor {
  sub?: string;
  rol?: Rol;
  entrenadorId?: string;
}

/**
 * Entrenador dueño del dato a partir del token.
 * Relevo histórico: si el token no trae `entrenadorId`, se usa `sub`.
 */
export function resolverEntrenadorId(usuario: UsuarioActor): string {
  return usuario.entrenadorId || usuario.sub || '';
}

/**
 * Contexto de la tasa vigente para el actor actual.
 * Con rol alumno, el objetivo siempre es el propio alumno y el contexto RLS es su `usuarioId`;
 * con rol entrenador, el contexto RLS es su `entrenadorId`.
 * Falla con 400 si no se logra el contexto del entrenador.
 */
export function resolverContextoTasaVigente(
  usuario: UsuarioActor,
  clienteId?: string,
): { entrenadorId: string; objetivoClienteId?: string; contextoRls: { usuarioId: string } | { entrenadorId: string } } {
  let entrenadorId = usuario.entrenadorId;
  let objetivoClienteId = clienteId;

  if (usuario.rol === Rol.ALUMNO) {
    objetivoClienteId = usuario.sub;
    if (!entrenadorId) {
      // En caso de que no venga en el token, FinanzasService lo busca
      entrenadorId = usuario.entrenadorId;
    }
  } else {
    entrenadorId = usuario.entrenadorId || usuario.sub;
  }

  if (!entrenadorId) {
    throw new BadRequestException('No se pudo determinar el contexto del entrenador para la tasa.');
  }

  const contextoRls =
    usuario.rol === Rol.ALUMNO && usuario.sub
      ? { usuarioId: usuario.sub }
      : { entrenadorId };

  return { entrenadorId, objetivoClienteId, contextoRls };
}

/**
 * Entrenador para el cálculo bimonetario.
 * El alumno calcula con su coach; el entrenador, con su propio identificador.
 * Falla con 400 si no se logra el contexto.
 */
export function resolverEntrenadorParaCalculo(usuario: UsuarioActor): string {
  const entrenadorId =
    usuario.rol === Rol.ALUMNO
      ? usuario.entrenadorId
      : usuario.entrenadorId || usuario.sub;

  if (!entrenadorId) {
    throw new BadRequestException('No se pudo determinar el contexto del entrenador para el cálculo.');
  }

  return entrenadorId;
}

/**
 * Entrenador para el historial del alumno.
 * Igual que el cálculo: el alumno consulta con su coach.
 */
export function resolverEntrenadorParaHistorial(usuario: UsuarioActor): string | undefined {
  if (usuario.rol === Rol.ALUMNO) {
    return usuario.entrenadorId;
  }

  return usuario.entrenadorId || usuario.sub;
}
