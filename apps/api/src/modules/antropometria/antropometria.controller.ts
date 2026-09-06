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
} from '@nestjs/common';
import { AntropometriaService } from './antropometria.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  Rol,
  PresignedUploadUrlSchema,
  CheckinAntropometricoSchema,
  ConciliarAntropometriaSchema,
  FiltroEvolucionAntropometricaSchema,
  ConsultaComparadorFotograficoSchema,
} from '@guachafit/shared';

@Controller('antropometria')
export class AntropometriaController {
  constructor(private readonly antropometriaService: AntropometriaService) {}

  /**
   * Generar Presigned Upload URL PUT directa a Cloudflare R2 (ADR-007, RNF-001).
   * Roles: Entrenador, Alumno, SuperAdmin
   */
  @Post('presigned-upload-url')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR, Rol.ALUMNO, Rol.SUPERADMIN)
  @HttpCode(HttpStatus.OK)
  async solicitarPresignedUploadUrl(@Req() req: any, @Body() body: unknown) {
    const dto = PresignedUploadUrlSchema.parse(body);
    const caller = {
      id: req.user.sub,
      rol: req.user.rol,
      entrenadorId: req.user.entrenadorId,
    };
    return this.antropometriaService.solicitarPresignedUploadUrl(caller, dto);
  }

  /**
   * Registrar check-in antropométrico con auditoría RBAC híbrida (ADR-001, RF-003).
   * Roles: Entrenador, Alumno
   */
  @Post('checkin')
  @UseGuards(JwtAuthGuard, RolesGuard)
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
   * Roles: Entrenador, SuperAdmin
   */
  @Get('pendientes')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR, Rol.SUPERADMIN)
  @HttpCode(HttpStatus.OK)
  async listarPendientes(@Req() req: any) {
    const coachId = req.user.entrenadorId || req.user.sub;
    return this.antropometriaService.listarPendientes(coachId);
  }

  /**
   * Consultar historial de evolución corporal multieje con filtrado por estado Aprobado (RF-004).
   * Roles: Entrenador, Alumno titular, SuperAdmin
   */
  @Get('evolucion/:alumnoId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR, Rol.ALUMNO, Rol.SUPERADMIN)
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
   * Roles: Entrenador, Alumno titular, SuperAdmin
   */
  @Get('comparador/:alumnoId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR, Rol.ALUMNO, Rol.SUPERADMIN)
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
   * Roles: Entrenador, SuperAdmin
   */
  @Patch(':id/conciliar')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR, Rol.SUPERADMIN)
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
   * Roles: Entrenador, Alumno titular, SuperAdmin
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR, Rol.ALUMNO, Rol.SUPERADMIN)
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
