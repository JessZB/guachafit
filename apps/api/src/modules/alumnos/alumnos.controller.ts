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
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { AlumnosService } from './alumnos.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  Rol,
  UUID_REGEX,
  AltaManualAlumnoSchema,
  RegistroPublicoAlumnoSchema,
  CambioEstadoAlumnoSchema,
  ActualizarPerfilAlumnoSchema,
  FiltroDirectorioAlumnosSchema,
  RestaurarAlumnoSchema,
} from '@guachafit/shared';

@Controller('alumnos')
export class AlumnosController {
  constructor(private readonly alumnosService: AlumnosService) {}

  /**
   * Alta Manual de Alumno por el Entrenador (RF-011, Vía A)
   */
  @Post('manual')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  @HttpCode(HttpStatus.CREATED)
  async altaManual(@Req() req: any, @Body() body: unknown) {
    const dto = AltaManualAlumnoSchema.parse(body);
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    return this.alumnosService.crearAlumnoManual(entrenadorId, dto);
  }

  /**
   * Registro Público Autónomo de Alumno (RF-011, Vía B - Deep Link con coachCode)
   */
  @Post('registro-publico')
  @HttpCode(HttpStatus.CREATED)
  async registroPublico(@Body() body: unknown) {
    const dto = RegistroPublicoAlumnoSchema.parse(body);
    return this.alumnosService.registroPublico(dto);
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
      throw new BadRequestException('El ID del alumno debe ser un UUID válido.');
    }
    const dto = CambioEstadoAlumnoSchema.parse(body);
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    return this.alumnosService.cambiarEstado(entrenadorId, alumnoId, dto);
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
      throw new BadRequestException('El ID del alumno debe ser un UUID válido.');
    }
    const dto = ActualizarPerfilAlumnoSchema.parse(body);
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
      throw new BadRequestException('El ID del alumno debe ser un UUID válido.');
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
      throw new BadRequestException('El ID del alumno debe ser un UUID válido.');
    }
    const dto = body && typeof body === 'object' && Object.keys(body).length > 0
      ? RestaurarAlumnoSchema.parse(body)
      : undefined;
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    return this.alumnosService.restaurarAlumno(entrenadorId, alumnoId, dto);
  }

  /**
   * Listar Directorio de Alumnos del Entrenador (RF-011, RF-012)
   */
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR, Rol.SUPERADMIN)
  async listarAlumnos(@Req() req: any, @Query() query: unknown) {
    const filtro = query && typeof query === 'object' && Object.keys(query).length > 0
      ? FiltroDirectorioAlumnosSchema.parse(query)
      : undefined;
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    return this.alumnosService.listarAlumnos(entrenadorId, filtro);
  }

  /**
   * Consultar Perfil de Alumno por ID con RBAC y Aislamiento Tenancy
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR, Rol.ALUMNO, Rol.SUPERADMIN)
  async obtenerPorId(@Req() req: any, @Param('id') alumnoId: string) {
    if (!UUID_REGEX.test(alumnoId)) {
      throw new BadRequestException('El ID del alumno debe ser un UUID válido.');
    }
    return this.alumnosService.obtenerPorId(
      alumnoId,
      req.user.sub,
      req.user.rol,
      req.user.entrenadorId
    );
  }
}
