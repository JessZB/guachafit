import {
  Injectable,
  Inject,
  Optional,
  Logger,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DRIZZLE_DB, WITH_TENANT } from '../../database/database.module';
import {
  Database,
  WithTenantFn,
  withTenant as withTenantBase,
  eq,
  and,
  or,
  gt,
  lte,
  isNull,
  count,
  desc,
  asc,
  usuarios,
  perfilesEntrenador,
  perfilesAlumno,
} from '@guachafit/database';
import { CryptoService } from '../../common/services/crypto.service';
import { obtenerSecretosJwt } from '../../common/config/secretos-jwt';
import {
  MENSAJE_SESION_VENCIDA,
  MENSAJE_CUENTA_ARCHIVADA,
  MENSAJE_CREDENCIALES_INCORRECTAS,
  MENSAJE_CUENTA_DESACTIVADA,
  MENSAJE_RECUPERACION_SOLICITADA,
  MENSAJE_ENLACE_RECUPERACION_INVALIDO,
  MENSAJE_PASSWORD_ACTUALIZADA,
} from '../../common/mensajes-acceso';
import {
  BienvenidaEntrenadorEvent,
  EventoCorreoCuenta,
  RecuperacionPasswordSolicitadaEvent,
  publicarCorreoCuenta,
} from '../notificaciones/events/eventos-correo-cuenta';
import { enmascararCorreo } from '../../common/enmascarar-correo.util';
import {
  LoginUsuarioDTO,
  EstablecerPasswordConTokenDTO,
  SolicitarRecuperacionPasswordDTO,
  RestablecerPasswordDTO,
  CrearEntrenadorDTO,
  AuthUserDTO,
  JwtPayload,
  Rol,
  Modalidad,
  EstadoUsuario,
  EstadoLicencia,
  PeriodicidadAntropometria,
  ListarEntrenadoresAdminQueryDTO,
  ListadoEntrenadoresAdminDTO,
  CambiarEstadoEntrenadorDTO,
  CambioEstadoEntrenadorResultadoDTO,
  CambiarLicenciaEntrenadorDTO,
  CambioLicenciaEntrenadorResultadoDTO,
  VIGENCIA_ENLACE_RECUPERACION_MS,
  EntrenadorCreadoDTO,
  ZONA_HORARIA_ALUMNO_POR_DEFECTO,
} from '@guachafit/shared';

/**
 * Recuperación: intervalo mínimo entre dos enlaces para la misma cuenta. Mientras el enlace
 * vigente tenga menos de 15 minutos no se rota (un tercero no puede anular el enlace de otra
 * persona pidiendo uno nuevo con su correo) ni se envía otro correo.
 */
export const INTERVALO_MINIMO_NUEVO_ENLACE_RECUPERACION_MS = 15 * 60_000;

/**
 * A6: hash bcrypt de un texto que nunca es una contraseña real. Se compara contra él cuando el
 * usuario no existe o aún no tiene contraseña para que el tiempo de respuesta no delate qué
 * correos están registrados. DEBE tener el mismo costo que `CryptoService.hashPassword`
 * (`RONDAS_BCRYPT`, hoy 10 => prefijo `$2b$10$`); si cambian las rondas, regenéralo con
 * `bcrypt.hashSync(<texto aleatorio>, RONDAS_BCRYPT)` (lo vigila api1-seguridad-auth.spec.ts).
 */
