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
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { EntrenamientoService } from './entrenamiento.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AlumnoHabilitadoGuard } from '../../common/guards/alumno-habilitado.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { BloquearAlumnoEn } from '../../common/decorators/bloqueo-alumno.decorator';
import {
  Rol,
  EstadoAlumno,
  UUID_REGEX,
  CrearEjercicioCatalogoSchema,
  CrearSesionEntrenamientoSchema,
  GuardarRutinaSemanalSchema,
  IniciarSesionSchema,
  SincronizarSeriesBatchSchema,
  FinalizarSesionSchema,
  EntrenarBloqueHoySchema,
  LIMITE_HISTORIAL_SESIONES_POR_DEFECTO,
  LIMITE_HISTORIAL_SESIONES_MAXIMO,
  LIMITE_MONITOR_ADHERENCIA_POR_DEFECTO,
  LIMITE_MONITOR_ADHERENCIA_MAXIMO,
  FiltroMonitorAdherenciaSchema,
} from '@guachafit/shared';

@Controller()
export class EntrenamientoController {
  constructor(private readonly entrenamientoService: EntrenamientoService) {}

  /**
   * Consulta pasiva y READ-ONLY de la sesión de hoy para el alumno (RF-001 Escenario 1 / RN-04).
   * Admite bloqueId opcional para consultar un bloque específico; NO crea, reemplaza ni elimina sesiones.
   * Para instanciar o cambiar de bloque existe la acción explícita `entrenarBloqueHoy`.
   * RF-012: pausado/suspendido no ven planificación (403 ALUMNO_BLOQUEADO).
   * Rol: Alumno
   */
  @Get(['alumnos/me/sesiones/hoy', 'sesiones/hoy'])
  @UseGuards(JwtAuthGuard, RolesGuard, AlumnoHabilitadoGuard)
  @BloquearAlumnoEn(EstadoAlumno.INACTIVO_PAUSADO, EstadoAlumno.SUSPENDIDO_PAGO)
  @Roles(Rol.ALUMNO)
  async obtenerSesionHoy(
    @Req() req: any,
    @Query('timezone') timezone?: string,
    @Query('bloqueId') bloqueId?: string,
    @Res({ passthrough: true }) res?: any
  ) {
    const alumnoId = req.user.sub;
    const sesion = await this.entrenamientoService.obtenerSesionHoy(alumnoId, timezone, bloqueId);
    if (!sesion && res) {
      res.status(HttpStatus.NO_CONTENT);
      return null;
    }
    return sesion;
  }

  /**
   * Acción explícita del alumno para entrenar un bloque hoy (RN-04): instancia o cambia la sesión
   * del día sin destruir sesiones existentes. Con `iniciarInmediato: true` (repetir un bloque ya
   * completado) la nueva sesión arranca directamente 'en_progreso' conservando el historial previo.
   * RF-012: pausado/suspendido no pueden iniciar nuevas sesiones (403 ALUMNO_BLOQUEADO).
   * Rol: Alumno
   */
  @Post('alumnos/me/sesiones/bloques/:bloqueId/entrenar-hoy')
  @UseGuards(JwtAuthGuard, RolesGuard, AlumnoHabilitadoGuard)
  @BloquearAlumnoEn(EstadoAlumno.INACTIVO_PAUSADO, EstadoAlumno.SUSPENDIDO_PAGO)
  @Roles(Rol.ALUMNO)
  @HttpCode(HttpStatus.OK)
  async entrenarBloqueHoy(
    @Req() req: any,
    @Param('bloqueId') bloqueId: string,
    @Body() body: unknown,
    @Headers('x-idempotency-key') idempotencyHeader?: string
  ) {
    const dto = EntrenarBloqueHoySchema.parse(body ?? {});
    return this.entrenamientoService.entrenarBloqueHoy(
      req.user.sub,
      bloqueId,
      dto,
      idempotencyHeader
    );
  }

