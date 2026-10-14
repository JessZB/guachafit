import { Injectable, Inject, Optional, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DRIZZLE_DB, WITH_TENANT } from '../../database/database.module';
import {
  Database,
  WithTenantFn,
  withTenant as withTenantBase,
} from '@guachafit/database';
import { CryptoService } from '../../common/services/crypto.service';
import { obtenerSecretosJwt } from '../../common/config/secretos-jwt';
import {
  LoginUsuarioDTO,
  EstablecerPasswordConTokenDTO,
  SolicitarRecuperacionPasswordDTO,
  RestablecerPasswordDTO,
  CrearEntrenadorDTO,
  AuthUserDTO,
  ListarEntrenadoresAdminQueryDTO,
  ListadoEntrenadoresAdminDTO,
  CambiarEstadoEntrenadorDTO,
  CambioEstadoEntrenadorResultadoDTO,
  CambiarLicenciaEntrenadorDTO,
  CambioLicenciaEntrenadorResultadoDTO,
  EntrenadorCreadoDTO,
  CambiarPasswordDTO,
  SolicitarCambioCorreoDTO,
  ConfirmarCambioCorreoDTO,
  SolicitudCambioCorreoDTO,
} from '@guachafit/shared';
import type { ContextoCasosAuth } from './casos-auth/contexto-casos';
import { iniciarSesion } from './casos-auth/iniciar-sesion';
import { obtenerSesion } from './casos-auth/obtener-sesion';
import { establecerPasswordConToken } from './casos-auth/establecer-password-token';
import { refrescarSesion } from './casos-auth/refrescar-sesion';
import {
  procesarSolicitudRecuperacion,
  solicitarRecuperacionPassword,
} from './casos-auth/solicitar-recuperacion';
import { restablecerPassword } from './casos-auth/restablecer-password';
import { cambiarPassword } from './casos-auth/cambiar-password';
import {
  cancelarCambioCorreoPendiente,
  confirmarCambioCorreo,
  solicitarCambioCorreo,
} from './casos-auth/cambio-correo';
import { crearEntrenador } from './casos-auth/crear-entrenador';
import { listarEntrenadores } from './casos-auth/listar-entrenadores';
import {
  cambiarEstadoEntrenador,
  cambiarLicenciaEntrenador,
} from './casos-auth/gestion-entrenadores';

export { INTERVALO_MINIMO_NUEVO_ENLACE_RECUPERACION_MS } from './casos-auth/recuperacion-reglas';

/**
 * Fachada de autenticación (P1): conserva el archivo, el nombre de la clase, los decoradores,
 * el constructor idéntico y cada método público. Cada método delega en un caso de uso de
 * `casos-auth/` con el contexto explícito de dependencias construido abajo (P2).
 * La semántica de datos no cambia (P3).
 */
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

  private readonly casos: ContextoCasosAuth;

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
    this.casos = {
      db: this.db,
      cryptoService: this.cryptoService,
      withTenant: this.withTenant,
      eventEmitter: this.eventEmitter,
      logger: this.logger,
      jwtSecret: this.jwtSecret,
      refreshSecret: this.refreshSecret,
    };
  }

  /** User sign-in (SuperAdmin, Entrenador or Alumno). */
  async login(dto: LoginUsuarioDTO) {
    return iniciarSesion(this.casos, dto);
  }

  /** Sesión fresca del usuario autenticado para `GET /auth/me`. */
  async obtenerSesion(usuarioId: string): Promise<AuthUserDTO> {
    return obtenerSesion(this.casos, usuarioId);
  }

  /** Establece la contraseña definitiva desde un token SHA-256 de invitación (RF-011). */
  async establecerPasswordConToken(dto: EstablecerPasswordConTokenDTO) {
    return establecerPasswordConToken(this.casos, dto);
  }

  /** Access-token renewal via refresh token. */
  async refresh(refreshToken: string) {
    return refrescarSesion(this.casos, refreshToken);
  }

  /** `POST /auth/recuperar-password` (uniform answer, background work). */
  async solicitarRecuperacionPassword(
    dto: SolicitarRecuperacionPasswordDTO
  ): Promise<{ mensaje: string }> {
    return solicitarRecuperacionPassword(this.casos, dto);
  }

  /** Background recovery work (link issue + email event). */
  async procesarSolicitudRecuperacion(email: string): Promise<void> {
    return procesarSolicitudRecuperacion(this.casos, email);
  }

  /** `POST /auth/restablecer-password` (single-use link redeem). */
  async restablecerPassword(dto: RestablecerPasswordDTO): Promise<{ mensaje: string }> {
    return restablecerPassword(this.casos, dto);
  }

  // RF-018 "Mi perfil": contraseña y correo de acceso del propio usuario.

  /** `POST /usuarios/me/password` (RF-018 RN-08). */
  async cambiarPassword(
    usuarioId: string,
    dto: CambiarPasswordDTO
  ): Promise<{ mensaje: string; accessToken: string; refreshToken: string }> {
    return cambiarPassword(this.casos, usuarioId, dto);
  }

  /** `POST /usuarios/me/correo` (RF-018 RN-04/RN-05). */
  async solicitarCambioCorreo(
    usuarioId: string,
    dto: SolicitarCambioCorreoDTO
  ): Promise<SolicitudCambioCorreoDTO> {
    return solicitarCambioCorreo(this.casos, usuarioId, dto);
  }

  /** `DELETE /usuarios/me/correo-pendiente` (RF-018 RN-05): idempotent. */
  async cancelarCambioCorreoPendiente(usuarioId: string): Promise<{ mensaje: string }> {
    return cancelarCambioCorreoPendiente(this.casos, usuarioId);
  }

  /** `POST /auth/confirmar-cambio-correo` (RF-018 RN-05/RN-06), public. */
  async confirmarCambioCorreo(dto: ConfirmarCambioCorreoDTO): Promise<{ mensaje: string }> {
    return confirmarCambioCorreo(this.casos, dto);
  }

  /** Coach account creation by SuperAdmin (RF-010, Scenario 1). */
  async crearEntrenador(dto: CrearEntrenadorDTO): Promise<EntrenadorCreadoDTO> {
    return crearEntrenador(this.casos, dto);
  }

  /** Listado de entrenadores para el panel maestro del Superadmin (RF-010 RN-01). */
  async listarEntrenadores(
    query: ListarEntrenadoresAdminQueryDTO
  ): Promise<ListadoEntrenadoresAdminDTO> {
    return listarEntrenadores(this.casos, query);
  }

  /** Enables or disables a coach ACCOUNT (RF-010 RN-01 / section 6). */
  async cambiarEstadoEntrenador(
    usuarioId: string,
    dto: CambiarEstadoEntrenadorDTO,
    solicitanteId: string
  ): Promise<CambioEstadoEntrenadorResultadoDTO> {
    return cambiarEstadoEntrenador(this.casos, usuarioId, dto, solicitanteId);
  }

  /** Activates or suspends a coach LICENSE (RF-010 RN-01). */
  async cambiarLicenciaEntrenador(
    usuarioId: string,
    dto: CambiarLicenciaEntrenadorDTO
  ): Promise<CambioLicenciaEntrenadorResultadoDTO> {
    return cambiarLicenciaEntrenador(this.casos, usuarioId, dto);
  }
}
