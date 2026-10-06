import {
  Controller,
  Post,
  Patch,
  Delete,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  Inject,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { parsearContrato } from '../../common/errores/parsear-contrato';
import { AlumnosService } from './alumnos.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { LimitarIntentosPublico } from '../../common/guards/limite-intentos.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  Rol,
  UUID_REGEX,
  COACH_CODE_REGEX,
  AltaManualAlumnoSchema,
  RegistroPublicoAlumnoSchema,
  CambioEstadoAlumnoSchema,
  ActualizarPerfilAlumnoSchema,
  ActualizarZonaHorariaAlumnoSchema,
  FiltroDirectorioAlumnosSchema,
  RestaurarAlumnoSchema,
  AltaManualAlumnoResultadoDTO,
  CoachPublicoDTO,
} from '@guachafit/shared';

@Controller('alumnos')
export class AlumnosController {
  // Token explícito (como los `@Inject(DRIZZLE_DB)` del proyecto): la inyección no depende de
  // `design:paramtypes`, que los transformadores de test (esbuild) no emiten.
  constructor(@Inject(AlumnosService) private readonly alumnosService: AlumnosService) {}

  /**
   * Alta Manual de Alumno por el Entrenador (RF-011, Vía A)
   */
  @Post('manual')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  @HttpCode(HttpStatus.CREATED)
  async altaManual(@Req() req: any, @Body() body: unknown): Promise<AltaManualAlumnoResultadoDTO> {
    const dto = parsearContrato(AltaManualAlumnoSchema, body);
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    return this.alumnosService.crearAlumnoManual(entrenadorId, dto);
  }

  /**
   * Registro Público Autónomo de Alumno (RF-011, Vía B - Deep Link con coachCode)
   */
  @Post('registro-publico')
  @HttpCode(HttpStatus.CREATED)
  // A5: registro público sin sesión, 20/min por IP.
  @LimitarIntentosPublico()
  async registroPublico(@Body() body: unknown) {
    const dto = parsearContrato(RegistroPublicoAlumnoSchema, body);
    return this.alumnosService.registroPublico(dto);
  }

  /**
   * Resolución Pública del coach_code para el deep link de captación (RF-011, RN-06/RN-07.1).
   * No requiere autenticación: solo identidad comercial del coach si el código existe y su
   * licencia está vigente. Declarado antes de `GET /alumnos/:id` para que el segmento `coach`
   * nunca se interprete como un ID de alumno.
   */
  @Get('coach/:code')
  @HttpCode(HttpStatus.OK)
  // A5: evita barrer códigos de coach por fuerza bruta (20/min por IP).
  @LimitarIntentosPublico()
  async resolverCoachPublico(@Param('code') code: string): Promise<CoachPublicoDTO> {
    const codigo = (code ?? '').trim().toUpperCase();
    if (!COACH_CODE_REGEX.test(codigo)) {
      throw new BadRequestException(
        'El código de entrenador no es válido o no está disponible. Por favor contacta a tu coach.'
      );
    }
    return this.alumnosService.resolverCoachPublico(codigo);
  }

  /**
   * Cambio de Estado de Activación y Ciclo de Vida (RF-012)
   */
  @Patch(':id/estado')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  async cambiarEstado(
    @Req() req: any,
    @Param('id') alumnoId: string,
    @Body() body: unknown
  ) {
    if (!UUID_REGEX.test(alumnoId)) {
      throw new BadRequestException('El alumno indicado no es válido.');
    }
    const dto = parsearContrato(CambioEstadoAlumnoSchema, body);
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    return this.alumnosService.cambiarEstado(entrenadorId, alumnoId, dto);
  }

  /**
   * LOTE API-N2 (RF-002): el alumno cambia su propia zona horaria (la que decide la ventana y el
   * plazo del reporte nutricional). El perfil sale del token, nunca del cuerpo. La consulta propia
   * viaja en `GET /auth/me` (`usuario.zonaHoraria`); el coach la gestiona en `PATCH /alumnos/:id`.
   * Rol: Alumno
   */
  @Patch('me/zona-horaria')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ALUMNO)
  async actualizarMiZonaHoraria(@Req() req: any, @Body() body: unknown) {
    const dto = parsearContrato(ActualizarZonaHorariaAlumnoSchema, body);
    return this.alumnosService.actualizarZonaHorariaPropia(req.user.sub, dto);
  }

  /**
   * Edición completa de la ficha e información de alumnos por el entrenador (RF-011, RF-012)
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  async actualizarAlumno(
    @Req() req: any,
    @Param('id') alumnoId: string,
    @Body() body: unknown
  ) {
    if (!UUID_REGEX.test(alumnoId)) {
      throw new BadRequestException('El alumno indicado no es válido.');
    }
    const dto = parsearContrato(ActualizarPerfilAlumnoSchema, body);
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    return this.alumnosService.actualizarAlumno(entrenadorId, alumnoId, dto);
  }

  /**
   * Baja Lógica de Alumno (Soft Delete, RF-012)
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  async softDelete(@Req() req: any, @Param('id') alumnoId: string) {
    if (!UUID_REGEX.test(alumnoId)) {
      throw new BadRequestException('El alumno indicado no es válido.');
    }
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    return this.alumnosService.softDelete(entrenadorId, alumnoId);
  }

  /**
   * Restauración de Alumno Dado de Baja Lógica (RF-012)
   */
  @Patch(':id/restaurar')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  async restaurarAlumno(
    @Req() req: any,
    @Param('id') alumnoId: string,
    @Body() body: unknown
  ) {
    if (!UUID_REGEX.test(alumnoId)) {
      throw new BadRequestException('El alumno indicado no es válido.');
    }
    const dto = body && typeof body === 'object' && Object.keys(body).length > 0
      ? parsearContrato(RestaurarAlumnoSchema, body)
      : undefined;
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    return this.alumnosService.restaurarAlumno(entrenadorId, alumnoId, dto);
  }

  /**
   * Listar Directorio de Alumnos del Entrenador (RF-011, RF-012)
   * Rol: Entrenador (RF-010 RN-01: el superadmin no accede al negocio del coach)
   */
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  async listarAlumnos(@Req() req: any, @Query() query: unknown) {
    const filtro = query && typeof query === 'object' && Object.keys(query).length > 0
      ? parsearContrato(FiltroDirectorioAlumnosSchema, query)
      : undefined;
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    return this.alumnosService.listarAlumnos(entrenadorId, filtro);
  }

  /**
   * Consultar Perfil de Alumno por ID con RBAC y Aislamiento Tenancy
   * Roles: Entrenador (su cartera), Alumno (su propio perfil)
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR, Rol.ALUMNO)
  async obtenerPorId(@Req() req: any, @Param('id') alumnoId: string) {
    if (!UUID_REGEX.test(alumnoId)) {
      throw new BadRequestException('El alumno indicado no es válido.');
    }
    return this.alumnosService.obtenerPorId(
      alumnoId,
      req.user.sub,
      req.user.rol,
      req.user.entrenadorId
    );
  }
}
