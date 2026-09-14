import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Query,
  Headers,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
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
  EmitirCuotaSchema,
  ActualizarTasaCambioSchema,
  CalcularConversionSchema,
  ReportarPagoSchema,
  CobroDirectoSchema,
  CobroDirectoInteligenteSchema,
  ConciliarTransaccionSchema,
} from '@guachafit/shared';

@Controller('finanzas')
export class FinanzasController {
  constructor(private readonly finanzasService: FinanzasService) {}

  /**
   * Consulta de tasas de cambio vigentes (BCV, Paralelo, Coach, Override cliente)
   * Autenticado (Entrenador, Alumno, SuperAdmin)
   */
  @Get('tasas/vigente')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR, Rol.ALUMNO, Rol.SUPERADMIN)
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

    return this.finanzasService.obtenerTasaVigente(entrenadorId, targetClienteId);
  }

  /**
   * Actualizar tasas de cambio de referencia del entrenador
   * Rol: Entrenador
   */
  @Put('tasas')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  async actualizarTasa(@Req() req: any, @Body() body: unknown) {
    const dto = ActualizarTasaCambioSchema.parse(body);
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    return this.finanzasService.actualizarTasa(entrenadorId, dto);
  }

  /**
   * Calcular conversión bimonetaria precisa entre USD y VES
   * Autenticado (Entrenador, Alumno, SuperAdmin)
   */
  @Post('tasas/calcular')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR, Rol.ALUMNO, Rol.SUPERADMIN)
  @HttpCode(HttpStatus.OK)
  async calcularConversion(@Req() req: any, @Body() body: unknown) {
    const dto = CalcularConversionSchema.parse(body);
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
    const dto = CrearPlanMembresiaSchema.parse(body);
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
      throw new BadRequestException(`El ID de plan '${planId}' no es un UUID válido.`);
    }
    const dto = ActualizarPlanMembresiaSchema.parse(body);
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
    const dto = CrearOverridePlanSchema.parse(body);
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    return this.finanzasService.crearOverride(entrenadorId, dto);
  }

  /**
   * Emisión de cuota mensual / periódica para un alumno
   * Rol: Entrenador
   */
  @Post('cuotas/emitir')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  @HttpCode(HttpStatus.CREATED)
  async emitirCuota(@Req() req: any, @Body() body: unknown) {
    const dto = EmitirCuotaSchema.parse(body);
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    return this.finanzasService.emitirCuota(entrenadorId, dto);
  }

  /**
   * Consultar detalle de una cuota por ID
   * Rol: Entrenador, Alumno titular, SuperAdmin
   */
  @Get('cuotas/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR, Rol.ALUMNO, Rol.SUPERADMIN)
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
    const dto = ReportarPagoSchema.parse(body);
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
    const dto = CobroDirectoSchema.parse(body);
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    return this.finanzasService.cobroDirecto(cuotaId, entrenadorId, dto);
  }

  /**
   * Bandeja de conciliación bancaria del entrenador (FIFO, transacciones pendientes)
   * Rol: Entrenador
   */
  @Get('conciliacion/bandeja')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  async listarBandejaConciliacion(@Req() req: any) {
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    return this.finanzasService.listarBandejaConciliacion(entrenadorId);
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
    const dto = ConciliarTransaccionSchema.parse(body);
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    return this.finanzasService.conciliarTransaccion(transaccionId, entrenadorId, dto);
  }

  /**
   * Historial financiero y resumen del alumno (cuotas, transacciones, saldos)
   * Rol: Entrenador, Alumno titular, SuperAdmin
   */
  @Get('clientes/:clienteId/historial')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR, Rol.ALUMNO, Rol.SUPERADMIN)
  async obtenerHistorialCliente(
    @Req() req: any,
    @Param('clienteId') clienteId: string
  ) {
    if (!UUID_REGEX.test(clienteId)) {
      throw new BadRequestException('El ID del alumno debe ser un UUID válido.');
    }
    const entrenadorId =
      req.user.rol === Rol.ALUMNO
        ? req.user.entrenadorId
        : req.user.entrenadorId || req.user.sub;
    return this.finanzasService.obtenerHistorialCliente(
      entrenadorId,
      clienteId,
      req.user.sub,
      req.user.rol
    );
  }

  /**
   * Cobro directo inteligente en sala (1 paso): si no hay cuota del mes, la emite automáticamente
   * Rol: Entrenador
   */
  @Post('clientes/:clienteId/cobro-directo-inteligente')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  @HttpCode(HttpStatus.CREATED)
  async cobroDirectoInteligente(
    @Req() req: any,
    @Param('clienteId') clienteId: string,
    @Body() body: unknown
  ) {
    if (!UUID_REGEX.test(clienteId)) {
      throw new BadRequestException('El ID del alumno debe ser un UUID válido.');
    }
    const dto = CobroDirectoInteligenteSchema.parse(body);
    const entrenadorId = req.user.entrenadorId || req.user.sub;
    return this.finanzasService.cobroDirectoInteligente(entrenadorId, clienteId, dto);
  }
}
