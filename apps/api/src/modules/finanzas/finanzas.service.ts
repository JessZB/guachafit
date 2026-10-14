import {
  Injectable,
  Inject,
  Logger,
  Optional,
} from '@nestjs/common';
import {
  type PlanFila,
  type PerfilAlumnoFila,
  type CuotaFila,
  type EmisionCiclo,
  type ResolucionTasa,
} from './casos-finanzas/finanzas-reglas';
// Re-export de la API pública de reglas puras (P1): `cartera.service.ts`,
// `billing-reminder.processor.ts`, `cuota-estado.helper.ts` y 4 specs las
// importan desde `./finanzas.service`.
export {
  toCents,
  fromCents,
  roundHalfToEven,
  addDecimals,
  subtractDecimals,
  multiplyDecimals,
  divideDecimalsBankers,
  toIsoSafe,
  assertBalanceInvariant,
  repartirAbono,
  aplicarSaldoAFavorACuota,
  mensajeCobroConExcedente,
  mensajePagoAprobado,
  estadoCuotaTrasRetirarAbono,
  esFechaPagoFutura,
} from './casos-finanzas/finanzas-reglas';
import { resolverTasa as resolverTasaRegla } from './casos-finanzas/finanzas-reglas';
import type { ContextoFinanzas } from './casos-finanzas/contexto-finanzas';
import {
  actualizarTasaCaso,
  calcularContravalorUSDCaso,
  calcularConversionCaso,
  obtenerTasaVigenteCaso,
  proyectarVESCaso,
} from './casos-finanzas/tasas-conversion';
import {
  actualizarPlanCaso,
  crearPlanCaso,
  listarPlanesPorEntrenadorCaso,
} from './casos-finanzas/planes';
import {
  crearOverrideCaso,
  eliminarOverrideCaso,
} from './casos-finanzas/overrides';
import { listarOverridesCaso } from './casos-finanzas/overrides-lectura';
import {
  asignarSuscripcionCaso,
  obtenerSuscripcionCaso,
  quitarSuscripcionCaso,
} from './casos-finanzas/suscripciones';
import {
  emitirCuotasProgramadasCaso,
  reconciliarRecordatoriosCaso,
} from './casos-finanzas/emision-programada';
import { emitirCuotaDeCicloEnTxCaso } from './casos-finanzas/emision-ciclo';
import { obtenerCuotaPorIdCaso } from './casos-finanzas/cuotas-lectura';
import { listarBandejaConciliacionCaso } from './casos-finanzas/bandeja-conciliacion';
import { obtenerHistorialClienteCaso } from './casos-finanzas/historial-cliente';
import { reportarPagoCaso } from './casos-finanzas/reportar-pago';
import { cobroDirectoCaso } from './casos-finanzas/cobro-directo';
import { conciliarTransaccionCaso } from './casos-finanzas/conciliar-transaccion';
import { revertirTransaccionCaso } from './casos-finanzas/revertir-transaccion';
import { anularCuotaCaso } from './casos-finanzas/anular-cuota';
import { cobroDirectoInteligenteCaso } from './casos-finanzas/cobro-inteligente';
import { resolverComprobanteUrlCaso } from './casos-finanzas/comprobantes';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { R2StorageService } from '../antropometria/r2-storage.service';
import { BillingSchedulerService } from './billing-scheduler.service';
import { RegistroIdempotencia } from '../../common/idempotencia/registro-idempotencia';
import { DRIZZLE_DB, WITH_TENANT } from '../../database/database.module';
import {
  Database,
  TenantRlsContext,
  TenantTransaction,
  WithTenantFn,
  withTenant as withTenantBase,
} from '@guachafit/database';
import {
  Rol,
  CrearPlanMembresiaDTO,
  ActualizarPlanMembresiaDTO,
  CrearOverridePlanDTO,
  ActualizarTasaCambioDTO,
  CalcularConversionDTO,
  ReportarPagoDTO,
  CobroDirectoDTO,
  CobroDirectoInteligenteDTO,
  ConciliarTransaccionDTO,
  RevertirPagoDTO,
  AnularCuotaDTO,
  AsignarSuscripcionDTO,
  SuscripcionAlumnoDTO,
  PlanMembresiaDetalleDTO,
  OverridePlanDetalleDTO,
  EliminarOverridePlanResultadoDTO,
  CuotaDetalleDTO,
  TransaccionPagoDetalleDTO,
  BandejaConciliacionDTO,
  CalculoConversionDTO,
  TasaCambioVigenteDTO,
  ResumenFinancieroAlumnoDTO,
  LIMITE_BANDEJA_CONCILIACION_POR_DEFECTO,
} from '@guachafit/shared';

