import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
  Req,
} from '@nestjs/common';
import { EntrenadorService } from './entrenador.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  ActualizarCaptacionSchema,
  CaptacionEntrenadorResultadoDTO,
  DashboardComandoDTO,
  PerfilEntrenadorDTO,
  Rol,
} from '@guachafit/shared';
import { parsearContrato } from '../../common/errores/parsear-contrato';

@Controller('entrenador')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EntrenadorController {
  constructor(private readonly entrenadorService: EntrenadorService) {}

  /**
   * Perfil operativo del entrenador autenticado (WU-E / RF-011 RN-06).
   * Expone el `coachCode` REAL para construir el enlace de captación; nunca datos de terceros.
   * RF-010 RN-01: el superadmin NO accede al negocio del coach (solo gestión de entrenadores).
   */
  @Get('perfil')
  @Roles(Rol.ENTRENADOR)
  async obtenerPerfil(@Req() req: any): Promise<PerfilEntrenadorDTO> {
    const coachId = req.user.entrenadorId || req.user.sub;
    return this.entrenadorService.obtenerPerfil(coachId);
  }

  /**
   * D17: rota el enlace de captación. El código anterior deja de resolver de inmediato.
   */
  @Post('captacion/rotar')
  @HttpCode(HttpStatus.OK)
  @Roles(Rol.ENTRENADOR)
  async rotarEnlaceCaptacion(@Req() req: any): Promise<CaptacionEntrenadorResultadoDTO> {
    const coachId = req.user.entrenadorId || req.user.sub;
    return this.entrenadorService.rotarEnlaceCaptacion(coachId);
  }

  /**
   * D17: pausa o reanuda la captación por enlace (cuerpo `{ activa: boolean }`).
   */
  @Patch('captacion')
  @Roles(Rol.ENTRENADOR)
  async actualizarCaptacion(
    @Req() req: any,
    @Body() body: unknown
  ): Promise<CaptacionEntrenadorResultadoDTO> {
    const dto = parsearContrato(ActualizarCaptacionSchema, body);
    const coachId = req.user.entrenadorId || req.user.sub;
    return this.entrenadorService.actualizarCaptacion(coachId, dto);
  }

  /**
   * Dashboard de Comando Central del Entrenador (RF-013)
   * Provee la fotografía ejecutiva del negocio y bandejas de mora/operaciones.
   * RF-010 RN-01 "Ver Dashboard de Negocio Propio": Superadmin ❌.
   */
  @Get('dashboard-comando')
  @Roles(Rol.ENTRENADOR)
  async obtenerDashboardComando(@Req() req: any): Promise<DashboardComandoDTO> {
    const coachId = req.user.entrenadorId || req.user.sub;
    return this.entrenadorService.obtenerDashboardComando(coachId);
  }
}
