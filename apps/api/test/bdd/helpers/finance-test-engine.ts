import {
  EstadoCuota,
  EstadoConciliacion,
  Moneda,
  MetodoPago,
  ReportarPagoDTO,
  ReportarPagoSchema,
  ConciliarTransaccionDTO,
  ConciliarTransaccionSchema,
  ActualizarTasaCambioDTO,
  ActualizarTasaCambioSchema,
  CalcularConversionDTO,
  CalcularConversionSchema,
  CuotaDetalleDTO,
  TransaccionPagoDetalleDTO,
} from '@guachafit/shared';

// =============================================================================
// ARITMÉTICA DECIMAL Y REDONDEO BANCARIO (RNF-002)
// =============================================================================

/**
 * Convierte un string decimal a céntimos enteros (ej. "50.25" -> 5025)
 * Evita la representación flotante IEEE 754.
 */
export function toCents(decimalStr: string): number {
  const parts = decimalStr.trim().split('.');
  const intPart = parseInt(parts[0], 10);
  const fracPart = parts[1] ? parts[1].padEnd(2, '0').slice(0, 2) : '00';
  const sign = decimalStr.startsWith('-') ? -1 : 1;
  return sign * (Math.abs(intPart) * 100 + parseInt(fracPart, 10));
}

/**
 * Convierte céntimos enteros a string decimal con 2 decimales (ej. 5025 -> "50.25")
 */
export function fromCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const intPart = Math.floor(abs / 100);
  const fracPart = (abs % 100).toString().padStart(2, '0');
  return `${sign}${intPart}.${fracPart}`;
}

/**
 * Redondeo Bancario (Round Half to Even) al número especificado de decimales.
 * Cumple con RNF-002 y evita acumulación de fracciones en libros contables.
 */
export function roundHalfToEven(val: number, decimals = 2): string {
  const factor = Math.pow(10, decimals);
  // Redondear temporalmente a 8 decimales para mitigar imprecisiones intermedias de JS
  const shifted = Number((val * factor).toFixed(8));
  const floor = Math.floor(shifted);
  const diff = Number((shifted - floor).toFixed(8));

  let roundedInt: number;
  const epsilon = 1e-7;

  if (Math.abs(diff - 0.5) < epsilon) {
    // Exactamente en el medio (halfway): redondear al entero par más cercano
    roundedInt = floor % 2 === 0 ? floor : floor + 1;
  } else if (diff > 0.5) {
    roundedInt = floor + 1;
  } else {
    roundedInt = floor;
  }

  const result = roundedInt / factor;
  return result.toFixed(decimals);
}

/**
 * Suma de montos decimales con precisión de céntimos
 */
export function addDecimals(a: string, b: string): string {
  return fromCents(toCents(a) + toCents(b));
}

/**
 * Resta de montos decimales con precisión de céntimos
 */
export function subtractDecimals(a: string, b: string): string {
  return fromCents(toCents(a) - toCents(b));
}

/**
 * Multiplicación exacta de saldo por tasa con redondeo bancario
 */
export function multiplyDecimals(amount: string, rate: string): string {
  const a = parseFloat(amount);
  const r = parseFloat(rate);
  return roundHalfToEven(a * r, 2);
}

/**
 * División exacta de bolívares entre tasa de cambio con redondeo bancario
 */
export function divideDecimalsBankers(amountBs: string, rate: string): string {
  const bs = parseFloat(amountBs);
  const r = parseFloat(rate);
  if (r <= 0) {
    throw new Error('La tasa de cambio debe ser estrictamente mayor a 0');
  }
  return roundHalfToEven(bs / r, 2);
}

// =============================================================================
// MOTOR BIMONETARIO (RF-006 & ADR-003)
// =============================================================================

export interface ResolucionTasaResult {
  tasaEfectiva: string;
  esTasaOverride: boolean;
  fuenteTasa: 'oficial_bcv' | 'paralelo' | 'entrenador_activa' | 'override_cliente';
}

export class MotorBimonetario {
  /**
   * Determina la tasa aplicable priorizando el override del cliente (RF-005, RF-006 RN-02)
   */
  resolverTasa(
    tasaActivaCoach: string,
    tasaOverrideCliente?: string | null
  ): ResolucionTasaResult {
    if (tasaOverrideCliente && parseFloat(tasaOverrideCliente) > 0) {
      return {
        tasaEfectiva: tasaOverrideCliente,
        esTasaOverride: true,
        fuenteTasa: 'override_cliente',
      };
    }

    return {
      tasaEfectiva: tasaActivaCoach,
      esTasaOverride: false,
      fuenteTasa: 'entrenador_activa',
    };
  }

