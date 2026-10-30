import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { MENSAJE_ALUMNO_NO_ENCONTRADO } from '../../common/mensajes-acceso';
import { parsearContrato } from '../../common/errores/parsear-contrato';
import { CarteraService } from './cartera.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { FiltroCarteraSchema, Rol, UUID_REGEX } from '@guachafit/shared';

/**
 * WU-I (RF-009): Tablero de Control de Cartera del coach.
 *
 * Rutas bajo `/finanzas/cartera` (misma tenancy del resto de finanzas: el coach autenticado
 * opera exclusivamente su propia cartera, `entrenadorId` viene del token).
 */
@Controller('finanzas/cartera')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CarteraController {
  constructor(private readonly carteraService: CarteraService) {}

  /**
   * KPIs + lista paginada de la pestaña activa (`mora` | `por_vencer` | `revision` | `al_dia`).
   * Envelope estándar `{ items, total, limit, offset }` + `resumen` de la cartera completa.
   * Rol: Entrenador
   */
  @Get()
  @Roles(Rol.ENTRENADOR)
  async obtenerCartera(@Req() req: any, @Query() query: unknown) {
    const dto = parsearContrato(FiltroCarteraSchema, query);
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    return this.carteraService.obtenerCartera(entrenadorId, dto);
  }

  /**
   * UX-09a (RF-009 D2): vista previa de solo lectura del recordatorio manual. Devuelve el texto
   * exacto que enviaría el POST, con `puedeEnviar` y `motivo`; no envía nada ni emite eventos.
   * Rol: Entrenador
   */
  @Get('clientes/:clienteId/recordatorio/vista-previa')
  @Roles(Rol.ENTRENADOR)
  async obtenerVistaPreviaRecordatorio(
    @Req() req: any,
    @Param('clienteId') clienteId: string
  ) {
    if (!UUID_REGEX.test(clienteId)) {
      throw new BadRequestException(MENSAJE_ALUMNO_NO_ENCONTRADO);
    }
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    return this.carteraService.obtenerVistaPreviaRecordatorio(entrenadorId, clienteId);
  }

  /**
   * RN-02: recordatorio manual de un clic al alumno (notificación FINANZAS in-app garantizada,
   * con cooldown anti-spam). `motivo` en la respuesta explica cualquier no-envío de negocio.
   * Rol: Entrenador
   */
  @Post('clientes/:clienteId/recordatorio')
  @Roles(Rol.ENTRENADOR)
  @HttpCode(HttpStatus.OK)
  async enviarRecordatorioManual(
    @Req() req: any,
    @Param('clienteId') clienteId: string
  ) {
    if (!UUID_REGEX.test(clienteId)) {
      throw new BadRequestException(MENSAJE_ALUMNO_NO_ENCONTRADO);
    }
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    return this.carteraService.enviarRecordatorioManual(entrenadorId, clienteId);
  }
}
