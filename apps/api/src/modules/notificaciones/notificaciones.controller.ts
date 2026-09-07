import {
  Controller,
  Get,
  Put,
  Patch,
  Body,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PreferenciasNotificacionService } from './preferencias-notificacion.service';
import { NotificationDispatcherService } from './notification-dispatcher.service';
import {
  ActualizarPreferenciasNotificacionSchema,
  ActualizarPreferenciasNotificacionDTO,
} from '@guachafit/shared';

@Controller('notificaciones')
@UseGuards(JwtAuthGuard)
export class NotificacionesController {
  constructor(
    private readonly preferenciasService: PreferenciasNotificacionService,
    private readonly dispatcherService: NotificationDispatcherService
  ) {}

  /**
   * Obtiene la matriz de preferencias de notificación del usuario autenticado (RF-015).
   */
  @Get('preferencias')
  async obtenerPreferencias(@Req() req: any) {
    const usuarioId = req.user.sub;
    return this.preferenciasService.obtenerPreferencias(usuarioId);
  }

  /**
   * Actualiza las preferencias de notificación por canal y categoría (RF-015).
   */
  @Put('preferencias')
  @HttpCode(HttpStatus.OK)
  async actualizarPreferencias(@Req() req: any, @Body() body: unknown) {
    const dto = ActualizarPreferenciasNotificacionSchema.parse(body);
    const usuarioId = req.user.sub;
    return this.preferenciasService.actualizarPreferencias(usuarioId, dto);
  }

  /**
   * Consulta las notificaciones de la bandeja In-App (campana del usuario) (RF-014).
   */
  @Get('in-app')
  async listarInApp(@Req() req: any) {
    const usuarioId = req.user.sub;
    return this.dispatcherService.listarNotificacionesInApp(usuarioId);
  }

  /**
   * Marca una notificación In-App específica como leída.
   */
  @Patch('in-app/:id/leer')
  @HttpCode(HttpStatus.OK)
  async marcarLeida(@Req() req: any, @Param('id') id: string) {
    const usuarioId = req.user.sub;
    await this.dispatcherService.marcarLeida(usuarioId, id);
    return { success: true };
  }

  /**
   * Marca todas las notificaciones In-App no leídas del usuario como leídas.
   */
  @Patch('in-app/leer-todas')
  @HttpCode(HttpStatus.OK)
  async marcarTodasLeidas(@Req() req: any) {
    const usuarioId = req.user.sub;
    const count = await this.dispatcherService.marcarTodasLeidas(usuarioId);
    return { success: true, count };
  }
}