const HASH_FICTICIO_SIN_USUARIO = '$2b$10$NE1sOETTV3S5BxjlNsXI6O6ENy1JcQJTkBlST32ZI6dQF5C04OVye';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtSecret: string;
  private readonly refreshSecret: string;

  /**
   * RNF-003/ADR-011 (etapa 3): `perfiles_alumno` tiene RLS. El perfil del alumno se lee SIEMPRE
   * dentro de `withTenant` con el contexto self (`current_usuario_id`), incluso en login/refresh/
   * canje donde todavía no hay JWT: el usuario autenticado en ese instante ES el dueño del perfil.
   * Se inyecta para que los tests puedan espiarlo.
   */
  private readonly withTenant: WithTenantFn;

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    private readonly cryptoService: CryptoService,
    @Optional() @Inject(WITH_TENANT) withTenant?: WithTenantFn,
    // Bienvenidas y recuperación publican un evento de dominio (ADR-010): el envío real lo hace
    // el worker de correo, fuera de la petición. Opcional para los consumidores sin bus de eventos.
    @Optional() @Inject(EventEmitter2) private readonly eventEmitter?: EventEmitter2
  ) {
    // A3: los secretos salen de la fuente única (fail-fast en producción).
    const { jwtSecret, refreshSecret } = obtenerSecretosJwt();
    this.jwtSecret = jwtSecret;
    this.refreshSecret = refreshSecret;
    this.withTenant = withTenant ?? ((context, fn) => withTenantBase(context, fn, this.db));
  }

  /**
   * Genera los tokens JWT de acceso (15 min) y refresco (7 días)
   */
  private generateTokens(payload: JwtPayload): { accessToken: string; refreshToken: string } {
    const accessToken = jwt.sign(payload, this.jwtSecret, { expiresIn: '15m' });
    const refreshToken = jwt.sign(
      { sub: payload.sub, email: payload.email, rol: payload.rol },
      this.refreshSecret,
      { expiresIn: '7d' }
    );
    return { accessToken, refreshToken };
  }

  /**
   * RF-010 §6 (WU Admin): una cuenta de entrenador SOLO opera con licencia `ACTIVA`.
   *
   * Mecanismo de revocación real (sin listas negras): el estado se verifica contra la BD en cada
   * ciclo de sesión — login, refresh y `GET /auth/me` —, así que deshabilitar la cuenta o
   * suspender la licencia bloquea de inmediato el refresh y cierra la sesión de la web en el
   * siguiente `/auth/me`. El ÚNICO límite es el access token ya emitido: al ser JWT stateless sin
   * consulta a BD en el guard, vive como máximo sus 15 minutos de TTL.
   */
  private async verificarLicenciaEntrenadorActiva(
    usuarioId: string
  ): Promise<{ nombres: string | null }> {
    const [perfil] = await this.db
      .select({
        estadoLicencia: perfilesEntrenador.estadoLicencia,
        nombres: perfilesEntrenador.nombres,
      })
      .from(perfilesEntrenador)
      .where(eq(perfilesEntrenador.usuarioId, usuarioId))
      .limit(1);

    if (!perfil || perfil.estadoLicencia !== EstadoLicencia.ACTIVA) {
      throw new UnauthorizedException(
        'La licencia de esta cuenta no está activa. Contacta al administrador de la plataforma.'
      );
    }
    // El nombre permite saludar al entrenador en el correo de recuperación.
    return { nombres: perfil.nombres ?? null };
  }

  /**
   * RF-010 §6 (CASCADA-COACH): el alumno solo opera si su entrenador está operable — cuenta
   * habilitada (`usuarios.activo`) Y licencia vigente (`perfiles_entrenador.estado_licencia`).
   *
   * Se evalúa en autenticación y derivado en runtime (login, `/auth/me`, refresh y canje), NO por
   * request: el guard no consulta la BD y no paga coste por petición (RF-010 §7). Al reactivar
   * cualquiera de los dos interruptores, el desbloqueo del alumno es inmediato en su siguiente
   * ciclo de sesión. El mensaje es único y no revela cuál de los dos falló.
   *
   * Semántica espejo del helper de licencia: sin fila en `perfiles_entrenador` el entrenador no
   * es operable. Ambas tablas no tienen RLS: la lectura va por el pool raíz (`this.db`).
   */
  private async verificarEntrenadorOperable(entrenadorId: string): Promise<void> {
    const [entrenador] = await this.db
      .select({
        activo: usuarios.activo,
        estadoLicencia: perfilesEntrenador.estadoLicencia,
      })
      .from(perfilesEntrenador)
      .innerJoin(usuarios, eq(usuarios.id, perfilesEntrenador.usuarioId))
      .where(eq(perfilesEntrenador.usuarioId, entrenadorId))
      .limit(1);

    if (!entrenador || !entrenador.activo || entrenador.estadoLicencia !== EstadoLicencia.ACTIVA) {
      throw new UnauthorizedException(
        'Tu entrenador no está disponible en este momento. Inténtalo de nuevo más tarde.'
      );
    }
  }

  /**
   * Inicio de Sesión de Usuario (SuperAdmin, Entrenador o Alumno)
   */
  async login(dto: LoginUsuarioDTO) {
    const [usuario] = await this.db
      .select()
      .from(usuarios)
      .where(eq(usuarios.email, dto.email.toLowerCase().trim()));

    // A6: la contraseña se verifica SIEMPRE y ANTES de revelar el estado de la cuenta. Sin usuario
    // (o sin contraseña aún) se compara contra un hash ficticio para no filtrar por tiempo.
    const hashAComparar = usuario?.passwordHash || HASH_FICTICIO_SIN_USUARIO;
    const isMatch = await this.cryptoService.comparePassword(dto.password, hashAComparar);
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
      await this.verificarLicenciaEntrenadorActiva(usuario.id);
    } else if (usuario.rol === Rol.ALUMNO) {
      // RNF-003/ADR-011 (etapa 3): lectura self del perfil con RLS (`current_usuario_id`).
      const [perfil] = await this.withTenant({ usuarioId: usuario.id }, (tx) =>
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
        await this.verificarEntrenadorOperable(entrenadorId);
      }
    }

    const payload: JwtPayload = {
      sub: usuario.id,
      email: usuario.email,
      rol: usuario.rol as Rol,
      entrenadorId,
    };

    const tokens = this.generateTokens(payload);

    // Actualizar último acceso UTC (ADR-002)
    await this.db
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

  /**
   * RF-003 RN-03/RN-04 (WU RF-003a/b): sesión fresca del usuario autenticado para `GET /auth/me`.
   *
   * A diferencia de leer el claim del JWT (15 min de vida), aquí se resuelve la modalidad y el
   * calendario antropométrico del perfil en el momento: un coach que cambia la modalidad o la
   * periodicidad del alumno se refleja de inmediato y el formulario de la web pasa a solo lectura
   * (o avisa de su ventana) sin esperar la rotación del token.
   */
  async obtenerSesion(usuarioId: string): Promise<AuthUserDTO> {
    const [usuario] = await this.db
      .select()
      .from(usuarios)
      .where(eq(usuarios.id, usuarioId))
      .limit(1);

    if (!usuario || !usuario.activo || usuario.estado === EstadoUsuario.BLOQUEADO) {
      throw new UnauthorizedException(MENSAJE_SESION_VENCIDA);
    }

    let entrenadorId: string | undefined;
    let modalidad: Modalidad | null = null;
    let periodicidadAntropometria: PeriodicidadAntropometria | null = null;
    let antropometriaInicio: string | null = null;
    // LOTE API-N2: zona del perfil del alumno (ventana y plazo del reporte nutricional).
    let zonaHoraria: string | null = null;

    if (usuario.rol === Rol.ENTRENADOR) {
      entrenadorId = usuario.id;
      // RF-010 §6: `/auth/me` es el ciclo de verificación de la web. Una licencia suspendida (o
      // una cuenta deshabilitada, ya rechazada arriba) cierra la sesión sin esperar al TTL del
      // access token.
      await this.verificarLicenciaEntrenadorActiva(usuario.id);
    } else if (usuario.rol === Rol.ALUMNO) {
      // RNF-003/ADR-011 (etapa 3): lectura self del perfil con RLS (`current_usuario_id`).
      const [perfil] = await this.withTenant({ usuarioId: usuario.id }, (tx) =>
        tx
          .select({
            entrenadorId: perfilesAlumno.entrenadorId,
            modalidad: perfilesAlumno.modalidad,
            periodicidadAntropometria: perfilesAlumno.periodicidadAntropometria,
            antropometriaInicio: perfilesAlumno.antropometriaInicio,
            zonaHoraria: perfilesAlumno.zonaHoraria,
            deletedAtUtc: perfilesAlumno.deletedAtUtc,
          })
          .from(perfilesAlumno)
          .where(eq(perfilesAlumno.usuarioId, usuario.id))
          .limit(1)
      );

      if (perfil?.deletedAtUtc) {
        throw new UnauthorizedException(MENSAJE_CUENTA_ARCHIVADA);
      }

      zonaHoraria = perfil ? perfil.zonaHoraria ?? ZONA_HORARIA_ALUMNO_POR_DEFECTO : null;
      entrenadorId = perfil?.entrenadorId;
      modalidad = perfil?.modalidad ?? null;
      // RF-003 RN-01 (WU RF-003b): el calendario viaja con la sesión para que la web del alumno
      // pueda avisar de su ventana de check-in sin necesitar el UUID de `perfiles_alumno`.
      periodicidadAntropometria = perfil?.periodicidadAntropometria ?? null;
      antropometriaInicio = perfil?.antropometriaInicio ?? null;

      // RF-010 §6 (CASCADA-COACH): `/auth/me` del alumno también refleja la cascada; si su
      // entrenador queda inoperable, la web cierra la sesión sin esperar al TTL del access token.
      if (entrenadorId) {
        await this.verificarEntrenadorOperable(entrenadorId);
      }
    }

    return {
      id: usuario.id,
      email: usuario.email,
      rol: usuario.rol as Rol,
      entrenadorId,
      modalidad,
      periodicidadAntropometria,
      antropometriaInicio,
      zonaHoraria,
    };
  }

  /**
   * Establece contraseña definitiva a partir de token SHA-256 de invitación (RF-011, ARCH-003 §2.1)
   *
   * WU-E: un token vigente NO habilita por sí solo la activación. Se rechazan cuentas inactivas o
   * bloqueadas (RF-012 "bloqueado total") y alumnos con baja lógica, sin consumir el token.
   */
  async establecerPasswordConToken(dto: EstablecerPasswordConTokenDTO) {
    const tokenHash = this.cryptoService.hashSha256(dto.token);
    const now = new Date();

    const [usuario] = await this.db
      .select()
      .from(usuarios)
      .where(
        and(
          eq(usuarios.tokenInvitacionHash, tokenHash),
          gt(usuarios.tokenInvitacionExpira, now)
        )
      );

    if (!usuario) {
      throw new NotFoundException(
        'El enlace de invitación no es válido o venció (dura 48 horas). Pide uno nuevo a tu entrenador.'
      );
    }

    if (!usuario.activo || usuario.estado === EstadoUsuario.BLOQUEADO) {
      throw new UnauthorizedException(MENSAJE_CUENTA_DESACTIVADA);
    }

    // La resolución del perfil ocurre ANTES de escribir: un alumno archivado no activa su cuenta.
    let entrenadorId: string | undefined;
    let modalidad: Modalidad | null = null;
    // ADR-019: la zona del perfil viaja con la sesión (como en `/auth/me`) para que la web cuente
    // la ventana del reporte nutricional con la misma zona que el servidor desde el primer render.
    let zonaHoraria: string | null = null;
    if (usuario.rol === Rol.ENTRENADOR) {
      // RF-010 §6: una licencia suspendida tampoco puede canjear la invitación (el canje emite
      // tokens; sería una tercera vía de sesión sin el ciclo de verificación).
      await this.verificarLicenciaEntrenadorActiva(usuario.id);
    } else if (usuario.rol === Rol.ALUMNO) {
      // RNF-003/ADR-011 (etapa 3): canje de invitación — lectura self del perfil con RLS.
      const [perfil] = await this.withTenant({ usuarioId: usuario.id }, (tx) =>
        tx.select().from(perfilesAlumno).where(eq(perfilesAlumno.usuarioId, usuario.id))
      );

      // RF-012 RN-02: la baja lógica revoca el acceso; el mensaje es el mismo que en el login.
      if (perfil?.deletedAtUtc) {
        throw new UnauthorizedException(MENSAJE_CUENTA_ARCHIVADA);
      }

      entrenadorId = perfil?.entrenadorId;
      modalidad = perfil?.modalidad ?? null;
      zonaHoraria = perfil ? perfil.zonaHoraria ?? ZONA_HORARIA_ALUMNO_POR_DEFECTO : null;

      // RF-010 §6 (CASCADA-COACH): el canje emite sesión, así que también exige un entrenador
      // operable; el token no se consume cuando la cascada bloquea.
      if (entrenadorId) {
        await this.verificarEntrenadorOperable(entrenadorId);
      }
    }

    const passwordHash = await this.cryptoService.hashPassword(dto.password);

    // Actualizar usuario: guardar contraseña y limpiar token (Un solo uso, RNF-003)
    await this.db
      .update(usuarios)
      .set({
        passwordHash,
        tokenInvitacionHash: null,
        tokenInvitacionExpira: null,
        ultimoAccesoUtc: now,
      })
      .where(eq(usuarios.id, usuario.id));

    const payload: JwtPayload = {
      sub: usuario.id,
      email: usuario.email,
      rol: usuario.rol as Rol,
      entrenadorId,
    };

    const tokens = this.generateTokens(payload);

    return {
      mensaje: 'Contraseña establecida con éxito. Bienvenido a GUACHAFIT.',
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

  /**
   * Renovación de token de acceso mediante Refresh Token
   */
  async refresh(refreshToken: string) {
    let decoded: any;
    try {
      decoded = jwt.verify(refreshToken, this.refreshSecret);
    } catch {
      throw new UnauthorizedException(MENSAJE_SESION_VENCIDA);
    }

    const [usuario] = await this.db
      .select()
      .from(usuarios)
      .where(eq(usuarios.id, decoded.sub));

    // "Bloqueado total" (RF-012): inactivo o bloqueado no renueva tokens.
    if (!usuario || !usuario.activo || usuario.estado === EstadoUsuario.BLOQUEADO) {
      throw new UnauthorizedException(MENSAJE_SESION_VENCIDA);
    }

    // Quien restablece la contraseña puede estar echando a un intruso: las sesiones abiertas
    // antes del cambio ya no se
    // renuevan (`iat` en segundos; un refresh emitido en el mismo segundo del cambio sigue válido).
    if (
      usuario.passwordCambiadaEn &&
      typeof decoded.iat === 'number' &&
      decoded.iat < Math.floor(new Date(usuario.passwordCambiadaEn).getTime() / 1000)
    ) {
      throw new UnauthorizedException(MENSAJE_SESION_VENCIDA);
    }

    let entrenadorId: string | undefined;
    if (usuario.rol === Rol.ENTRENADOR) {
      entrenadorId = usuario.id;
      // RF-010 §6: la licencia se re-verifica en cada refresh; una cuenta suspendida no renueva.
      await this.verificarLicenciaEntrenadorActiva(usuario.id);
    } else if (usuario.rol === Rol.ALUMNO) {
      // RNF-003/ADR-011 (etapa 3): refresh — lectura self del perfil con RLS.
      const [perfil] = await this.withTenant({ usuarioId: usuario.id }, (tx) =>
        tx.select().from(perfilesAlumno).where(eq(perfilesAlumno.usuarioId, usuario.id))
      );

      // RF-012 RN-02: la baja lógica también revoca la renovación de tokens.
      if (perfil?.deletedAtUtc) {
        throw new UnauthorizedException(MENSAJE_CUENTA_ARCHIVADA);
      }

      entrenadorId = perfil?.entrenadorId;

      // RF-010 §6 (CASCADA-COACH): el refresh del alumno re-verifica a su entrenador; una cuenta
      // deshabilitada o una licencia suspendida cortan la renovación de inmediato.
      if (entrenadorId) {
        await this.verificarEntrenadorOperable(entrenadorId);
      }
    }

    const payload: JwtPayload = {
      sub: usuario.id,
      email: usuario.email,
      rol: usuario.rol as Rol,
      entrenadorId,
    };

    const tokens = this.generateTokens(payload);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  /**
   * Publica un correo de cuenta y devuelve si quedó realmente en camino (espera acotada, ver
   * `publicarCorreoCuenta`). Un fallo del bus o de la cola NUNCA cambia el resultado del flujo de
   * negocio: solo se registra.
   */
  private publicarCorreoCuenta(nombreEvento: string, evento: EventoCorreoCuenta): Promise<boolean> {
    return publicarCorreoCuenta(this.eventEmitter, nombreEvento, evento, this.logger);
  }

  /**
   * ¿La cuenta tiene acceso a la plataforma? Misma regla que login/refresh/canje:
   * habilitada y no bloqueada; coach con licencia activa; alumno no archivado y con entrenador
   * operable (cascada RF-010 §6). Lanza el 401 claro correspondiente; devuelve el nombre del
   * alumno o del entrenador (si lo hay) para personalizar el correo.
   */
  private async verificarCuentaConAcceso(usuario: {
    id: string;
    rol: string;
    activo: boolean;
    estado: string;
  }): Promise<{ nombre: string | null }> {
    if (!usuario.activo || usuario.estado === EstadoUsuario.BLOQUEADO) {
      throw new UnauthorizedException(MENSAJE_CUENTA_DESACTIVADA);
    }
    if (usuario.rol === Rol.ENTRENADOR) {
      const { nombres } = await this.verificarLicenciaEntrenadorActiva(usuario.id);
      return { nombre: nombres };
    }
    if (usuario.rol === Rol.ALUMNO) {
      // RNF-003/ADR-011 (etapa 3): lectura self del perfil con RLS (`current_usuario_id`).
      const [perfil] = await this.withTenant({ usuarioId: usuario.id }, (tx) =>
        tx.select().from(perfilesAlumno).where(eq(perfilesAlumno.usuarioId, usuario.id))
      );
      if (perfil?.deletedAtUtc) {
        throw new UnauthorizedException(MENSAJE_CUENTA_ARCHIVADA);
      }
      if (perfil?.entrenadorId) {
        await this.verificarEntrenadorOperable(perfil.entrenadorId);
      }
      return { nombre: perfil?.nombres ?? null };
    }
    return { nombre: null };
  }

  /**
   * `POST /auth/recuperar-password`.
   *
   * Responde SIEMPRE el mismo mensaje y en el mismo tiempo, exista o no la cuenta: no revela si
   * el correo está registrado ni el estado de la cuenta.
   *
   * Contra la enumeración por tiempo, TODO el trabajo que depende de la cuenta (búsqueda, reglas
   * de acceso, generación y guardado del código, encolado del correo) corre en segundo plano
   * (`procesarSolicitudRecuperacion`) y la respuesta no lo espera: el camino visible es idéntico
   * para un correo registrado y uno que no lo está. Los errores de ese trabajo solo se registran
   * (con el correo enmascarado); la persona puede volver a pedir el enlace.
   */
  async solicitarRecuperacionPassword(
    dto: SolicitarRecuperacionPasswordDTO
  ): Promise<{ mensaje: string }> {
    const email = dto.email.toLowerCase().trim();

    void Promise.resolve()
      .then(() => this.procesarSolicitudRecuperacion(email))
      .catch((error) => {
        this.logger.error(
          `Falló la recuperación de contraseña pedida para ${enmascararCorreo(email)}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      });

    return { mensaje: MENSAJE_RECUPERACION_SOLICITADA };
  }

  /**
   * Trabajo en segundo plano de la recuperación (ver `solicitarRecuperacionPassword`).
   *
   * Solo si la cuenta tiene acceso se genera un código aleatorio de un solo uso (se guarda SOLO su
   * hash SHA-256, con la vigencia `VIGENCIA_ENLACE_RECUPERACION_MS`) y se publica el evento que
   * termina en el correo.
   *
   * Contra la anulación del enlace ajeno: si ya hay un enlace vigente emitido hace menos de
   * `INTERVALO_MINIMO_NUEVO_ENLACE_RECUPERACION_MS`, no se rota ni se envía otro correo (el enlace
   * de la persona sigue sirviendo). Pasado ese intervalo sí se emite uno nuevo y el anterior deja
   * de servir. La emisión se deduce del vencimiento (`expira - vigencia`): no hace falta otra
   * columna. El UPDATE repite la condición para que dos pedidos simultáneos no roten dos veces.
   */
  async procesarSolicitudRecuperacion(email: string): Promise<void> {
    const [usuario] = await this.db.select().from(usuarios).where(eq(usuarios.email, email));
    if (!usuario) return;

    let nombre: string | null;
    try {
      ({ nombre } = await this.verificarCuentaConAcceso(usuario));
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        this.logger.log(
          `Recuperación pedida para una cuenta sin acceso (${usuario.id}); no se envía enlace.`
        );
        return;
      }
      throw error;
    }

    // Un enlace que vence después de este instante fue emitido hace menos del intervalo mínimo.
    const limiteRecienEmitido = new Date(
      Date.now() + VIGENCIA_ENLACE_RECUPERACION_MS - INTERVALO_MINIMO_NUEVO_ENLACE_RECUPERACION_MS
    );
    const expiraActual = usuario.tokenRecuperacionExpira
      ? new Date(usuario.tokenRecuperacionExpira)
      : null;
    if (expiraActual && expiraActual > limiteRecienEmitido) {
      this.logger.log(
        `Recuperación repetida para el usuario ${usuario.id}: su enlace reciente sigue vigente; no se envía otro.`
      );
      return;
    }

    const { rawToken, tokenHash, expiresAt } = this.cryptoService.generarTokenRecuperacion();
    const rotados = await this.db
      .update(usuarios)
      .set({ tokenRecuperacionHash: tokenHash, tokenRecuperacionExpira: expiresAt })
      .where(
        and(
          eq(usuarios.id, usuario.id),
          or(
            isNull(usuarios.tokenRecuperacionExpira),
            lte(usuarios.tokenRecuperacionExpira, limiteRecienEmitido)
          )
        )
      )
      .returning({ id: usuarios.id });

    if (rotados.length === 0) return; // Otro pedido simultáneo ya emitió el enlace.

    await this.publicarCorreoCuenta(
      RecuperacionPasswordSolicitadaEvent.NOMBRE,
      new RecuperacionPasswordSolicitadaEvent({
        tipo: 'RECUPERACION_PASSWORD',
        usuarioId: usuario.id,
        email: usuario.email,
        nombre,
        token: rawToken,
      })
    );
  }

  /**
   * `POST /auth/restablecer-password`.
   *
   * Valida el token (hash, vigente) y la cuenta (misma regla de acceso que el login), aplica la
   * política de contraseña de la activación (contrato compartido) y consume el token en el MISMO
   * UPDATE condicionado al hash: dos canjes simultáneos no pueden usarlo dos veces. También anula
   * una invitación pendiente y marca `passwordCambiadaEn` (el refresh rechaza sesiones previas).
   * No emite sesión: la web lleva al inicio de sesión.
   */
  async restablecerPassword(dto: RestablecerPasswordDTO): Promise<{ mensaje: string }> {
    const tokenHash = this.cryptoService.hashSha256(dto.token);
    const ahora = new Date();

    const [usuario] = await this.db
      .select()
      .from(usuarios)
      .where(
        and(
          eq(usuarios.tokenRecuperacionHash, tokenHash),
          gt(usuarios.tokenRecuperacionExpira, ahora)
        )
      );

    if (!usuario) {
      throw new NotFoundException(MENSAJE_ENLACE_RECUPERACION_INVALIDO);
    }

    await this.verificarCuentaConAcceso(usuario);

    const passwordHash = await this.cryptoService.hashPassword(dto.password);
    const actualizados = await this.db
      .update(usuarios)
      .set({
        passwordHash,
        tokenRecuperacionHash: null,
        tokenRecuperacionExpira: null,
        tokenInvitacionHash: null,
        tokenInvitacionExpira: null,
        passwordCambiadaEn: ahora,
        updatedAtUtc: ahora,
      })
      .where(and(eq(usuarios.id, usuario.id), eq(usuarios.tokenRecuperacionHash, tokenHash)))
      .returning({ id: usuarios.id });

    if (actualizados.length === 0) {
      throw new NotFoundException(MENSAJE_ENLACE_RECUPERACION_INVALIDO);
    }

    return { mensaje: MENSAJE_PASSWORD_ACTUALIZADA };
  }

  /**
   * Creación de cuenta de Entrenador por SuperAdmin (RF-010, Escenario 1)
   */
  async crearEntrenador(dto: CrearEntrenadorDTO): Promise<EntrenadorCreadoDTO> {
    // 1. Validar email único
    const [existenteEmail] = await this.db
      .select()
      .from(usuarios)
      .where(eq(usuarios.email, dto.email.toLowerCase().trim()));

    if (existenteEmail) {
      throw new ConflictException('Este correo ya se encuentra registrado.');
    }

    // 2. Validar coachCode único
    const [existenteCode] = await this.db
      .select()
      .from(perfilesEntrenador)
      .where(eq(perfilesEntrenador.coachCode, dto.coachCode.toUpperCase().trim()));

    if (existenteCode) {
      throw new ConflictException('Ese código de entrenador ya está en uso.');
    }

    // 3. Generar token de bienvenida o hashear contraseña directa
    let passwordHash: string | null = null;
    let tokenHash: string | null = null;
    let tokenExpira: Date | null = null;
    let rawToken: string | null = null;

    if (dto.password) {
      passwordHash = await this.cryptoService.hashPassword(dto.password);
    } else {
      const tokenData = this.cryptoService.generateInvitationToken();
      tokenHash = tokenData.tokenHash;
      tokenExpira = tokenData.expiresAt;
      rawToken = tokenData.rawToken;
    }

    // 4. Crear usuario
    const [nuevoUsuario] = await this.db
      .insert(usuarios)
      .values({
        email: dto.email.toLowerCase().trim(),
        passwordHash,
        rol: Rol.ENTRENADOR,
        estado: EstadoUsuario.ACTIVO,
        tokenInvitacionHash: tokenHash,
        tokenInvitacionExpira: tokenExpira,
        activo: true,
      })
      .returning();

    // 5. Crear perfil de entrenador
    const [nuevoCoach] = await this.db
      .insert(perfilesEntrenador)
      .values({
        usuarioId: nuevoUsuario.id,
        nombres: dto.nombres.trim(),
        apellidos: dto.apellidos.trim(),
        nombreComercial: dto.nombreComercial?.trim() || null,
        coachCode: dto.coachCode.toUpperCase().trim(),
        capacidadMaxima: dto.capacidadMaxima,
        tasaCambioGlobal: dto.tasaCambioGlobal,
        telefonoContacto: dto.telefonoContacto.trim(),
        estadoLicencia: EstadoLicencia.ACTIVA,
      })
      .returning();

    // RF-010 Escenario 1: sin contraseña directa, la bienvenida con el enlace de activación sale
    // por correo (evento → despachador → cola). Se espera la confirmación del encolado (acotada)
    // solo para no prometer un envío que no ocurrió; el enlace copiable del panel es el respaldo.
    const correoEnviado = rawToken
      ? await this.publicarCorreoCuenta(
          BienvenidaEntrenadorEvent.NOMBRE,
          new BienvenidaEntrenadorEvent({
            tipo: 'BIENVENIDA_ENTRENADOR',
            usuarioId: nuevoUsuario.id,
            email: nuevoUsuario.email,
            nombre: nuevoCoach.nombres ?? null,
            token: rawToken,
          })
        )
      : false;

    return {
      id: nuevoCoach.id,
      usuarioId: nuevoUsuario.id,
      nombres: nuevoCoach.nombres,
      apellidos: nuevoCoach.apellidos,
      email: nuevoUsuario.email,
      coachCode: nuevoCoach.coachCode,
      tokenInvitacion: rawToken,
      correoEnviado,
      mensaje: !rawToken
        ? 'Entrenador registrado exitosamente.'
        : correoEnviado
          ? 'Entrenador registrado exitosamente. Le enviamos un correo con el enlace para crear su contraseña. Si no le llega, compártele el enlace de activación.'
          : 'Entrenador registrado exitosamente. Comparte el enlace de activación con el entrenador para que cree su contraseña.',
    };
  }

  /**
   * RF-010 RN-01 (WU Admin): listado de entrenadores para el panel maestro del Superadmin.
   *
   * Solo cuentas con rol ENTRENADOR y su perfil (inner join): un usuario sin perfil de entrenador
   * no es un entrenador operable y no aparece. Devuelve el envelope paginado estándar del repo,
   * con `total` como COUNT real (no el tamaño de la página). Orden: alta más reciente primero.
   */
  async listarEntrenadores(
    query: ListarEntrenadoresAdminQueryDTO
  ): Promise<ListadoEntrenadoresAdminDTO> {
    const { limit, offset } = query;
    const soloEntrenadores = eq(usuarios.rol, Rol.ENTRENADOR);

    const [[filaTotal], filas] = await Promise.all([
      this.db
        .select({ total: count() })
        .from(usuarios)
        .innerJoin(perfilesEntrenador, eq(perfilesEntrenador.usuarioId, usuarios.id))
        .where(soloEntrenadores),
      this.db
        .select({
          usuarioId: usuarios.id,
          perfilId: perfilesEntrenador.id,
          nombres: perfilesEntrenador.nombres,
          apellidos: perfilesEntrenador.apellidos,
          nombreComercial: perfilesEntrenador.nombreComercial,
          email: usuarios.email,
          coachCode: perfilesEntrenador.coachCode,
          estadoLicencia: perfilesEntrenador.estadoLicencia,
          activo: usuarios.activo,
          fechaAltaUtc: usuarios.createdAtUtc,
        })
        .from(usuarios)
        .innerJoin(perfilesEntrenador, eq(perfilesEntrenador.usuarioId, usuarios.id))
        .where(soloEntrenadores)
        .orderBy(desc(usuarios.createdAtUtc), asc(usuarios.id))
        .limit(limit)
        .offset(offset),
    ]);

    return {
      items: filas.map((fila) => ({
        ...fila,
        fechaAltaUtc: new Date(fila.fechaAltaUtc).toISOString(),
      })),
      total: Number(filaTotal?.total ?? 0),
      limit,
      offset,
    };
  }

  /**
   * RF-010 RN-01 / §6 (WU Admin): habilita o deshabilita la CUENTA de un entrenador.
   *
   * Reglas:
   * - La colección es de entrenadores: un id de alumno (o inexistente) responde 404.
   * - El Superadmin no puede deshabilitarse a sí mismo (400).
   * - Idempotente: repetir el mismo estado no escribe y devuelve `cambioAplicado: false`.
   *
   * La deshabilitación revoca la sesión en el siguiente ciclo de verificación: login y refresh
   * la rechazan de inmediato y `/auth/me` cierra la sesión de la web; el access token ya emitido
   * expira como máximo en 15 minutos (ver `verificarLicenciaEntrenadorActiva`).
   */
  async cambiarEstadoEntrenador(
    usuarioId: string,
    dto: CambiarEstadoEntrenadorDTO,
    solicitanteId: string
  ): Promise<CambioEstadoEntrenadorResultadoDTO> {
    const [usuario] = await this.db
      .select()
      .from(usuarios)
      .where(eq(usuarios.id, usuarioId))
      .limit(1);

    if (!usuario || usuario.rol !== Rol.ENTRENADOR) {
      throw new NotFoundException('Entrenador no encontrado.');
    }

    if (!dto.activo && usuarioId === solicitanteId) {
      throw new BadRequestException('No puedes deshabilitar tu propia cuenta.');
    }

    if (usuario.activo === dto.activo) {
      return {
        usuarioId,
        activo: usuario.activo,
        cambioAplicado: false,
        mensaje: dto.activo
          ? 'La cuenta del entrenador ya estaba activa.'
          : 'La cuenta del entrenador ya estaba deshabilitada.',
      };
    }

    await this.db
      .update(usuarios)
      .set({ activo: dto.activo, updatedAtUtc: new Date() })
      .where(eq(usuarios.id, usuarioId));

    return {
      usuarioId,
      activo: dto.activo,
      cambioAplicado: true,
      mensaje: dto.activo
        ? 'Entrenador reactivado. Ya puede volver a iniciar sesión.'
        : 'Entrenador deshabilitado. Ya no podrá iniciar sesión; si tiene una sesión abierta, se cerrará en unos minutos.',
    };
  }

  /**
   * RF-010 RN-01 (WU Admin): activa o suspende la LICENCIA de un entrenador.
   *
   * Efectos reales del estado `SUSPENDIDA_SUPERADMIN` (los mismos que la cuenta deshabilitada):
   * la resolución pública del `coach_code` deja de resolver (RF-011 RN-07.1), el login y el
   * refresh del coach se rechazan y `/auth/me` cierra su sesión. Idempotente.
   */
  async cambiarLicenciaEntrenador(
    usuarioId: string,
    dto: CambiarLicenciaEntrenadorDTO
  ): Promise<CambioLicenciaEntrenadorResultadoDTO> {
    const [coach] = await this.db
      .select()
      .from(perfilesEntrenador)
      .where(eq(perfilesEntrenador.usuarioId, usuarioId))
      .limit(1);

    if (!coach) {
      throw new NotFoundException('Entrenador no encontrado.');
    }

    if (coach.estadoLicencia === dto.estadoLicencia) {
      return {
        usuarioId,
        estadoLicencia: coach.estadoLicencia,
        cambioAplicado: false,
        mensaje:
          dto.estadoLicencia === EstadoLicencia.ACTIVA
            ? 'La licencia del entrenador ya estaba activa.'
            : 'La licencia del entrenador ya estaba suspendida.',
      };
    }

    await this.db
      .update(perfilesEntrenador)
      .set({ estadoLicencia: dto.estadoLicencia, updatedAtUtc: new Date() })
      .where(eq(perfilesEntrenador.usuarioId, usuarioId));

    return {
      usuarioId,
      estadoLicencia: dto.estadoLicencia,
      cambioAplicado: true,
      mensaje:
        dto.estadoLicencia === EstadoLicencia.ACTIVA
          ? 'Licencia activada. El entrenador recupera su acceso y su enlace de captación vuelve a funcionar.'
          : 'Licencia suspendida. El entrenador ya no podrá iniciar sesión y su enlace de captación deja de funcionar.',
    };
  }
}
