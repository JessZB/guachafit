import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { eq } from '@guachafit/database';
import { DRIZZLE_DB } from '../../database/database.module';
import { Database, usuarios } from '@guachafit/database';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ActualizarTemaUiSchema } from '@guachafit/shared';

@Controller('usuarios')
@UseGuards(JwtAuthGuard)
export class UsuariosController {
  constructor(@Inject(DRIZZLE_DB) private readonly db: Database) {}

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
    const dto = ActualizarTemaUiSchema.parse(body);

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
