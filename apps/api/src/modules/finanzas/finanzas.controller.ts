import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { MENSAJE_ALUMNO_NO_ENCONTRADO } from '../../common/mensajes-acceso';
import { parsearContrato } from '../../common/errores/parsear-contrato';
import { FinanzasService } from './finanzas.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  Rol,
  UUID_REGEX,
  CrearPlanMembresiaSchema,
  ActualizarPlanMembresiaSchema,
  CrearOverridePlanSchema,
  ActualizarTasaCambioSchema,
  CalcularConversionSchema,
  ReportarPagoSchema,
  CobroDirectoSchema,
  CobroDirectoInteligenteSchema,
  ConciliarTransaccionSchema,
  RevertirPagoSchema,
  AsignarSuscripcionSchema,
  LIMITE_BANDEJA_CONCILIACION_POR_DEFECTO,
  LIMITE_BANDEJA_CONCILIACION_MAXIMO,
  LIMITE_TRANSACCIONES_HISTORIAL_MAXIMO,
} from '@guachafit/shared';

@Controller('finanzas')
export class FinanzasController {
  constructor(private readonly finanzasService: FinanzasService) {}

  /**
   * Consulta de tasas de cambio vigentes (BCV, Paralelo, Coach, Override cliente)
   * Autenticado (Entrenador, Alumno)
   */
  @Get('tasas/vigente')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR, Rol.ALUMNO)
  async obtenerTasaVigente(@Req() req: any, @Query('clienteId') clienteId?: string) {
    let entrenadorId = req.user.entrenadorId;
    let targetClienteId = clienteId;

    if (req.user.rol === Rol.ALUMNO) {
      targetClienteId = req.user.sub;
      if (!entrenadorId) {
        // En caso de que no venga en el token, FinanzasService lo busca
        entrenadorId = req.user.entrenadorId;
      }
    } else {
      entrenadorId = req.user.entrenadorId || req.user.sub;
    }

    if (!entrenadorId) {
      throw new BadRequestException('No se pudo determinar el contexto del entrenador para la tasa.');
    }

    // RNF-003/ADR-011 (etapa 3): la tasa override lee `perfiles_alumno` (RLS); el contexto RLS
    // es el del actor (self del alumno, tenant del coach).
    return this.finanzasService.obtenerTasaVigente(
      entrenadorId,
      targetClienteId,
      undefined,
      req.user.rol === Rol.ALUMNO ? { usuarioId: req.user.sub } : { entrenadorId }
    );
  }

  /**
   * Actualizar tasas de cambio de referencia del entrenador
   * Rol: Entrenador
   */
  @Put('tasas')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  async actualizarTasa(@Req() req: any, @Body() body: unknown) {
    const dto = parsearContrato(ActualizarTasaCambioSchema, body);
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    return this.finanzasService.actualizarTasa(entrenadorId, dto);
  }

  /**
   * Calcular conversión bimonetaria precisa entre USD y VES
   * Autenticado (Entrenador, Alumno)
   */
  @Post('tasas/calcular')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR, Rol.ALUMNO)
  @HttpCode(HttpStatus.OK)
  async calcularConversion(@Req() req: any, @Body() body: unknown) {
    const dto = parsearContrato(CalcularConversionSchema, body);
    const entrenadorId =
      req.user.rol === Rol.ALUMNO
        ? req.user.entrenadorId
        : req.user.entrenadorId || req.user.sub;

    if (!entrenadorId) {
      throw new BadRequestException('No se pudo determinar el contexto del entrenador para el cálculo.');
    }

    return this.finanzasService.calcularConversion(
      dto,
      entrenadorId,
      req.user.sub,
      req.user.rol
    );
  }

  /**
   * Crear plan estándar en el catálogo comercial
   * Rol: Entrenador
   */
  @Post('planes')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  @HttpCode(HttpStatus.CREATED)
  async crearPlan(@Req() req: any, @Body() body: unknown) {
    const dto = parsearContrato(CrearPlanMembresiaSchema, body);
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    return this.finanzasService.crearPlan(entrenadorId, dto);
  }

  /**
   * Listar planes del catálogo del entrenador
   * Rol: Entrenador
   */
  @Get('planes')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  async listarPlanes(@Req() req: any) {
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    return this.finanzasService.listarPlanesPorEntrenador(entrenadorId);
  }

  /**
   * Actualizar un plan comercial del catálogo
   * Rol: Entrenador
   */
  @Patch('planes/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  async actualizarPlan(
    @Req() req: any,
    @Param('id') planId: string,
    @Body() body: unknown
  ) {
    if (!UUID_REGEX.test(planId)) {
      throw new BadRequestException('No encontramos ese plan. Puede que se haya eliminado.');
    }
    const dto = parsearContrato(ActualizarPlanMembresiaSchema, body);
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    return this.finanzasService.actualizarPlan(entrenadorId, planId, dto);
  }

  /**
   * Crear o actualizar override de precio/tasa para un cliente específico
   * Rol: Entrenador
   */
  @Post('planes/override')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  @HttpCode(HttpStatus.CREATED)
  async crearOverride(@Req() req: any, @Body() body: unknown) {
    const dto = parsearContrato(CrearOverridePlanSchema, body);
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    return this.finanzasService.crearOverride(entrenadorId, dto);
  }

  /**
   * Listar overrides del catálogo comercial (RF-005 RN-02)
   * - Sin `clienteId`: todos los overrides de la cartera del entrenador.
   * - Con `clienteId` (usuarioId o perfilId): solo los del alumno, con aislamiento de tenant.
   * Rol: Entrenador
   */
  @Get('planes/override')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  async listarOverrides(@Req() req: any, @Query('clienteId') clienteId?: string) {
    if (clienteId !== undefined && !UUID_REGEX.test(clienteId)) {
      throw new BadRequestException(MENSAJE_ALUMNO_NO_ENCONTRADO);
    }
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    return this.finanzasService.listarOverrides(entrenadorId, clienteId || undefined);
  }

  /**
   * Eliminar el override de un alumno (RF-005 RN-02): vuelve a heredar los valores del plan.
   * Rol: Entrenador
   */
  @Delete('planes/override/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  async eliminarOverride(@Req() req: any, @Param('id') overrideId: string) {
    if (!UUID_REGEX.test(overrideId)) {
      throw new BadRequestException('No encontramos ese precio especial. Puede que se haya eliminado.');
    }
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    return this.finanzasService.eliminarOverride(entrenadorId, overrideId);
  }

  /**
   * Plan asignado al alumno y su ciclo de cobro (M5-L1, RF-005 / RF-008); `null` si no tiene.
   * Rol: Entrenador
   */
  @Get('suscripciones/:clienteId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  async obtenerSuscripcion(@Req() req: any, @Param('clienteId') clienteId: string) {
    if (!UUID_REGEX.test(clienteId)) {
      throw new BadRequestException(MENSAJE_ALUMNO_NO_ENCONTRADO);
    }
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    return this.finanzasService.obtenerSuscripcion(entrenadorId, clienteId);
  }

  /**
   * Asigna o cambia el plan del alumno; sus cuotas se emiten solas desde entonces (M5-L1).
   * `fechaInicio` solo se envía con el primer plan.
   * Rol: Entrenador
   */
  @Put('suscripciones/:clienteId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  async asignarSuscripcion(
    @Req() req: any,
    @Param('clienteId') clienteId: string,
    @Body() body: unknown
  ) {
    if (!UUID_REGEX.test(clienteId)) {
      throw new BadRequestException(MENSAJE_ALUMNO_NO_ENCONTRADO);
    }
    const dto = parsearContrato(AsignarSuscripcionSchema, body);
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    return this.finanzasService.asignarSuscripcion(entrenadorId, clienteId, dto);
  }

  /**
   * Quita el plan del alumno: deja de renovarse; las cuotas emitidas no cambian (M5-L1).
   * Rol: Entrenador
   */
  @Delete('suscripciones/:clienteId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  async quitarSuscripcion(@Req() req: any, @Param('clienteId') clienteId: string) {
    if (!UUID_REGEX.test(clienteId)) {
      throw new BadRequestException(MENSAJE_ALUMNO_NO_ENCONTRADO);
    }
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    return this.finanzasService.quitarSuscripcion(entrenadorId, clienteId);
  }

  /**
   * Consultar detalle de una cuota por ID
   * Roles: Entrenador, Alumno titular
   */
  @Get('cuotas/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR, Rol.ALUMNO)
  async obtenerCuota(@Req() req: any, @Param('id') cuotaId: string) {
    return this.finanzasService.obtenerCuotaPorId(
      cuotaId,
      req.user.sub,
      req.user.rol,
      req.user.entrenadorId
    );
  }

  /**
   * Reporte de abono o liquidación por el alumno titular con X-Idempotency-Key
   * Rol: Alumno
   */
  @Post('cuotas/:id/reportar-pago')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ALUMNO)
  @HttpCode(HttpStatus.CREATED)
  async reportarPago(
    @Req() req: any,
    @Param('id') cuotaId: string,
    @Headers('x-idempotency-key') idempotencyHeader: string | undefined,
    @Body() body: unknown
  ) {
    const dto = parsearContrato(ReportarPagoSchema, body);
    const alumnoUserId = req.user.sub;
    return this.finanzasService.reportarPago(
      cuotaId,
      alumnoUserId,
      dto,
      idempotencyHeader
    );
  }

  /**
   * Registro de cobro directo en efectivo en sala por el entrenador (auto-aprobado)
   * Rol: Entrenador
   */
  @Post('cuotas/:id/cobro-directo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  @HttpCode(HttpStatus.CREATED)
  async cobroDirecto(
    @Req() req: any,
    @Param('id') cuotaId: string,
    @Body() body: unknown
  ) {
    const dto = parsearContrato(CobroDirectoSchema, body);
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    return this.finanzasService.cobroDirecto(cuotaId, entrenadorId, dto);
  }

  /**
   * Bandeja de conciliación bancaria del entrenador (FIFO, transacciones pendientes)
   * WU24b: envelope `{ items, total, limit, offset }`; `limit` default 25 (techo 100) y
   * `offset` default 0. El orden FIFO por fecha de reporte se mantiene.
   * Rol: Entrenador
   */
  @Get('conciliacion/bandeja')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  async listarBandejaConciliacion(
    @Req() req: any,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ) {
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    const limitNum = limit
      ? Math.min(
          Math.max(parseInt(limit, 10) || LIMITE_BANDEJA_CONCILIACION_POR_DEFECTO, 1),
          LIMITE_BANDEJA_CONCILIACION_MAXIMO
        )
      : LIMITE_BANDEJA_CONCILIACION_POR_DEFECTO;
    const offsetNum = offset ? Math.max(parseInt(offset, 10) || 0, 0) : 0;
    return this.finanzasService.listarBandejaConciliacion(entrenadorId, limitNum, offsetNum);
  }

  /**
   * Conciliar transacción (aprobar o rechazar) bajo transacción ACID y bloqueo pesimista
   * Rol: Entrenador
   */
  @Patch('transacciones/:id/conciliar')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  async conciliarTransaccion(
    @Req() req: any,
    @Param('id') transaccionId: string,
    @Body() body: unknown
  ) {
    const dto = parsearContrato(ConciliarTransaccionSchema, body);
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    return this.finanzasService.conciliarTransaccion(transaccionId, entrenadorId, dto);
  }

  /**
   * RF-007: revertir un pago aprobado por error (motivo obligatorio). Rol: Entrenador dueño.
   */
  @Post('transacciones/:id/revertir')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  @HttpCode(HttpStatus.OK)
  async revertirTransaccion(
    @Req() req: any,
    @Param('id') transaccionId: string,
    @Body() body: unknown
  ) {
    if (!UUID_REGEX.test(transaccionId)) {
      throw new NotFoundException('No encontramos ese pago. Actualiza la pantalla.');
    }
    const dto = parsearContrato(RevertirPagoSchema, body);
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    return this.finanzasService.revertirTransaccion(transaccionId, entrenadorId, dto);
  }

  /**
   * Historial financiero y resumen del alumno (cuotas, transacciones, saldos)
   * WU24b: `transaccionesTotal` es el COUNT real SIEMPRE presente. `txLimit`/`txOffset` son
   * OPT-IN: sin ellos `transacciones` trae todas (contrato histórico del resumen).
   * Roles: Entrenador, Alumno titular
   */
  @Get('clientes/:clienteId/historial')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR, Rol.ALUMNO)
  async obtenerHistorialCliente(
    @Req() req: any,
    @Param('clienteId') clienteId: string,
    @Query('txLimit') txLimit?: string,
    @Query('txOffset') txOffset?: string
  ) {
    if (!UUID_REGEX.test(clienteId)) {
      throw new BadRequestException(MENSAJE_ALUMNO_NO_ENCONTRADO);
    }
    const entrenadorId =
      req.user.rol === Rol.ALUMNO
        ? req.user.entrenadorId
        : req.user.entrenadorId || req.user.sub;

    // WU24b: un valor ausente o no numérico de `txLimit` conserva el default "todas".
    const txLimitParsed = txLimit !== undefined ? parseInt(txLimit, 10) : NaN;
    const txLimitNum = Number.isFinite(txLimitParsed)
      ? Math.min(Math.max(txLimitParsed, 1), LIMITE_TRANSACCIONES_HISTORIAL_MAXIMO)
      : undefined;
    const txOffsetNum = txOffset ? Math.max(parseInt(txOffset, 10) || 0, 0) : 0;

    return this.finanzasService.obtenerHistorialCliente(
      entrenadorId,
      clienteId,
      req.user.sub,
      req.user.rol,
      txLimitNum,
      txOffsetNum
    );
  }

  /**
   * Cobro directo inteligente en sala (1 paso): cobra la cuota abierta más antigua o adelanta la
   * próxima de la suscripción. `x-idempotency-key` evita cobrar dos veces ante un doble clic.
   * Rol: Entrenador
   */
  @Post('clientes/:clienteId/cobro-directo-inteligente')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  @HttpCode(HttpStatus.CREATED)
  async cobroDirectoInteligente(
    @Req() req: any,
    @Param('clienteId') clienteId: string,
    @Headers('x-idempotency-key') idempotencyHeader: string | undefined,
    @Body() body: unknown
  ) {
    if (!UUID_REGEX.test(clienteId)) {
      throw new BadRequestException(MENSAJE_ALUMNO_NO_ENCONTRADO);
    }
    const dto = parsearContrato(CobroDirectoInteligenteSchema, body);
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    return this.finanzasService.cobroDirectoInteligente(
      entrenadorId,
      clienteId,
      dto,
      idempotencyHeader
    );
  }
}