  /**
   * Proyección bimonetaria de saldo adeudado: Saldo Bs. = Saldo USD * Tasa (RN-03)
   */
  proyectarVES(saldoUsd: string, tasa: string): string {
    return multiplyDecimals(saldoUsd, tasa);
  }

  /**
   * Deducción en USD de un abono en Bolívares con tasa congelada: DeltaUSD = MBs / Tasa (RN-04)
   */
  calcularContravalorUSD(montoVES: string, tasaReporte: string): string {
    return divideDecimalsBankers(montoVES, tasaReporte);
  }
}

// =============================================================================
// INVARIANTE Y MÁQUINA DE ESTADOS DE CUOTA (RF-008 & RNF-002)
// =============================================================================

export interface CuotaState {
  id: string;
  clienteId: string;
  entrenadorId: string;
  planId: string;
  periodo: string;
  montoTotalUsd: string;
  montoAbonadoUsd: string;
  saldoPendienteUsd: string;
  fechaEmisionUtc: string;
  fechaCorteUtc: string;
  estado: EstadoCuota;
  estadoPrevio?: EstadoCuota;
  transacciones: TransaccionPagoDetalleDTO[];
}

export class CuotaStateMachine {
  /**
   * Invariante de Balance Estricta (RNF-002 §3):
   * saldo_pendiente_usd == monto_total_usd - monto_abonado_usd
   */
  static assertBalanceInvariant(cuota: CuotaState): void {
    const totalCents = toCents(cuota.montoTotalUsd);
    const abonadoCents = toCents(cuota.montoAbonadoUsd);
    const pendienteCents = toCents(cuota.saldoPendienteUsd);

    const expectedPendiente = Math.max(0, totalCents - abonadoCents);

    if (pendienteCents !== expectedPendiente) {
      throw new Error(
        `Violación de Invariante Contable (RNF-002): Saldo pendiente (${cuota.saldoPendienteUsd}) ` +
          `no coincide con Total (${cuota.montoTotalUsd}) - Abonado (${cuota.montoAbonadoUsd}).`
      );
    }
  }

  /**
   * Transición de estado validada según ciclo de vida de cuota
   */
  static transition(cuota: CuotaState, nuevoEstado: EstadoCuota): void {
    const actual = cuota.estado;

    // Estados terminales
    if (actual === EstadoCuota.ANULADA) {
      throw new Error(`Transición inválida: La cuota ${cuota.id} se encuentra anulada.`);
    }

    if (actual === EstadoCuota.AL_DIA && nuevoEstado === EstadoCuota.VENCIDA) {
      throw new Error('Transición inválida: Una cuota pagada al día no puede transicionar a vencida.');
    }

    cuota.estadoPrevio = actual;
    cuota.estado = nuevoEstado;
  }

  /**
   * Proceso de corte automático diario (Worker/Cron)
   */
  static procesarCorteDiario(cuota: CuotaState, nowUtc: Date): EstadoCuota {
    const fechaCorte = new Date(cuota.fechaCorteUtc);

    // Si ya está pagada, permanece al día
    if (toCents(cuota.saldoPendienteUsd) === 0) {
      return EstadoCuota.AL_DIA;
    }

    // Si tiene pago pendiente de revisión, los recordatorios y corte a mora se pausan
    if (cuota.estado === EstadoCuota.PENDIENTE_REVISION) {
      return EstadoCuota.PENDIENTE_REVISION;
    }

    // Si expiró la fecha de corte y tiene saldo pendiente
    if (nowUtc.getTime() > fechaCorte.getTime()) {
      cuota.estado = EstadoCuota.VENCIDA;
      return EstadoCuota.VENCIDA;
    }

    return cuota.estado;
  }

