import {
  Controller,
  Get,
  Post,
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
import { AntropometriaService } from './antropometria.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AlumnoHabilitadoGuard } from '../../common/guards/alumno-habilitado.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { BloquearAlumnoEn } from '../../common/decorators/bloqueo-alumno.decorator';
import {
  Rol,
  EstadoAlumno,
  PresignedUploadUrlSchema,
  CheckinAntropometricoSchema,
  ConciliarAntropometriaSchema,
  FiltroEvolucionAntropometricaSchema,
  ConsultaComparadorFotograficoSchema,
  LIMITE_COLA_ANTROPOMETRIA_POR_DEFECTO,
  LIMITE_COLA_ANTROPOMETRIA_MAXIMO,
} from '@guachafit/shared';

@Controller('antropometria')
export class AntropometriaController {
  constructor(private readonly antropometriaService: AntropometriaService) {}

  /**
   * Generar Presigned Upload URL PUT directa a Cloudflare R2 (ADR-007, RNF-001).
   * El contrato se valida aquí con 400 (mensaje del contrato) antes de tocar el servicio:
   * un MIME no permitido (p. ej. PDF fuera de `nutricion-recursos`) nunca debe ser un 500.
   * Roles: Entrenador, Alumno
   */
  @Post('presigned-upload-url')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR, Rol.ALUMNO)
  @HttpCode(HttpStatus.OK)
  async solicitarPresignedUploadUrl(@Req() req: any, @Body() body: unknown) {
    const validacion = PresignedUploadUrlSchema.safeParse(body);
    if (!validacion.success) {
      throw new BadRequestException(
        validacion.error.issues[0]?.message ?? 'Datos de subida inválidos.'
      );
    }
    const caller = {
      id: req.user.sub,
      rol: req.user.rol,
      entrenadorId: req.user.entrenadorId,
    };
    return this.antropometriaService.solicitarPresignedUploadUrl(caller, validacion.data);
  }

  /**
   * Registrar check-in antropométrico con auditoría RBAC híbrida (ADR-001, RF-003).
   * RF-012: el check-in remoto es un reporte del alumno y se bloquea si está pausado
   * (403 ALUMNO_BLOQUEADO). El registro presencial del entrenador no se ve afectado: el guard
   * sólo evalúa al rol Alumno.
   * Roles: Entrenador, Alumno
   */
  @Post('checkin')
  @UseGuards(JwtAuthGuard, RolesGuard, AlumnoHabilitadoGuard)
  @BloquearAlumnoEn(EstadoAlumno.INACTIVO_PAUSADO)
  @Roles(Rol.ENTRENADOR, Rol.ALUMNO)
  @HttpCode(HttpStatus.CREATED)
  async registrarCheckin(@Req() req: any, @Body() body: unknown) {
    const dto = CheckinAntropometricoSchema.parse(body);
    const caller = {
      id: req.user.sub,
      rol: req.user.rol,
      entrenadorId: req.user.entrenadorId,
    };
    return this.antropometriaService.registrarCheckin(caller, dto);
  }

  /**
   * Listar controles pendientes de validación para la bandeja del coach.
   * WU24b: envelope `{ items, total, limit, offset }`; `limit` default 25 (techo 100) y
   * `offset` default 0. El orden por fecha de evaluación descendente se mantiene.
   * Rol: Entrenador
   */
  @Get('pendientes')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  @HttpCode(HttpStatus.OK)
  async listarPendientes(
    @Req() req: any,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ) {
    const coachId = req.user.entrenadorId || req.user.sub;
    const limitNum = limit
      ? Math.min(
          Math.max(parseInt(limit, 10) || LIMITE_COLA_ANTROPOMETRIA_POR_DEFECTO, 1),
          LIMITE_COLA_ANTROPOMETRIA_MAXIMO
        )
      : LIMITE_COLA_ANTROPOMETRIA_POR_DEFECTO;
    const offsetNum = offset ? Math.max(parseInt(offset, 10) || 0, 0) : 0;
    return this.antropometriaService.listarPendientes(coachId, limitNum, offsetNum);
  }

  /**
   * Consultar historial de evolución corporal multieje con filtrado por estado Aprobado (RF-004).
   * Roles: Entrenador, Alumno titular
   */
  @Get('evolucion/:alumnoId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR, Rol.ALUMNO)
  @HttpCode(HttpStatus.OK)
  async obtenerEvolucion(
    @Req() req: any,
    @Param('alumnoId') alumnoId: string,
    @Query() query: unknown
  ) {
    const filtro = FiltroEvolucionAntropometricaSchema.parse(query || {});
    const caller = {
      id: req.user.sub,
      rol: req.user.rol,
      entrenadorId: req.user.entrenadorId,
    };
    return this.antropometriaService.obtenerEvolucion(alumnoId, filtro, caller);
  }

  /**
   * Comparador fotográfico angular entre dos fechas de control (RF-004).
   * Roles: Entrenador, Alumno titular
   */
  @Get('comparador/:alumnoId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR, Rol.ALUMNO)
  @HttpCode(HttpStatus.OK)
  async obtenerComparativaFotografica(
    @Req() req: any,
    @Param('alumnoId') alumnoId: string,
    @Query() query: unknown
  ) {
    const dto = ConsultaComparadorFotograficoSchema.parse(query);
    const caller = {
      id: req.user.sub,
      rol: req.user.rol,
      entrenadorId: req.user.entrenadorId,
    };
    return this.antropometriaService.obtenerComparativaFotografica(alumnoId, dto, caller);
  }

  /**
   * Conciliar (aprobar o rechazar) un check-in remoto (RF-003).
   * Rol: Entrenador
   */
  @Patch(':id/conciliar')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  @HttpCode(HttpStatus.OK)
  async conciliarControl(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: unknown
  ) {
    const dto = ConciliarAntropometriaSchema.parse(body);
    const coachId = req.user.entrenadorId || req.user.sub;
    return this.antropometriaService.conciliarControl(coachId, id, dto);
  }

  /**
   * Obtener detalle de un control antropométrico por su ID.
   * Roles: Entrenador, Alumno titular
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR, Rol.ALUMNO)
  @HttpCode(HttpStatus.OK)
  async obtenerControlPorId(@Req() req: any, @Param('id') id: string) {
    const caller = {
      id: req.user.sub,
      rol: req.user.rol,
      entrenadorId: req.user.entrenadorId,
    };
    return this.antropometriaService.obtenerControlPorId(id, caller);
  }
}