// =============================================================================
// FACHADA PRINCIPAL DE FINANZAS (P1): conserva archivo, clase, decoradores,
// constructor y todos los métodos; cada uno delega en su caso de uso (P2).
// =============================================================================

@Injectable()
export class FinanzasService {
  // Registro de idempotencia en memoria para reintentos inmediatos por lag de red (RNF-002 §4):
  // con TTL (24 h) y tope de entradas, une los reintentos simultáneos con la misma clave a una sola
  // ejecución y no recuerda los fallos.
  private readonly idempotencia = new RegistroIdempotencia();

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    // RF-014 RN-01 (ADR-010): finanzas publica eventos de dominio; jamás llama al despachador.
    @Optional() private readonly eventEmitter?: EventEmitter2,
    @Optional() private readonly r2StorageService?: R2StorageService,
    @Optional() private readonly billingSchedulerService?: BillingSchedulerService,
    // RNF-003/ADR-011 (etapa 2): `planes_membresia`, `cuotas_membresia` y `transacciones_pago`
    // tienen RLS; toda consulta corre dentro de `withTenant` con el contexto del actor.
    @Optional() @Inject(WITH_TENANT) withTenant?: WithTenantFn
  ) {
    this.withTenant = withTenant ?? ((context, fn) => withTenantBase(context, fn, this.db));
    this.ctx = {
      db: this.db,
      withTenant: this.withTenant,
      eventEmitter: this.eventEmitter,
      r2StorageService: this.r2StorageService,
      billingSchedulerService: this.billingSchedulerService,
      idempotencia: this.idempotencia,
      logger: this.logger,
    };
  }

  private readonly withTenant: WithTenantFn;

  private readonly logger = new Logger(FinanzasService.name);

  /** Contexto de dependencias explícito de los casos de uso (P2). */
  private readonly ctx: ContextoFinanzas;

  // WU-I: público para que el servicio de cartera reutilice la MISMA resolución de
  // comprobantes (presigned URL con TTL, `null` honesto si R2 no está configurado o falla).
  async resolverComprobanteUrl(storageKey?: string | null): Promise<string | null> {
    return resolverComprobanteUrlCaso(this.ctx, storageKey);
  }

  // 1. Motor bimonetario (RF-006, ADR-003, RNF-002). Detalle en `tasas-conversion.caso.ts`.
  resolverTasa(tasaActivaCoach: string | null, tasaOverrideCliente?: string | null): ResolucionTasa {
    return resolverTasaRegla(tasaActivaCoach, tasaOverrideCliente);
  }

  proyectarVES(saldoUsd: string, tasa: string): string {
    return proyectarVESCaso(saldoUsd, tasa);
  }

  calcularContravalorUSD(montoVES: string, tasaReporte: string): string {
    return calcularContravalorUSDCaso(montoVES, tasaReporte);
  }

  async calcularConversion(dto: CalcularConversionDTO, entrenadorId: string, actorUserId?: string, actorRole?: Rol): Promise<CalculoConversionDTO> {
    return calcularConversionCaso(this.ctx, dto, entrenadorId, actorUserId, actorRole);
  }

  // 2. Tasas de cambio (RF-006, ADR-003). Detalle en `tasas-conversion.caso.ts`.
  async actualizarTasa(entrenadorId: string, dto: ActualizarTasaCambioDTO): Promise<TasaCambioVigenteDTO> {
    return actualizarTasaCaso(this.ctx, entrenadorId, dto);
  }

  async obtenerTasaVigente(entrenadorId: string, clienteId?: string, tx?: TenantTransaction, contexto?: TenantRlsContext): Promise<TasaCambioVigenteDTO & { esTasaOverride: boolean }> {
    return obtenerTasaVigenteCaso(this.ctx, entrenadorId, clienteId, tx, contexto);
  }

  // 3. Catálogo de planes y overrides (RF-005). Detalle en `planes.caso.ts` y `overrides*.caso.ts`.
  async crearPlan(entrenadorId: string, dto: CrearPlanMembresiaDTO): Promise<PlanMembresiaDetalleDTO> {
    return crearPlanCaso(this.ctx, entrenadorId, dto);
  }

  async listarPlanesPorEntrenador(entrenadorId: string): Promise<PlanMembresiaDetalleDTO[]> {
    return listarPlanesPorEntrenadorCaso(this.ctx, entrenadorId);
  }

  async actualizarPlan(entrenadorId: string, planId: string, dto: ActualizarPlanMembresiaDTO): Promise<PlanMembresiaDetalleDTO> {
    return actualizarPlanCaso(this.ctx, entrenadorId, planId, dto);
  }

  async crearOverride(entrenadorId: string, dto: CrearOverridePlanDTO): Promise<OverridePlanDetalleDTO> {
    return crearOverrideCaso(this.ctx, entrenadorId, dto);
  }

  async listarOverrides(entrenadorId: string, clienteId?: string): Promise<OverridePlanDetalleDTO[]> {
    return listarOverridesCaso(this.ctx, entrenadorId, clienteId);
  }

  async eliminarOverride(entrenadorId: string, overrideId: string): Promise<EliminarOverridePlanResultadoDTO> {
    return eliminarOverrideCaso(this.ctx, entrenadorId, overrideId);
  }

  // 4b. Suscripción del alumno y emisión automática (M5-L1, RF-005/RF-008).
  async asignarSuscripcion(entrenadorId: string, clienteId: string, dto: AsignarSuscripcionDTO, ahora: Date = new Date()): Promise<SuscripcionAlumnoDTO> {
    return asignarSuscripcionCaso(this.ctx, entrenadorId, clienteId, dto, ahora);
  }

  async quitarSuscripcion(entrenadorId: string, clienteId: string, ahora: Date = new Date()): Promise<{ desactivada: true }> {
    return quitarSuscripcionCaso(this.ctx, entrenadorId, clienteId, ahora);
  }

  async obtenerSuscripcion(entrenadorId: string, clienteId: string): Promise<SuscripcionAlumnoDTO | null> {
    return obtenerSuscripcionCaso(this.ctx, entrenadorId, clienteId);
  }

  async emitirCuotasProgramadas(ahora: Date = new Date()): Promise<{ evaluadas: number; emitidas: number; omitidas: number }> {
    return emitirCuotasProgramadasCaso(this.ctx, ahora);
  }

  async reconciliarRecordatorios(ahora: Date = new Date()): Promise<{ evaluadas: number; agendadas: number }> {
    return reconciliarRecordatoriosCaso(this.ctx, ahora);
  }

  // Contrato P1 (`as any` en `rf006-saldo-favor.spec.ts:1215`): se conserva en la fachada.
  private async emitirCuotaDeCicloEnTx(tx: TenantTransaction, perfil: PerfilAlumnoFila, plan: PlanFila, corte: string, ahora: Date): Promise<EmisionCiclo> {
    return emitirCuotaDeCicloEnTxCaso(tx, perfil, plan, corte, ahora);
  }

  // 4d. Lectura de cuota por id (RF-008, RNF-002, RNF-003).
  async obtenerCuotaPorId(cuotaId: string, actorUserId: string, actorRole: Rol, actorEntrenadorId?: string): Promise<CuotaDetalleDTO> {
    return obtenerCuotaPorIdCaso(this.ctx, cuotaId, actorUserId, actorRole, actorEntrenadorId);
  }

  // 5. Reporte de pago por alumno & idempotencia (RF-007, RNF-002).
  async reportarPago(cuotaId: string, alumnoUserId: string, dto: ReportarPagoDTO, idempotencyHeader?: string): Promise<{ transaccion: TransaccionPagoDetalleDTO; cuota: CuotaDetalleDTO; esDuplicadoIdempotente: boolean; mensaje: string }> {
    return reportarPagoCaso(this.ctx, cuotaId, alumnoUserId, dto, idempotencyHeader);
  }

  // 6. Cobro directo en sala por el coach (RF-007).
  async cobroDirecto(cuotaId: string, entrenadorId: string, dto: CobroDirectoDTO): Promise<{ transaccion: TransaccionPagoDetalleDTO; cuota: CuotaDetalleDTO; mensaje: string }> {
    return cobroDirectoCaso(this.ctx, cuotaId, entrenadorId, dto);
  }

  // 7. Conciliación con bloqueo pesimista (RNF-002).
  async conciliarTransaccion(transaccionId: string, entrenadorId: string, dto: ConciliarTransaccionDTO): Promise<{ transaccion: TransaccionPagoDetalleDTO; cuota: CuotaDetalleDTO; mensaje: string }> {
    return conciliarTransaccionCaso(this.ctx, transaccionId, entrenadorId, dto);
  }

  // 8. Reversión de pago aprobado (RF-007, RNF-002).
  async revertirTransaccion(transaccionId: string, entrenadorId: string, dto: RevertirPagoDTO, ahora: Date = new Date()): Promise<{ transaccion: TransaccionPagoDetalleDTO; cuota: CuotaDetalleDTO; mensaje: string }> {
    return revertirTransaccionCaso(this.ctx, transaccionId, entrenadorId, dto, ahora);
  }

  // 9. Anulación de cuota (RF-008, RNF-002).
  async anularCuota(cuotaId: string, entrenadorId: string, dto: AnularCuotaDTO, ahora: Date = new Date()): Promise<{ cuota: CuotaDetalleDTO; saldoAFavorDevueltoUsd: string; mensaje: string }> {
    return anularCuotaCaso(this.ctx, cuotaId, entrenadorId, dto, ahora);
  }

  // 10. Bandeja de conciliación del entrenador, FIFO (RF-007).
  async listarBandejaConciliacion(entrenadorId: string, limit = LIMITE_BANDEJA_CONCILIACION_POR_DEFECTO, offset = 0): Promise<BandejaConciliacionDTO> {
    return listarBandejaConciliacionCaso(this.ctx, entrenadorId, limit, offset);
  }

  // 11. Historial financiero 360 del alumno (RF-009).
  async obtenerHistorialCliente(entrenadorId: string, clienteId: string, actorUserId: string, actorRole: Rol, txLimit?: number, txOffset = 0): Promise<ResumenFinancieroAlumnoDTO> {
    return obtenerHistorialClienteCaso(this.ctx, entrenadorId, clienteId, actorUserId, actorRole, txLimit, txOffset);
  }

  // 12. Cobro directo inteligente en 1 paso (RF-009 RN-01).
  async cobroDirectoInteligente(entrenadorId: string, clienteId: string, dto: CobroDirectoInteligenteDTO | CobroDirectoDTO, idempotencyKey?: string, ahora: Date = new Date()) {
    return cobroDirectoInteligenteCaso(this.ctx, entrenadorId, clienteId, dto, idempotencyKey, ahora);
  }
}