  /**
   * Evalúa los recordatorios automáticos según cronograma (RF-008 §4.B)
   */
  static evaluarDisparadorRecordatorio(
    cuota: CuotaState,
    nowUtc: Date
  ): {
    enviarRecordatorio: boolean;
    tipoDisparador?: 'T_MENOS_5' | 'T_MENOS_1' | 'DIA_T_CORTE' | 'T_MAS_2_MORA';
    motivoPausa?: string;
  } {
    if (toCents(cuota.saldoPendienteUsd) === 0 || cuota.estado === EstadoCuota.AL_DIA) {
      return { enviarRecordatorio: false, motivoPausa: 'Cuota completamente cancelada' };
    }

    if (cuota.estado === EstadoCuota.PENDIENTE_REVISION) {
      return {
        enviarRecordatorio: false,
        motivoPausa: 'Pausado temporalmente: Reporte de pago en espera de conciliación',
      };
    }

    const fechaCorte = new Date(cuota.fechaCorteUtc);
    const msPorDia = 24 * 60 * 60 * 1000;
    const diffDias = Math.floor((fechaCorte.getTime() - nowUtc.getTime()) / msPorDia);

    if (diffDias === 5) {
      return { enviarRecordatorio: true, tipoDisparador: 'T_MENOS_5' };
    }
    if (diffDias === 1) {
      return { enviarRecordatorio: true, tipoDisparador: 'T_MENOS_1' };
    }
    if (diffDias === 0) {
      return { enviarRecordatorio: true, tipoDisparador: 'DIA_T_CORTE' };
    }
    if (diffDias <= -2) {
      return { enviarRecordatorio: true, tipoDisparador: 'T_MAS_2_MORA' };
    }

    return { enviarRecordatorio: false };
  }
}

// =============================================================================
// BANDEJA DE CONCILIACIÓN & IDEMPOTENCIA (RF-007 & RNF-002)
// =============================================================================

export class BandejaConciliacionEngine {
  private idempotencyStore = new Map<string, TransaccionPagoDetalleDTO>();
  private transaccionesRegistradas = new Map<string, TransaccionPagoDetalleDTO>();

  private motorBimonetario = new MotorBimonetario();

  private generarCompoundIndexKey(metodo: string, ref: string, fecha: string): string {
    return `${metodo}::${ref}::${fecha}`;
  }

