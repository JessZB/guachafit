import {
  Controller,
  Post,
  Patch,
  Delete,
  Get,
  Body,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AlumnosService } from './alumnos.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  Rol,
  AltaManualAlumnoSchema,
  RegistroPublicoAlumnoSchema,
  CambioEstadoAlumnoSchema,
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
    const dto = CambioEstadoAlumnoSchema.parse(body);
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    return this.alumnosService.cambiarEstado(entrenadorId, alumnoId, dto);
  }

  /**
   * Baja Lógica de Alumno (Soft Delete, RF-012)
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  async softDelete(@Req() req: any, @Param('id') alumnoId: string) {
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    return this.alumnosService.softDelete(entrenadorId, alumnoId);
  }

  /**
   * Consultar Perfil de Alumno por ID con RBAC y Aislamiento Tenancy
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR, Rol.ALUMNO, Rol.SUPERADMIN)
  async obtenerPorId(@Req() req: any, @Param('id') alumnoId: string) {
    return this.alumnosService.obtenerPorId(
      alumnoId,
      req.user.sub,
      req.user.rol,
      req.user.entrenadorId
    );
  }
}
