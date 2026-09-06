import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { NutricionService } from './nutricion.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  Rol,
  CheckinNutricionalSchema,
  FiltroCheckinsNutricionalesSchema,
} from '@guachafit/shared';

@Controller('nutricion')
export class NutricionController {
  constructor(private readonly nutricionService: NutricionService) {}

  /**
   * Registrar check-in nutricional diario 1-Tap con fotos de comidas opcionales (RN-02, RN-03).
   * Rol: Alumno
   */
  @Post('checkin-diario')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ALUMNO)
  @HttpCode(HttpStatus.CREATED)
  async registrarCheckinDiario(@Req() req: any, @Body() body: unknown) {
    const dto = CheckinNutricionalSchema.parse(body);
    const alumnoId = req.user.sub;
    return this.nutricionService.registrarCheckinDiario(alumnoId, dto);
  }

  /**
   * Consultar el reporte nutricional del día en curso para el alumno autenticado.
   * Rol: Alumno
   */
  @Get('checkin/hoy')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ALUMNO)
  async obtenerCheckinHoy(@Req() req: any, @Query('fecha') fecha?: string) {
    const alumnoId = req.user.sub;
    return this.nutricionService.obtenerCheckinHoy(alumnoId, fecha);
  }

  /**
   * Consultar historial de check-ins de un alumno con filtros de fechas y semáforo.
   * Roles: Entrenador (de su alumno), Alumno (propio historial), SuperAdmin
   */
  @Get('alumnos/:alumnoId/checkins')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR, Rol.ALUMNO, Rol.SUPERADMIN)
  async listarCheckins(
    @Req() req: any,
    @Param('alumnoId') alumnoId: string,
    @Query() query: unknown
  ) {
    const filtro = FiltroCheckinsNutricionalesSchema.parse(query || {});
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    return this.nutricionService.listarCheckins(
      entrenadorId,
      alumnoId,
      filtro,
      req.user.rol,
      req.user.sub
    );
  }
}