  /**
   * Reporta un pago aplicando validación de contrato, congelamiento de tasa e idempotencia
   */
  reportarPago(params: {
    cuota: CuotaState;
    dto: ReportarPagoDTO;
    tasaGlobalCoach: string;
    tasaOverrideCliente?: string | null;
    registradoPor: string;
  }): { transaccion: TransaccionPagoDetalleDTO; cuotaActualizada: CuotaState; esDuplicadoIdempotente: boolean } {
    const { cuota, dto, tasaGlobalCoach, tasaOverrideCliente, registradoPor } = params;

    // 1. Validar esquema Zod (RF-007 RN-02)
    ReportarPagoSchema.parse(dto);

    // 2. Verificar Idempotency Key en caso de reintentos por lag
    if (dto.idempotencyKey && this.idempotencyStore.has(dto.idempotencyKey)) {
      const cached = this.idempotencyStore.get(dto.idempotencyKey)!;
      return {
        transaccion: cached,
        cuotaActualizada: cuota,
        esDuplicadoIdempotente: true,
      };
    }

    // 3. Verificar Unicidad Compuesta: UNIQUE(metodo_pago, referencia_bancaria, fecha_operacion)
    if (dto.referenciaBancaria) {
      const compositeKey = this.generarCompoundIndexKey(
        dto.metodoPago,
        dto.referenciaBancaria,
        dto.fechaOperacion
      );

      if (this.transaccionesRegistradas.has(compositeKey)) {
        throw new Error(
          'Esta referencia ya ha sido registrada previamente para este método y fecha de operación.'
        );
      }
    }

    // 4. Congelar la tasa de cambio vigente (ADR-003)
    const { tasaEfectiva } = this.motorBimonetario.resolverTasa(
      tasaGlobalCoach,
      tasaOverrideCliente
    );

    // 5. Calcular contravalor en USD
    let montoEquivalenteUsd = dto.montoOriginal;
    if (dto.monedaOriginal === Moneda.VES) {
      montoEquivalenteUsd = this.motorBimonetario.calcularContravalorUSD(
        dto.montoOriginal,
        tasaEfectiva
      );
    }

    const txId = `tx-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const transaccion: TransaccionPagoDetalleDTO = {
      id: txId,
      cuotaId: cuota.id,
      clienteId: cuota.clienteId,
      entrenadorId: cuota.entrenadorId,
      registradoPor,
      montoOriginal: dto.montoOriginal,
      monedaOriginal: dto.monedaOriginal,
      tasaCambioFijada: tasaEfectiva,
      montoEquivalenteUsd,
      metodoPago: dto.metodoPago,
      referenciaBancaria: dto.referenciaBancaria ?? null,
      fechaOperacion: dto.fechaOperacion,
      comprobanteStorageKey: dto.comprobanteStorageKey ?? null,
      estadoConciliacion: EstadoConciliacion.PENDIENTE,
      fechaReporteUtc: new Date().toISOString(),
      createdAtUtc: new Date().toISOString(),
      updatedAtUtc: new Date().toISOString(),
    };

    // Guardar en stores de idempotencia
    if (dto.idempotencyKey) {
      this.idempotencyStore.set(dto.idempotencyKey, transaccion);
    }
    if (dto.referenciaBancaria) {
      const compositeKey = this.generarCompoundIndexKey(
        dto.metodoPago,
        dto.referenciaBancaria,
        dto.fechaOperacion
      );
      this.transaccionesRegistradas.set(compositeKey, transaccion);
    }

    // Asociar a la cuota y cambiar estado temporal a PENDIENTE_REVISION
    cuota.transacciones.push(transaccion);
    CuotaStateMachine.transition(cuota, EstadoCuota.PENDIENTE_REVISION);

    return {
      transaccion,
      cuotaActualizada: cuota,
      esDuplicadoIdempotente: false,
    };
  }

  /**
   * Aprueba una transacción pendiente, descuenta el crédito en USD y actualiza la cuota (RF-007 RN-04)
   */
  aprobarTransaccion(params: {
    cuota: CuotaState;
    transaccionId: string;
  }): { transaccion: TransaccionPagoDetalleDTO; cuotaActualizada: CuotaState } {
    const { cuota, transaccionId } = params;
    const tx = cuota.transacciones.find((t) => t.id === transaccionId);

    if (!tx) {
      throw new Error(`Transacción ${transaccionId} no encontrada.`);
    }

    if (tx.estadoConciliacion !== EstadoConciliacion.PENDIENTE) {
      throw new Error(`Transacción ${transaccionId} ya fue conciliada previamente.`);
    }

    // 1. Marcar transacción como aprobada
    tx.estadoConciliacion = EstadoConciliacion.APROBADO;
    tx.fechaConciliacionUtc = new Date().toISOString();
    tx.updatedAtUtc = new Date().toISOString();

    // 2. Incrementar monto abonado y decrementar saldo pendiente en USD
    const nuevoAbonado = addDecimals(cuota.montoAbonadoUsd, tx.montoEquivalenteUsd);
    const nuevoPendiente = subtractDecimals(cuota.saldoPendienteUsd, tx.montoEquivalenteUsd);

    cuota.montoAbonadoUsd = nuevoAbonado;
    cuota.saldoPendienteUsd = toCents(nuevoPendiente) < 0 ? '0.00' : nuevoPendiente;

    // 3. Validar invariante de balance (RNF-002)
    CuotaStateMachine.assertBalanceInvariant(cuota);

    // 4. Reevaluar estado de la cuota
    if (toCents(cuota.saldoPendienteUsd) === 0) {
      CuotaStateMachine.transition(cuota, EstadoCuota.AL_DIA);
    } else {
      CuotaStateMachine.transition(cuota, EstadoCuota.ABONADA_PARCIAL);
    }

    return {
      transaccion: tx,
      cuotaActualizada: cuota,
    };
  }

  /**
   * Rechaza una transacción exigiendo motivo, preservando intacto el saldo adeudado (RF-007 RN-05)
   */
  rechazarTransaccion(params: {
    cuota: CuotaState;
    transaccionId: string;
    dto: ConciliarTransaccionDTO;
  }): { transaccion: TransaccionPagoDetalleDTO; cuotaActualizada: CuotaState } {
    const { cuota, transaccionId, dto } = params;

    // 1. Validar esquema Zod (exige motivoRechazo si accion === 'rechazar')
    ConciliarTransaccionSchema.parse(dto);

    const tx = cuota.transacciones.find((t) => t.id === transaccionId);
    if (!tx) {
      throw new Error(`Transacción ${transaccionId} no encontrada.`);
    }

    if (tx.estadoConciliacion !== EstadoConciliacion.PENDIENTE) {
      throw new Error(`Transacción ${transaccionId} ya fue conciliada previamente.`);
    }

    // 2. Marcar como rechazado con motivo
    tx.estadoConciliacion = EstadoConciliacion.RECHAZADO;
    tx.motivoRechazo = dto.motivoRechazo ?? null;
    tx.fechaConciliacionUtc = new Date().toISOString();
    tx.updatedAtUtc = new Date().toISOString();

    // 3. El saldo adeudado NO se altera en lo absoluto (RN-05)
    // Invariante de balance permanece intacta
    CuotaStateMachine.assertBalanceInvariant(cuota);

    // 4. Restaurar estado previo de la cuota
    const estadoRestaurado = cuota.estadoPrevio || EstadoCuota.EMITIDA;
    CuotaStateMachine.transition(cuota, estadoRestaurado);

    return {
      transaccion: tx,
      cuotaActualizada: cuota,
    };
  }
}
