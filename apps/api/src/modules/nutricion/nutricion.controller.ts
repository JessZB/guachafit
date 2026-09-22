import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  Inject,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ZodSchema } from 'zod';
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
  MetasNutricionalesSchema,
} from '@guachafit/shared';

/**
 * Valida un cuerpo con el contrato compartido y devuelve 400 con el primer mensaje del contrato.
 * El servicio vuelve a validar (defensa en profundidad para sus otros llamadores); aquí se evita
 * que un ZodError crudo termine en un 500 genérico.
 */
function parsearContrato<T>(schema: ZodSchema<T>, body: unknown): T {
  const resultado = schema.safeParse(body);
  if (!resultado.success) {
    throw new BadRequestException(resultado.error.issues[0]?.message ?? 'Datos inválidos.');
  }
  return resultado.data;
}

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
    const dto = parsearContrato(CheckinNutricionalSchema, body);
    const alumnoId = req.user.sub;
    return this.nutricionService.registrarCheckinDiario(alumnoId, dto);
  }

  /**
   * Consultar el reporte nutricional del día en curso para el alumno autenticado.
   * `timezoneCliente` (RN-05/ADR-002) resuelve el día local cuando no se envía `fecha`.
   * Rol: Alumno
   */
  @Get('checkin/hoy')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ALUMNO)
  async obtenerCheckinHoy(
    @Req() req: any,
    @Query('fecha') fecha?: string,
    @Query('timezoneCliente') timezoneCliente?: string,
    @Res({ passthrough: true }) res?: any
  ) {
    const alumnoId = req.user.sub;
    const checkin = await this.nutricionService.obtenerCheckinHoy(alumnoId, fecha, timezoneCliente);
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
    const filtro = parsearContrato(FiltroCheckinsNutricionalesSchema, query || {});
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    return this.nutricionService.listarCheckins(
      entrenadorId,
      alumnoId,
      filtro,
      req.user.rol,
      req.user.sub
    );
  }

  /**
   * Consultar las metas nutricionales del alumno autenticado (RN-01).
   * 204 si el coach aún no configuró metas (estado honesto, no un vacío fabricado).
   * Rol: Alumno
   */
  @Get('metas')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ALUMNO)
  async obtenerMisMetas(@Req() req: any, @Res({ passthrough: true }) res?: any) {
    const metas = await this.nutricionService.obtenerMetasNutricionales(req.user.sub);
    if (!metas && res) {
      res.status(HttpStatus.NO_CONTENT);
      return null;
    }
    return metas;
  }

  /**
   * Consultar las metas nutricionales de un alumno de la cartera del coach (RN-01).
   * 204 si el alumno no tiene metas configuradas. Tenancy validada en el servicio.
   * Rol: Entrenador
   */
  @Get('alumnos/:alumnoId/metas')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  async obtenerMetasAlumno(
    @Req() req: any,
    @Param('alumnoId') alumnoId: string,
    @Res({ passthrough: true }) res?: any
  ) {
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    const metas = await this.nutricionService.obtenerMetasDeAlumno(entrenadorId, alumnoId);
    if (!metas && res) {
      res.status(HttpStatus.NO_CONTENT);
      return null;
    }
    return metas;
  }

  /**
   * Definir (crear o reemplazar) las metas nutricionales de un alumno del coach (RN-01):
   * calorías, macros, agua y recursos educativos. Tenancy validada en el servicio.
   * Rol: Entrenador
   */
  @Put('alumnos/:alumnoId/metas')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  async definirMetasAlumno(
    @Req() req: any,
    @Param('alumnoId') alumnoId: string,
    @Body() body: unknown
  ) {
    const dto = parsearContrato(MetasNutricionalesSchema, body);
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    return this.nutricionService.definirMetasNutricionales(entrenadorId, alumnoId, dto);
  }
}
