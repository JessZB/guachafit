import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  Inject,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { NutricionService } from './nutricion.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AlumnoHabilitadoGuard } from '../../common/guards/alumno-habilitado.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { BloquearAlumnoEn } from '../../common/decorators/bloqueo-alumno.decorator';
import {
  Rol,
  EstadoAlumno,
  CheckinNutricionalSchema,
  FiltroCheckinsNutricionalesSchema,
} from '@guachafit/shared';

@Controller('nutricion')
export class NutricionController {
  // Token explícito (como los `@Inject(DRIZZLE_DB)` del proyecto): la inyección no depende de
  // `design:paramtypes`, que los transformadores de test (esbuild) no emiten.
  constructor(@Inject(NutricionService) private readonly nutricionService: NutricionService) {}

  /**
   * Registrar check-in nutricional diario 1-Tap con fotos de comidas opcionales (RN-02, RN-03).
   * RF-012: "enviar reportes" se bloquea al alumno pausado (403 ALUMNO_BLOQUEADO). El suspendido
   * por pago conserva este reporte: su bloqueo es de planificación, no de reportes.
   * Rol: Alumno
   */
  @Post('checkin-diario')
  @UseGuards(JwtAuthGuard, RolesGuard, AlumnoHabilitadoGuard)
  @BloquearAlumnoEn(EstadoAlumno.INACTIVO_PAUSADO)
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
  async obtenerCheckinHoy(
    @Req() req: any,
    @Query('fecha') fecha?: string,
    @Res({ passthrough: true }) res?: any
  ) {
    const alumnoId = req.user.sub;
    const checkin = await this.nutricionService.obtenerCheckinHoy(alumnoId, fecha);
    if (!checkin && res) {
      res.status(HttpStatus.NO_CONTENT);
      return null;
    }
    return checkin;
  }

  /**
   * Consultar historial de check-ins de un alumno con filtros de fechas y semáforo.
   * Roles: Entrenador (de su alumno), Alumno (propio historial)
   */
  @Get('alumnos/:alumnoId/checkins')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR, Rol.ALUMNO)
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