  /**
   * Progreso de la semana en curso (Lunes a Domingo) por bloques de entrenamiento.
   * RF-012: la planificación (incluida la semana en curso) se bloquea a pausado/suspendido.
   * Rol: Alumno
   */
  @Get('alumnos/me/rutina/semana-actual')
  @UseGuards(JwtAuthGuard, RolesGuard, AlumnoHabilitadoGuard)
  @BloquearAlumnoEn(EstadoAlumno.INACTIVO_PAUSADO, EstadoAlumno.SUSPENDIDO_PAGO)
  @Roles(Rol.ALUMNO)
  async obtenerSemanaActualProgreso(
    @Req() req: any,
    @Query('timezone') timezone?: string
  ) {
    const alumnoId = req.user.sub;
    return this.entrenamientoService.obtenerSemanaActualProgreso(alumnoId, timezone);
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
   * RF-012: "bloqueo de visualización de nuevas rutinas" para pausado/suspendido (el coach que
   * consulta la ficha del alumno no se ve afectado: el guard sólo evalúa al rol Alumno).
   * Roles: Entrenador, Alumno
   */
  @Get('rutinas/alumno/:alumnoId/activa')
  @UseGuards(JwtAuthGuard, RolesGuard, AlumnoHabilitadoGuard)
  @BloquearAlumnoEn(EstadoAlumno.INACTIVO_PAUSADO, EstadoAlumno.SUSPENDIDO_PAGO)
  @Roles(Rol.ENTRENADOR, Rol.ALUMNO)
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
   * RF-012: pausado/suspendido no pueden iniciar sesiones (403 ALUMNO_BLOQUEADO).
   * Rol: Alumno
   */
  @Post('sesiones/:id/iniciar')
  @UseGuards(JwtAuthGuard, RolesGuard, AlumnoHabilitadoGuard)
  @BloquearAlumnoEn(EstadoAlumno.INACTIVO_PAUSADO, EstadoAlumno.SUSPENDIDO_PAGO)
  @Roles(Rol.ALUMNO)
  @HttpCode(HttpStatus.OK)
  async iniciarSesion(
    @Req() req: any,
    @Param('id') sesionId: string,
    @Body() body: unknown,
    @Headers('x-idempotency-key') idempotencyHeader?: string
  ) {
    const dto = IniciarSesionSchema.parse(body);
    const alumnoId = req.user.sub;
    return this.entrenamientoService.iniciarSesion(sesionId, alumnoId, dto, idempotencyHeader);
  }

  /**
   * Sincronización batch de series (Offline-first checklist interactivo).
   * RF-012: el checklist interactivo se bloquea a pausado/suspendido (403 ALUMNO_BLOQUEADO).
   * Rol: Alumno
   */
  @Put('sesiones/:id/series')
  @UseGuards(JwtAuthGuard, RolesGuard, AlumnoHabilitadoGuard)
  @BloquearAlumnoEn(EstadoAlumno.INACTIVO_PAUSADO, EstadoAlumno.SUSPENDIDO_PAGO)
  @Roles(Rol.ALUMNO)
  async sincronizarSeries(
    @Req() req: any,
    @Param('id') sesionId: string,
    @Body() body: unknown,
    @Headers('x-idempotency-key') idempotencyHeader?: string
  ) {
    const dto = SincronizarSeriesBatchSchema.parse(body);
    const alumnoId = req.user.sub;
    return this.entrenamientoService.sincronizarSeries(sesionId, alumnoId, dto, idempotencyHeader);
  }

  /**
   * Finalización de sesión: calcula cumplimiento y evalúa regla de racha (RN-02).
   * RF-012: el checklist interactivo se bloquea a pausado/suspendido (403 ALUMNO_BLOQUEADO).
   * Rol: Alumno
   */
  @Post('sesiones/:id/finalizar')
  @UseGuards(JwtAuthGuard, RolesGuard, AlumnoHabilitadoGuard)
  @BloquearAlumnoEn(EstadoAlumno.INACTIVO_PAUSADO, EstadoAlumno.SUSPENDIDO_PAGO)
  @Roles(Rol.ALUMNO)
  @HttpCode(HttpStatus.OK)
  async finalizarSesion(
    @Req() req: any,
    @Param('id') sesionId: string,
    @Body() body: unknown,
    @Headers('x-idempotency-key') idempotencyHeader?: string
  ) {
    const dto = FinalizarSesionSchema.parse(body);
    const alumnoId = req.user.sub;
    return this.entrenamientoService.finalizarSesion(sesionId, alumnoId, dto, idempotencyHeader);
  }

  /**
   * Obtener la última sesión registrada de un alumno (auditoría coach).
   * Solo sesiones COMPLETADA o EN_PROGRESO; excluye PLANIFICADA y OMITIDA.
   * Rol: Entrenador
   */
  @Get(['sesiones/alumno/:alumnoId/ultima', 'sesiones/:alumnoId/ultima'])
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  async obtenerUltimaSesionAlumno(
    @Req() req: any,
    @Param('alumnoId') alumnoId: string,
    @Res({ passthrough: true }) res?: any
  ) {
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    const sesion = await this.entrenamientoService.obtenerUltimaSesionAlumno(
      entrenadorId,
      alumnoId,
      req.user.rol,
      req.user.sub
    );
    if (!sesion && res) {
      res.status(HttpStatus.NO_CONTENT);
      return null;
    }
    return sesion;
  }

  /**
   * Consultar historial cronológico de sesiones de un alumno (auditoría coach).
   * WU24: envelope `{ items, total, limit, offset }`; `offset` opcional (default 0) y `limit`
   * opcional (default 30, techo 100). El `total` es el COUNT real del historial del alumno.
   * Roles: Entrenador, Alumno titular
   */
  @Get(['sesiones/alumno/:alumnoId/historial', 'sesiones/:alumnoId/historial'])
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR, Rol.ALUMNO)
  async obtenerHistorialSesionesAlumno(
    @Req() req: any,
    @Param('alumnoId') alumnoId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ) {
    if (!UUID_REGEX.test(alumnoId)) {
      throw new BadRequestException(`El ID de alumno '${alumnoId}' no es un UUID válido.`);
    }
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    const limitNum = limit
      ? Math.min(
          Math.max(parseInt(limit, 10) || LIMITE_HISTORIAL_SESIONES_POR_DEFECTO, 1),
          LIMITE_HISTORIAL_SESIONES_MAXIMO
        )
      : LIMITE_HISTORIAL_SESIONES_POR_DEFECTO;
    const offsetNum = offset ? Math.max(parseInt(offset, 10) || 0, 0) : 0;
    return this.entrenamientoService.obtenerHistorialSesionesAlumno(
      entrenadorId,
      alumnoId,
      req.user.rol,
      limitNum,
      offsetNum,
      req.user.sub
    );
  }

