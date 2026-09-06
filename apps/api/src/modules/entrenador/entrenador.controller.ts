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
import { Rol, DashboardComandoDTO } from '@guachafit/shared';

@Controller('entrenador')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EntrenadorController {
  constructor(private readonly entrenadorService: EntrenadorService) {}

  /**
   * Dashboard de Comando Central del Entrenador (RF-013)
   * Provee la fotografía ejecutiva del negocio y bandejas de mora/operaciones.
   */
  @Get('dashboard-comando')
  @Roles(Rol.ENTRENADOR, Rol.SUPERADMIN)
  async obtenerDashboardComando(@Req() req: any): Promise<DashboardComandoDTO> {
    const coachId = req.user.entrenadorId || req.user.sub;
    return this.entrenadorService.obtenerDashboardComando(coachId);
  }
}
