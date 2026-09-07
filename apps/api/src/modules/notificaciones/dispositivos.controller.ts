import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { DispositivosService } from './dispositivos.service';
import { RegistrarDispositivoSchema } from '@guachafit/shared';

@Controller('dispositivos')
@UseGuards(JwtAuthGuard)
export class DispositivosController {
  constructor(private readonly dispositivosService: DispositivosService) {}

  /**
   * Registro o renovación de token Push para el dispositivo actual (RF-016 RN-02).
   */
  @Post('token-push')
  @HttpCode(HttpStatus.OK)
  async registrarToken(@Req() req: any, @Body() body: unknown) {
    const dto = RegistrarDispositivoSchema.parse(body);
    const usuarioId = req.user.sub;
    return this.dispositivosService.registrarToken(usuarioId, dto);
  }

  /**
   * Desactivación de token Push por cierre de sesión en este dispositivo (RF-016 RN-03).
   */
  @Delete('token-push/:token')
  @HttpCode(HttpStatus.OK)
  async desactivarToken(@Req() req: any, @Param('token') token: string) {
    const usuarioId = req.user.sub;
    await this.dispositivosService.desactivarToken(usuarioId, token);
    return { success: true, message: 'Dispositivo desactivado correctamente' };
  }

  /**
   * Lista todos los dispositivos activos registrados para el usuario autenticado (RF-016 RN-01).
   */
  @Get()
  async listarDispositivos(@Req() req: any) {
    const usuarioId = req.user.sub;
    return this.dispositivosService.listarDispositivosActivos(usuarioId);
  }
}
