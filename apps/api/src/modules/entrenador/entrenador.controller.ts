import {
  Controller,
  Get,
  UseGuards,
  Req,
} from '@nestjs/common';
import { EntrenadorService } from './entrenador.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Rol, DashboardComandoDTO, PerfilEntrenadorDTO } from '@guachafit/shared';

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
