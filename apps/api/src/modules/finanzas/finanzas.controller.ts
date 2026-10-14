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
} from '@nestjs/common';
import { FinanzasService } from './finanzas.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Rol } from '@guachafit/shared';
import {
  actualizarPlanControlador,
  actualizarTasaControlador,
  anularCuotaControlador,
  asignarSuscripcionControlador,
  calcularConversionControlador,
  cobroDirectoControlador,
  cobroDirectoInteligenteControlador,
  conciliarTransaccionControlador,
  crearOverrideControlador,
  crearPlanControlador,
  eliminarOverrideControlador,
  listarBandejaConciliacionControlador,
  listarOverridesControlador,
  listarPlanesControlador,
  obtenerCuotaControlador,
  obtenerHistorialClienteControlador,
  obtenerSuscripcionControlador,
  obtenerTasaVigenteControlador,
  quitarSuscripcionControlador,
  reportarPagoControlador,
  revertirTransaccionControlador,
} from './controlador-finanzas';

@Controller('finanzas')
export class FinanzasController {
  constructor(private readonly finanzasService: FinanzasService) {}

  /** Consulta de tasas vigentes (BCV, Paralelo, Coach, Override del cliente). Entrenador y Alumno. */
  @Get('tasas/vigente')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR, Rol.ALUMNO)
  async obtenerTasaVigente(@Req() req: any, @Query('clienteId') clienteId?: string) {
    return obtenerTasaVigenteControlador(this.finanzasService, req.user, clienteId);
  }

  /** Actualiza las tasas de referencia del entrenador. Entrenador. */
  @Put('tasas')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  async actualizarTasa(@Req() req: any, @Body() body: unknown) {
    return actualizarTasaControlador(this.finanzasService, req.user, body);
  }

  /** Conversión bimonetaria precisa entre USD y VES. Entrenador y Alumno. */
  @Post('tasas/calcular')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR, Rol.ALUMNO)
  @HttpCode(HttpStatus.OK)
  async calcularConversion(@Req() req: any, @Body() body: unknown) {
    return calcularConversionControlador(this.finanzasService, req.user, body);
  }

  /** Crea un plan estándar del catálogo comercial. Entrenador. */
  @Post('planes')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  @HttpCode(HttpStatus.CREATED)
  async crearPlan(@Req() req: any, @Body() body: unknown) {
    return crearPlanControlador(this.finanzasService, req.user, body);
  }

  /** Lista los planes del catálogo del entrenador. Entrenador. */
  @Get('planes')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  async listarPlanes(@Req() req: any) {
    return listarPlanesControlador(this.finanzasService, req.user);
  }

  /** Actualiza un plan comercial del catálogo. Entrenador. */
  @Patch('planes/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  async actualizarPlan(@Req() req: any, @Param('id') planId: string, @Body() body: unknown) {
    return actualizarPlanControlador(this.finanzasService, req.user, planId, body);
  }

  /** Crea o actualiza el override de precio/tasa de un cliente. Entrenador. */
  @Post('planes/override')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  @HttpCode(HttpStatus.CREATED)
  async crearOverride(@Req() req: any, @Body() body: unknown) {
    return crearOverrideControlador(this.finanzasService, req.user, body);
  }

  /** Lista overrides (RF-005 RN-02): sin clienteId, toda la cartera; con clienteId, solo el alumno. Entrenador. */
  @Get('planes/override')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  async listarOverrides(@Req() req: any, @Query('clienteId') clienteId?: string) {
    return listarOverridesControlador(this.finanzasService, req.user, clienteId);
  }

  /** Elimina el override de un alumno (RF-005 RN-02): hereda de nuevo el plan. Entrenador. */
  @Delete('planes/override/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  async eliminarOverride(@Req() req: any, @Param('id') overrideId: string) {
    return eliminarOverrideControlador(this.finanzasService, req.user, overrideId);
  }

  /** Plan y ciclo de cobro del alumno (M5-L1, RF-005/RF-008); null si no tiene. Entrenador. */
  @Get('suscripciones/:clienteId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  async obtenerSuscripcion(@Req() req: any, @Param('clienteId') clienteId: string) {
    return obtenerSuscripcionControlador(this.finanzasService, req.user, clienteId);
  }

  /** Asigna o cambia el plan del alumno (M5-L1); fechaInicio solo con el primer plan. Entrenador. */
  @Put('suscripciones/:clienteId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  async asignarSuscripcion(@Req() req: any, @Param('clienteId') clienteId: string, @Body() body: unknown) {
    return asignarSuscripcionControlador(this.finanzasService, req.user, clienteId, body);
  }

  /** Quita el plan del alumno (M5-L1): no renueva; cuotas emitidas intactas. Entrenador. */
  @Delete('suscripciones/:clienteId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  async quitarSuscripcion(@Req() req: any, @Param('clienteId') clienteId: string) {
    return quitarSuscripcionControlador(this.finanzasService, req.user, clienteId);
  }

  /** Detalle de una cuota por ID. Entrenador y Alumno titular. */
  @Get('cuotas/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR, Rol.ALUMNO)
  async obtenerCuota(@Req() req: any, @Param('id') cuotaId: string) {
    return obtenerCuotaControlador(this.finanzasService, req.user, cuotaId);
  }

  /** Reporte de abono del alumno titular con X-Idempotency-Key. Alumno. */
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
    return reportarPagoControlador(this.finanzasService, req.user, cuotaId, idempotencyHeader, body);
  }

  /** Cobro directo en efectivo en sala (auto-aprobado). Entrenador. */
  @Post('cuotas/:id/cobro-directo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  @HttpCode(HttpStatus.CREATED)
  async cobroDirecto(@Req() req: any, @Param('id') cuotaId: string, @Body() body: unknown) {
    return cobroDirectoControlador(this.finanzasService, req.user, cuotaId, body);
  }

  /** RF-008: anula una cuota sin pagos (motivo obligatorio). Entrenador dueño. */
  @Post('cuotas/:id/anular')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  @HttpCode(HttpStatus.OK)
  async anularCuota(@Req() req: any, @Param('id') cuotaId: string, @Body() body: unknown) {
    return anularCuotaControlador(this.finanzasService, req.user, cuotaId, body);
  }

  /** Bandeja de conciliación FIFO (WU24b: envelope items/total/limit/offset; limit 25, techo 100; offset 0). Entrenador. */
  @Get('conciliacion/bandeja')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  async listarBandejaConciliacion(@Req() req: any, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return listarBandejaConciliacionControlador(this.finanzasService, req.user, limit, offset);
  }

  /** Concilia una transacción (aprobar o rechazar) con ACID y bloqueo pesimista. Entrenador. */
  @Patch('transacciones/:id/conciliar')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  async conciliarTransaccion(@Req() req: any, @Param('id') transaccionId: string, @Body() body: unknown) {
    return conciliarTransaccionControlador(this.finanzasService, req.user, transaccionId, body);
  }

  /** RF-007: revierte un pago aprobado por error (motivo obligatorio). Entrenador dueño. */
  @Post('transacciones/:id/revertir')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR)
  @HttpCode(HttpStatus.OK)
  async revertirTransaccion(@Req() req: any, @Param('id') transaccionId: string, @Body() body: unknown) {
    return revertirTransaccionControlador(this.finanzasService, req.user, transaccionId, body);
  }

  /** Historial y resumen del alumno (WU24b: transaccionesTotal siempre; txLimit/txOffset opt-in, sin ellos trae todas). Entrenador y Alumno titular. */
  @Get('clientes/:clienteId/historial')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Rol.ENTRENADOR, Rol.ALUMNO)
  async obtenerHistorialCliente(
    @Req() req: any,
    @Param('clienteId') clienteId: string,
    @Query('txLimit') txLimit?: string,
    @Query('txOffset') txOffset?: string
  ) {
    return obtenerHistorialClienteControlador(this.finanzasService, req.user, clienteId, txLimit, txOffset);
  }

  /** Cobro directo inteligente en sala (1 paso); x-idempotency-key evita el doble cobro. Entrenador. */
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
    return cobroDirectoInteligenteControlador(this.finanzasService, req.user, clienteId, idempotencyHeader, body);
  }
}
