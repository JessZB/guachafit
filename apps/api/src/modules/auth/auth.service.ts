import {
  Injectable,
  Inject,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { DRIZZLE_DB } from '../../database/database.module';
import {
  Database,
  eq,
  and,
  gt,
  usuarios,
  perfilesEntrenador,
  perfilesAlumno,
} from '@guachafit/database';
import { CryptoService } from '../../common/services/crypto.service';
import {
  LoginUsuarioDTO,
  EstablecerPasswordConTokenDTO,
  CrearEntrenadorDTO,
  JwtPayload,
  Rol,
  EstadoUsuario,
  EstadoLicencia,
} from '@guachafit/shared';

@Injectable()
export class AuthService {
  private readonly jwtSecret: string;
  private readonly refreshSecret: string;

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    private readonly cryptoService: CryptoService
  ) {
    this.jwtSecret = process.env.JWT_SECRET || 'guachafit_jwt_super_secret_key_2026';
    this.refreshSecret = process.env.JWT_REFRESH_SECRET || 'guachafit_jwt_refresh_super_secret_key_2026';
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
   * Inicio de Sesión de Usuario (SuperAdmin, Entrenador o Alumno)
   */
  async login(dto: LoginUsuarioDTO) {
    const [usuario] = await this.db
      .select()
      .from(usuarios)
      .where(eq(usuarios.email, dto.email.toLowerCase().trim()));

    if (!usuario || !usuario.passwordHash) {
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    if (usuario.estado === EstadoUsuario.BLOQUEADO || !usuario.activo) {
      throw new UnauthorizedException('Su cuenta se encuentra inactiva o bloqueada.');
    }

    const isMatch = await this.cryptoService.comparePassword(dto.password, usuario.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    // Resolver el entrenador_id de pertenencia para el claim de Tenancy
    let entrenadorId: string | undefined;

    if (usuario.rol === Rol.ENTRENADOR) {
      entrenadorId = usuario.id;
    } else if (usuario.rol === Rol.ALUMNO) {
      const [perfil] = await this.db
        .select()
        .from(perfilesAlumno)
        .where(eq(perfilesAlumno.usuarioId, usuario.id));

      // RF-012 RN-02: la baja lógica revoca el acceso de la cuenta vinculada. Sin este chequeo,
      // el alumno archivado seguía iniciando sesión (y renovando tokens) pese a no tener acceso
      // operativo. El mensaje es claro y no expone datos del perfil ni del entrenador.
      if (perfil?.deletedAtUtc) {
        throw new UnauthorizedException(
          'Tu cuenta fue dada de baja por tu entrenador. Contacta con tu entrenador para restaurar tu acceso.'
        );
      }

      entrenadorId = perfil?.entrenadorId;
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
      },
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
        'El enlace de invitación no es válido o ha expirado (TTL 48 horas). Solicite uno nuevo a su entrenador.'
      );
    }

    if (!usuario.activo || usuario.estado === EstadoUsuario.BLOQUEADO) {
      throw new UnauthorizedException('Su cuenta se encuentra inactiva o bloqueada.');
    }

    // La resolución del perfil ocurre ANTES de escribir: un alumno archivado no activa su cuenta.
    let entrenadorId: string | undefined;
    if (usuario.rol === Rol.ALUMNO) {
      const [perfil] = await this.db
        .select()
        .from(perfilesAlumno)
        .where(eq(perfilesAlumno.usuarioId, usuario.id));

      // RF-012 RN-02: la baja lógica revoca el acceso; el mensaje es el mismo que en el login.
      if (perfil?.deletedAtUtc) {
        throw new UnauthorizedException(
          'Tu cuenta fue dada de baja por tu entrenador. Contacta con tu entrenador para restaurar tu acceso.'
        );
      }

      entrenadorId = perfil?.entrenadorId;
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
      throw new UnauthorizedException('Refresh token expirado o inválido.');
    }

    const [usuario] = await this.db
      .select()
      .from(usuarios)
      .where(eq(usuarios.id, decoded.sub));

    // "Bloqueado total" (RF-012): inactivo o bloqueado no renueva tokens.
    if (!usuario || !usuario.activo || usuario.estado === EstadoUsuario.BLOQUEADO) {
      throw new UnauthorizedException('Usuario no válido o inactivo.');
    }

    let entrenadorId: string | undefined;
    if (usuario.rol === Rol.ENTRENADOR) {
      entrenadorId = usuario.id;
    } else if (usuario.rol === Rol.ALUMNO) {
      const [perfil] = await this.db
        .select()
        .from(perfilesAlumno)
        .where(eq(perfilesAlumno.usuarioId, usuario.id));

      // RF-012 RN-02: la baja lógica también revoca la renovación de tokens.
      if (perfil?.deletedAtUtc) {
        throw new UnauthorizedException(
          'Tu cuenta fue dada de baja por tu entrenador. Contacta con tu entrenador para restaurar tu acceso.'
        );
      }

      entrenadorId = perfil?.entrenadorId;
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
   * Creación de cuenta de Entrenador por SuperAdmin (RF-010, Escenario 1)
   */
  async crearEntrenador(dto: CrearEntrenadorDTO) {
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
      throw new ConflictException('El coach_code ya se encuentra en uso.');
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

    return {
      id: nuevoCoach.id,
      usuarioId: nuevoUsuario.id,
      nombres: nuevoCoach.nombres,
      apellidos: nuevoCoach.apellidos,
      email: nuevoUsuario.email,
      coachCode: nuevoCoach.coachCode,
      tokenInvitacion: rawToken,
      mensaje: 'Entrenador registrado exitosamente.',
    };
  }
}
