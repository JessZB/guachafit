import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { parsearContrato } from '../../common/errores/parsear-contrato';
import { eq } from '@guachafit/database';
import { DRIZZLE_DB } from '../../database/database.module';
import { Database, usuarios } from '@guachafit/database';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  ActualizarMiPerfilSchema,
  ActualizarTemaUiSchema,
  CambiarPasswordSchema,
  SolicitarCambioCorreoSchema,
} from '@guachafit/shared';
import { UsuariosService } from './usuarios.service';
import { AuthService } from '../auth/auth.service';
import { LimitarIntentosCuenta } from '../../common/guards/limite-intentos.guard';

@Controller('usuarios')
@UseGuards(JwtAuthGuard)
export class UsuariosController {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    // Tokens explícitos: los transformadores de test (esbuild) no emiten `design:paramtypes`.
    @Inject(UsuariosService) private readonly usuariosService: UsuariosService,
    @Inject(AuthService) private readonly authService: AuthService
  ) {}

  /** RF-018: perfil propio (datos editables y de solo lectura, correo pendiente). */
  @Get('me/perfil')
  async obtenerMiPerfil(@Req() req: any) {
    return this.usuariosService.obtenerMiPerfil(req.user.sub);
  }

  /** RF-018 RN-01/RN-02: edita los datos permitidos para el rol (el id sale del token). */
  @Patch('me/perfil')
  @HttpCode(HttpStatus.OK)
  async actualizarMiPerfil(@Req() req: any, @Body() body: unknown) {
    const dto = parsearContrato(ActualizarMiPerfilSchema, body);
    return this.usuariosService.actualizarMiPerfil(req.user.sub, dto);
  }

  /** RF-018 RN-08: cambio de contraseña con la actual; devuelve tokens nuevos. */
  @Post('me/password')
  @HttpCode(HttpStatus.OK)
  @LimitarIntentosCuenta()
  async cambiarPassword(@Req() req: any, @Body() body: unknown) {
    const dto = parsearContrato(CambiarPasswordSchema, body);
    return this.authService.cambiarPassword(req.user.sub, dto);
  }

  /** RF-018 RN-03..RN-05: pide el cambio de correo; envía el enlace al correo nuevo. */
  @Post('me/correo')
  @HttpCode(HttpStatus.OK)
  @LimitarIntentosCuenta()
  async solicitarCambioCorreo(@Req() req: any, @Body() body: unknown) {
    const dto = parsearContrato(SolicitarCambioCorreoSchema, body);
    return this.authService.solicitarCambioCorreo(req.user.sub, dto);
  }

  /** RF-018 RN-05: cancela el cambio de correo pendiente (idempotente). */
  @Delete('me/correo-pendiente')
  @HttpCode(HttpStatus.OK)
  async cancelarCambioCorreo(@Req() req: any) {
    return this.authService.cancelarCambioCorreoPendiente(req.user.sub);
  }

  /**
   * Consulta del perfil y preferencias del usuario autenticado
   */
  @Get('me')
  async obtenerPerfil(@Req() req: any) {
    const [usuario] = await this.db
      .select({
        id: usuarios.id,
        email: usuarios.email,
        rol: usuarios.rol,
        timezone: usuarios.timezone,
        temaUi: usuarios.temaUi,
        activo: usuarios.activo,
        createdAtUtc: usuarios.createdAtUtc,
      })
      .from(usuarios)
      .where(eq(usuarios.id, req.user.sub));

    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    return {
      usuario: {
        ...usuario,
        entrenadorId: req.user.entrenadorId,
      },
    };
  }

  /**
   * Sincronización de preferencias de UI (Dark Mode persistente, ARCH-003 §3.4)
   */
  @Patch('me/preferencias')
  @HttpCode(HttpStatus.OK)
  async actualizarPreferencias(@Req() req: any, @Body() body: unknown) {
    const dto = parsearContrato(ActualizarTemaUiSchema, body);

    const [actualizado] = await this.db
      .update(usuarios)
      .set({
        temaUi: dto.temaUi,
        updatedAtUtc: new Date(),
      })
      .where(eq(usuarios.id, req.user.sub))
      .returning({
        temaUi: usuarios.temaUi,
      });

    if (!actualizado) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    return {
      temaUi: actualizado.temaUi,
      mensaje: 'Preferencia de interfaz actualizada con éxito.',
    };
  }
}
