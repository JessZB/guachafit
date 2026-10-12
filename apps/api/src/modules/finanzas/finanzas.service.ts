import {
  Injectable,
  Inject,
  Logger,
  Optional,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import {
  MENSAJE_ALUMNO_FUERA_DE_LISTA,
  MENSAJE_ALUMNO_NO_ENCONTRADO,
} from '../../common/mensajes-acceso';

/** Cuota o pago inexistente (o de otro coach), en lenguaje claro y con tuteo. */
const MENSAJE_CUOTA_NO_ENCONTRADA = 'No encontramos esa cuota. Actualiza la pantalla.';
const MENSAJE_PAGO_NO_ENCONTRADO = 'No encontramos ese pago. Actualiza la pantalla.';
const MENSAJE_REFERENCIA_DUPLICADA =
  'Esta referencia ya ha sido registrada previamente para este método y fecha de operación.';
const MENSAJE_SIN_PLAN_ASIGNADO = 'Este alumno no tiene un plan asignado.';

/** M5-L1 (RF-005): ventana válida de la fecha de inicio del primer plan, en días locales. */
const DIAS_MAXIMOS_INICIO_PASADO = 30;
const DIAS_MAXIMOS_INICIO_FUTURO = 60;

/** Índice único de referencias por entrenador (migración 0018). */
const INDICE_REFERENCIA_POR_ENTRENADOR = 'uq_transaccion_referencia_entrenador';
const INDICE_CUOTA_POR_PERIODO = 'uq_cuota_cliente_plan_periodo';
const MENSAJE_CUOTA_EN_PREPARACION =
  'No pudimos preparar la próxima cuota de este alumno. Actualiza la pantalla e inténtalo de nuevo.';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { R2StorageService } from '../antropometria/r2-storage.service';
import { BillingSchedulerService } from './billing-scheduler.service';
import { parsearContrato } from '../../common/errores/parsear-contrato';
import { RegistroIdempotencia } from '../../common/idempotencia/registro-idempotencia';
import { esViolacionUnicidad } from '../../common/violacion-unicidad.util';
import { obtenerFechaLocalYyyyMmDd, sumarDiasCalendario } from '../../common/adherencia.util';
import {
  calcularSiguienteCorte,
  corteVigente,
  debeEmitirCuota,
  instanteCorteUtc,
  periodoDeCorte,
  sumarMesesCalendario,
} from './suscripcion-ciclo';
import {
  CobroDirectoRegistradoEvent,
  PagoAprobadoEvent,
  PagoRechazadoEvent,
  PagoRevertidoEvent,
  PagoReportadoEvent,
} from '../notificaciones/events/eventos-notificacion';
import { DRIZZLE_DB, WITH_TENANT } from '../../database/database.module';
import {
  Database,
  TenantRlsContext,
  TenantTransaction,
  WithTenantFn,
  withTenant as withTenantBase,
  eq,
  and,
  or,
  desc,
  asc,
  ne,
  inArray,
  notInArray,
  isNull,
  isNotNull,
  sql,
  count,
  sum,
  gt,
  gte,
  lt,
  planesMembresia,
  overridesClientePlan,
  cuotasMembresia,
  transaccionesPago,
  tasasCambioReferencia,
  perfilesEntrenador,
  perfilesAlumno,
  usuarios,
} from '@guachafit/database';
import {
  Rol,
  Moneda,
  EstadoCuota,
  EstadoConciliacion,
  MetodoPago,
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
  RevertirPagoSchema,
  MENSAJE_REVERSION_SOLO_APROBADOS,
  MENSAJE_REVERSION_SALDO_USADO,
  AsignarSuscripcionDTO,
  SuscripcionAlumnoDTO,
  EstadoAlumno,
  ZONA_HORARIA_ALUMNO_POR_DEFECTO,
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
// ARITMÉTICA DECIMAL Y REDONDEO BANCARIO (RNF-002)
// =============================================================================

export function toCents(decimalStr: string): number {
  const parts = decimalStr.trim().split('.');
  const intPart = parseInt(parts[0], 10);
  const fracPart = parts[1] ? parts[1].padEnd(2, '0').slice(0, 2) : '00';
  const sign = decimalStr.startsWith('-') ? -1 : 1;
  return sign * (Math.abs(intPart) * 100 + parseInt(fracPart, 10));
}

export function fromCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const intPart = Math.floor(abs / 100);
  const fracPart = (abs % 100).toString().padStart(2, '0');
  return `${sign}${intPart}.${fracPart}`;
}

export function roundHalfToEven(val: number, decimals = 2): string {
  const factor = Math.pow(10, decimals);
  const shifted = Number((val * factor).toFixed(8));
  const floor = Math.floor(shifted);
  const diff = Number((shifted - floor).toFixed(8));

  let roundedInt: number;
  const epsilon = 1e-7;

  if (Math.abs(diff - 0.5) < epsilon) {
    roundedInt = floor % 2 === 0 ? floor : floor + 1;
  } else if (diff > 0.5) {
    roundedInt = floor + 1;
  } else {
    roundedInt = floor;
  }

  const result = roundedInt / factor;
  return result.toFixed(decimals);
}

export function addDecimals(a: string, b: string): string {
  return fromCents(toCents(a) + toCents(b));
}

export function subtractDecimals(a: string, b: string): string {
  return fromCents(toCents(a) - toCents(b));
}

export function multiplyDecimals(amount: string, rate: string): string {
  const a = parseFloat(amount);
  const r = parseFloat(rate);
  return roundHalfToEven(a * r, 2);
}

export function divideDecimalsBankers(amountBs: string, rate: string): string {
  const bs = parseFloat(amountBs);
  const r = parseFloat(rate);
  if (r <= 0) {
    throw new BadRequestException('La tasa de cambio debe ser estrictamente mayor a 0');
  }
  return roundHalfToEven(bs / r, 2);
}

export function toIsoSafe(d: any): string {
  if (!d) return new Date().toISOString();
  if (typeof d === 'string') {
    return d.endsWith('Z') ? d : new Date(d).toISOString();
  }
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

export function assertBalanceInvariant(
  montoTotalUsd: string,
  montoAbonadoUsd: string,
  saldoPendienteUsd: string
): void {
  const totalCents = toCents(montoTotalUsd);
  const abonadoCents = toCents(montoAbonadoUsd);
  const pendienteCents = toCents(saldoPendienteUsd);
  const expectedPendiente = Math.max(0, totalCents - abonadoCents);

  if (pendienteCents !== expectedPendiente) {
    throw new Error(
      `Violación de Invariante Contable (RNF-002): Saldo pendiente (${saldoPendienteUsd}) ` +
        `no coincide con Total (${montoTotalUsd}) - Abonado (${montoAbonadoUsd}).`
    );
  }
}

/**
 * RF-006 RN-05: reparte un abono (USD) entre la deuda de la cuota y el saldo a favor. Lo que cubre
 * el saldo pendiente se aplica a la cuota; el resto es excedente y pasa al saldo a favor.
 */
export function repartirAbono(
  saldoPendienteUsd: string,
  montoUsd: string
): { aplicadoUsd: string; excedenteUsd: string } {
  const pendiente = Math.max(0, toCents(saldoPendienteUsd));
  const monto = toCents(montoUsd);
  const aplicado = Math.min(pendiente, monto);
  return { aplicadoUsd: fromCents(aplicado), excedenteUsd: fromCents(monto - aplicado) };
}

/**
 * RF-006 RN-05: estado inicial de una cuota nueva de `montoTotalUsd` cuando el alumno tiene
 * `saldoAFavorUsd`. El saldo cubre la cuota hasta su total (se reutiliza `repartirAbono` con el
 * total como "deuda" y el saldo como "abono"); el becado no consume saldo.
 */
export function aplicarSaldoAFavorACuota(
  montoTotalUsd: string,
  saldoAFavorUsd: string,
  esBecado: boolean
): {
  aplicadoUsd: string;
  saldoPendienteUsd: string;
  saldoAFavorRestanteUsd: string;
  estado: EstadoCuota;
} {
  const reparto = esBecado
    ? { aplicadoUsd: '0.00', excedenteUsd: saldoAFavorUsd }
    : repartirAbono(montoTotalUsd, saldoAFavorUsd);
  const saldoPendienteUsd = subtractDecimals(montoTotalUsd, reparto.aplicadoUsd);
  const estado =
    esBecado || toCents(saldoPendienteUsd) === 0
      ? EstadoCuota.AL_DIA
      : toCents(reparto.aplicadoUsd) > 0
        ? EstadoCuota.ABONADA_PARCIAL
        : EstadoCuota.EMITIDA;
  return {
    aplicadoUsd: reparto.aplicadoUsd,
    saldoPendienteUsd,
    saldoAFavorRestanteUsd: reparto.excedenteUsd,
    estado,
  };
}

/**
 * RF-006 RN-05: cuerpo del aviso de un cobro en sala. Con excedente dice qué parte se aplicó a la
 * cuota y qué parte quedó como saldo a favor (nunca afirma que todo se aplicó a la cuota).
 */
export function mensajeCobroConExcedente(
  inicio: string,
  montoUsd: string,
  excedenteUsd: string
): string {
  if (toCents(excedenteUsd) <= 0) return `${inicio} aplicado a tu cuota.`;
  const aplicado = subtractDecimals(montoUsd, excedenteUsd);
  if (toCents(aplicado) <= 0) {
    return `${inicio}; como tu cuota ya estaba pagada, quedó completo como saldo a favor para tu próxima cuota.`;
  }
  return `${inicio}: ${aplicado} USD se aplicaron a tu cuota y ${excedenteUsd} USD quedaron como saldo a favor para tu próxima cuota.`;
}

/** RF-006 RN-05: cuerpo del aviso de pago aprobado; con excedente menciona el saldo a favor. */
export function mensajePagoAprobado(base: string, excedenteUsd: string): string {
  if (toCents(excedenteUsd) <= 0) return base;
  return `${base} ${excedenteUsd} USD quedaron como saldo a favor para tu próxima cuota.`;
}

/**
 * Estado de una cuota cuando se le retira un abono (rechazo de un pago en revisión o reversión de
 * uno aprobado, RF-007): otros pagos en revisión mandan; si ya quedó saldada, al día; si conserva
 * algún abono, parcial; si no, vencida o emitida según el corte.
 */
export function estadoCuotaTrasRetirarAbono(cuota: {
  montoAbonadoUsd: string;
  saldoPendienteUsd: string;
  fechaCorteUtc: Date | string;
  hayOtrasPendientes: boolean;
  ahora: Date;
}): EstadoCuota {
  if (cuota.hayOtrasPendientes) return EstadoCuota.PENDIENTE_REVISION;
  if (toCents(cuota.saldoPendienteUsd) === 0) return EstadoCuota.AL_DIA;
  if (toCents(cuota.montoAbonadoUsd) > 0) return EstadoCuota.ABONADA_PARCIAL;
  return new Date(cuota.fechaCorteUtc).getTime() < cuota.ahora.getTime()
    ? EstadoCuota.VENCIDA
    : EstadoCuota.EMITIDA;
}

/** El efectivo no lleva referencia bancaria: nunca participa en la detección de duplicados. */
function esMetodoEfectivo(metodo: MetodoPago): boolean {
  return metodo === MetodoPago.EFECTIVO_USD || metodo === MetodoPago.EFECTIVO_VES;
}

type PlanFila = typeof planesMembresia.$inferSelect;
type PerfilAlumnoFila = typeof perfilesAlumno.$inferSelect;
type CuotaFila = typeof cuotasMembresia.$inferSelect;

/** Resultado de emitir (o encontrar ya emitida) la cuota de un ciclo de la suscripción. */
interface EmisionCiclo {
  /** Cuota creada en esta llamada; `null` si la de ese periodo ya existía. */
  cuota: CuotaFila | null;
  esBecado: boolean;
  /** Vencimiento (día local) que queda como próximo tras avanzar el ciclo. */
  proximoCorte: string;
}

function zonaDelAlumno(perfil: Pick<PerfilAlumnoFila, 'zonaHoraria'>): string {
  return perfil.zonaHoraria || ZONA_HORARIA_ALUMNO_POR_DEFECTO;
}

/** `YYYY-MM-DD` → `DD/MM/AAAA` para los mensajes al entrenador. */
function formatearFechaCorta(fechaYyyyMmDd: string): string {
  const [anio, mes, dia] = fechaYyyyMmDd.split('-');
  return `${dia}/${mes}/${anio}`;
}

// =============================================================================
// SERVICIO PRINCIPAL DE FINANZAS
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
  }

  private readonly withTenant: WithTenantFn;

  private readonly logger = new Logger(FinanzasService.name);

  /**
   * WU-H (RF-008 / ADR-008 §3.2): al liquidarse una cuota (saldo $0.00) se cancelan los
   * recordatorios futuros. Se ejecuta DESPUÉS del commit: un fallo de Redis no revierte el pago.
   */
  private async cancelarRecordatoriosSiLiquidada(cuotaId: string): Promise<void> {
    if (!this.billingSchedulerService) return;
    try {
      await this.billingSchedulerService.cancelarRecordatoriosCuota(cuotaId);
    } catch (error) {
      this.logger.error(
        `No se pudieron cancelar los recordatorios de la cuota ${cuotaId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * WU-I: público para que el servicio de cartera reutilice la MISMA resolución de comprobantes
   * (presigned URL con TTL, `null` honesto si R2 no está configurado o falla).
   */
  async resolverComprobanteUrl(storageKey?: string | null): Promise<string | null> {
    if (!storageKey || !this.r2StorageService) return null;
    try {
      return await this.r2StorageService.generarPresignedGetUrl(storageKey, 900);
    } catch {
      return null;
    }
  }

  // ===========================================================================
  // 1. MOTOR BIMONETARIO (RF-006, ADR-003, RNF-002)
  // ===========================================================================

  resolverTasa(
    tasaActivaCoach: string | null,
    tasaOverrideCliente?: string | null
  ): {
    tasaEfectiva: string | null;
    esTasaOverride: boolean;
    fuenteTasa:
      | 'oficial_bcv'
      | 'paralelo'
      | 'entrenador_activa'
      | 'override_cliente'
      | 'sin_configurar';
  } {
    if (tasaOverrideCliente && parseFloat(tasaOverrideCliente) > 0) {
      return {
        tasaEfectiva: tasaOverrideCliente,
        esTasaOverride: true,
        fuenteTasa: 'override_cliente',
      };
    }

    // Sin tasa configurada (ni activa del coach ni override del alumno) NO se inventa una
    // tasa: se devuelve null y cada consumidor decide (estado honesto u error de negocio).
    if (!tasaActivaCoach || parseFloat(tasaActivaCoach) <= 0) {
      return {
        tasaEfectiva: null,
        esTasaOverride: false,
        fuenteTasa: 'sin_configurar',
      };
    }

    return {
      tasaEfectiva: tasaActivaCoach,
      esTasaOverride: false,
      fuenteTasa: 'entrenador_activa',
    };
  }

  proyectarVES(saldoUsd: string, tasa: string): string {
    return multiplyDecimals(saldoUsd, tasa);
  }

  calcularContravalorUSD(montoVES: string, tasaReporte: string): string {
    return divideDecimalsBankers(montoVES, tasaReporte);
  }

  async calcularConversion(
    dto: CalcularConversionDTO,
    entrenadorId: string,
    actorUserId?: string,
    actorRole?: Rol
  ): Promise<CalculoConversionDTO> {
    const targetClienteId =
      dto.clienteId || (actorRole === Rol.ALUMNO ? actorUserId : undefined);

    // RNF-003/ADR-011 (etapa 3): si hay cliente, la tasa override sale del perfil (RLS); el
    // contexto es el del actor (self del alumno o tenant del coach).
    const contextoTasa: TenantRlsContext =
      actorUserId && actorRole
        ? this.contextoRlsDeActor(actorUserId, actorRole, entrenadorId)
        : { entrenadorId };
    const tasaVigente = await this.obtenerTasaVigente(
      entrenadorId,
      targetClienteId,
      undefined,
      contextoTasa
    );
    const { tasaEfectiva, esTasaOverride, fuente } = tasaVigente;

    let montoConvertido: string;
    let tasaAplicada = tasaEfectiva ?? '1.0000';

    if (dto.monedaOrigen === dto.monedaDestino) {
      // Conversión identidad: no requiere tasa de cambio.
      montoConvertido = dto.monto;
      tasaAplicada = '1.0000';
    } else if (!tasaEfectiva || parseFloat(tasaEfectiva) <= 0) {
      // Operación bimonetaria sin tasa vigente: error de negocio claro, jamás una tasa inventada.
      throw new BadRequestException(
        'El entrenador aún no ha configurado la tasa de cambio. No es posible convertir entre USD y VES sin una tasa vigente.'
      );
    } else if (dto.monedaOrigen === Moneda.USD && dto.monedaDestino === Moneda.VES) {
      montoConvertido = this.proyectarVES(dto.monto, tasaEfectiva);
    } else if (dto.monedaOrigen === Moneda.VES && dto.monedaDestino === Moneda.USD) {
      montoConvertido = this.calcularContravalorUSD(dto.monto, tasaEfectiva);
    } else {
      throw new BadRequestException('Conversión de monedas no soportada.');
    }

    const fuenteTasa:
      | 'oficial_bcv'
      | 'paralelo'
      | 'entrenador_activa'
      | 'override_cliente'
      | 'sin_configurar' = esTasaOverride
      ? 'override_cliente'
      : fuente === 'bcv'
      ? 'oficial_bcv'
      : fuente === 'sin_configurar'
      ? 'sin_configurar'
      : 'entrenador_activa';

    return {
      montoOriginal: dto.monto,
      monedaOriginal: dto.monedaOrigen,
      montoConvertido,
      monedaConvertida: dto.monedaDestino,
      tasaAplicada,
      fuenteTasa,
      esTasaOverride,
      fechaCalculoUtc: new Date().toISOString(),
    };
  }

  // ===========================================================================
  // 2. GESTIÓN DE TASAS DE CAMBIO (RF-006, ADR-003)
  // ===========================================================================

  async actualizarTasa(
    entrenadorId: string,
    dto: ActualizarTasaCambioDTO
  ): Promise<TasaCambioVigenteDTO> {
    if (parseFloat(dto.tasaOficialBcv) <= 0 || parseFloat(dto.tasaActivaEntrenador) <= 0) {
      throw new BadRequestException('Las tasas de cambio deben ser mayores a 0.');
    }

    const nowUtc = new Date();

    const [nuevaTasa] = await this.db
      .insert(tasasCambioReferencia)
      .values({
        entrenadorId,
        tasaOficialBcv: dto.tasaOficialBcv,
        tasaParalelo: dto.tasaParalelo || null,
        tasaActivaEntrenador: dto.tasaActivaEntrenador,
        fuente: dto.fuente || 'manual',
        fechaActualizacionUtc: nowUtc,
      })
      .returning();

    // Actualizar tasaCambioGlobal en el perfil del entrenador para consistencia
    await this.db
      .update(perfilesEntrenador)
      .set({
        tasaCambioGlobal: dto.tasaActivaEntrenador,
        updatedAtUtc: nowUtc,
      })
      .where(eq(perfilesEntrenador.usuarioId, entrenadorId));

    return {
      id: nuevaTasa.id,
      entrenadorId,
      tasaOficialBcv: nuevaTasa.tasaOficialBcv,
      tasaParalelo: nuevaTasa.tasaParalelo,
      tasaActivaEntrenador: nuevaTasa.tasaActivaEntrenador,
      tasaAcordadaCliente: null,
      tasaEfectiva: nuevaTasa.tasaActivaEntrenador,
      fuente: nuevaTasa.fuente,
      fechaActualizacionUtc: nuevaTasa.fechaActualizacionUtc.toISOString(),
    };
  }

  /**
   * RNF-003/ADR-011 (etapa 3): `perfiles_alumno` tiene RLS. Con `clienteId` la tasa acordada se
   * lee del perfil, así que:
   * - Con `tx` (llamador dentro de una transacción con contexto) la lectura corre en ESA conexión.
   * - Sin `tx`, el flujo abre su propia transacción con el contexto del actor (`contexto`), nunca
   *   desde el pool raíz (que bajo RLS no vería el perfil y silenciaría el override).
   */
  async obtenerTasaVigente(
    entrenadorId: string,
    clienteId?: string,
    tx?: TenantTransaction,
    contexto?: TenantRlsContext
  ): Promise<TasaCambioVigenteDTO & { esTasaOverride: boolean }> {
    if (tx) {
      return this.obtenerTasaVigenteEn(entrenadorId, clienteId, tx);
    }
    if (clienteId) {
      return this.withTenant(contexto ?? { entrenadorId }, (conexion) =>
        this.obtenerTasaVigenteEn(entrenadorId, clienteId, conexion)
      );
    }
    return this.obtenerTasaVigenteEn(
      entrenadorId,
      undefined,
      this.db as unknown as TenantTransaction
    );
  }

  private async obtenerTasaVigenteEn(
    entrenadorId: string,
    clienteId: string | undefined,
    conn: TenantTransaction
  ): Promise<TasaCambioVigenteDTO & { esTasaOverride: boolean }> {
    // 1. Obtener última tasa registrada del entrenador
    const [tasaRef] = await conn
      .select()
      .from(tasasCambioReferencia)
      .where(eq(tasasCambioReferencia.entrenadorId, entrenadorId))
      .orderBy(desc(tasasCambioReferencia.fechaActualizacionUtc))
      .limit(1);

    // Sin histórico ni perfil NO se inventa una tasa "default": el vacío se propaga como
    // `null` (dato honesto) y cada operación que necesite la tasa valida y falla con claridad.
    let tasaOficialBcv: string | null = null;
    let tasaParalelo: string | null = null;
    let tasaActivaCoach: string | null = null;
    let fuente = 'sin_configurar';
    let fechaActualizacionUtc: string | null = null;

    if (tasaRef) {
      tasaOficialBcv = tasaRef.tasaOficialBcv;
      tasaParalelo = tasaRef.tasaParalelo;
      tasaActivaCoach = tasaRef.tasaActivaEntrenador;
      fuente = tasaRef.fuente;
      fechaActualizacionUtc = tasaRef.fechaActualizacionUtc.toISOString();
    } else {
      const [coachPerfil] = await conn
        .select()
        .from(perfilesEntrenador)
        .where(eq(perfilesEntrenador.usuarioId, entrenadorId));

      if (coachPerfil?.tasaCambioGlobal && parseFloat(coachPerfil.tasaCambioGlobal) > 0) {
        tasaActivaCoach = coachPerfil.tasaCambioGlobal;
        tasaOficialBcv = coachPerfil.tasaCambioGlobal;
        fuente = 'perfil_coach';
      }
    }

    // 2. Si se solicitó para un cliente, verificar si tiene override activo
    let tasaAcordadaCliente: string | null = null;
    if (clienteId) {
      const clienteUsuarioId = await this.resolveClienteUsuarioId(clienteId, conn);

      // RNF-003/ADR-011 (etapa 3): perfil del alumno (RLS) en la MISMA conexión con contexto.
      const [alumno] = await conn
        .select()
        .from(perfilesAlumno)
        .where(
          and(
            eq(perfilesAlumno.usuarioId, clienteUsuarioId),
            eq(perfilesAlumno.entrenadorId, entrenadorId)
          )
        );

      if (alumno?.tasaFijadaOverride) {
        tasaAcordadaCliente = alumno.tasaFijadaOverride;
      }
    }

    const { tasaEfectiva, esTasaOverride } = this.resolverTasa(
      tasaActivaCoach,
      tasaAcordadaCliente
    );

    return {
      id: tasaRef?.id,
      entrenadorId,
      tasaOficialBcv,
      tasaParalelo,
      tasaActivaEntrenador: tasaActivaCoach,
      tasaAcordadaCliente,
      tasaEfectiva,
      esTasaOverride,
      fuente,
      fechaActualizacionUtc,
    };
  }

  // ===========================================================================
  // 3. CATÁLOGO DE PLANES Y OVERRIDES (RF-005)
  // ===========================================================================

  async crearPlan(
    entrenadorId: string,
    dto: CrearPlanMembresiaDTO
  ): Promise<PlanMembresiaDetalleDTO> {
    // RNF-003/ADR-011 (etapa 2): `planes_membresia` tiene RLS; alta tenant-scoped.
    const [plan] = await this.withTenant({ entrenadorId }, async (tx) =>
      tx
        .insert(planesMembresia)
        .values({
          entrenadorId,
          nombre: dto.nombre.trim(),
          descripcion: dto.descripcion?.trim() || null,
          beneficios: dto.beneficios,
          precioBaseUsd: dto.precioBaseUsd,
          duracionMeses: dto.duracionMeses ?? 1,
          activo: dto.activo ?? true,
        })
        .returning()
    );

    return {
      id: plan.id,
      entrenadorId: plan.entrenadorId,
      nombre: plan.nombre,
      descripcion: plan.descripcion,
      beneficios: (plan.beneficios as string[]) || [],
      precioBaseUsd: plan.precioBaseUsd,
      duracionMeses: plan.duracionMeses,
      activo: plan.activo,
      createdAtUtc: plan.createdAtUtc.toISOString(),
      updatedAtUtc: plan.updatedAtUtc.toISOString(),
    };
  }

  async listarPlanesPorEntrenador(entrenadorId: string): Promise<PlanMembresiaDetalleDTO[]> {
    const planes = await this.withTenant({ entrenadorId }, async (tx) =>
      tx
        .select()
        .from(planesMembresia)
        .where(eq(planesMembresia.entrenadorId, entrenadorId))
        .orderBy(desc(planesMembresia.createdAtUtc))
    );

    return planes.map((plan) => ({
      id: plan.id,
      entrenadorId: plan.entrenadorId,
      nombre: plan.nombre,
      descripcion: plan.descripcion,
      beneficios: (plan.beneficios as string[]) || [],
      precioBaseUsd: plan.precioBaseUsd,
      duracionMeses: plan.duracionMeses,
      activo: plan.activo,
      createdAtUtc: plan.createdAtUtc.toISOString(),
      updatedAtUtc: plan.updatedAtUtc.toISOString(),
    }));
  }

  async actualizarPlan(
    entrenadorId: string,
    planId: string,
    dto: ActualizarPlanMembresiaDTO
  ): Promise<PlanMembresiaDetalleDTO> {
    const updates: Partial<typeof planesMembresia.$inferInsert> = {
      updatedAtUtc: new Date(),
    };

    if (dto.nombre !== undefined) updates.nombre = dto.nombre.trim();
    if (dto.descripcion !== undefined) updates.descripcion = dto.descripcion.trim();
    if (dto.beneficios !== undefined) updates.beneficios = dto.beneficios;
    if (dto.precioBaseUsd !== undefined) updates.precioBaseUsd = dto.precioBaseUsd;
    if (dto.duracionMeses !== undefined) updates.duracionMeses = dto.duracionMeses;
    if (dto.activo !== undefined) updates.activo = dto.activo;

    // RNF-003/ADR-011 (etapa 2): lectura + escritura de `planes_membresia` en UNA transacción
    // con el GUC del coach (además del chequeo de tenancy explícito de negocio).
    const actualizado = await this.withTenant({ entrenadorId }, async (tx) => {
      const [plan] = await tx
        .select()
        .from(planesMembresia)
        .where(eq(planesMembresia.id, planId))
        .limit(1);

      if (!plan) {
        throw new NotFoundException('No encontramos ese plan. Puede que se haya eliminado.');
      }

      if (plan.entrenadorId !== entrenadorId) {
        throw new ForbiddenException(
          'No tienes acceso a este plan.'
        );
      }

      const [fila] = await tx
        .update(planesMembresia)
        .set(updates)
        .where(eq(planesMembresia.id, planId))
        .returning();

      return fila;
    });

    return {
      id: actualizado.id,
      entrenadorId: actualizado.entrenadorId,
      nombre: actualizado.nombre,
      descripcion: actualizado.descripcion,
      beneficios: (actualizado.beneficios as string[]) || [],
      precioBaseUsd: actualizado.precioBaseUsd,
      duracionMeses: actualizado.duracionMeses,
      activo: actualizado.activo,
      createdAtUtc: actualizado.createdAtUtc.toISOString(),
      updatedAtUtc: actualizado.updatedAtUtc.toISOString(),
    };
  }

  async crearOverride(
    entrenadorId: string,
    dto: CrearOverridePlanDTO
  ): Promise<OverridePlanDetalleDTO> {
    // RNF-003/ADR-011 (etapa 2): plan (RLS) + alumno + override + tasa del alumno en UNA
    // transacción con el GUC del coach. `overrides_cliente_plan` y `perfiles_alumno` aún no
    // tienen RLS (etapa 3), pero comparten el contexto para no fragmentar el flujo.
    return this.withTenant({ entrenadorId }, async (tx) => {
      // 1. Validar que el plan pertenezca al entrenador
      const [plan] = await tx
        .select()
        .from(planesMembresia)
        .where(
          and(eq(planesMembresia.id, dto.planId), eq(planesMembresia.entrenadorId, entrenadorId))
        );

      if (!plan) {
        throw new NotFoundException('Ese plan no está en tu catálogo. Actualiza la pantalla.');
      }

      // 2. Validar que el alumno pertenezca al entrenador
      const clienteUsuarioId = await this.resolveClienteUsuarioId(dto.clienteId, tx);
      const [alumno] = await tx
        .select()
        .from(perfilesAlumno)
        .where(
          and(
            eq(perfilesAlumno.usuarioId, clienteUsuarioId),
            eq(perfilesAlumno.entrenadorId, entrenadorId)
          )
        );

      if (!alumno) {
        throw new NotFoundException(MENSAJE_ALUMNO_FUERA_DE_LISTA);
      }

      // 3. Upsert en tabla overridesClientePlan
      const [existente] = await tx
        .select()
        .from(overridesClientePlan)
        .where(
          and(
            eq(overridesClientePlan.planId, dto.planId),
            eq(overridesClientePlan.clienteId, clienteUsuarioId)
          )
        );

      let override;
      const nowUtc = new Date();

      if (existente) {
        // Semántica de upsert (RF-005 RN-02): `undefined` conserva el valor vigente; `null`
        // explícito lo limpia (p. ej. quitar el precio acordado para volver al precio del plan).
        [override] = await tx
          .update(overridesClientePlan)
          .set({
            precioAcordadoUsd:
              dto.precioAcordadoUsd !== undefined
                ? dto.precioAcordadoUsd
                : existente.precioAcordadoUsd,
            tasaFijadaOverride:
              dto.tasaFijadaOverride !== undefined
                ? dto.tasaFijadaOverride
                : existente.tasaFijadaOverride,
            beneficiosPersonalizados:
              dto.beneficiosPersonalizados !== undefined
                ? dto.beneficiosPersonalizados
                : existente.beneficiosPersonalizados,
            motivoOverride:
              dto.motivoOverride !== undefined ? dto.motivoOverride : existente.motivoOverride,
            updatedAtUtc: nowUtc,
          })
          .where(eq(overridesClientePlan.id, existente.id))
          .returning();
      } else {
        [override] = await tx
          .insert(overridesClientePlan)
          .values({
            planId: dto.planId,
            clienteId: clienteUsuarioId,
            precioAcordadoUsd: dto.precioAcordadoUsd ?? null,
            tasaFijadaOverride: dto.tasaFijadaOverride ?? null,
            beneficiosPersonalizados: dto.beneficiosPersonalizados ?? null,
            motivoOverride: dto.motivoOverride ?? null,
            createdAtUtc: nowUtc,
            updatedAtUtc: nowUtc,
          })
          .returning();
      }

      // ADR-003 §3.2 / RF-005 RN-02: la tasa especial del alumno vive en `perfiles_alumno`
      // (`tasa_fijada_override`) para que TODAS las operaciones bimonetarias la usen. El override
      // del plan la sincroniza; un `null` explícito la limpia y el alumno vuelve a la tasa global.
      if (dto.tasaFijadaOverride !== undefined) {
        await tx
          .update(perfilesAlumno)
          .set({
            tasaFijadaOverride: dto.tasaFijadaOverride,
            updatedAtUtc: nowUtc,
          })
          .where(
            and(
              eq(perfilesAlumno.usuarioId, clienteUsuarioId),
              eq(perfilesAlumno.entrenadorId, entrenadorId)
            )
          );
      }

      return {
        id: override.id,
        planId: override.planId,
        clienteId: override.clienteId,
        precioAcordadoUsd: override.precioAcordadoUsd,
        tasaFijadaOverride: override.tasaFijadaOverride,
        beneficiosPersonalizados: (override.beneficiosPersonalizados as string[]) || null,
        motivoOverride: override.motivoOverride,
        planNombre: plan.nombre,
        planPrecioBaseUsd: plan.precioBaseUsd,
        clienteNombre: `${alumno.nombres} ${alumno.apellidos}`.trim(),
        createdAtUtc: override.createdAtUtc.toISOString(),
        updatedAtUtc: override.updatedAtUtc.toISOString(),
      };
    });
  }

  /**
   * Listado de overrides del catálogo (RF-005 RN-02).
   *
   * - Sin `clienteId`: todos los overrides de la cartera del entrenador (soporta la UI de
   *   catálogo/planes).
   * - Con `clienteId` (usuarioId o perfilId): solo los del alumno, validando que pertenezca a
   *   su cartera (404 uniforme si no existe o es de otro coach — aislamiento multi-tenant).
   *
   * El aislamiento se garantiza filtrando por los planes del propio entrenador: un override
   * solo existe si su plan es del catálogo del coach autenticado.
   */
  async listarOverrides(entrenadorId: string, clienteId?: string): Promise<OverridePlanDetalleDTO[]> {
    // RNF-003/ADR-011 (etapa 2): el catálogo (`planes_membresia`) tiene RLS; el flujo completo
    // (planes + alumno + overrides + nombres) corre en UNA transacción con el GUC del coach.
    return this.withTenant({ entrenadorId }, async (tx) => {
      const planes = await tx
        .select({
          id: planesMembresia.id,
          nombre: planesMembresia.nombre,
          precioBaseUsd: planesMembresia.precioBaseUsd,
        })
        .from(planesMembresia)
        .where(eq(planesMembresia.entrenadorId, entrenadorId));

      if (planes.length === 0) return [];
      const planesPorId = new Map(planes.map((plan) => [plan.id, plan]));

      let clienteUsuarioId: string | undefined;
      if (clienteId) {
        clienteUsuarioId = await this.resolveClienteUsuarioId(clienteId, tx);
        const [alumno] = await tx
          .select({ id: perfilesAlumno.id })
          .from(perfilesAlumno)
          .where(
            and(
              eq(perfilesAlumno.usuarioId, clienteUsuarioId),
              eq(perfilesAlumno.entrenadorId, entrenadorId)
            )
          );

        if (!alumno) {
          throw new NotFoundException(MENSAJE_ALUMNO_FUERA_DE_LISTA);
        }
      }

      const whereOverrides = clienteUsuarioId
        ? and(
            inArray(
              overridesClientePlan.planId,
              planes.map((plan) => plan.id)
            ),
            eq(overridesClientePlan.clienteId, clienteUsuarioId)
          )
        : inArray(
            overridesClientePlan.planId,
            planes.map((plan) => plan.id)
          );

      const overrides = await tx
        .select()
        .from(overridesClientePlan)
        .where(whereOverrides)
        .orderBy(desc(overridesClientePlan.updatedAtUtc), desc(overridesClientePlan.id));

      if (overrides.length === 0) return [];

      const clienteIds = [...new Set(overrides.map((o) => o.clienteId))];
      const alumnos = await tx
        .select({
          usuarioId: perfilesAlumno.usuarioId,
          nombres: perfilesAlumno.nombres,
          apellidos: perfilesAlumno.apellidos,
        })
        .from(perfilesAlumno)
        .where(
          and(
            inArray(perfilesAlumno.usuarioId, clienteIds),
            eq(perfilesAlumno.entrenadorId, entrenadorId)
          )
        );
      const nombresPorUsuario = new Map(
        alumnos.map((alumno) => [
          alumno.usuarioId,
          `${alumno.nombres} ${alumno.apellidos}`.trim(),
        ])
      );

      return overrides.map((o) => {
        const plan = planesPorId.get(o.planId);
        return {
          id: o.id,
          planId: o.planId,
          clienteId: o.clienteId,
          precioAcordadoUsd: o.precioAcordadoUsd,
          tasaFijadaOverride: o.tasaFijadaOverride,
          beneficiosPersonalizados: (o.beneficiosPersonalizados as string[]) || null,
          motivoOverride: o.motivoOverride,
          planNombre: plan?.nombre ?? null,
          planPrecioBaseUsd: plan?.precioBaseUsd ?? null,
          clienteNombre: nombresPorUsuario.get(o.clienteId) ?? null,
          createdAtUtc: toIsoSafe(o.createdAtUtc),
          updatedAtUtc: toIsoSafe(o.updatedAtUtc),
        };
      });
    });
  }

  /**
   * Elimina un override individual (RF-005 RN-02): el alumno vuelve a heredar los valores del
   * plan del catálogo. La verificación de tenancy se hace contra el plan dueño del override.
   *
   * Si la tasa global del alumno (`perfiles_alumno.tasa_fijada_override`) coincidía con la tasa
   * de este override, se limpia junto con él para no dejar una tasa huérfana aplicándose en
   * operaciones bimonetarias (ADR-003 §3.2). Una tasa fijada manualmente distinta se conserva.
   */
  async eliminarOverride(
    entrenadorId: string,
    overrideId: string
  ): Promise<EliminarOverridePlanResultadoDTO> {
    // RNF-003/ADR-011 (etapa 2): plan (RLS) + override + limpieza de tasa en UNA transacción
    // con el GUC del coach (la verificación de tenancy de negocio se conserva).
    return this.withTenant({ entrenadorId }, async (tx) => {
      const [override] = await tx
        .select()
        .from(overridesClientePlan)
        .where(eq(overridesClientePlan.id, overrideId))
        .limit(1);

      if (!override) {
        throw new NotFoundException('No encontramos ese precio especial. Puede que se haya eliminado.');
      }

      const [plan] = await tx
        .select()
        .from(planesMembresia)
        .where(eq(planesMembresia.id, override.planId))
        .limit(1);

      if (!plan || plan.entrenadorId !== entrenadorId) {
        throw new ForbiddenException(
          'No tienes acceso a este precio especial.'
        );
      }

      await tx.delete(overridesClientePlan).where(eq(overridesClientePlan.id, overrideId));

      if (override.tasaFijadaOverride) {
        await tx
          .update(perfilesAlumno)
          .set({ tasaFijadaOverride: null, updatedAtUtc: new Date() })
          .where(
            and(
              eq(perfilesAlumno.usuarioId, override.clienteId),
              eq(perfilesAlumno.entrenadorId, entrenadorId),
              eq(perfilesAlumno.tasaFijadaOverride, override.tasaFijadaOverride)
            )
          );
      }

      return {
        id: overrideId,
        eliminado: true,
        mensaje: `Precio especial de ${plan.nombre} eliminado: el alumno vuelve a los valores del catálogo.`,
      };
    });
  }

  // ===========================================================================
  // 4. EMISIÓN Y GESTIÓN DE CUOTAS (RF-008, RNF-002)
  // ===========================================================================
  // Las cuotas solo se emiten desde la suscripción del alumno (sección 4b, ADR-020). La emisión
  // manual `POST /finanzas/cuotas/emitir` se retiró (decisión del dueño, 2026-10-10): saltaba la
  // regla del solape y podía crear cuotas fuera del ciclo.

  /**
   * RF-005 RN-03 (Precedencia de Valores) — corazón de este requerimiento:
   * "Al generarse una nueva cuota para un cliente, el sistema evalúa: si existe un Override
   *  activo para ese cliente, toma sus valores; en caso contrario, toma los valores por
   *  defecto del plan estándar del catálogo."
   * Orden exacto aplicado:
   *   1. `precio_acordado_usd` del override del alumno para ESTE plan (si existe y no es null).
   *      Un override de 0.00 es legítimo: becado/intercambio (RF-005 §6) y la cuota nace
   *      saldada en estado `al_dia` (sin recordatorios de cobro).
   *   2. `precio_base_usd` del plan del catálogo (RN-01: mayor a 0.00).
   * Un plan sin precio base y sin override de precio no emite cuota: jamás se inventa un monto.
   */
  private async resolverMontoCuota(
    tx: TenantTransaction,
    plan: PlanFila,
    clienteUsuarioId: string
  ): Promise<{ montoTotal: string; esBecado: boolean }> {
    const [override] = await tx
      .select()
      .from(overridesClientePlan)
      .where(
        and(
          eq(overridesClientePlan.planId, plan.id),
          eq(overridesClientePlan.clienteId, clienteUsuarioId)
        )
      );

    const precioAcordado = override?.precioAcordadoUsd ?? null;
    if (precioAcordado !== null && toCents(precioAcordado) < 0) {
      throw new BadRequestException('El precio acordado del alumno no puede ser negativo.');
    }

    if (precioAcordado !== null) {
      // El override del alumno SIEMPRE gana sobre el precio del catálogo (RN-03), incluso en 0.00.
      return { montoTotal: precioAcordado, esBecado: toCents(precioAcordado) === 0 };
    }
    if (toCents(plan.precioBaseUsd) > 0) {
      return { montoTotal: plan.precioBaseUsd, esBecado: false };
    }
    throw new BadRequestException(
      'El plan no tiene un precio base mayor a 0.00. Para un alumno becado o un acuerdo de intercambio, asígnale un precio especial de 0.00.'
    );
  }

  // ===========================================================================
  // 4b. SUSCRIPCIÓN DEL ALUMNO Y EMISIÓN AUTOMÁTICA DE CUOTAS (M5-L1, RF-005 / RF-008)
  // ===========================================================================

  /**
   * Asigna o cambia el plan del alumno. Las cuotas se emiten solas a partir de esta suscripción.
   * - Primer plan: `fechaInicio` (día local del alumno) fija el día de vencimiento de todos los
   *   ciclos, en meses de calendario. Si el primer vencimiento cae dentro de los próximos 5 días,
   *   su cuota se emite en el acto.
   * - Cambio de plan: el nuevo aplica desde la próxima cuota y el día de vencimiento no cambia.
   */
  async asignarSuscripcion(
    entrenadorId: string,
    clienteId: string,
    dto: AsignarSuscripcionDTO,
    ahora: Date = new Date()
  ): Promise<SuscripcionAlumnoDTO> {
    const resultado = await this.withTenant({ entrenadorId }, async (tx) => {
      // Bloqueo de fila: el barrido o un cobro en sala simultáneos esperan a esta asignación.
      const perfil = await this.buscarPerfilDeCartera(tx, entrenadorId, clienteId, {
        bloquear: true,
      });

      const [plan] = await tx
        .select()
        .from(planesMembresia)
        .where(
          and(eq(planesMembresia.id, dto.planId), eq(planesMembresia.entrenadorId, entrenadorId))
        );

      if (!plan) {
        throw new NotFoundException('Ese plan no está en tu catálogo. Actualiza la pantalla.');
      }
      if (!plan.activo) {
        throw new BadRequestException('Ese plan está desactivado. Actívalo en Ajustes o elige otro.');
      }

      if (perfil.planSuscritoId) {
        if (dto.fechaInicio !== undefined) {
          throw new BadRequestException(
            'La fecha de inicio solo se elige al asignar el plan por primera vez. Quita el plan para empezar un ciclo nuevo.'
          );
        }
        await tx
          .update(perfilesAlumno)
          .set({ planSuscritoId: plan.id, updatedAtUtc: ahora })
          .where(eq(perfilesAlumno.id, perfil.id));
        return { perfil: { ...perfil, planSuscritoId: plan.id }, plan, emision: null };
      }

      if (!dto.fechaInicio) {
        throw new BadRequestException('Elige la fecha de inicio del plan.');
      }
      const hoyLocal = obtenerFechaLocalYyyyMmDd(ahora, zonaDelAlumno(perfil));
      const inicioMinimo = sumarDiasCalendario(hoyLocal, -DIAS_MAXIMOS_INICIO_PASADO);
      const inicioMaximo = sumarDiasCalendario(hoyLocal, DIAS_MAXIMOS_INICIO_FUTURO);
      if (dto.fechaInicio < inicioMinimo || dto.fechaInicio > inicioMaximo) {
        throw new BadRequestException(
          `Elige una fecha de inicio entre el ${formatearFechaCorta(inicioMinimo)} y el ${formatearFechaCorta(inicioMaximo)}.`
        );
      }

      // Decisión del dueño (M5-L1): un plan nuevo no puede empezar dentro de un periodo ya
      // cubierto por una cuota anterior; si no, el mismo mes quedaría cobrado dos veces.
      const cubiertoHasta = await this.calcularCoberturaVigente(tx, perfil);
      if (cubiertoHasta && dto.fechaInicio < cubiertoHasta) {
        throw new BadRequestException(
          `Este alumno ya tiene cubierto hasta el ${formatearFechaCorta(cubiertoHasta)}. Elige esa fecha o una posterior, o cambia el plan sin quitarlo.`
        );
      }

      const suscrito: PerfilAlumnoFila = {
        ...perfil,
        planSuscritoId: plan.id,
        cicloAncla: dto.fechaInicio,
        proximoCorte: dto.fechaInicio,
      };
      await tx
        .update(perfilesAlumno)
        .set({
          planSuscritoId: plan.id,
          cicloAncla: dto.fechaInicio,
          proximoCorte: dto.fechaInicio,
          updatedAtUtc: ahora,
        })
        .where(eq(perfilesAlumno.id, perfil.id));

      const emision = await this.emitirCuotaDeSuscripcionSiCorresponde(tx, suscrito, plan, ahora);
      return {
        perfil: emision ? { ...suscrito, proximoCorte: emision.proximoCorte } : suscrito,
        plan,
        emision,
      };
    });

    // Los recordatorios (Redis) se agendan DESPUÉS del commit: un fallo no revierte la asignación.
    await this.programarRecordatoriosDeEmision(resultado.emision, resultado.perfil);
    return this.construirSuscripcionDTO(
      resultado.perfil,
      resultado.plan,
      resultado.emision?.cuota?.id ?? null
    );
  }

  /** Quita el plan del alumno: deja de renovarse. Las cuotas ya emitidas no cambian. */
  async quitarSuscripcion(
    entrenadorId: string,
    clienteId: string,
    ahora: Date = new Date()
  ): Promise<{ desactivada: true }> {
    return this.withTenant({ entrenadorId }, async (tx) => {
      const perfil = await this.buscarPerfilDeCartera(tx, entrenadorId, clienteId, {
        bloquear: true,
      });
      if (!perfil.planSuscritoId) {
        throw new NotFoundException(MENSAJE_SIN_PLAN_ASIGNADO);
      }
      await tx
        .update(perfilesAlumno)
        .set({ planSuscritoId: null, cicloAncla: null, proximoCorte: null, updatedAtUtc: ahora })
        .where(eq(perfilesAlumno.id, perfil.id));
      return { desactivada: true as const };
    });
  }

  /** Suscripción vigente del alumno, o `null` si no tiene plan asignado. */
  async obtenerSuscripcion(
    entrenadorId: string,
    clienteId: string
  ): Promise<SuscripcionAlumnoDTO | null> {
    return this.withTenant({ entrenadorId }, async (tx) => {
      const perfil = await this.buscarPerfilDeCartera(tx, entrenadorId, clienteId);
      if (!perfil.planSuscritoId) return null;

      const [plan] = await tx
        .select()
        .from(planesMembresia)
        .where(
          and(
            eq(planesMembresia.id, perfil.planSuscritoId),
            eq(planesMembresia.entrenadorId, entrenadorId)
          )
        );
      return plan ? this.construirSuscripcionDTO(perfil, plan, null) : null;
    });
  }

  /**
   * Barrido diario (RF-008): emite la cuota de cada alumno activo cuyo próximo vencimiento cae
   * dentro de los próximos 5 días y avanza su ciclo. Alumnos pausados, suspendidos o archivados
   * no generan cuotas; al volver, se emite solo la del ciclo en curso (`corteVigente`).
   *
   * RUTA DE SISTEMA: la lectura de candidatos cruza todos los tenants con el bypass explícito
   * `is_superadmin`; cada emisión corre en su propia transacción con el GUC del coach, así que el
   * error de un alumno no afecta a los demás.
   */
  async emitirCuotasProgramadas(
    ahora: Date = new Date()
  ): Promise<{ evaluadas: number; emitidas: number; omitidas: number }> {
    const candidatos = await this.withTenant({ isSuperadmin: true }, (tx) =>
      tx
        .select({ id: perfilesAlumno.id, entrenadorId: perfilesAlumno.entrenadorId })
        .from(perfilesAlumno)
        .where(
          and(
            isNotNull(perfilesAlumno.planSuscritoId),
            isNull(perfilesAlumno.deletedAtUtc),
            eq(perfilesAlumno.estadoActivacion, EstadoAlumno.ACTIVO)
          )
        )
    );

    let emitidas = 0;
    let omitidas = 0;

    for (const candidato of candidatos) {
      try {
        const resultado = await this.withTenant(
          { entrenadorId: candidato.entrenadorId },
          async (tx) => {
            // Relectura con bloqueo de fila: dos barridos simultáneos no emiten dos veces el ciclo.
            // Se revalida todo el filtro: el alumno pudo pausarse o archivarse tras la lectura.
            const [perfil] = await tx
              .select()
              .from(perfilesAlumno)
              .where(eq(perfilesAlumno.id, candidato.id))
              .for('update');
            if (
              !perfil?.planSuscritoId ||
              perfil.deletedAtUtc ||
              perfil.estadoActivacion !== EstadoAlumno.ACTIVO
            ) {
              return null;
            }

            const [plan] = await tx
              .select()
              .from(planesMembresia)
              .where(
                and(
                  eq(planesMembresia.id, perfil.planSuscritoId),
                  eq(planesMembresia.entrenadorId, perfil.entrenadorId)
                )
              );
            if (!plan) {
              throw new Error(
                `El plan suscrito ${perfil.planSuscritoId} no está en el catálogo del entrenador.`
              );
            }

            const emision = await this.emitirCuotaDeSuscripcionSiCorresponde(tx, perfil, plan, ahora);
            return emision ? { emision, perfil } : null;
          }
        );

        if (resultado?.emision.cuota) {
          emitidas += 1;
          await this.programarRecordatoriosDeEmision(resultado.emision, resultado.perfil);
        }
      } catch (error) {
        omitidas += 1;
        this.logger.error(
          `No se pudo emitir la cuota programada del alumno ${candidato.id}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    this.logger.log(
      `Emisión automática de cuotas: ${candidatos.length} suscripciones evaluadas, ${emitidas} emitidas, ${omitidas} con error.`
    );
    return { evaluadas: candidatos.length, emitidas, omitidas };
  }

  /**
   * Reposición diaria de recordatorios (RF-008): vuelve a agendar los hitos FUTUROS de las cuotas
   * abiertas. Repara los recordatorios que no se agendaron porque Redis falló al emitir. BullMQ
   * ignora un `jobId` que ya existe, así que no duplica avisos; con `incluirMismoDia: false`
   * tampoco repite el aviso de hoy si ya salió.
   *
   * Solo alumnos ACTIVOS: archivados, pausados o suspendidos no reciben recordatorios automáticos
   * (decisión del dueño, 2026-10-10); su deuda sigue visible en Control de Cobros.
   *
   * Empieza levantando la pausa de la cola: si una emisión de este mismo barrido la abrió y Redis
   * ya volvió, la reparación no se aplaza un día. Si sigue caído, el primer intento la reabre.
   *
   * Límite aceptado: no repone un hito del mismo día (no repetir un aviso que quizá ya salió) y el
   * volumen es lineal (hasta 4 `add` por cuota abierta y día).
   *
   * RUTA DE SISTEMA: lectura transversal con `is_superadmin` (solo lectura; el planificador no
   * toca la base de datos).
   */
  async reconciliarRecordatorios(
    ahora: Date = new Date()
  ): Promise<{ evaluadas: number; agendadas: number }> {
    if (!this.billingSchedulerService) return { evaluadas: 0, agendadas: 0 };
    this.billingSchedulerService.reanudarCola();

    // Una cuota vencida hace más de 3 días ya no tiene hitos futuros (el último es T+2).
    const limiteCorte = new Date(ahora.getTime() - 3 * 24 * 60 * 60 * 1000);
    const cuotas = await this.withTenant({ isSuperadmin: true }, (tx) =>
      tx
        .select({
          id: cuotasMembresia.id,
          fechaCorteUtc: cuotasMembresia.fechaCorteUtc,
          zonaHoraria: perfilesAlumno.zonaHoraria,
        })
        .from(cuotasMembresia)
        .innerJoin(perfilesAlumno, eq(perfilesAlumno.usuarioId, cuotasMembresia.clienteId))
        .where(
          and(
            notInArray(cuotasMembresia.estado, [EstadoCuota.AL_DIA, EstadoCuota.ANULADA]),
            gt(cuotasMembresia.saldoPendienteUsd, '0'),
            gt(cuotasMembresia.fechaCorteUtc, limiteCorte),
            isNull(perfilesAlumno.deletedAtUtc),
            eq(perfilesAlumno.estadoActivacion, EstadoAlumno.ACTIVO)
          )
        )
    );

    let agendadas = 0;
    for (const cuota of cuotas) {
      const hitos = await this.billingSchedulerService.programarRecordatoriosCuota(
        {
          id: cuota.id,
          fechaCorteUtc: cuota.fechaCorteUtc,
          zonaHoraria: cuota.zonaHoraria || ZONA_HORARIA_ALUMNO_POR_DEFECTO,
        },
        ahora,
        { incluirMismoDia: false }
      );
      if (hitos.length > 0) agendadas += 1;
    }

    this.logger.log(
      `Reposición de recordatorios: ${cuotas.length} cuotas abiertas evaluadas, ${agendadas} con hitos futuros agendados.`
    );
    return { evaluadas: cuotas.length, agendadas };
  }

  /**
   * Perfil del alumno dentro de la cartera del coach (acepta `usuarioId` o id de perfil). Un
   * alumno de otro coach, inexistente o archivado responde el mismo 404 (RNF-003 §3.1: no se
   * revela si el alumno existe en otra cartera). Opciones:
   * - `bloquear`: la fila queda tomada (`FOR UPDATE`) hasta el fin de la transacción;
   * - `incluirArchivados`: un alumno archivado SÍ se devuelve (consulta de su historial).
   *
   * Es la única búsqueda del perfil para el entrenador en este servicio (suscripción, cobro en
   * sala e historial).
   */
  private async buscarPerfilDeCartera(
    tx: TenantTransaction,
    entrenadorId: string,
    clienteId: string,
    opciones: { bloquear?: boolean; incluirArchivados?: boolean } = {}
  ): Promise<PerfilAlumnoFila> {
    const buscar = (columna: typeof perfilesAlumno.usuarioId | typeof perfilesAlumno.id) => {
      const consulta = tx.select().from(perfilesAlumno).where(eq(columna, clienteId));
      return opciones.bloquear ? consulta.for('update') : consulta;
    };

    let [perfil] = await buscar(perfilesAlumno.usuarioId);
    if (!perfil) {
      [perfil] = await buscar(perfilesAlumno.id);
    }

    if (
      !perfil ||
      perfil.entrenadorId !== entrenadorId ||
      (perfil.deletedAtUtc && !opciones.incluirArchivados)
    ) {
      throw new NotFoundException(MENSAJE_ALUMNO_FUERA_DE_LISTA);
    }
    return perfil;
  }

  /**
   * Día local hasta el que el alumno ya está cubierto: fin del periodo de su cuota no anulada más
   * reciente (vencimiento + duración de su plan, en meses de calendario). `null` sin cuotas.
   */
  private async calcularCoberturaVigente(
    tx: TenantTransaction,
    perfil: PerfilAlumnoFila
  ): Promise<string | null> {
    const [ultima] = await tx
      .select({
        fechaCorteUtc: cuotasMembresia.fechaCorteUtc,
        duracionMeses: planesMembresia.duracionMeses,
      })
      .from(cuotasMembresia)
      .innerJoin(planesMembresia, eq(planesMembresia.id, cuotasMembresia.planId))
      .where(
        and(
          eq(cuotasMembresia.clienteId, perfil.usuarioId),
          eq(cuotasMembresia.entrenadorId, perfil.entrenadorId),
          ne(cuotasMembresia.estado, EstadoCuota.ANULADA)
        )
      )
      .orderBy(desc(cuotasMembresia.fechaCorteUtc))
      .limit(1);

    if (!ultima) return null;
    return sumarMesesCalendario(
      obtenerFechaLocalYyyyMmDd(ultima.fechaCorteUtc, zonaDelAlumno(perfil)),
      Math.max(1, ultima.duracionMeses)
    );
  }

  /** Emite la cuota del ciclo en curso si ya está dentro de la ventana de 5 días; si no, `null`. */
  private async emitirCuotaDeSuscripcionSiCorresponde(
    tx: TenantTransaction,
    perfil: PerfilAlumnoFila,
    plan: PlanFila,
    ahora: Date
  ): Promise<EmisionCiclo | null> {
    if (!perfil.cicloAncla || !perfil.proximoCorte) return null;

    const hoyLocal = obtenerFechaLocalYyyyMmDd(ahora, zonaDelAlumno(perfil));
    if (!debeEmitirCuota(perfil.proximoCorte, hoyLocal)) return null;

    const corte = corteVigente(perfil.cicloAncla, perfil.proximoCorte, plan.duracionMeses, hoyLocal);
    return this.emitirCuotaDeCicloEnTx(tx, perfil, plan, corte, ahora);
  }

  /**
   * RF-006 RN-05: suma `excedenteUsd` al saldo a favor del alumno, con su fila bloqueada para que
   * una emisión o una aprobación concurrentes no pierdan el incremento. Sin excedente no hace nada.
   * El perfil se busca en el entrenador DUEÑO de la cuota (supuesto: el perfil del alumno es del
   * mismo entrenador que sus cuotas).
   *
   * ORDEN DE BLOQUEOS (evita deadlocks): aprobar o cobrar bloquea la cuota y DESPUÉS el perfil.
   * Por eso ninguna ruta que bloquee el perfil del alumno (asignar o quitar el plan, la emisión, el
   * cobro inteligente) puede bloquear ni actualizar después una cuota EXISTENTE: solo insertar
   * cuotas nuevas. Si una ruta futura lo necesita, debe bloquear la cuota antes que el perfil.
   */
  private async acreditarSaldoAFavor(
    tx: TenantTransaction,
    clienteUsuarioId: string,
    entrenadorId: string,
    excedenteUsd: string,
    ahora: Date
  ): Promise<void> {
    if (toCents(excedenteUsd) <= 0) return;
    const [perfil] = await tx
      .select({ id: perfilesAlumno.id, saldoAFavorUsd: perfilesAlumno.saldoAFavorUsd })
      .from(perfilesAlumno)
      .where(
        and(
          eq(perfilesAlumno.usuarioId, clienteUsuarioId),
          eq(perfilesAlumno.entrenadorId, entrenadorId)
        )
      )
      .for('update');
    if (!perfil) {
      // Sin perfil no hay dónde acreditar: se revierte la operación entera (nunca se pierde dinero).
      throw new NotFoundException(MENSAJE_ALUMNO_NO_ENCONTRADO);
    }
    await tx
      .update(perfilesAlumno)
      .set({ saldoAFavorUsd: addDecimals(perfil.saldoAFavorUsd, excedenteUsd), updatedAtUtc: ahora })
      .where(eq(perfilesAlumno.id, perfil.id));
  }

  /**
   * RF-007: resta `excedenteUsd` del saldo a favor del alumno al revertir el pago que lo generó
   * (simétrica a `acreditarSaldoAFavor`, mismo orden de bloqueos). Si el saldo actual no alcanza,
   * ese excedente ya se aplicó a otra cuota: 409 y la transacción entera se deshace.
   */
  private async retirarSaldoAFavor(
    tx: TenantTransaction,
    clienteUsuarioId: string,
    entrenadorId: string,
    excedenteUsd: string,
    ahora: Date
  ): Promise<void> {
    if (toCents(excedenteUsd) <= 0) return;
    const [perfil] = await tx
      .select({ id: perfilesAlumno.id, saldoAFavorUsd: perfilesAlumno.saldoAFavorUsd })
      .from(perfilesAlumno)
      .where(
        and(
          eq(perfilesAlumno.usuarioId, clienteUsuarioId),
          eq(perfilesAlumno.entrenadorId, entrenadorId)
        )
      )
      .for('update');
    if (!perfil) {
      throw new NotFoundException(MENSAJE_ALUMNO_NO_ENCONTRADO);
    }
    if (toCents(perfil.saldoAFavorUsd) < toCents(excedenteUsd)) {
      throw new ConflictException(MENSAJE_REVERSION_SALDO_USADO);
    }
    await tx
      .update(perfilesAlumno)
      .set({ saldoAFavorUsd: subtractDecimals(perfil.saldoAFavorUsd, excedenteUsd), updatedAtUtc: ahora })
      .where(eq(perfilesAlumno.id, perfil.id));
  }

  /**
   * Emite la cuota que vence en `corte` (día local) y avanza `proximo_corte` al ciclo siguiente,
   * en la MISMA transacción. Si la cuota de ese periodo ya existe no se duplica, pero el ciclo
   * avanza igual (un barrido repetido es idempotente).
   */
  private async emitirCuotaDeCicloEnTx(
    tx: TenantTransaction,
    perfil: PerfilAlumnoFila,
    plan: PlanFila,
    corte: string,
    ahora: Date
  ): Promise<EmisionCiclo> {
    const periodo = periodoDeCorte(corte);
    const [existente] = await tx
      .select({ id: cuotasMembresia.id })
      .from(cuotasMembresia)
      .where(
        and(
          eq(cuotasMembresia.clienteId, perfil.usuarioId),
          eq(cuotasMembresia.planId, plan.id),
          eq(cuotasMembresia.periodo, periodo)
        )
      );

    let cuota: CuotaFila | null = null;
    let esBecado = false;

    // RF-006 RN-05: saldo a favor leído con la fila del alumno bloqueada (una aprobación
    // concurrente que lo incrementa espera a esta transacción, y viceversa).
    let saldoAFavorRestante: string | null = null;

    if (!existente) {
      const monto = await this.resolverMontoCuota(tx, plan, perfil.usuarioId);
      esBecado = monto.esBecado;

      let saldoAFavor = '0.00';
      if (!esBecado) {
        const [filaSaldo] = await tx
          .select({ saldoAFavorUsd: perfilesAlumno.saldoAFavorUsd })
          .from(perfilesAlumno)
          .where(eq(perfilesAlumno.id, perfil.id))
          .for('update');
        saldoAFavor = filaSaldo?.saldoAFavorUsd ?? '0.00';
      }
      const inicial = aplicarSaldoAFavorACuota(monto.montoTotal, saldoAFavor, esBecado);
      const aplicado = inicial.aplicadoUsd;
      const pendiente = inicial.saldoPendienteUsd;
      const estadoInicial = inicial.estado;
      if (toCents(aplicado) > 0) saldoAFavorRestante = inicial.saldoAFavorRestanteUsd;
      assertBalanceInvariant(monto.montoTotal, aplicado, pendiente);

      [cuota] = await tx
        .insert(cuotasMembresia)
        .values({
          clienteId: perfil.usuarioId,
          entrenadorId: perfil.entrenadorId,
          planId: plan.id,
          periodo,
          montoTotalUsd: monto.montoTotal,
          montoAbonadoUsd: aplicado,
          saldoPendienteUsd: pendiente,
          saldoAFavorAplicadoUsd: aplicado,
          fechaEmisionUtc: ahora,
          fechaCorteUtc: instanteCorteUtc(corte, zonaDelAlumno(perfil)),
          // RF-005 §6: la cuota del becado nace Al Día (no hay deuda que cobrar); también la que
          // el saldo a favor cubre entera.
          estado: estadoInicial,
          notas: null,
          createdAtUtc: ahora,
          updatedAtUtc: ahora,
        })
        .returning();
    }

    const proximoCorte = calcularSiguienteCorte(
      perfil.cicloAncla ?? corte,
      corte,
      Math.max(1, plan.duracionMeses)
    );
    await tx
      .update(perfilesAlumno)
      .set({
        proximoCorte,
        ...(saldoAFavorRestante !== null ? { saldoAFavorUsd: saldoAFavorRestante } : {}),
        updatedAtUtc: ahora,
      })
      .where(eq(perfilesAlumno.id, perfil.id));

    return { cuota, esBecado, proximoCorte };
  }

  /** Agenda los recordatorios T-5/T-1/T/T+2 a las 09:00 locales del alumno (best-effort). */
  private async programarRecordatoriosDeEmision(
    emision: EmisionCiclo | null,
    perfil: Pick<PerfilAlumnoFila, 'zonaHoraria'>
  ): Promise<void> {
    // Una cuota que nace pagada (becado o cubierta por el saldo a favor) no lleva recordatorios.
    if (
      !emision?.cuota ||
      emision.esBecado ||
      emision.cuota.estado === EstadoCuota.AL_DIA ||
      !this.billingSchedulerService
    ) {
      return;
    }
    try {
      await this.billingSchedulerService.programarRecordatoriosCuota({
        id: emision.cuota.id,
        fechaCorteUtc: emision.cuota.fechaCorteUtc,
        zonaHoraria: zonaDelAlumno(perfil),
      });
    } catch (error) {
      this.logger.error(
        `No se pudieron programar los recordatorios de la cuota ${emision.cuota.id}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  private construirSuscripcionDTO(
    perfil: PerfilAlumnoFila,
    plan: PlanFila,
    cuotaEmitidaId: string | null
  ): SuscripcionAlumnoDTO {
    return {
      clienteId: perfil.usuarioId,
      planId: plan.id,
      planNombre: plan.nombre,
      duracionMeses: plan.duracionMeses,
      fechaInicio: perfil.cicloAncla ?? '',
      proximoCorte: perfil.proximoCorte ?? '',
      cuotaEmitidaId,
    };
  }

  async obtenerCuotaPorId(
    cuotaId: string,
    actorUserId: string,
    actorRole: Rol,
    actorEntrenadorId?: string
  ): Promise<CuotaDetalleDTO> {
    // RNF-003/ADR-011 (etapa 2): `cuotas_membresia`, `planes_membresia` y `transacciones_pago`
    // tienen RLS. Contexto según actor:
    // - ALUMNO  -> self-select (`cliente_id = current_usuario_id`).
    // - COACH   -> tenant del entrenador dueño.
    // - SUPERADMIN -> bypass explícito (defensivo; la ruta solo admite coach/alumno).
    const contexto = this.contextoRlsDeActor(actorUserId, actorRole, actorEntrenadorId);

    return this.withTenant(contexto, async (tx) => {
      const [cuota] = await tx
        .select()
        .from(cuotasMembresia)
        .where(eq(cuotasMembresia.id, cuotaId));

      if (!cuota) {
        throw new NotFoundException(MENSAJE_CUOTA_NO_ENCONTRADA);
      }

      // Aislamiento de Tenancy / Autorización
      if (actorRole === Rol.ALUMNO && cuota.clienteId !== actorUserId) {
        throw new ForbiddenException('No tienes acceso a esta cuota.');
      }

      if (
        actorRole === Rol.ENTRENADOR &&
        cuota.entrenadorId !== actorUserId &&
        cuota.entrenadorId !== actorEntrenadorId
      ) {
        throw new ForbiddenException(
          'No tienes acceso a esta cuota.'
        );
      }

      // Cargar información adicional
      const [plan] = await tx
        .select()
        .from(planesMembresia)
        .where(eq(planesMembresia.id, cuota.planId));

      const [alumno] = await tx
        .select()
        .from(perfilesAlumno)
        .where(eq(perfilesAlumno.usuarioId, cuota.clienteId));

      const txRecords = await tx
        .select()
        .from(transaccionesPago)
        .where(eq(transaccionesPago.cuotaId, cuotaId))
        .orderBy(asc(transaccionesPago.fechaReporteUtc));

      const transacciones: TransaccionPagoDetalleDTO[] = await Promise.all(
        txRecords.map(async (t) => ({
          id: t.id,
          cuotaId: t.cuotaId,
          clienteId: t.clienteId,
          entrenadorId: t.entrenadorId,
          registradoPor: t.registradoPor,
          montoOriginal: t.montoOriginal,
          monedaOriginal: t.monedaOriginal,
          tasaCambioFijada: t.tasaCambioFijada,
          montoEquivalenteUsd: t.montoEquivalenteUsd,
          excedenteUsd: t.excedenteUsd,
          metodoPago: t.metodoPago,
          referenciaBancaria: t.referenciaBancaria,
          fechaOperacion: t.fechaOperacion,
          comprobanteStorageKey: t.comprobanteStorageKey,
          comprobanteUrl: await this.resolverComprobanteUrl(t.comprobanteStorageKey),
          estadoConciliacion: t.estadoConciliacion,
          motivoRechazo: t.motivoRechazo,
          fechaReporteUtc: t.fechaReporteUtc.toISOString(),
          fechaConciliacionUtc: t.fechaConciliacionUtc?.toISOString() || null,
          createdAtUtc: t.createdAtUtc.toISOString(),
          updatedAtUtc: t.updatedAtUtc.toISOString(),
        }))
      );

      // Proyección en Bs solo con tasa real (misma regla que la emisión: sin tasa, se omite).
      // RNF-003/ADR-011 (etapa 3): la tasa override se lee en la MISMA transacción con contexto.
      const tasa = await this.obtenerTasaVigente(cuota.entrenadorId, cuota.clienteId, tx);
      const saldoPendienteVes = tasa.tasaEfectiva
        ? this.proyectarVES(cuota.saldoPendienteUsd, tasa.tasaEfectiva)
        : undefined;

      return {
        id: cuota.id,
        clienteId: cuota.clienteId,
        entrenadorId: cuota.entrenadorId,
        planId: cuota.planId,
        periodo: cuota.periodo,
        montoTotalUsd: cuota.montoTotalUsd,
        montoAbonadoUsd: cuota.montoAbonadoUsd,
        saldoPendienteUsd: cuota.saldoPendienteUsd,
        saldoAFavorAplicadoUsd: cuota.saldoAFavorAplicadoUsd,
        saldoPendienteVes,
        tasaAplicada: tasa.tasaEfectiva ?? undefined,
        fechaEmisionUtc: toIsoSafe(cuota.fechaEmisionUtc),
        fechaCorteUtc: toIsoSafe(cuota.fechaCorteUtc),
        estado: cuota.estado,
        notas: cuota.notas,
        // RF-005 §6: reconocible en cualquier lectura de la cuota (becado = emitida en 0.00).
        esBecado: toCents(cuota.montoTotalUsd) === 0,
        planNombre: plan?.nombre,
        clienteNombre: alumno ? `${alumno.nombres} ${alumno.apellidos}` : undefined,
        transacciones,
        createdAtUtc: toIsoSafe(cuota.createdAtUtc),
        updatedAtUtc: toIsoSafe(cuota.updatedAtUtc),
      };
    });
  }

  /**
   * RNF-003/ADR-011 (etapa 2): contexto RLS para rutas que atienden a más de un rol.
   * - ALUMNO -> self-select (`current_usuario_id`).
   * - ENTRENADOR -> tenant del coach (su `usuarioId` es el `entrenadorId` del tenant).
   * - SUPERADMIN -> bypass explícito `is_superadmin`.
   */
  private contextoRlsDeActor(
    actorUserId: string,
    actorRole: Rol,
    actorEntrenadorId?: string
  ): TenantRlsContext {
    if (actorRole === Rol.ALUMNO) return { usuarioId: actorUserId };
    if (actorRole === Rol.SUPERADMIN) return { isSuperadmin: true };
    return { entrenadorId: actorEntrenadorId ?? actorUserId };
  }

  // ===========================================================================
  // 5. REPORTE DE PAGO POR ALUMNO & IDEMPOTENCIA (RF-007, RNF-002)
  // ===========================================================================

  async reportarPago(
    cuotaId: string,
    alumnoUserId: string,
    dto: ReportarPagoDTO,
    idempotencyHeader?: string
  ): Promise<{
    transaccion: TransaccionPagoDetalleDTO;
    cuota: CuotaDetalleDTO;
    esDuplicadoIdempotente: boolean;
    mensaje: string;
  }> {
    const idempotencyKey = idempotencyHeader || dto.idempotencyKey;
    // RNF-002 §4 + aislamiento de tenant: la caché se indexa por solicitante para que una key
    // repetida jamás devuelva la respuesta de otro alumno, aunque la consulta de caché ocurra
    // antes del control de titularidad.
    const cacheKey = idempotencyKey ? `${alumnoUserId}:${idempotencyKey}` : undefined;

    // 1. Idempotencia en memoria (lag de red / reintento exacto): una respuesta guardada o una
    //    ejecución en curso con la misma clave se reutiliza en vez de registrar otro pago.
    let ejecutadoAhora = false;
    const { transaccion, cuota } = await this.idempotencia.ejecutar(cacheKey, () => {
      ejecutadoAhora = true;
      return this.registrarReportePago(cuotaId, alumnoUserId, dto);
    });

    if (!ejecutadoAhora) {
      return {
        transaccion,
        cuota,
        esDuplicadoIdempotente: true,
        mensaje: 'Pago ya reportado previamente (respuesta idempotente).',
      };
    }

    return {
      transaccion,
      cuota,
      esDuplicadoIdempotente: false,
      mensaje: 'Pago reportado con éxito. Tu entrenador lo revisará pronto.',
    };
  }

  /** Pasos 2-5 del reporte de pago (sin idempotencia): valida, registra, notifica y devuelve. */
  private async registrarReportePago(
    cuotaId: string,
    alumnoUserId: string,
    dto: ReportarPagoDTO
  ): Promise<{ transaccion: TransaccionPagoDetalleDTO; cuota: CuotaDetalleDTO }> {
    // 2-5. RNF-003/ADR-011 (etapa 2): el alumno reporta con contexto self (`current_usuario_id`).
    // Validación de titularidad, transacción y transición de la cuota en UNA transacción; las
    // políticas `self_select`/`self_insert`/`self_update` de 0012 cubren exactamente este flujo.
    const nuevaTx = await this.withTenant({ usuarioId: alumnoUserId }, async (tx) => {
      // 2. Validar cuota y permisos del alumno titular
      const [cuota] = await tx
        .select()
        .from(cuotasMembresia)
        .where(eq(cuotasMembresia.id, cuotaId));

      if (!cuota) {
        throw new NotFoundException(MENSAJE_CUOTA_NO_ENCONTRADA);
      }

      if (cuota.clienteId !== alumnoUserId) {
        throw new ForbiddenException('No puedes reportar pagos en esta cuota.');
      }

      if (cuota.estado === EstadoCuota.ANULADA) {
        throw new BadRequestException('No se pueden reportar pagos sobre una cuota anulada.');
      }

      if (cuota.estado === EstadoCuota.AL_DIA && toCents(cuota.saldoPendienteUsd) === 0) {
        throw new BadRequestException('La cuota ya se encuentra totalmente saldada.');
      }

      // 3. Referencia repetida (RF-007 §6) — mismo alcance que el índice único parcial
      //    `uq_transaccion_referencia_entrenador` (0018): dentro de la cartera del coach, solo
      //    métodos electrónicos y sin contar pagos rechazados (que pueden reenviarse). Bajo RLS el
      //    alumno solo ve sus propios pagos: el choque con los de otro alumno lo detecta el índice
      //    al insertar (23505 -> 409 más abajo).
      if (dto.referenciaBancaria && !esMetodoEfectivo(dto.metodoPago)) {
        const [txDuplicada] = await tx
          .select()
          .from(transaccionesPago)
          .where(
            and(
              eq(transaccionesPago.entrenadorId, cuota.entrenadorId),
              eq(transaccionesPago.metodoPago, dto.metodoPago),
              eq(transaccionesPago.referenciaBancaria, dto.referenciaBancaria),
              eq(transaccionesPago.fechaOperacion, dto.fechaOperacion),
              // RF-007: un pago rechazado o revertido no ocupa su referencia.
              notInArray(transaccionesPago.estadoConciliacion, [
                EstadoConciliacion.RECHAZADO,
                EstadoConciliacion.REVERTIDO,
              ])
            )
          );

        if (txDuplicada) {
          throw new ConflictException(MENSAJE_REFERENCIA_DUPLICADA);
        }
      }

      // 4. Congelar la tasa de cambio vigente (ADR-003 rate snapshot).
      //    Un pago en VES exige tasa real: sin ella no se puede calcular el contravalor USD y
      //    se devuelve un error de negocio claro en vez de inventar un equivalente.
      //    RNF-003/ADR-011 (etapa 3): tasa override leída en la MISMA tx (contexto self del alumno).
      const tasa = await this.obtenerTasaVigente(cuota.entrenadorId, alumnoUserId, tx);
      let tasaCambioFijada = '1.0000';
      let montoEquivalenteUsd = dto.montoOriginal;

      if (dto.monedaOriginal === Moneda.VES) {
        const tasaEfectiva = tasa.tasaEfectiva;
        if (!tasaEfectiva || parseFloat(tasaEfectiva) <= 0) {
          throw new BadRequestException(
            'El entrenador aún no ha configurado la tasa de cambio. No es posible calcular el equivalente en USD de un pago en bolívares.'
          );
        }
        tasaCambioFijada = tasaEfectiva;
        montoEquivalenteUsd = this.calcularContravalorUSD(dto.montoOriginal, tasaEfectiva);
      }

      const nowUtc = new Date();

      // 5. Inserción de transacción y transición de cuota a 'pendiente_revision'
      let nuevaTx: typeof transaccionesPago.$inferSelect;
      try {
        [nuevaTx] = await tx
          .insert(transaccionesPago)
          .values({
            cuotaId: cuota.id,
            clienteId: alumnoUserId,
            entrenadorId: cuota.entrenadorId,
            registradoPor: alumnoUserId,
            montoOriginal: dto.montoOriginal,
            monedaOriginal: dto.monedaOriginal,
            tasaCambioFijada,
            montoEquivalenteUsd,
            metodoPago: dto.metodoPago,
            referenciaBancaria: dto.referenciaBancaria || null,
            fechaOperacion: dto.fechaOperacion,
            comprobanteStorageKey: dto.comprobanteStorageKey || null,
            estadoConciliacion: EstadoConciliacion.PENDIENTE,
            fechaReporteUtc: nowUtc,
            createdAtUtc: nowUtc,
            updatedAtUtc: nowUtc,
          })
          .returning();
      } catch (error) {
        if (esViolacionUnicidad(error, INDICE_REFERENCIA_POR_ENTRENADOR)) {
          throw new ConflictException(MENSAJE_REFERENCIA_DUPLICADA);
        }
        throw error;
      }

      // Transicionar cuota a PENDIENTE_REVISION
      await tx
        .update(cuotasMembresia)
        .set({
          estado: EstadoCuota.PENDIENTE_REVISION,
          updatedAtUtc: nowUtc,
        })
        .where(eq(cuotasMembresia.id, cuota.id));

      return nuevaTx;
    });

    // Lectura del detalle ya con la transacción confirmada (contexto del entrenador dueño).
    const cuotaDto = await this.obtenerCuotaPorId(
      nuevaTx.cuotaId,
      nuevaTx.entrenadorId,
      Rol.ENTRENADOR
    );

    const txDto: TransaccionPagoDetalleDTO = {
      id: nuevaTx.id,
      cuotaId: nuevaTx.cuotaId,
      clienteId: nuevaTx.clienteId,
      entrenadorId: nuevaTx.entrenadorId,
      registradoPor: nuevaTx.registradoPor,
      montoOriginal: nuevaTx.montoOriginal,
      monedaOriginal: nuevaTx.monedaOriginal,
      tasaCambioFijada: nuevaTx.tasaCambioFijada,
      montoEquivalenteUsd: nuevaTx.montoEquivalenteUsd,
      excedenteUsd: nuevaTx.excedenteUsd,
      metodoPago: nuevaTx.metodoPago,
      referenciaBancaria: nuevaTx.referenciaBancaria,
      fechaOperacion: nuevaTx.fechaOperacion,
      comprobanteStorageKey: nuevaTx.comprobanteStorageKey,
      comprobanteUrl: await this.resolverComprobanteUrl(nuevaTx.comprobanteStorageKey),
      estadoConciliacion: nuevaTx.estadoConciliacion,
      motivoRechazo: nuevaTx.motivoRechazo,
      fechaReporteUtc: nuevaTx.fechaReporteUtc.toISOString(),
      fechaConciliacionUtc: null,
      createdAtUtc: nuevaTx.createdAtUtc.toISOString(),
      updatedAtUtc: nuevaTx.updatedAtUtc.toISOString(),
    };

    if (this.eventEmitter) {
      // RF-014 RN-01: evento de dominio fire-and-forget; un fallo de colas NUNCA tumba el reporte.
      void this.eventEmitter
        .emitAsync(
          PagoReportadoEvent.NOMBRE,
          new PagoReportadoEvent({
            tipoEvento: 'PAGO_REPORTADO',
            destinatarioUserId: nuevaTx.entrenadorId,
            entrenadorId: nuevaTx.entrenadorId,
            categoria: 'FINANZAS',
            titulo: 'Nuevo pago por verificar',
            cuerpo: `Se ha reportado un pago de ${nuevaTx.montoOriginal} ${nuevaTx.monedaOriginal} pendiente por conciliar.`,
            linkAccion: '/finanzas/conciliacion',
            datosAdicionales: {
              transaccionId: nuevaTx.id,
              cuotaId: nuevaTx.cuotaId,
              clienteId: nuevaTx.clienteId,
              montoOriginal: nuevaTx.montoOriginal,
              monedaOriginal: nuevaTx.monedaOriginal,
              referenciaBancaria: nuevaTx.referenciaBancaria,
            },
            esCriticoSeguridad: false,
            // RNF-004 §3: ref de origen del jobId determinista.
            referenciaId: nuevaTx.id,
          })
        )
        .catch(() => {});
    }

    return { transaccion: txDto, cuota: cuotaDto };
  }

  // ===========================================================================
  // 6. COBRO DIRECTO EN SALA POR EL COACH (RF-007)
  // ===========================================================================

  async cobroDirecto(
    cuotaId: string,
    entrenadorId: string,
    dto: CobroDirectoDTO
  ): Promise<{
    transaccion: TransaccionPagoDetalleDTO;
    cuota: CuotaDetalleDTO;
    mensaje: string;
  }> {
    const esEfectivo =
      dto.metodoPago === MetodoPago.EFECTIVO_USD ||
      dto.metodoPago === MetodoPago.EFECTIVO_VES;

    if (!esEfectivo) {
      throw new BadRequestException(
        'El cobro en sala solo acepta efectivo (dólares o bolívares).'
      );
    }

    const resultado = await this.db.transaction(async (tx) => {
      // Bloqueo Pesimista (SELECT ... FOR UPDATE) con RLS Tenant.
      // set_config(..., true) es la forma VÁLIDA de aplicar un SET LOCAL parametrizado:
      // `SET LOCAL x = $1` no es sintaxis admitida por PostgreSQL (error 42601). Mismo patrón
      // que withTenant() en packages/database (WU7).
      //
      // RNF-003/ADR-011 (etapa 2): se conserva la transacción PROPIA (FOR UPDATE + set_config
      // manual) porque `withTenant` no anida limpio sobre `db.transaction`; es EQUIVALENTE al
      // helper (misma GUC transaccional, mismo alcance). No se duplica contexto.
      await tx.execute(
        sql`SELECT set_config('app.current_entrenador_id', ${entrenadorId}, true)`
      );
      await tx.execute(sql`SELECT id FROM cuotas_membresia WHERE id = ${cuotaId} FOR UPDATE`);

      const [cuotaLock] = await tx
        .select()
        .from(cuotasMembresia)
        .where(
          and(eq(cuotasMembresia.id, cuotaId), eq(cuotasMembresia.entrenadorId, entrenadorId))
        );

      if (!cuotaLock) {
        throw new NotFoundException(MENSAJE_CUOTA_NO_ENCONTRADA);
      }

      if (cuotaLock.estado === EstadoCuota.ANULADA) {
        throw new BadRequestException('La cuota se encuentra anulada.');
      }

      // Calcular contravalor USD. Un cobro en VES exige tasa real: sin ella se aborta la
      // transacción con error de negocio claro (nunca un contravalor fabricado).
      let tasaCambioFijada = '1.0000';
      let montoEquivalenteUsd = dto.montoOriginal;

      if (dto.monedaOriginal === Moneda.VES) {
        // RNF-003/ADR-011 (etapa 3): la tasa override lee el perfil (RLS) en la MISMA tx manual
        // con el GUC del coach (set_config arriba).
        const tasa = await this.obtenerTasaVigente(entrenadorId, cuotaLock.clienteId, tx);
        if (!tasa.tasaEfectiva || parseFloat(tasa.tasaEfectiva) <= 0) {
          throw new BadRequestException(
            'Aún no has configurado la tasa de cambio. Configura tu tasa activa en Ajustes → Tasas para cobrar en bolívares.'
          );
        }
        tasaCambioFijada = tasa.tasaEfectiva;
        montoEquivalenteUsd = this.calcularContravalorUSD(dto.montoOriginal, tasaCambioFijada);
      }

      const nowUtc = new Date();
      // RF-006 RN-05: lo que excede el saldo de la cuota pasa al saldo a favor del alumno.
      const reparto = repartirAbono(cuotaLock.saldoPendienteUsd, montoEquivalenteUsd);

      // Transacción auto-aprobada
      const [nuevaTx] = await tx
        .insert(transaccionesPago)
        .values({
          cuotaId: cuotaLock.id,
          clienteId: cuotaLock.clienteId,
          entrenadorId,
          registradoPor: entrenadorId,
          montoOriginal: dto.montoOriginal,
          monedaOriginal: dto.monedaOriginal,
          tasaCambioFijada,
          montoEquivalenteUsd,
          excedenteUsd: reparto.excedenteUsd,
          metodoPago: dto.metodoPago,
          // El cobro en sala es siempre en efectivo, que no lleva referencia bancaria (M5-L1):
          // se descarta cualquiera que envíe el cliente y nunca se usa un centinela compartido.
          referenciaBancaria: null,
          fechaOperacion: dto.fechaOperacion,
          estadoConciliacion: EstadoConciliacion.APROBADO,
          fechaReporteUtc: nowUtc,
          fechaConciliacionUtc: nowUtc,
          createdAtUtc: nowUtc,
          updatedAtUtc: nowUtc,
        })
        .returning();

      // Descuento inmediato: la cuota recibe solo lo que debía; el excedente va al saldo a favor.
      const nuevoAbonado = addDecimals(cuotaLock.montoAbonadoUsd, reparto.aplicadoUsd);
      const nuevoPendiente = subtractDecimals(cuotaLock.saldoPendienteUsd, reparto.aplicadoUsd);
      await this.acreditarSaldoAFavor(
        tx,
        cuotaLock.clienteId,
        cuotaLock.entrenadorId,
        reparto.excedenteUsd,
        nowUtc
      );
      const nuevoEstado =
        toCents(nuevoPendiente) === 0 ? EstadoCuota.AL_DIA : EstadoCuota.ABONADA_PARCIAL;

      assertBalanceInvariant(cuotaLock.montoTotalUsd, nuevoAbonado, nuevoPendiente);

      const [cuotaActualizada] = await tx
        .update(cuotasMembresia)
        .set({
          montoAbonadoUsd: nuevoAbonado,
          saldoPendienteUsd: nuevoPendiente,
          estado: nuevoEstado,
          updatedAtUtc: nowUtc,
        })
        .where(eq(cuotasMembresia.id, cuotaLock.id))
        .returning();

      const txDto: TransaccionPagoDetalleDTO = {
        id: nuevaTx.id,
        cuotaId: nuevaTx.cuotaId,
        clienteId: nuevaTx.clienteId,
        entrenadorId: nuevaTx.entrenadorId,
        registradoPor: nuevaTx.registradoPor,
        montoOriginal: nuevaTx.montoOriginal,
        monedaOriginal: nuevaTx.monedaOriginal,
        tasaCambioFijada: nuevaTx.tasaCambioFijada,
        montoEquivalenteUsd: nuevaTx.montoEquivalenteUsd,
        excedenteUsd: nuevaTx.excedenteUsd,
        metodoPago: nuevaTx.metodoPago,
        referenciaBancaria: nuevaTx.referenciaBancaria,
        fechaOperacion: nuevaTx.fechaOperacion,
        comprobanteStorageKey: null,
        estadoConciliacion: nuevaTx.estadoConciliacion,
        motivoRechazo: null,
        fechaReporteUtc: nuevaTx.fechaReporteUtc.toISOString(),
        fechaConciliacionUtc: nuevaTx.fechaConciliacionUtc?.toISOString() || null,
        createdAtUtc: nuevaTx.createdAtUtc.toISOString(),
        updatedAtUtc: nuevaTx.updatedAtUtc.toISOString(),
      };

      // Proyección informativa en Bs: solo con tasa real (sin tasa, se omite el dato).
      // RNF-003/ADR-011 (etapa 3): misma tx manual con contexto del coach.
      const tasa = await this.obtenerTasaVigente(entrenadorId, cuotaActualizada.clienteId, tx);
      const saldoPendienteVes = tasa.tasaEfectiva
        ? this.proyectarVES(cuotaActualizada.saldoPendienteUsd, tasa.tasaEfectiva)
        : undefined;

      const cuotaDto: CuotaDetalleDTO = {
        id: cuotaActualizada.id,
        clienteId: cuotaActualizada.clienteId,
        entrenadorId: cuotaActualizada.entrenadorId,
        planId: cuotaActualizada.planId,
        periodo: cuotaActualizada.periodo,
        montoTotalUsd: cuotaActualizada.montoTotalUsd,
        montoAbonadoUsd: cuotaActualizada.montoAbonadoUsd,
        saldoPendienteUsd: cuotaActualizada.saldoPendienteUsd,
        saldoAFavorAplicadoUsd: cuotaActualizada.saldoAFavorAplicadoUsd,
        saldoPendienteVes,
        tasaAplicada: tasa.tasaEfectiva ?? undefined,
        fechaEmisionUtc: toIsoSafe(cuotaActualizada.fechaEmisionUtc),
        fechaCorteUtc: toIsoSafe(cuotaActualizada.fechaCorteUtc),
        estado: cuotaActualizada.estado,
        notas: cuotaActualizada.notas,
        // RF-005 §6: una cuota emitida en 0.00 es de un becado (también en el cobro directo).
        esBecado: toCents(cuotaActualizada.montoTotalUsd) === 0,
        createdAtUtc: toIsoSafe(cuotaActualizada.createdAtUtc),
        updatedAtUtc: toIsoSafe(cuotaActualizada.updatedAtUtc),
      };

      return {
        transaccion: txDto,
        cuota: cuotaDto,
        mensaje: 'Cobro directo en efectivo registrado y auto-aprobado exitosamente.',
      };
    });

    // WU-H (RF-008 / ADR-008 §3.2): un cobro directo que liquida la cuota cancela los
    // recordatorios futuros pendientes.
    if (toCents(resultado.cuota.saldoPendienteUsd) === 0) {
      await this.cancelarRecordatoriosSiLiquidada(resultado.cuota.id);
    }

    if (this.eventEmitter) {
      // RF-014 RN-01: aviso de dominio fire-and-forget al alumno dueño de la cuota; un fallo de
      // colas NUNCA revierte el cobro ya confirmado.
      void this.eventEmitter
        .emitAsync(
          CobroDirectoRegistradoEvent.NOMBRE,
          new CobroDirectoRegistradoEvent({
            tipoEvento: 'COBRO_DIRECTO_REGISTRADO',
            destinatarioUserId: resultado.transaccion.clienteId,
            entrenadorId,
            categoria: 'FINANZAS',
            titulo: 'Tu entrenador registró un cobro',
            cuerpo: mensajeCobroConExcedente(
              `Tu entrenador registró un cobro de ${resultado.transaccion.montoEquivalenteUsd} USD`,
              resultado.transaccion.montoEquivalenteUsd,
              resultado.transaccion.excedenteUsd
            ),
            linkAccion: '/app/pagos',
            datosAdicionales: {
              transaccionId: resultado.transaccion.id,
              cuotaId: resultado.cuota.id,
              montoOriginal: resultado.transaccion.montoOriginal,
              monedaOriginal: resultado.transaccion.monedaOriginal,
              montoEquivalenteUsd: resultado.transaccion.montoEquivalenteUsd,
              excedenteUsd: resultado.transaccion.excedenteUsd,
            },
            esCriticoSeguridad: false,
            // RNF-004 §3: ref de origen del jobId determinista.
            referenciaId: resultado.transaccion.id,
          })
        )
        .catch(() => {});
    }

    return resultado;
  }

  // ===========================================================================
  // 7. CONCILIACIÓN CON BLOQUEO PESIMISTA (SELECT ... FOR UPDATE) (RNF-002)
  // ===========================================================================

  async conciliarTransaccion(
    transaccionId: string,
    entrenadorId: string,
    dto: ConciliarTransaccionDTO
  ): Promise<{
    transaccion: TransaccionPagoDetalleDTO;
    cuota: CuotaDetalleDTO;
    mensaje: string;
  }> {
    if (dto.accion === 'rechazar' && (!dto.motivoRechazo || dto.motivoRechazo.trim().length === 0)) {
      throw new BadRequestException('El motivo de rechazo es obligatorio al rechazar una transacción.');
    }

    const resultado = await this.db.transaction(async (tx) => {
      // 1. Contexto RLS (set_config parametrizado = SET LOCAL válido; ver withTenant()).
      //    RNF-003/ADR-011 (etapa 2): transacción propia con FOR UPDATE + GUC manual,
      //    EQUIVALENTE a withTenant (no se anida el helper sobre db.transaction).
      await tx.execute(
        sql`SELECT set_config('app.current_entrenador_id', ${entrenadorId}, true)`
      );

      // 2. Bloqueo Pesimista en la Transacción
      await tx.execute(sql`SELECT id FROM transacciones_pago WHERE id = ${transaccionId} FOR UPDATE`);

      const [txRecord] = await tx
        .select()
        .from(transaccionesPago)
        .where(
          and(
            eq(transaccionesPago.id, transaccionId),
            eq(transaccionesPago.entrenadorId, entrenadorId)
          )
        );

      if (!txRecord) {
        throw new NotFoundException(MENSAJE_PAGO_NO_ENCONTRADO);
      }

      if (txRecord.estadoConciliacion !== EstadoConciliacion.PENDIENTE) {
        throw new ConflictException('Este pago ya fue revisado.');
      }

      // 3. Bloqueo Pesimista en la Cuota asociada
      await tx.execute(sql`SELECT id FROM cuotas_membresia WHERE id = ${txRecord.cuotaId} FOR UPDATE`);

      const [cuotaLock] = await tx
        .select()
        .from(cuotasMembresia)
        .where(eq(cuotasMembresia.id, txRecord.cuotaId));

      if (!cuotaLock) {
        throw new NotFoundException('Cuota asociada a la transacción no encontrada.');
      }

      const nowUtc = new Date();

      if (dto.accion === 'aprobar') {
        // Aprobación: liquidar crédito en USD. RF-006 RN-05: lo que excede el saldo de la cuota
        // (p. ej. el mismo pago reportado dos veces) pasa al saldo a favor del alumno.
        const reparto = repartirAbono(cuotaLock.saldoPendienteUsd, txRecord.montoEquivalenteUsd);
        const [txAprobada] = await tx
          .update(transaccionesPago)
          .set({
            estadoConciliacion: EstadoConciliacion.APROBADO,
            excedenteUsd: reparto.excedenteUsd,
            fechaConciliacionUtc: nowUtc,
            updatedAtUtc: nowUtc,
          })
          .where(eq(transaccionesPago.id, transaccionId))
          .returning();

        const nuevoAbonado = addDecimals(cuotaLock.montoAbonadoUsd, reparto.aplicadoUsd);
        const nuevoPendiente = subtractDecimals(cuotaLock.saldoPendienteUsd, reparto.aplicadoUsd);
        await this.acreditarSaldoAFavor(
          tx,
          cuotaLock.clienteId,
          cuotaLock.entrenadorId,
          reparto.excedenteUsd,
          nowUtc
        );
        const nuevoEstado =
          toCents(nuevoPendiente) === 0 ? EstadoCuota.AL_DIA : EstadoCuota.ABONADA_PARCIAL;

        assertBalanceInvariant(cuotaLock.montoTotalUsd, nuevoAbonado, nuevoPendiente);

        const [cuotaActualizada] = await tx
          .update(cuotasMembresia)
          .set({
            montoAbonadoUsd: nuevoAbonado,
            saldoPendienteUsd: nuevoPendiente,
            estado: nuevoEstado,
            updatedAtUtc: nowUtc,
          })
          .where(eq(cuotasMembresia.id, cuotaLock.id))
          .returning();

        return {
          transaccion: this.mapearTransaccionDTO(txAprobada),
          cuota: this.mapearCuotaDTO(cuotaActualizada),
          mensaje: 'Transacción aprobada y saldo de cuota liquidado exitosamente.',
        };
      } else {
        // Rechazo: Exigir motivo y restaurar estado previo de cuota (RN-05)
        const [txRechazada] = await tx
          .update(transaccionesPago)
          .set({
            estadoConciliacion: EstadoConciliacion.RECHAZADO,
            motivoRechazo: dto.motivoRechazo?.trim() || 'Rechazado por el entrenador',
            fechaConciliacionUtc: nowUtc,
            updatedAtUtc: nowUtc,
          })
          .where(eq(transaccionesPago.id, transaccionId))
          .returning();

        // Verificar si existen otras transacciones aún en estado PENDIENTE en esta cuota
        const otrasPendientes = await tx
          .select()
          .from(transaccionesPago)
          .where(
            and(
              eq(transaccionesPago.cuotaId, cuotaLock.id),
              eq(transaccionesPago.estadoConciliacion, EstadoConciliacion.PENDIENTE),
              ne(transaccionesPago.id, transaccionId)
            )
          );

        // Si otro pago ya la saldó, rechazar este no la vuelve parcial.
        const nuevoEstado = estadoCuotaTrasRetirarAbono({
          montoAbonadoUsd: cuotaLock.montoAbonadoUsd,
          saldoPendienteUsd: cuotaLock.saldoPendienteUsd,
          fechaCorteUtc: cuotaLock.fechaCorteUtc,
          hayOtrasPendientes: otrasPendientes.length > 0,
          ahora: nowUtc,
        });

        // Invariante de balance permanece inalterada
        assertBalanceInvariant(
          cuotaLock.montoTotalUsd,
          cuotaLock.montoAbonadoUsd,
          cuotaLock.saldoPendienteUsd
        );

        const [cuotaActualizada] = await tx
          .update(cuotasMembresia)
          .set({
            estado: nuevoEstado,
            updatedAtUtc: nowUtc,
          })
          .where(eq(cuotasMembresia.id, cuotaLock.id))
          .returning();

        return {
          transaccion: this.mapearTransaccionDTO(txRechazada),
          cuota: this.mapearCuotaDTO(cuotaActualizada),
          mensaje: 'Transacción rechazada y cuota restaurada exitosamente.',
        };
      }
    });

    // WU-H (RF-008 / ADR-008 §3.2): aprobar el pago que deja la cuota en $0.00 cancela los
    // recordatorios futuros (T-1/T/T+2) para no cobrarle a un cliente que ya está al día.
    if (dto.accion === 'aprobar' && toCents(resultado.cuota.saldoPendienteUsd) === 0) {
      await this.cancelarRecordatoriosSiLiquidada(resultado.cuota.id);
    }

    if (this.eventEmitter) {
      if (dto.accion === 'aprobar') {
        // RF-014 RN-01: evento de dominio fire-and-forget (el recibo crítico lo garantiza Email).
        void this.eventEmitter
          .emitAsync(
            PagoAprobadoEvent.NOMBRE,
            new PagoAprobadoEvent({
              tipoEvento: 'PAGO_APROBADO',
              destinatarioUserId: resultado.transaccion.clienteId,
              entrenadorId,
              categoria: 'FINANZAS',
              titulo: '¡Pago verificado y aprobado!',
              cuerpo: mensajePagoAprobado(
                `Tu pago de ${resultado.transaccion.montoOriginal} ${resultado.transaccion.monedaOriginal} fue aprobado con éxito.`,
                resultado.transaccion.excedenteUsd
              ),
              linkAccion: '/finanzas',
              datosAdicionales: {
                transaccionId: resultado.transaccion.id,
                cuotaId: resultado.cuota.id,
                montoEquivalenteUsd: resultado.transaccion.montoEquivalenteUsd,
                excedenteUsd: resultado.transaccion.excedenteUsd,
              },
              esCriticoSeguridad: true, // Recibo financiero / comprobante crítico garantizado por Email (RF-015 RN-03)
              // RNF-004 §3: ref de origen del jobId determinista.
              referenciaId: resultado.transaccion.id,
            })
          )
          .catch(() => {});
      } else {
        void this.eventEmitter
          .emitAsync(
            PagoRechazadoEvent.NOMBRE,
            new PagoRechazadoEvent({
              tipoEvento: 'PAGO_RECHAZADO',
              destinatarioUserId: resultado.transaccion.clienteId,
              entrenadorId,
              categoria: 'FINANZAS',
              titulo: 'Pago no verificado',
              cuerpo: `Tu pago fue rechazado. Motivo: ${resultado.transaccion.motivoRechazo || 'Rechazado por el entrenador'}.`,
              linkAccion: '/finanzas',
              datosAdicionales: {
                transaccionId: resultado.transaccion.id,
                cuotaId: resultado.cuota.id,
                motivoRechazo: resultado.transaccion.motivoRechazo,
              },
              esCriticoSeguridad: false,
              // RNF-004 §3: ref de origen del jobId determinista.
              referenciaId: resultado.transaccion.id,
            })
          )
          .catch(() => {});
      }
    }

    return resultado;
  }

  /**
   * RF-007 (decisión del dueño 2026-10-11): revierte un pago APROBADO por error (de la bandeja o un
   * cobro en sala). Solo el entrenador dueño, con motivo obligatorio, en cualquier momento.
   *
   * Deshace exactamente la aprobación: devuelve a la cuota lo aplicado y quita del saldo a favor el
   * excedente que generó el pago (RF-006 RN-05). Si ese excedente ya se aplicó a otra cuota (el
   * saldo a favor actual no alcanza), responde 409 y no cambia nada: nunca queda saldo negativo.
   * El pago queda `revertido` con su motivo; no se borra.
   *
   * Bloqueos en el MISMO orden que la aprobación: transacción → cuota → perfil (ver
   * `acreditarSaldoAFavor`). Si la cuota vuelve a tener deuda, sus recordatorios se agendan en el
   * acto (best-effort; BullMQ descarta los repetidos por `jobId`).
   */
  async revertirTransaccion(
    transaccionId: string,
    entrenadorId: string,
    dto: RevertirPagoDTO,
    ahora: Date = new Date()
  ): Promise<{
    transaccion: TransaccionPagoDetalleDTO;
    cuota: CuotaDetalleDTO;
    mensaje: string;
  }> {
    const validado = parsearContrato(RevertirPagoSchema, dto);
    let zonaAlumno: string | null = null;

    const resultado = await this.db.transaction(async (tx) => {
      // Contexto RLS del coach (mismo patrón que `conciliarTransaccion`).
      await tx.execute(
        sql`SELECT set_config('app.current_entrenador_id', ${entrenadorId}, true)`
      );
      await tx.execute(sql`SELECT id FROM transacciones_pago WHERE id = ${transaccionId} FOR UPDATE`);

      const [txRecord] = await tx
        .select()
        .from(transaccionesPago)
        .where(
          and(
            eq(transaccionesPago.id, transaccionId),
            eq(transaccionesPago.entrenadorId, entrenadorId)
          )
        );
      if (!txRecord) {
        throw new NotFoundException(MENSAJE_PAGO_NO_ENCONTRADO);
      }
      if (txRecord.estadoConciliacion !== EstadoConciliacion.APROBADO) {
        throw new ConflictException(MENSAJE_REVERSION_SOLO_APROBADOS);
      }

      await tx.execute(sql`SELECT id FROM cuotas_membresia WHERE id = ${txRecord.cuotaId} FOR UPDATE`);
      const [cuotaLock] = await tx
        .select()
        .from(cuotasMembresia)
        .where(eq(cuotasMembresia.id, txRecord.cuotaId));
      if (!cuotaLock) {
        throw new NotFoundException('Cuota asociada a la transacción no encontrada.');
      }
      if (cuotaLock.estado === EstadoCuota.ANULADA) {
        throw new ConflictException('No se puede revertir un pago de una cuota anulada.');
      }

      const excedente = txRecord.excedenteUsd;
      const aplicado = subtractDecimals(txRecord.montoEquivalenteUsd, excedente);

      // El excedente que generó este pago sale del saldo a favor; si ya se gastó, no se revierte.
      await this.retirarSaldoAFavor(
        tx,
        cuotaLock.clienteId,
        cuotaLock.entrenadorId,
        excedente,
        ahora
      );

      // La cuota recupera lo aplicado. El pendiente se recalcula desde el total (también cubre
      // pagos anteriores a la 0019, cuyo abonado podía superar el total).
      const nuevoAbonadoCents = Math.max(0, toCents(cuotaLock.montoAbonadoUsd) - toCents(aplicado));
      const nuevoAbonado = fromCents(nuevoAbonadoCents);
      const nuevoPendiente = fromCents(
        Math.max(0, toCents(cuotaLock.montoTotalUsd) - nuevoAbonadoCents)
      );
      assertBalanceInvariant(cuotaLock.montoTotalUsd, nuevoAbonado, nuevoPendiente);

      const otrasPendientes = await tx
        .select({ id: transaccionesPago.id })
        .from(transaccionesPago)
        .where(
          and(
            eq(transaccionesPago.cuotaId, cuotaLock.id),
            eq(transaccionesPago.estadoConciliacion, EstadoConciliacion.PENDIENTE)
          )
        );
      const nuevoEstado = estadoCuotaTrasRetirarAbono({
        montoAbonadoUsd: nuevoAbonado,
        saldoPendienteUsd: nuevoPendiente,
        fechaCorteUtc: cuotaLock.fechaCorteUtc,
        hayOtrasPendientes: otrasPendientes.length > 0,
        ahora,
      });

      const [cuotaActualizada] = await tx
        .update(cuotasMembresia)
        .set({
          montoAbonadoUsd: nuevoAbonado,
          saldoPendienteUsd: nuevoPendiente,
          estado: nuevoEstado,
          updatedAtUtc: ahora,
        })
        .where(eq(cuotasMembresia.id, cuotaLock.id))
        .returning();

      const [perfilZona] = await tx
        .select({ zonaHoraria: perfilesAlumno.zonaHoraria })
        .from(perfilesAlumno)
        .where(
          and(
            eq(perfilesAlumno.usuarioId, cuotaLock.clienteId),
            eq(perfilesAlumno.entrenadorId, cuotaLock.entrenadorId)
          )
        );
      zonaAlumno = perfilZona ? zonaDelAlumno(perfilZona) : null;

      const [txRevertida] = await tx
        .update(transaccionesPago)
        .set({
          estadoConciliacion: EstadoConciliacion.REVERTIDO,
          motivoReversion: validado.motivo,
          fechaReversionUtc: ahora,
          updatedAtUtc: ahora,
        })
        .where(eq(transaccionesPago.id, transaccionId))
        .returning();

      return {
        transaccion: this.mapearTransaccionDTO(txRevertida),
        cuota: this.mapearCuotaDTO(cuotaActualizada),
        mensaje:
          toCents(excedente) > 0
            ? `Pago revertido. La cuota volvió a su saldo anterior y se descontaron ${excedente} USD del saldo a favor del alumno.`
            : 'Pago revertido. La cuota volvió a su saldo anterior.',
      };
    });

    // La cuota vuelve a tener deuda: se agendan sus recordatorios (incluido el del día si toca).
    if (toCents(resultado.cuota.saldoPendienteUsd) > 0 && zonaAlumno && this.billingSchedulerService) {
      try {
        await this.billingSchedulerService.programarRecordatoriosCuota({
          id: resultado.cuota.id,
          fechaCorteUtc: new Date(resultado.cuota.fechaCorteUtc),
          zonaHoraria: zonaAlumno,
        });
      } catch (error) {
        this.logger.error(
          `No se pudieron reagendar los recordatorios de la cuota ${resultado.cuota.id}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    if (this.eventEmitter) {
      // RF-014: aviso fire-and-forget al alumno; un fallo del bus no revierte la reversión.
      void this.eventEmitter
        .emitAsync(
          PagoRevertidoEvent.NOMBRE,
          new PagoRevertidoEvent({
            tipoEvento: 'PAGO_REVERTIDO',
            destinatarioUserId: resultado.transaccion.clienteId,
            entrenadorId,
            categoria: 'FINANZAS',
            titulo: 'Tu entrenador revirtió un pago',
            cuerpo: `Tu entrenador revirtió tu pago de ${resultado.transaccion.montoOriginal} ${resultado.transaccion.monedaOriginal}. Motivo: ${validado.motivo}. Ese monto vuelve a figurar como pendiente en tu cuota.`,
            linkAccion: '/app/pagos',
            datosAdicionales: {
              transaccionId: resultado.transaccion.id,
              cuotaId: resultado.cuota.id,
              motivoReversion: validado.motivo,
            },
            esCriticoSeguridad: false,
            // RNF-004 §3: referencia propia, distinta de la del aviso de aprobación del mismo pago.
            // Con `_` y nunca `:` (BullMQ 5 rechaza `:` en los jobId; ver notificaciones.config.ts).
            referenciaId: `${resultado.transaccion.id}_revertido`,
          })
        )
        .catch(() => {});
    }

    return resultado;
  }

  // ===========================================================================
  // 8. BANDEJA DE CONCILIACIÓN DEL ENTRENADOR (FIFO) (RF-007)
  // ===========================================================================

  /**
   * WU24b: bandeja FIFO paginada en SQL. `total` es el COUNT real de transacciones PENDIENTES
   * del entrenador (no el tamaño de la página) y el desempate estable por `id` garantiza que
   * `offset` avance sin repetir ni saltar filas entre páginas.
   */
  async listarBandejaConciliacion(
    entrenadorId: string,
    limit = LIMITE_BANDEJA_CONCILIACION_POR_DEFECTO,
    offset = 0
  ): Promise<BandejaConciliacionDTO> {
    const whereBandeja = and(
      eq(transaccionesPago.entrenadorId, entrenadorId),
      eq(transaccionesPago.estadoConciliacion, EstadoConciliacion.PENDIENTE)
    );

    // WU24b: COUNT real en SQL para el `total` del envelope.
    // RNF-003/ADR-011 (etapa 2): `transacciones_pago` tiene RLS; ambas lecturas en UNA
    // transacción con el GUC del coach.
    const { filaTotal, records } = await this.withTenant({ entrenadorId }, async (tx) => {
      const [filaTotal] = await tx
        .select({ total: count() })
        .from(transaccionesPago)
        .where(whereBandeja);

      const records = await tx
        .select({
          tx: transaccionesPago,
          alumno: perfilesAlumno,
          cuota: cuotasMembresia,
        })
        .from(transaccionesPago)
        .leftJoin(perfilesAlumno, eq(perfilesAlumno.usuarioId, transaccionesPago.clienteId))
        .leftJoin(cuotasMembresia, eq(cuotasMembresia.id, transaccionesPago.cuotaId))
        .where(whereBandeja)
        // FIFO por fecha de reporte; desempate estable para paginar sin repetidos.
        .orderBy(asc(transaccionesPago.fechaReporteUtc), asc(transaccionesPago.id))
        .limit(limit)
        .offset(offset);

      return { filaTotal, records };
    });

    const items = await Promise.all(
      records.map(async ({ tx, alumno, cuota }) => ({
        id: tx.id,
        cuotaId: tx.cuotaId,
        clienteId: tx.clienteId,
        entrenadorId: tx.entrenadorId,
        registradoPor: tx.registradoPor,
        montoOriginal: tx.montoOriginal,
        monedaOriginal: tx.monedaOriginal,
        tasaCambioFijada: tx.tasaCambioFijada,
        montoEquivalenteUsd: tx.montoEquivalenteUsd,
        excedenteUsd: tx.excedenteUsd,
        // Saldo actual de la cuota, para que la web pueda avisar antes de aprobar si el pago la
        // excede (el excedente quedará como saldo a favor).
        saldoPendienteCuotaUsd: cuota?.saldoPendienteUsd ?? undefined,
        metodoPago: tx.metodoPago,
        referenciaBancaria: tx.referenciaBancaria,
        fechaOperacion: tx.fechaOperacion,
        comprobanteStorageKey: tx.comprobanteStorageKey,
        comprobanteUrl: await this.resolverComprobanteUrl(tx.comprobanteStorageKey),
        estadoConciliacion: tx.estadoConciliacion,
        motivoRechazo: tx.motivoRechazo,
        fechaReporteUtc: tx.fechaReporteUtc.toISOString(),
        fechaConciliacionUtc: tx.fechaConciliacionUtc?.toISOString() || null,
        clienteNombre: alumno ? `${alumno.nombres} ${alumno.apellidos}` : undefined,
        createdAtUtc: tx.createdAtUtc.toISOString(),
        updatedAtUtc: tx.updatedAtUtc.toISOString(),
      }))
    );

    return {
      items,
      total: Number(filaTotal?.total ?? 0),
      limit,
      offset,
    };
  }

  // ===========================================================================
  // HELPERS PRIVADOS
  // ===========================================================================

  /**
   * Resuelve un `usuarioId` a partir de un id que puede ser de `usuarios` o de `perfiles_alumno`.
   * RNF-003/ADR-011 (etapa 3 completada): `perfiles_alumno` está bajo RLS, así que la lectura
   * SIEMPRE debe correr en una transacción con contexto (`withTenant` o tx con `set_config`).
   * El `tx` es OBLIGATORIO a propósito: sin él, un futuro llamador leería 0 filas en silencio.
   */
  private async resolveClienteUsuarioId(
    idOrPerfilId: string,
    tx: TenantTransaction
  ): Promise<string> {
    const conn = tx;

    // Si ya es un usuarioId en la tabla usuarios
    const [user] = await conn
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(eq(usuarios.id, idOrPerfilId));

    if (user) return user.id;

    // Si es un perfilId en perfilesAlumno
    const [perfil] = await conn
      .select({ usuarioId: perfilesAlumno.usuarioId })
      .from(perfilesAlumno)
      .where(eq(perfilesAlumno.id, idOrPerfilId));

    if (perfil) return perfil.usuarioId;

    return idOrPerfilId;
  }

  private mapearTransaccionDTO(t: typeof transaccionesPago.$inferSelect): TransaccionPagoDetalleDTO {
    return {
      id: t.id,
      cuotaId: t.cuotaId,
      clienteId: t.clienteId,
      entrenadorId: t.entrenadorId,
      registradoPor: t.registradoPor,
      montoOriginal: t.montoOriginal,
      monedaOriginal: t.monedaOriginal,
      tasaCambioFijada: t.tasaCambioFijada,
      montoEquivalenteUsd: t.montoEquivalenteUsd,
      excedenteUsd: t.excedenteUsd,
      metodoPago: t.metodoPago,
      referenciaBancaria: t.referenciaBancaria,
      fechaOperacion: t.fechaOperacion,
      comprobanteStorageKey: t.comprobanteStorageKey,
      estadoConciliacion: t.estadoConciliacion,
      motivoRechazo: t.motivoRechazo,
      motivoReversion: t.motivoReversion ?? null,
      fechaReversionUtc: t.fechaReversionUtc ? toIsoSafe(t.fechaReversionUtc) : null,
      fechaReporteUtc: toIsoSafe(t.fechaReporteUtc),
      fechaConciliacionUtc: t.fechaConciliacionUtc ? toIsoSafe(t.fechaConciliacionUtc) : null,
      createdAtUtc: toIsoSafe(t.createdAtUtc),
      updatedAtUtc: toIsoSafe(t.updatedAtUtc),
    };
  }

  private mapearCuotaDTO(c: typeof cuotasMembresia.$inferSelect): CuotaDetalleDTO {
    return {
      id: c.id,
      clienteId: c.clienteId,
      entrenadorId: c.entrenadorId,
      planId: c.planId,
      periodo: c.periodo,
      montoTotalUsd: c.montoTotalUsd,
      montoAbonadoUsd: c.montoAbonadoUsd,
      saldoPendienteUsd: c.saldoPendienteUsd,
      saldoAFavorAplicadoUsd: c.saldoAFavorAplicadoUsd,
      fechaEmisionUtc: toIsoSafe(c.fechaEmisionUtc),
      fechaCorteUtc: toIsoSafe(c.fechaCorteUtc),
      estado: c.estado,
      notas: c.notas,
      createdAtUtc: toIsoSafe(c.createdAtUtc),
      updatedAtUtc: toIsoSafe(c.updatedAtUtc),
    };
  }

  /**
   * Obtener historial financiero completo y resumen 360 del alumno.
   *
   * WU24b: `transaccionesTotal` es el COUNT real SIEMPRE presente. `txLimit`/`txOffset` son
   * OPT-IN: sin ellos `transacciones` trae todas (comportamiento histórico) y con ellos el
   * slice se resuelve con LIMIT/OFFSET en SQL. Los agregados del resumen (`saldoPendienteTotalUsd`,
   * `totalPagadoHistoricoUsd`, `totalPagadoMesActualUsd`) se calculan sobre el TOTAL, no la página.
   */
  async obtenerHistorialCliente(
    entrenadorId: string,
    clienteId: string,
    actorUserId: string,
    actorRole: Rol,
    txLimit?: number,
    txOffset = 0
  ): Promise<ResumenFinancieroAlumnoDTO> {
    // RNF-003/ADR-011 (etapa 2): `cuotas_membresia`/`transacciones_pago` tienen RLS. El flujo
    // completo (perfil + cuotas + transacciones + agregados) corre en UNA transacción con el
    // contexto del actor: ALUMNO -> self; COACH -> tenant.
    return this.withTenant(
      this.contextoRlsDeActor(actorUserId, actorRole, entrenadorId),
      async (tx) => {
        // 1. Alumno y aislamiento. El entrenador usa la búsqueda única de su cartera (404
        //    uniforme) y SÍ puede consultar los pagos de un alumno archivado.
        let perfil: PerfilAlumnoFila;
        if (actorRole === Rol.ENTRENADOR) {
          perfil = await this.buscarPerfilDeCartera(tx, entrenadorId, clienteId, {
            incluirArchivados: true,
          });
        } else {
          let [encontrado] = await tx
            .select()
            .from(perfilesAlumno)
            .where(eq(perfilesAlumno.id, clienteId));

          if (!encontrado) {
            [encontrado] = await tx
              .select()
              .from(perfilesAlumno)
              .where(eq(perfilesAlumno.usuarioId, clienteId));
          }

          if (!encontrado) {
            throw new NotFoundException(MENSAJE_ALUMNO_NO_ENCONTRADO);
          }

          if (encontrado.usuarioId !== actorUserId) {
            throw new ForbiddenException('Solo puedes ver tus propios pagos.');
          }
          perfil = encontrado;
        }

        const clienteUsuarioId = perfil.usuarioId;

        const cuotas = await tx
          .select()
          .from(cuotasMembresia)
          .where(
            and(
              eq(cuotasMembresia.clienteId, clienteUsuarioId),
              eq(cuotasMembresia.entrenadorId, entrenadorId)
            )
          )
          .orderBy(desc(cuotasMembresia.createdAtUtc));

        const whereTransacciones = and(
          eq(transaccionesPago.clienteId, clienteUsuarioId),
          eq(transaccionesPago.entrenadorId, entrenadorId)
        );

        // WU24b: COUNT real del total (independiente de la página solicitada).
        const [filaTotalTx] = await tx
          .select({ total: count() })
          .from(transaccionesPago)
          .where(whereTransacciones);

        const txQuery = tx
          .select()
          .from(transaccionesPago)
          .where(whereTransacciones)
          // Desempate estable por `id` para que `txOffset` no repita ni salte filas.
          .orderBy(desc(transaccionesPago.createdAtUtc), desc(transaccionesPago.id));

        // WU24b: LIMIT/OFFSET en SQL solo cuando el consumidor pide explícitamente una página.
        const txs = await (txLimit !== undefined
          ? txQuery.limit(txLimit).offset(txOffset)
          : txQuery);

        let saldoTotalCents = 0;
        for (const c of cuotas) {
          if (c.estado !== EstadoCuota.AL_DIA) {
            saldoTotalCents += toCents(c.saldoPendienteUsd);
          }
        }

        const hoy = new Date();
        const currentYear = hoy.getFullYear();
        const currentMonth = hoy.getMonth();
        const inicioMesActual = new Date(currentYear, currentMonth, 1);
        const inicioMesSiguiente = new Date(currentYear, currentMonth + 1, 1);

        // WU24b: agregados del resumen en SQL sobre TODAS las transacciones aprobadas del alumno
        // (no solo la página), preservando la semántica de `totalPagadoHistoricoUsd`/`totalPagadoMesActualUsd`.
        const [filaTotalesHistoricos] = await tx
          .select({ totalUsd: sum(transaccionesPago.montoEquivalenteUsd) })
          .from(transaccionesPago)
          .where(
            and(whereTransacciones, eq(transaccionesPago.estadoConciliacion, EstadoConciliacion.APROBADO))
          );

        const [filaTotalesMes] = await tx
          .select({ totalUsd: sum(transaccionesPago.montoEquivalenteUsd) })
          .from(transaccionesPago)
          .where(
            and(
              whereTransacciones,
              eq(transaccionesPago.estadoConciliacion, EstadoConciliacion.APROBADO),
              gte(transaccionesPago.createdAtUtc, inicioMesActual),
              lt(transaccionesPago.createdAtUtc, inicioMesSiguiente)
            )
          );

        const totalPagadoHistCents = toCents(filaTotalesHistoricos?.totalUsd ?? '0');
        const totalPagadoMesCents = toCents(filaTotalesMes?.totalUsd ?? '0');

        const currentPeriod = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
        const cuotaMes = cuotas.find((c) => c.periodo === currentPeriod) || cuotas[0] || null;

        return {
          alumnoId: perfil.id,
          usuarioId: clienteUsuarioId,
          saldoPendienteTotalUsd: fromCents(saldoTotalCents),
          saldoAFavorUsd: perfil.saldoAFavorUsd ?? '0.00',
          totalPagadoHistoricoUsd: fromCents(totalPagadoHistCents),
          totalPagadoMesActualUsd: fromCents(totalPagadoMesCents),
          cuotaMesActual: cuotaMes
            ? {
                id: cuotaMes.id,
                periodo: cuotaMes.periodo,
                montoTotalUsd: cuotaMes.montoTotalUsd,
                montoPagadoUsd: cuotaMes.montoAbonadoUsd,
                saldoPendienteUsd: cuotaMes.saldoPendienteUsd,
                saldoAFavorAplicadoUsd: cuotaMes.saldoAFavorAplicadoUsd,
                estado: cuotaMes.estado,
                fechaVencimiento: toIsoSafe(cuotaMes.fechaCorteUtc),
              }
            : null,
          transaccionesTotal: Number(filaTotalTx?.total ?? 0),
          transacciones: txs.map((t) => ({
            id: t.id,
            cuotaId: t.cuotaId,
            montoUsd: t.montoEquivalenteUsd,
            montoBs: t.monedaOriginal === Moneda.VES ? t.montoOriginal : undefined,
            metodoPago: t.metodoPago,
            referencia: t.referenciaBancaria || undefined,
            estado: t.estadoConciliacion,
            motivoReversion: t.motivoReversion ?? null,
            createdAtUtc: toIsoSafe(t.createdAtUtc),
          })),
        };
      }
    );
  }

  /**
   * Cobro directo inteligente en 1 paso (RF-009 RN-01): cobra sobre la cuota abierta más antigua
   * del alumno; si no tiene ninguna, adelanta la próxima cuota de su suscripción y cobra sobre ella.
   *
   * Con `idempotencyKey` (header `x-idempotency-key`), un reintento o doble clic con la misma
   * clave devuelve el mismo cobro en vez de cobrar el ciclo siguiente (RNF-002 §4).
   */
  async cobroDirectoInteligente(
    entrenadorId: string,
    clienteId: string,
    dto: CobroDirectoInteligenteDTO | CobroDirectoDTO,
    idempotencyKey?: string,
    ahora: Date = new Date()
  ) {
    const cacheKey = idempotencyKey
      ? `cobro-sala:${entrenadorId}:${clienteId}:${idempotencyKey}`
      : undefined;
    return this.idempotencia.ejecutar(cacheKey, () =>
      this.registrarCobroDirectoInteligente(entrenadorId, clienteId, dto, ahora)
    );
  }

  /** Cobro en sala sin idempotencia: resuelve (o adelanta) la cuota y cobra sobre ella. */
  private async registrarCobroDirectoInteligente(
    entrenadorId: string,
    clienteId: string,
    dto: CobroDirectoInteligenteDTO | CobroDirectoDTO,
    ahora: Date
  ) {
    // Se valida el método ANTES de emitir nada: `cobroDirecto` lo rechazaría después y dejaría
    // emitida una cuota adelantada que nadie pidió.
    if (!esMetodoEfectivo(dto.metodoPago)) {
      throw new BadRequestException('El cobro en sala solo acepta efectivo (dólares o bolívares).');
    }

    // RNF-003/ADR-011 (etapa 2): la resolución (alumno + cuota abierta o adelantada) lee y escribe
    // tablas con RLS en UNA transacción con el GUC del coach; `cobroDirecto` abre después su
    // propia transacción (secuencial, nunca anidada).
    let resolucion: {
      targetCuotaId: string;
      emision: { emision: EmisionCiclo; perfil: PerfilAlumnoFila } | null;
    };
    try {
      resolucion = await this.withTenant({ entrenadorId }, async (tx) => {
        // 1. Alumno de la cartera (otro coach, inexistente o archivado → 404) con la fila
        //    bloqueada: el barrido diario y una asignación de plan esperan, así que la cuota
        //    abierta y el próximo vencimiento que se leen abajo no cambian bajo nuestros pies.
        const perfil = await this.buscarPerfilDeCartera(tx, entrenadorId, clienteId, {
          bloquear: true,
        });

        const clienteUsuarioId = perfil.usuarioId;

        // 2. Un cobro en VES exige tasa configurada ANTES de emitir cualquier cuota: así la
        //    operación falla entera y no deja una cuota emitida como efecto colateral.
        if (dto.monedaOriginal === Moneda.VES) {
          // RNF-003/ADR-011 (etapa 3): tasa override en la MISMA tx con el GUC del coach.
          const tasa = await this.obtenerTasaVigente(entrenadorId, clienteUsuarioId, tx);
          if (!tasa.tasaEfectiva || parseFloat(tasa.tasaEfectiva) <= 0) {
            throw new BadRequestException(
              'Aún no has configurado la tasa de cambio. Configura tu tasa activa en Ajustes → Tasas para cobrar en bolívares.'
            );
          }
        }

        // 3. Cuota abierta MÁS ANTIGUA por vencimiento: la deuda vieja se cobra primero y una
        //    cuota anulada jamás recibe cobros (M5-L1).
        const [cuotaAbierta] = await tx
          .select()
          .from(cuotasMembresia)
          .where(
            and(
              eq(cuotasMembresia.clienteId, clienteUsuarioId),
              eq(cuotasMembresia.entrenadorId, entrenadorId),
              notInArray(cuotasMembresia.estado, [EstadoCuota.AL_DIA, EstadoCuota.ANULADA])
            )
          )
          .orderBy(asc(cuotasMembresia.fechaCorteUtc), asc(cuotasMembresia.id))
          .limit(1);

        if (cuotaAbierta?.id) {
          return { targetCuotaId: cuotaAbierta.id, emision: null };
        }

        // 4. Sin cuota abierta: cobro por adelantado de la próxima cuota de la suscripción
        //    (M5-L1). Sin plan asignado no se inventa una cuota.
        if (!perfil.planSuscritoId || !perfil.cicloAncla || !perfil.proximoCorte) {
          throw new BadRequestException(
            'Este alumno no tiene un plan asignado. Asígnale un plan en su ficha para registrar el cobro.'
          );
        }

        const [plan] = await tx
          .select()
          .from(planesMembresia)
          .where(
            and(
              eq(planesMembresia.id, perfil.planSuscritoId),
              eq(planesMembresia.entrenadorId, entrenadorId)
            )
          );

        if (!plan) {
          throw new BadRequestException(
            'El plan asignado al alumno ya no está en tu catálogo. Asígnale otro plan en su ficha.'
          );
        }

        // Si la cuota de ese vencimiento ya existía (saldada), el ciclo avanza y se adelanta la
        // siguiente; el tope evita un bucle ante datos inconsistentes.
        let suscrito: PerfilAlumnoFila = perfil;
        for (let intento = 0; intento < 3; intento++) {
          const emision = await this.emitirCuotaDeCicloEnTx(
            tx,
            suscrito,
            plan,
            suscrito.proximoCorte!,
            ahora
          );
          suscrito = { ...suscrito, proximoCorte: emision.proximoCorte };
          if (emision.cuota) {
            return {
              targetCuotaId: emision.cuota.id,
              emision: { emision, perfil: suscrito },
            };
          }
        }

        throw new ConflictException(MENSAJE_CUOTA_EN_PREPARACION);
      });
    } catch (error) {
      // Defensa en profundidad: todos los caminos que emiten cuotas bloquean la fila del alumno,
      // pero si la cuota de ese periodo ya existe por otra vía, un 409 claro en vez de un 500.
      if (esViolacionUnicidad(error, INDICE_CUOTA_POR_PERIODO)) {
        throw new ConflictException(MENSAJE_CUOTA_EN_PREPARACION);
      }
      throw error;
    }
    const { targetCuotaId, emision } = resolucion;

    // 5. La cuota adelantada ya quedó emitida: se agendan sus recordatorios (se cancelan solos si
    //    el cobro la deja saldada) y se cobra sobre ella.
    if (emision) {
      await this.programarRecordatoriosDeEmision(emision.emision, emision.perfil);
    }

    return this.cobroDirecto(targetCuotaId, entrenadorId, dto);
  }
}