  /**
   * Consultar detalle de sesión por ID con aislamiento Tenancy.
   * Roles: Alumno, Entrenador
   */
  @Get('sesiones/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ALUMNO, Rol.ENTRENADOR)
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
   * Autenticado (Entrenador, Alumno)
   */
  @Get('ejercicios/catalogo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR, Rol.ALUMNO)
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
   * `timezone` (opcional, IANA) define el Lunes 00:00 local de la ventana; default UTC.
   * WU24: envelope `{ items, total, limit, offset, resumen }`; `limit` default 25 (techo 100) y
   * `offset` default 0. `resumen` cuenta la cartera completa, no la página.
   * WU25a: `q` (nombre, literal y sin distinguir mayúsculas/acentos) y `semaforo`
   * (rojo|amarillo|verde|sinPlan|sinPendientes) filtran ANTES del slice sin alterar `resumen`.
   * WU26: `orden` (`riesgo` default | `nombre`) se aplica ANTES del slice; ambos órdenes son
   * totales (desempate por `alumnoId`) y mantienen la paginación por offset coherente.
   * Rol: Entrenador
   */
  @Get('entrenador/monitor-adherencia')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  async monitorAdherencia(
    @Req() req: any,
    @Query('timezone') timezone?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('q') q?: string,
    @Query('semaforo') semaforo?: string,
    @Query('orden') orden?: string
  ) {
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    const limitNum = limit
      ? Math.min(
          Math.max(parseInt(limit, 10) || LIMITE_MONITOR_ADHERENCIA_POR_DEFECTO, 1),
          LIMITE_MONITOR_ADHERENCIA_MAXIMO
        )
      : LIMITE_MONITOR_ADHERENCIA_POR_DEFECTO;
    const offsetNum = offset ? Math.max(parseInt(offset, 10) || 0, 0) : 0;
    // WU25a/WU26: validación Zod de los filtros nuevos (400 ante valores fuera del contrato).
    const filtro = FiltroMonitorAdherenciaSchema.parse({ q, semaforo, orden });
    return this.entrenamientoService.calcularSemanaAdherencia(
      entrenadorId,
      timezone,
      limitNum,
      offsetNum,
      filtro
    );
  }
}
