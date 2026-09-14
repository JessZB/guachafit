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
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { EntrenamientoService } from './entrenamiento.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  Rol,
  UUID_REGEX,
  CrearEjercicioCatalogoSchema,
  CrearSesionEntrenamientoSchema,
  GuardarRutinaSemanalSchema,
  IniciarSesionSchema,
  SincronizarSeriesBatchSchema,
  FinalizarSesionSchema,
} from '@guachafit/shared';

@Controller()
export class EntrenamientoController {
  constructor(private readonly entrenamientoService: EntrenamientoService) {}

  /**
   * Consulta pasiva de rutina programada de hoy para el alumno (RN-04).
   * No altera estado 'planificada'.
   * Rol: Alumno
   */
  @Get(['alumnos/me/sesiones/hoy', 'sesiones/hoy'])
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ALUMNO)
  async obtenerSesionHoy(
    @Req() req: any,
    @Query('timezone') timezone?: string,
    @Res({ passthrough: true }) res?: any
  ) {
    const alumnoId = req.user.sub;
    const sesion = await this.entrenamientoService.obtenerSesionHoy(alumnoId, timezone);
    if (!sesion && res) {
      res.status(HttpStatus.NO_CONTENT);
      return null;
    }
    return sesion;
  }

  /**
   * Prescripción / actualización de rutina semanal por bloques de días.
   * Rol: Entrenador
   */
  @Put('rutinas/alumno/:alumnoId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  async guardarRutinaSemanal(
    @Req() req: any,
    @Param('alumnoId') alumnoId: string,
    @Body() body: any
  ) {
    const raw = typeof body === 'object' && body !== null ? { ...body, alumnoId } : { alumnoId };
    const dto = GuardarRutinaSemanalSchema.parse(raw);
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    return this.entrenamientoService.guardarRutinaSemanal(entrenadorId, alumnoId, dto);
  }

  /**
   * Consulta de la rutina semanal activa del alumno.
   * Roles: Entrenador, Alumno, SuperAdmin
   */
  @Get('rutinas/alumno/:alumnoId/activa')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR, Rol.ALUMNO, Rol.SUPERADMIN)
  async obtenerRutinaActivaAlumno(
    @Req() req: any,
    @Param('alumnoId') alumnoId: string,
    @Res({ passthrough: true }) res?: any
  ) {
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    const rutina = await this.entrenamientoService.obtenerRutinaSemanalActiva(
      entrenadorId,
      alumnoId,
      req.user.rol,
      req.user.sub
    );
    if (!rutina && res) {
      res.status(HttpStatus.NO_CONTENT);
      return null;
    }
    return rutina;
  }

  /**
   * Prescripción de sesión de entrenamiento con ejercicios y series.
   * Rol: Entrenador
   */
  @Post('sesiones/prescribir')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  @HttpCode(HttpStatus.CREATED)
  async prescribirSesion(@Req() req: any, @Body() body: unknown) {
    const dto = CrearSesionEntrenamientoSchema.parse(body);
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    return this.entrenamientoService.crearSesion(entrenadorId, dto);
  }

  /**
   * Inicio explícito de sesión: transiciona de 'planificada' a 'en_progreso'.
   * Rol: Alumno
   */
  @Post('sesiones/:id/iniciar')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ALUMNO)
  @HttpCode(HttpStatus.OK)
  async iniciarSesion(@Req() req: any, @Param('id') sesionId: string, @Body() body: unknown) {
    const dto = IniciarSesionSchema.parse(body);
    const alumnoId = req.user.sub;
    return this.entrenamientoService.iniciarSesion(sesionId, alumnoId, dto);
  }

  /**
   * Sincronización batch de series (Offline-first checklist interactivo).
   * Rol: Alumno
   */
  @Put('sesiones/:id/series')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ALUMNO)
  async sincronizarSeries(
    @Req() req: any,
    @Param('id') sesionId: string,
    @Body() body: unknown
  ) {
    const dto = SincronizarSeriesBatchSchema.parse(body);
    const alumnoId = req.user.sub;
    return this.entrenamientoService.sincronizarSeries(sesionId, alumnoId, dto);
  }

  /**
   * Finalización de sesión: calcula cumplimiento y evalúa regla de racha (RN-02).
   * Rol: Alumno
   */
  @Post('sesiones/:id/finalizar')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ALUMNO)
  @HttpCode(HttpStatus.OK)
  async finalizarSesion(
    @Req() req: any,
    @Param('id') sesionId: string,
    @Body() body: unknown
  ) {
    const dto = FinalizarSesionSchema.parse(body);
    const alumnoId = req.user.sub;
    return this.entrenamientoService.finalizarSesion(sesionId, alumnoId, dto);
  }

  /**
   * Obtener la última sesión registrada de un alumno (auditoría coach).
   * Roles: Entrenador, SuperAdmin
   */
  @Get(['sesiones/alumno/:alumnoId/ultima', 'sesiones/:alumnoId/ultima'])
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR, Rol.SUPERADMIN)
  async obtenerUltimaSesionAlumno(
    @Req() req: any,
    @Param('alumnoId') alumnoId: string,
    @Res({ passthrough: true }) res?: any
  ) {
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    const sesion = await this.entrenamientoService.obtenerUltimaSesionAlumno(
      entrenadorId,
      alumnoId,
      req.user.rol
    );
    if (!sesion && res) {
      res.status(HttpStatus.NO_CONTENT);
      return null;
    }
    return sesion;
  }

  /**
   * Consultar historial cronológico de sesiones de un alumno (auditoría coach).
   * Roles: Entrenador, Alumno titular, SuperAdmin
   */
  @Get(['sesiones/alumno/:alumnoId/historial', 'sesiones/:alumnoId/historial'])
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR, Rol.ALUMNO, Rol.SUPERADMIN)
  async obtenerHistorialSesionesAlumno(
    @Req() req: any,
    @Param('alumnoId') alumnoId: string,
    @Query('limit') limit?: string
  ) {
    if (!UUID_REGEX.test(alumnoId)) {
      throw new BadRequestException(`El ID de alumno '${alumnoId}' no es un UUID válido.`);
    }
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    const limitNum = limit ? Math.min(Math.max(parseInt(limit, 10) || 30, 1), 100) : 30;
    return this.entrenamientoService.obtenerHistorialSesionesAlumno(
      entrenadorId,
      alumnoId,
      req.user.rol,
      limitNum
    );
  }

  /**
   * Consultar detalle de sesión por ID con aislamiento Tenancy.
   * Roles: Alumno, Entrenador, SuperAdmin
   */
  @Get('sesiones/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ALUMNO, Rol.ENTRENADOR, Rol.SUPERADMIN)
  async obtenerSesionPorId(@Req() req: any, @Param('id') sesionId: string) {
    return this.entrenamientoService.obtenerSesionPorId(
      sesionId,
      req.user.sub,
      req.user.rol,
      req.user.entrenadorId
    );
  }

  /**
   * Listar ejercicios del catálogo (Globales + específicos del coach).
   * Autenticado (Entrenador, Alumno, SuperAdmin)
   */
  @Get('ejercicios/catalogo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR, Rol.ALUMNO, Rol.SUPERADMIN)
  async listarEjercicios(@Req() req: any) {
    const entrenadorId =
      req.user.rol === Rol.ENTRENADOR
        ? req.user.entrenadorId || req.user.sub
        : req.user.entrenadorId;
    return this.entrenamientoService.listarEjercicios(entrenadorId);
  }

  /**
   * Crear nuevo ejercicio en el catálogo comercial del coach.
   * Rol: Entrenador
   */
  @Post('ejercicios/catalogo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  @HttpCode(HttpStatus.CREATED)
  async crearEjercicio(@Req() req: any, @Body() body: unknown) {
    const dto = CrearEjercicioCatalogoSchema.parse(body);
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    return this.entrenamientoService.crearEjercicio(entrenadorId, dto);
  }

  /**
   * Monitor semanal de adherencia del coach: ordena por nivel de riesgo (RN-03).
   * Rol: Entrenador
   */
  @Get('entrenador/monitor-adherencia')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  async monitorAdherencia(@Req() req: any) {
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    return this.entrenamientoService.calcularSemanaAdherencia(entrenadorId);
  }
}
