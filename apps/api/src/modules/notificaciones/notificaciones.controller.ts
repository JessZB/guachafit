import {
  Controller,
  Get,
  Put,
  Patch,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PreferenciasNotificacionService } from './preferencias-notificacion.service';
import { NotificationDispatcherService } from './notification-dispatcher.service';
import {
  ActualizarPreferenciasNotificacionSchema,
  ActualizarPreferenciasNotificacionDTO,
  FiltroBandejaInAppSchema,
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
   *
   * Devuelve la matriz completa de SU rol (§A alumno / §B entrenador), con `canalesObligatorios`
   * para que la UI pinte los switches bloqueados por RN-01. Nunca expone preferencias de terceros:
   * el usuario sale del token (`req.user.sub`).
   */
  @Get('preferencias')
  async obtenerPreferencias(@Req() req: any) {
    const usuarioId = req.user.sub;
    return this.preferenciasService.obtenerPreferencias(usuarioId);
  }

  /**
   * Actualiza las preferencias de notificación por canal y categoría (RF-015).
   *
   * Un payload inválido o que viole RN-01/RN-02 responde 400 con el detalle por campo (nunca un
   * 500 opaco): la UI muestra la advertencia de RN-02 y reintenta con el campo de confirmación.
   */
  @Put('preferencias')
  @HttpCode(HttpStatus.OK)
  async actualizarPreferencias(@Req() req: any, @Body() body: unknown) {
    const usuarioId = req.user.sub;
    const resultado = ActualizarPreferenciasNotificacionSchema.safeParse(body);

    if (!resultado.success) {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'PREFERENCIAS_INVALIDAS',
        message: 'No se pudo actualizar la matriz de preferencias de notificaciones.',
        errores: resultado.error.issues.map((issue) => ({
          campo: issue.path.join('.') || '(payload)',
          mensaje: issue.message,
        })),
      });
    }

    return this.preferenciasService.actualizarPreferencias(usuarioId, resultado.data);
  }

  /**
   * RF-014 (Ola 3): bandeja In-App paginada (campana de N2).
   *
   * Query: `limit` (1..100, default 25), `offset` (>=0), `soloNoLeidas` (`true`/`false`).
   * Envelope: `{ items, total, limit, offset, totalNoLeidas }`, más recientes primero.
   */
  @Get('in-app')
  async listarInApp(@Req() req: any, @Query() query: unknown) {
    const usuarioId = req.user.sub;
    const filtro = FiltroBandejaInAppSchema.parse(query);
    return this.dispatcherService.listarNotificacionesInApp(usuarioId, filtro);
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
