import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PlantillasService } from './plantillas.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Rol } from '@guachafit/shared';

/**
 * RF-017: banco de plantillas de rutina del entrenador.
 * Todos los endpoints son tenant-scoped: el coach opera únicamente sobre sus plantillas.
 */
@Controller('plantillas')
export class PlantillasController {
  constructor(private readonly plantillasService: PlantillasService) {}

  /**
   * Lista las plantillas del coach autenticado.
   * `activa` opcional (true/false); omitido devuelve activas y desactivadas.
   * Rol: Entrenador
   */
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  async listarPlantillas(@Req() req: any, @Query('activa') activa?: string) {
    return this.plantillasService.listarPlantillas(this.coachId(req), this.parseActiva(activa));
  }

  /**
   * Crea una plantilla en estado Activa asociada al tenant (Escenario 1).
   * Rol: Entrenador
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  @HttpCode(HttpStatus.CREATED)
  async crearPlantilla(@Req() req: any, @Body() body: unknown) {
    return this.plantillasService.crearPlantilla(this.coachId(req), body as any);
  }

  /**
   * Detalle de una plantilla del coach (404 si pertenece a otro tenant).
   * Rol: Entrenador
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  async obtenerPlantilla(@Req() req: any, @Param('id') id: string) {
    return this.plantillasService.obtenerPlantilla(this.coachId(req), id);
  }

  /**
   * Edita nombre, nivel objetivo, bloques y/o estado activo de una plantilla propia.
   * Rol: Entrenador
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  async actualizarPlantilla(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    return this.plantillasService.actualizarPlantilla(this.coachId(req), id, body as any);
  }

  /**
   * Desactiva (soft delete) una plantilla del coach.
   * Rol: Entrenador
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  async desactivarPlantilla(@Req() req: any, @Param('id') id: string) {
    return this.plantillasService.desactivarPlantilla(this.coachId(req), id);
  }

  /**
   * Asigna la plantilla a uno o más alumnos (REEMPLAZAR / FUSIONAR), con ajustes
   * opcionales de cargas/series/reps y reporte de éxito/fallo por alumno.
   * Rol: Entrenador
   */
  @Post(':id/asignar')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  @HttpCode(HttpStatus.OK)
  async asignarPlantilla(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    return this.plantillasService.asignarPlantilla(this.coachId(req), id, body as any);
  }

  private coachId(req: any): string {
    return req.user.entrenadorId || req.user.sub;
  }

  private parseActiva(activa?: string): boolean | undefined {
    if (activa === undefined || activa === null || activa === '') return undefined;
    if (activa === 'true' || activa === '1') return true;
    if (activa === 'false' || activa === '0') return false;
    return undefined;
  }
}
