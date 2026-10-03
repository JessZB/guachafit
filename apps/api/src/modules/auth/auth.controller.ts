import {
  Controller,
  Post,
  Patch,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  Inject,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { parsearContrato } from '../../common/errores/parsear-contrato';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  LimitarIntentosLogin,
  LimitarIntentosPublico,
  LimitarIntentosRefresh,
} from '../../common/guards/limite-intentos.guard';
import {
  Rol,
  UUID_REGEX,
  LoginUsuarioSchema,
  EstablecerPasswordConTokenSchema,
  RefreshTokenSchema,
  CrearEntrenadorSchema,
  ListarEntrenadoresAdminQuerySchema,
  CambiarEstadoEntrenadorSchema,
  CambiarLicenciaEntrenadorSchema,
} from '@guachafit/shared';

/**
 * LOTE API-2: el correo del login se recorta antes de validar. Un espacio pegado al copiar el
 * correo no es un error del usuario: el límite de intentos y `AuthService.login` ya lo normalizan
 * (minúsculas + trim), así que validar el valor recortado es coherente y evita un 400 inútil.
 */
function normalizarCorreoLogin(body: unknown): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const { email } = body as { email?: unknown };
  return typeof email === 'string' ? { ...(body as object), email: email.trim() } : body;
}

@Controller('auth')
export class AuthController {
  // Token explícito (como los `@Inject(DRIZZLE_DB)` del proyecto): la inyección no depende de
  // `design:paramtypes`, que los transformadores de test (esbuild) no emiten.
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  /**
   * Inicio de Sesión estándar
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  // A5: 5 intentos/min por IP + correo (fuerza bruta) y 60/min por IP (rociado de correos).
  @LimitarIntentosLogin()
  async login(@Body() body: unknown) {
    const dto = parsearContrato(LoginUsuarioSchema, normalizarCorreoLogin(body));
    return this.authService.login(dto);
  }

  /**
   * Establecer contraseña inicial mediante Token de Invitación (RF-011, ARCH-003 §2.1)
   */
  @Post('invitacion/establecer-password')
  @HttpCode(HttpStatus.OK)
  // A5: activación de cuenta (ruta pública), 20/min por IP.
  @LimitarIntentosPublico()
  async establecerPassword(@Body() body: unknown) {
    const dto = parsearContrato(EstablecerPasswordConTokenSchema, body);
    return this.authService.establecerPasswordConToken(dto);
  }

  /**
   * Renovación de token JWT de acceso
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  // A5: exige un refresh token válido; tope holgado por IP sin consumir el cupo del login.
  @LimitarIntentosRefresh()
  async refresh(@Body() body: unknown) {
    const dto = parsearContrato(RefreshTokenSchema, body);
    return this.authService.refresh(dto.refreshToken);
  }

  /**
   * Alta de Entrenador por el SuperAdmin (RF-010, Escenario 1)
   */
  @Post('entrenador')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.SUPERADMIN)
  @HttpCode(HttpStatus.CREATED)
  async crearEntrenador(@Body() body: unknown) {
    const dto = parsearContrato(CrearEntrenadorSchema, body);
    return this.authService.crearEntrenador(dto);
  }

  /**
   * Listado de entrenadores del panel maestro (RF-010 RN-01: "Crear / Deshabilitar Entrenadores"
   * y "Gestionar Licencias" ✅ Superadmin). Envelope paginado estándar `{ items, total, limit,
   * offset }`. Solo el superadmin lo consume; el negocio del coach queda fuera de la matriz.
   */
  @Get('entrenadores')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.SUPERADMIN)
  async listarEntrenadores(@Query() query: unknown) {
    const dto = parsearContrato(ListarEntrenadoresAdminQuerySchema, query ?? {});
    return this.authService.listarEntrenadores(dto);
  }

  /**
   * Deshabilitar/reactivar la CUENTA de un entrenador (RF-010 RN-01/§6).
   *
   * `:id` es el `usuarioId` de la cuenta (el mismo que expone `GET /auth/entrenadores`). La
   * deshabilitación es idempotente y revoca login/refresh en el siguiente ciclo de verificación.
   */
  @Patch('entrenadores/:id/estado')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.SUPERADMIN)
  async cambiarEstadoEntrenador(
    @Req() req: any,
    @Param('id') usuarioId: string,
    @Body() body: unknown
  ) {
    if (!UUID_REGEX.test(usuarioId)) {
      throw new BadRequestException('El entrenador indicado no es válido.');
    }
    const dto = parsearContrato(CambiarEstadoEntrenadorSchema, body);
    return this.authService.cambiarEstadoEntrenador(usuarioId, dto, req.user.sub);
  }

  /**
   * Activar/suspender la LICENCIA de un entrenador (RF-010 RN-01).
   *
   * `:id` es el `usuarioId` de la cuenta. Suspender bloquea login/refresh del coach y su enlace
   * público de captación (RF-011 RN-07.1); activar restaura ambos. Idempotente.
   */
  @Patch('entrenadores/:id/licencia')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.SUPERADMIN)
  async cambiarLicenciaEntrenador(
    @Req() req: any,
    @Param('id') usuarioId: string,
    @Body() body: unknown
  ) {
    if (!UUID_REGEX.test(usuarioId)) {
      throw new BadRequestException('El entrenador indicado no es válido.');
    }
    const dto = parsearContrato(CambiarLicenciaEntrenadorSchema, body);
    return this.authService.cambiarLicenciaEntrenador(usuarioId, dto);
  }

  /**
   * Consulta de la sesión activa.
   *
   * WU RF-003a: la sesión se resuelve contra el perfil actual (no contra el claim del JWT) para
   * exponer `modalidad` del alumno al instante. Mismo envelope `{ usuario }` de siempre.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: any) {
    return {
      usuario: await this.authService.obtenerSesion(req.user.sub),
    };
  }
}
