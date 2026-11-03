import { UnauthorizedException } from '@nestjs/common';
import { eq, perfilesAlumno, usuarios } from '@guachafit/database';
import {
  EstadoUsuario,
  Modalidad,
  Rol,
  ZONA_HORARIA_ALUMNO_POR_DEFECTO,
  type JwtPayload,
  type LoginUsuarioDTO,
} from '@guachafit/shared';
import {
  MENSAJE_CREDENCIALES_INCORRECTAS,
  MENSAJE_CUENTA_ARCHIVADA,
  MENSAJE_CUENTA_DESACTIVADA,
} from '../../../common/mensajes-acceso';
import {
  generateTokens,
  verificarEntrenadorOperable,
  verificarLicenciaEntrenadorActiva,
} from './acceso-comun';
import { precargarZonaDispositivo } from '../../alumnos/casos-alumnos/precargar-zona-dispositivo';
import type { ContextoAuth } from './contexto-auth';

/**
 * A6: hash bcrypt de un texto que nunca es una contraseña real. Se compara contra él cuando el
 * usuario no existe o aún no tiene contraseña para que el tiempo de respuesta no delate qué
 * correos están registrados. DEBE tener el mismo costo que `CryptoService.hashPassword`
 * (`RONDAS_BCRYPT`, hoy 10 => prefijo `$2b$10$`); si cambian las rondas, regenéralo con
 * `bcrypt.hashSync(<texto aleatorio>, RONDAS_BCRYPT)` (lo vigila api1-seguridad-auth.spec.ts).
 */
const HASH_FICTICIO_SIN_USUARIO = '$2b$10$NE1sOETTV3S5BxjlNsXI6O6ENy1JcQJTkBlST32ZI6dQF5C04OVye';

/**
 * Inicio de Sesión de Usuario (SuperAdmin, Entrenador o Alumno).
 * Movido sin cambios (P3).
 */
export async function iniciarSesion(ctx: ContextoAuth, dto: LoginUsuarioDTO) {
  const [usuario] = await ctx.db
    .select()
    .from(usuarios)
    .where(eq(usuarios.email, dto.email.toLowerCase().trim()));

  // A6: la contraseña se verifica SIEMPRE y ANTES de revelar el estado de la cuenta. Sin usuario
  // (o sin contraseña aún) se compara contra un hash ficticio para no filtrar por tiempo.
  const hashAComparar = usuario?.passwordHash || HASH_FICTICIO_SIN_USUARIO;
  const isMatch = await ctx.cryptoService.comparePassword(dto.password, hashAComparar);
  if (!usuario || !usuario.passwordHash || !isMatch) {
    throw new UnauthorizedException(MENSAJE_CREDENCIALES_INCORRECTAS);
  }

  if (usuario.estado === EstadoUsuario.BLOQUEADO || !usuario.activo) {
    throw new UnauthorizedException(MENSAJE_CUENTA_DESACTIVADA);
  }

  // Resolver el entrenador_id de pertenencia para el claim de Tenancy
  let entrenadorId: string | undefined;
  // RF-003 RN-03/RN-04 (WU RF-003a): la modalidad del alumno viaja en la sesión para que la web
  // bloquee el formulario antropométrico sin una petición extra.
  let modalidad: Modalidad | null = null;
  // ADR-019: la zona del perfil viaja con la sesión (como en `/auth/me`) para que la web cuente
  // la ventana del reporte nutricional con la misma zona que el servidor desde el primer render.
  let zonaHoraria: string | null = null;

  if (usuario.rol === Rol.ENTRENADOR) {
    entrenadorId = usuario.id;
    // RF-010 §6: una licencia suspendida bloquea el inicio de sesión del coach (mismo 401 claro
    // que la cuenta deshabilitada, sin revelar si la cuenta existe).
    await verificarLicenciaEntrenadorActiva(ctx, usuario.id);
  } else if (usuario.rol === Rol.ALUMNO) {
    // RNF-003/ADR-011 (etapa 3): lectura self del perfil con RLS (`current_usuario_id`).
    const [perfil] = await ctx.withTenant({ usuarioId: usuario.id }, (tx) =>
      tx.select().from(perfilesAlumno).where(eq(perfilesAlumno.usuarioId, usuario.id))
    );

    // RF-012 RN-02: la baja lógica revoca el acceso de la cuenta vinculada. Sin este chequeo,
    // el alumno archivado seguía iniciando sesión (y renovando tokens) pese a no tener acceso
    // operativo. El mensaje es claro y no expone datos del perfil ni del entrenador.
    if (perfil?.deletedAtUtc) {
      throw new UnauthorizedException(MENSAJE_CUENTA_ARCHIVADA);
    }

    entrenadorId = perfil?.entrenadorId;
    modalidad = perfil?.modalidad ?? null;
    zonaHoraria = perfil ? perfil.zonaHoraria ?? ZONA_HORARIA_ALUMNO_POR_DEFECTO : null;

    // RF-010 §6 (CASCADA-COACH): la sesión del alumno depende de que su entrenador esté
    // operable. Filas legacy sin coach no pagan el chequeo ni cambian de comportamiento.
    if (entrenadorId) {
      await verificarEntrenadorOperable(ctx, entrenadorId);
    }

    // ADR-025 (ZH-1): precarga única de la zona del dispositivo. Va después de la cascada del
    // entrenador para que un acceso bloqueado no escriba nada. Solo actúa si el perfil aún no
    // tiene la zona definida y llega una zona válida; si no, se conserva la del perfil.
    if (perfil && !perfil.zonaHorariaDefinida && dto.zonaDispositivo !== undefined) {
      const zonaPrecargada = await precargarZonaDispositivo(ctx, usuario.id, dto.zonaDispositivo);
      zonaHoraria = zonaPrecargada ?? zonaHoraria;
    }
  }

  const payload: JwtPayload = {
    sub: usuario.id,
    email: usuario.email,
    rol: usuario.rol as Rol,
    entrenadorId,
  };

  const tokens = generateTokens(ctx, payload);

  // Update last access UTC (ADR-002).
  await ctx.db
    .update(usuarios)
    .set({ ultimoAccesoUtc: new Date() })
    .where(eq(usuarios.id, usuario.id));

  return {
    mensaje: 'Inicio de sesión exitoso.',
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    usuario: {
      id: usuario.id,
      email: usuario.email,
      rol: usuario.rol as Rol,
      entrenadorId,
      modalidad,
      zonaHoraria,
    },
  };
}
