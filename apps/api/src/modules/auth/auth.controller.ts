import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  Rol,
  LoginUsuarioSchema,
  EstablecerPasswordConTokenSchema,
  RefreshTokenSchema,
  CrearEntrenadorSchema,
} from '@guachafit/shared';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Inicio de Sesión estándar
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: unknown) {
    const dto = LoginUsuarioSchema.parse(body);
    return this.authService.login(dto);
  }

  /**
   * Establecer contraseña inicial mediante Token de Invitación (RF-011, ARCH-003 §2.1)
   */
  @Post('invitacion/establecer-password')
  @HttpCode(HttpStatus.OK)
  async establecerPassword(@Body() body: unknown) {
    const dto = EstablecerPasswordConTokenSchema.parse(body);
    return this.authService.establecerPasswordConToken(dto);
  }

  /**
   * Renovación de token JWT de acceso
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() body: unknown) {
    const dto = RefreshTokenSchema.parse(body);
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
    const dto = CrearEntrenadorSchema.parse(body);
    return this.authService.crearEntrenador(dto);
  }

  /**
   * Consulta de la sesión activa
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: any) {
    return {
      usuario: req.user,
    };
  }
}
