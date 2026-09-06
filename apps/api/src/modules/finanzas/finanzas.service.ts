import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { DRIZZLE_DB } from '../../database/database.module';
import {
  Database,
  eq,
  and,
  desc,
  asc,
  ne,
  sql,
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
  CrearOverridePlanDTO,
  EmitirCuotaDTO,
  ActualizarTasaCambioDTO,
  CalcularConversionDTO,
  ReportarPagoDTO,
  CobroDirectoDTO,
  ConciliarTransaccionDTO,
  PlanMembresiaDetalleDTO,
  OverridePlanDetalleDTO,
  CuotaDetalleDTO,
  TransaccionPagoDetalleDTO,
  CalculoConversionDTO,
  TasaCambioVigenteDTO,
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

// =============================================================================
// SERVICIO PRINCIPAL DE FINANZAS
// =============================================================================

@Injectable()
export class FinanzasService {
  // Store de idempotencia en memoria para reintentos inmediatos por lag de red (RNF-002 §4)
  private readonly idempotencyCache = new Map<
    string,
    { transaccion: TransaccionPagoDetalleDTO; cuota: CuotaDetalleDTO }
  >();

  constructor(@Inject(DRIZZLE_DB) private readonly db: Database) {}

  // ===========================================================================
  // 1. MOTOR BIMONETARIO (RF-006, ADR-003, RNF-002)
  // ===========================================================================

  resolverTasa(
    tasaActivaCoach: string,
    tasaOverrideCliente?: string | null
  ): {
    tasaEfectiva: string;
    esTasaOverride: boolean;
    fuenteTasa: 'oficial_bcv' | 'paralelo' | 'entrenador_activa' | 'override_cliente';
  } {
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

    const tasaVigente = await this.obtenerTasaVigente(entrenadorId, targetClienteId);
    const { tasaEfectiva, esTasaOverride, fuente } = tasaVigente;

    let montoConvertido: string;
    let tasaAplicada = tasaEfectiva;

    if (dto.monedaOrigen === Moneda.USD && dto.monedaDestino === Moneda.VES) {
      montoConvertido = this.proyectarVES(dto.monto, tasaEfectiva);
    } else if (dto.monedaOrigen === Moneda.VES && dto.monedaDestino === Moneda.USD) {
      montoConvertido = this.calcularContravalorUSD(dto.monto, tasaEfectiva);
    } else if (dto.monedaOrigen === dto.monedaDestino) {
      montoConvertido = dto.monto;
      tasaAplicada = '1.0000';
    } else {
      throw new BadRequestException('Conversión de monedas no soportada.');
    }

    const fuenteTasa: 'oficial_bcv' | 'paralelo' | 'entrenador_activa' | 'override_cliente' =
      esTasaOverride
        ? 'override_cliente'
        : fuente === 'bcv'
        ? 'oficial_bcv'
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

  async obtenerTasaVigente(
    entrenadorId: string,
    clienteId?: string
  ): Promise<TasaCambioVigenteDTO & { esTasaOverride: boolean }> {
    // 1. Obtener última tasa registrada del entrenador
    const [tasaRef] = await this.db
      .select()
      .from(tasasCambioReferencia)
      .where(eq(tasasCambioReferencia.entrenadorId, entrenadorId))
      .orderBy(desc(tasasCambioReferencia.fechaActualizacionUtc))
      .limit(1);

    // Si no hay histórico en tasasCambioReferencia, buscar en perfil entrenador
    let tasaOficialBcv = '65.0000';
    let tasaParalelo: string | null = null;
    let tasaActivaCoach = '65.0000';
    let fuente = 'default';
    let fechaActualizacionUtc = new Date().toISOString();

    if (tasaRef) {
      tasaOficialBcv = tasaRef.tasaOficialBcv;
      tasaParalelo = tasaRef.tasaParalelo;
      tasaActivaCoach = tasaRef.tasaActivaEntrenador;
      fuente = tasaRef.fuente;
      fechaActualizacionUtc = tasaRef.fechaActualizacionUtc.toISOString();
    } else {
      const [coachPerfil] = await this.db
        .select()
        .from(perfilesEntrenador)
        .where(eq(perfilesEntrenador.usuarioId, entrenadorId));

      if (coachPerfil?.tasaCambioGlobal) {
        tasaActivaCoach = coachPerfil.tasaCambioGlobal;
        tasaOficialBcv = coachPerfil.tasaCambioGlobal;
        fuente = 'perfil_coach';
      }
    }

    // 2. Si se solicitó para un cliente, verificar si tiene override activo
    let tasaAcordadaCliente: string | null = null;
    if (clienteId) {
      const clienteUsuarioId = await this.resolveClienteUsuarioId(clienteId);

      const [alumno] = await this.db
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
    const [plan] = await this.db
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
      .returning();

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
    const planes = await this.db
      .select()
      .from(planesMembresia)
      .where(eq(planesMembresia.entrenadorId, entrenadorId))
      .orderBy(desc(planesMembresia.createdAtUtc));

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

  async crearOverride(
    entrenadorId: string,
    dto: CrearOverridePlanDTO
  ): Promise<OverridePlanDetalleDTO> {
    // 1. Validar que el plan pertenezca al entrenador
    const [plan] = await this.db
      .select()
      .from(planesMembresia)
      .where(
        and(eq(planesMembresia.id, dto.planId), eq(planesMembresia.entrenadorId, entrenadorId))
      );

    if (!plan) {
      throw new NotFoundException('El plan especificado no existe o no pertenece a su catálogo.');
    }

    // 2. Validar que el alumno pertenezca al entrenador
    const clienteUsuarioId = await this.resolveClienteUsuarioId(dto.clienteId);
    const [alumno] = await this.db
      .select()
      .from(perfilesAlumno)
      .where(
        and(
          eq(perfilesAlumno.usuarioId, clienteUsuarioId),
          eq(perfilesAlumno.entrenadorId, entrenadorId)
        )
      );

    if (!alumno) {
      throw new NotFoundException('El alumno especificado no existe o no pertenece a su cartera.');
    }

    // 3. Upsert en tabla overridesClientePlan
    const [existente] = await this.db
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
      [override] = await this.db
        .update(overridesClientePlan)
        .set({
          precioAcordadoUsd: dto.precioAcordadoUsd ?? existente.precioAcordadoUsd,
          tasaFijadaOverride: dto.tasaFijadaOverride ?? existente.tasaFijadaOverride,
          beneficiosPersonalizados:
            dto.beneficiosPersonalizados ?? existente.beneficiosPersonalizados,
          motivoOverride: dto.motivoOverride ?? existente.motivoOverride,
          updatedAtUtc: nowUtc,
        })
        .where(eq(overridesClientePlan.id, existente.id))
        .returning();
    } else {
      [override] = await this.db
        .insert(overridesClientePlan)
        .values({
          planId: dto.planId,
          clienteId: clienteUsuarioId,
          precioAcordadoUsd: dto.precioAcordadoUsd || null,
          tasaFijadaOverride: dto.tasaFijadaOverride || null,
          beneficiosPersonalizados: dto.beneficiosPersonalizados || null,
          motivoOverride: dto.motivoOverride || null,
          createdAtUtc: nowUtc,
          updatedAtUtc: nowUtc,
        })
        .returning();
    }

    // Si se fijó una tasa override, actualizar también perfilesAlumno para cálculo global del alumno
    if (dto.tasaFijadaOverride) {
      await this.db
        .update(perfilesAlumno)
        .set({
          tasaFijadaOverride: dto.tasaFijadaOverride,
          updatedAtUtc: nowUtc,
        })
        .where(eq(perfilesAlumno.usuarioId, clienteUsuarioId));
    }

    return {
      id: override.id,
      planId: override.planId,
      clienteId: override.clienteId,
      precioAcordadoUsd: override.precioAcordadoUsd,
      tasaFijadaOverride: override.tasaFijadaOverride,
      beneficiosPersonalizados: (override.beneficiosPersonalizados as string[]) || null,
      motivoOverride: override.motivoOverride,
      createdAtUtc: override.createdAtUtc.toISOString(),
      updatedAtUtc: override.updatedAtUtc.toISOString(),
    };
  }

  // ===========================================================================
  // 4. EMISIÓN Y GESTIÓN DE CUOTAS (RF-008, RNF-002)
  // ===========================================================================

  async emitirCuota(entrenadorId: string, dto: EmitirCuotaDTO): Promise<CuotaDetalleDTO> {
    // Validar monto positivo
    if (toCents(dto.montoTotalUsd) <= 0) {
      throw new BadRequestException('El monto total de la cuota debe ser estrictamente mayor a 0.00 USD.');
    }

    const clienteUsuarioId = await this.resolveClienteUsuarioId(dto.clienteId);

    // Validar alumno
    const [alumno] = await this.db
      .select()
      .from(perfilesAlumno)
      .where(
        and(
          eq(perfilesAlumno.usuarioId, clienteUsuarioId),
          eq(perfilesAlumno.entrenadorId, entrenadorId)
        )
      );

    if (!alumno) {
      throw new NotFoundException('El alumno especificado no existe o no pertenece a su cartera.');
    }

    // Validar plan
    const [plan] = await this.db
      .select()
      .from(planesMembresia)
      .where(
        and(eq(planesMembresia.id, dto.planId), eq(planesMembresia.entrenadorId, entrenadorId))
      );

    if (!plan) {
      throw new NotFoundException('El plan especificado no pertenece a su catálogo.');
    }

    // Validar unicidad (clienteId, planId, periodo)
    const [existente] = await this.db
      .select()
      .from(cuotasMembresia)
      .where(
        and(
          eq(cuotasMembresia.clienteId, clienteUsuarioId),
          eq(cuotasMembresia.planId, dto.planId),
          eq(cuotasMembresia.periodo, dto.periodo)
        )
      );

    if (existente) {
      throw new ConflictException(
        `Ya existe una cuota emitida para este alumno y plan en el periodo ${dto.periodo}.`
      );
    }

    // Al emitir: montoAbonadoUsd = 0.00, saldoPendienteUsd = montoTotalUsd (Invariante RNF-002)
    const montoTotal = dto.montoTotalUsd;
    const montoAbonado = '0.00';
    const saldoPendiente = montoTotal;

    assertBalanceInvariant(montoTotal, montoAbonado, saldoPendiente);

    const nowUtc = new Date();
    const fechaEmision = dto.fechaEmisionUtc ? new Date(dto.fechaEmisionUtc) : nowUtc;
    const fechaCorte = new Date(dto.fechaCorteUtc);

    const [cuota] = await this.db
      .insert(cuotasMembresia)
      .values({
        clienteId: clienteUsuarioId,
        entrenadorId,
        planId: dto.planId,
        periodo: dto.periodo,
        montoTotalUsd: montoTotal,
        montoAbonadoUsd: montoAbonado,
        saldoPendienteUsd: saldoPendiente,
        fechaEmisionUtc: fechaEmision,
        fechaCorteUtc: fechaCorte,
        estado: EstadoCuota.EMITIDA,
        notas: dto.notas || null,
        createdAtUtc: nowUtc,
        updatedAtUtc: nowUtc,
      })
      .returning();

    // Calcular proyección en Bs y tasa aplicada
    const tasa = await this.obtenerTasaVigente(entrenadorId, clienteUsuarioId);
    const saldoPendienteVes = this.proyectarVES(cuota.saldoPendienteUsd, tasa.tasaEfectiva);

    return {
      id: cuota.id,
      clienteId: cuota.clienteId,
      entrenadorId: cuota.entrenadorId,
      planId: cuota.planId,
      periodo: cuota.periodo,
      montoTotalUsd: cuota.montoTotalUsd,
      montoAbonadoUsd: cuota.montoAbonadoUsd,
      saldoPendienteUsd: cuota.saldoPendienteUsd,
      saldoPendienteVes,
      tasaAplicada: tasa.tasaEfectiva,
      fechaEmisionUtc: cuota.fechaEmisionUtc.toISOString(),
      fechaCorteUtc: cuota.fechaCorteUtc.toISOString(),
      estado: cuota.estado,
      notas: cuota.notas,
      planNombre: plan.nombre,
      clienteNombre: `${alumno.nombres} ${alumno.apellidos}`,
      transacciones: [],
      createdAtUtc: cuota.createdAtUtc.toISOString(),
      updatedAtUtc: cuota.updatedAtUtc.toISOString(),
    };
  }

  async obtenerCuotaPorId(
    cuotaId: string,
    actorUserId: string,
    actorRole: Rol,
    actorEntrenadorId?: string
  ): Promise<CuotaDetalleDTO> {
    const [cuota] = await this.db
      .select()
      .from(cuotasMembresia)
      .where(eq(cuotasMembresia.id, cuotaId));

    if (!cuota) {
      throw new NotFoundException('Cuota no encontrada.');
    }

    // Aislamiento de Tenancy / Autorización
    if (actorRole === Rol.ALUMNO && cuota.clienteId !== actorUserId) {
      throw new ForbiddenException('Aislamiento de Tenant: Acceso denegado a cuota de otro alumno.');
    }

    if (
      actorRole === Rol.ENTRENADOR &&
      cuota.entrenadorId !== actorUserId &&
      cuota.entrenadorId !== actorEntrenadorId
    ) {
      throw new ForbiddenException(
        'Aislamiento de Tenant: Acceso denegado a cuota de otro entrenador.'
      );
    }

    // Cargar información adicional
    const [plan] = await this.db
      .select()
      .from(planesMembresia)
      .where(eq(planesMembresia.id, cuota.planId));

    const [alumno] = await this.db
      .select()
      .from(perfilesAlumno)
      .where(eq(perfilesAlumno.usuarioId, cuota.clienteId));

    const txRecords = await this.db
      .select()
      .from(transaccionesPago)
      .where(eq(transaccionesPago.cuotaId, cuotaId))
      .orderBy(asc(transaccionesPago.fechaReporteUtc));

    const transacciones: TransaccionPagoDetalleDTO[] = txRecords.map((t) => ({
      id: t.id,
      cuotaId: t.cuotaId,
      clienteId: t.clienteId,
      entrenadorId: t.entrenadorId,
      registradoPor: t.registradoPor,
      montoOriginal: t.montoOriginal,
      monedaOriginal: t.monedaOriginal,
      tasaCambioFijada: t.tasaCambioFijada,
      montoEquivalenteUsd: t.montoEquivalenteUsd,
      metodoPago: t.metodoPago,
      referenciaBancaria: t.referenciaBancaria,
      fechaOperacion: t.fechaOperacion,
      comprobanteStorageKey: t.comprobanteStorageKey,
      estadoConciliacion: t.estadoConciliacion,
      motivoRechazo: t.motivoRechazo,
      fechaReporteUtc: t.fechaReporteUtc.toISOString(),
      fechaConciliacionUtc: t.fechaConciliacionUtc?.toISOString() || null,
      createdAtUtc: t.createdAtUtc.toISOString(),
      updatedAtUtc: t.updatedAtUtc.toISOString(),
    }));

    const tasa = await this.obtenerTasaVigente(cuota.entrenadorId, cuota.clienteId);
    const saldoPendienteVes = this.proyectarVES(cuota.saldoPendienteUsd, tasa.tasaEfectiva);

    return {
      id: cuota.id,
      clienteId: cuota.clienteId,
      entrenadorId: cuota.entrenadorId,
      planId: cuota.planId,
      periodo: cuota.periodo,
      montoTotalUsd: cuota.montoTotalUsd,
      montoAbonadoUsd: cuota.montoAbonadoUsd,
      saldoPendienteUsd: cuota.saldoPendienteUsd,
      saldoPendienteVes,
      tasaAplicada: tasa.tasaEfectiva,
      fechaEmisionUtc: toIsoSafe(cuota.fechaEmisionUtc),
      fechaCorteUtc: toIsoSafe(cuota.fechaCorteUtc),
      estado: cuota.estado,
      notas: cuota.notas,
      planNombre: plan?.nombre,
      clienteNombre: alumno ? `${alumno.nombres} ${alumno.apellidos}` : undefined,
      transacciones,
      createdAtUtc: toIsoSafe(cuota.createdAtUtc),
      updatedAtUtc: toIsoSafe(cuota.updatedAtUtc),
    };
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

    // 1. Verificar cache en memoria para idempotencia rápida (lag de red / reintento exacto)
    if (idempotencyKey && this.idempotencyCache.has(idempotencyKey)) {
      const cached = this.idempotencyCache.get(idempotencyKey)!;
      return {
        transaccion: cached.transaccion,
        cuota: cached.cuota,
        esDuplicadoIdempotente: true,
        mensaje: 'Pago ya reportado previamente (respuesta idempotente).',
      };
    }

    // 2. Validar cuota y permisos del alumno titular
    const [cuota] = await this.db
      .select()
      .from(cuotasMembresia)
      .where(eq(cuotasMembresia.id, cuotaId));

    if (!cuota) {
      throw new NotFoundException('Cuota no encontrada.');
    }

    if (cuota.clienteId !== alumnoUserId) {
      throw new ForbiddenException('Aislamiento de Tenant: No tiene permisos para reportar pagos en esta cuota.');
    }

    if (cuota.estado === EstadoCuota.ANULADA) {
      throw new BadRequestException('No se pueden reportar pagos sobre una cuota anulada.');
    }

    if (cuota.estado === EstadoCuota.AL_DIA && toCents(cuota.saldoPendienteUsd) === 0) {
      throw new BadRequestException('La cuota ya se encuentra totalmente saldada.');
    }

    // 3. Verificar unicidad por índice compuesto en transacciones_pago:
    // UNIQUE(metodo_pago, referencia_bancaria, fecha_operacion)
    if (dto.referenciaBancaria) {
      const [txDuplicada] = await this.db
        .select()
        .from(transaccionesPago)
        .where(
          and(
            eq(transaccionesPago.metodoPago, dto.metodoPago),
            eq(transaccionesPago.referenciaBancaria, dto.referenciaBancaria),
            eq(transaccionesPago.fechaOperacion, dto.fechaOperacion)
          )
        );

      if (txDuplicada) {
        throw new ConflictException(
          'Esta referencia ya ha sido registrada previamente para este método y fecha de operación.'
        );
      }
    }

    // 4. Congelar la tasa de cambio vigente (ADR-003 rate snapshot)
    const tasa = await this.obtenerTasaVigente(cuota.entrenadorId, alumnoUserId);
    let tasaCambioFijada = tasa.tasaEfectiva;
    let montoEquivalenteUsd = dto.montoOriginal;

    if (dto.monedaOriginal === Moneda.VES) {
      montoEquivalenteUsd = this.calcularContravalorUSD(dto.montoOriginal, tasaCambioFijada);
    } else {
      tasaCambioFijada = '1.0000';
    }

    const nowUtc = new Date();

    // 5. Inserción de transacción y transición de cuota a 'pendiente_revision'
    const [nuevaTx] = await this.db
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

    // Transicionar cuota a PENDIENTE_REVISION
    const [cuotaActualizada] = await this.db
      .update(cuotasMembresia)
      .set({
        estado: EstadoCuota.PENDIENTE_REVISION,
        updatedAtUtc: nowUtc,
      })
      .where(eq(cuotasMembresia.id, cuota.id))
      .returning();

    const cuotaDto = await this.obtenerCuotaPorId(
      cuota.id,
      cuota.entrenadorId,
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
      metodoPago: nuevaTx.metodoPago,
      referenciaBancaria: nuevaTx.referenciaBancaria,
      fechaOperacion: nuevaTx.fechaOperacion,
      comprobanteStorageKey: nuevaTx.comprobanteStorageKey,
      estadoConciliacion: nuevaTx.estadoConciliacion,
      motivoRechazo: nuevaTx.motivoRechazo,
      fechaReporteUtc: nuevaTx.fechaReporteUtc.toISOString(),
      fechaConciliacionUtc: null,
      createdAtUtc: nuevaTx.createdAtUtc.toISOString(),
      updatedAtUtc: nuevaTx.updatedAtUtc.toISOString(),
    };

    if (idempotencyKey) {
      this.idempotencyCache.set(idempotencyKey, {
        transaccion: txDto,
        cuota: cuotaDto,
      });
    }

    return {
      transaccion: txDto,
      cuota: cuotaDto,
      esDuplicadoIdempotente: false,
      mensaje: 'Pago reportado con éxito. Se encuentra en espera de verificación por su entrenador.',
    };
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
        'El cobro directo en sala solo admite métodos en efectivo (efectivo_usd o efectivo_ves).'
      );
    }

    return await this.db.transaction(async (tx) => {
      // Bloqueo Pesimista (SELECT ... FOR UPDATE) con RLS Tenant
      await tx.execute(sql`SET LOCAL app.current_entrenador_id = ${entrenadorId}`);
      await tx.execute(sql`SELECT id FROM cuotas_membresia WHERE id = ${cuotaId} FOR UPDATE`);

      const [cuotaLock] = await tx
        .select()
        .from(cuotasMembresia)
        .where(
          and(eq(cuotasMembresia.id, cuotaId), eq(cuotasMembresia.entrenadorId, entrenadorId))
        );

      if (!cuotaLock) {
        throw new NotFoundException('Cuota no encontrada o no pertenece a su cartera.');
      }

      if (cuotaLock.estado === EstadoCuota.ANULADA) {
        throw new BadRequestException('La cuota se encuentra anulada.');
      }

      // Calcular contravalor USD
      let tasaCambioFijada = '1.0000';
      let montoEquivalenteUsd = dto.montoOriginal;

      if (dto.monedaOriginal === Moneda.VES) {
        const tasa = await this.obtenerTasaVigente(entrenadorId, cuotaLock.clienteId);
        tasaCambioFijada = tasa.tasaEfectiva;
        montoEquivalenteUsd = this.calcularContravalorUSD(dto.montoOriginal, tasaCambioFijada);
      }

      const nowUtc = new Date();

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
          metodoPago: dto.metodoPago,
          referenciaBancaria: dto.referenciaBancaria || 'COBRO_DIRECTO_SALA',
          fechaOperacion: dto.fechaOperacion,
          estadoConciliacion: EstadoConciliacion.APROBADO,
          fechaReporteUtc: nowUtc,
          fechaConciliacionUtc: nowUtc,
          createdAtUtc: nowUtc,
          updatedAtUtc: nowUtc,
        })
        .returning();

      // Descuento inmediato y cálculo estricto
      const nuevoAbonado = addDecimals(cuotaLock.montoAbonadoUsd, montoEquivalenteUsd);
      const nuevoPendienteRaw = subtractDecimals(cuotaLock.saldoPendienteUsd, montoEquivalenteUsd);
      const nuevoPendiente = toCents(nuevoPendienteRaw) < 0 ? '0.00' : nuevoPendienteRaw;
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

      const tasa = await this.obtenerTasaVigente(entrenadorId, cuotaActualizada.clienteId);
      const saldoPendienteVes = this.proyectarVES(
        cuotaActualizada.saldoPendienteUsd,
        tasa.tasaEfectiva
      );

      const cuotaDto: CuotaDetalleDTO = {
        id: cuotaActualizada.id,
        clienteId: cuotaActualizada.clienteId,
        entrenadorId: cuotaActualizada.entrenadorId,
        planId: cuotaActualizada.planId,
        periodo: cuotaActualizada.periodo,
        montoTotalUsd: cuotaActualizada.montoTotalUsd,
        montoAbonadoUsd: cuotaActualizada.montoAbonadoUsd,
        saldoPendienteUsd: cuotaActualizada.saldoPendienteUsd,
        saldoPendienteVes,
        tasaAplicada: tasa.tasaEfectiva,
        fechaEmisionUtc: toIsoSafe(cuotaActualizada.fechaEmisionUtc),
        fechaCorteUtc: toIsoSafe(cuotaActualizada.fechaCorteUtc),
        estado: cuotaActualizada.estado,
        notas: cuotaActualizada.notas,
        createdAtUtc: toIsoSafe(cuotaActualizada.createdAtUtc),
        updatedAtUtc: toIsoSafe(cuotaActualizada.updatedAtUtc),
      };

      return {
        transaccion: txDto,
        cuota: cuotaDto,
        mensaje: 'Cobro directo en efectivo registrado y auto-aprobado exitosamente.',
      };
    });
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

    return await this.db.transaction(async (tx) => {
      // 1. Contexto RLS
      await tx.execute(sql`SET LOCAL app.current_entrenador_id = ${entrenadorId}`);

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
        throw new NotFoundException('Transacción no encontrada o no pertenece a su cartera.');
      }

      if (txRecord.estadoConciliacion !== EstadoConciliacion.PENDIENTE) {
        throw new ConflictException(`Transacción ${transaccionId} ya fue conciliada previamente.`);
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
        // Aprobación: Liquidar crédito en USD
        const [txAprobada] = await tx
          .update(transaccionesPago)
          .set({
            estadoConciliacion: EstadoConciliacion.APROBADO,
            fechaConciliacionUtc: nowUtc,
            updatedAtUtc: nowUtc,
          })
          .where(eq(transaccionesPago.id, transaccionId))
          .returning();

        const nuevoAbonado = addDecimals(cuotaLock.montoAbonadoUsd, txRecord.montoEquivalenteUsd);
        const nuevoPendienteRaw = subtractDecimals(
          cuotaLock.saldoPendienteUsd,
          txRecord.montoEquivalenteUsd
        );
        const nuevoPendiente = toCents(nuevoPendienteRaw) < 0 ? '0.00' : nuevoPendienteRaw;
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

        let nuevoEstado: EstadoCuota;
        if (otrasPendientes.length > 0) {
          nuevoEstado = EstadoCuota.PENDIENTE_REVISION;
        } else if (toCents(cuotaLock.montoAbonadoUsd) > 0) {
          nuevoEstado = EstadoCuota.ABONADA_PARCIAL;
        } else if (cuotaLock.fechaCorteUtc.getTime() < nowUtc.getTime()) {
          nuevoEstado = EstadoCuota.VENCIDA;
        } else {
          nuevoEstado = EstadoCuota.EMITIDA;
        }

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
  }

  // ===========================================================================
  // 8. BANDEJA DE CONCILIACIÓN DEL ENTRENADOR (FIFO) (RF-007)
  // ===========================================================================

  async listarBandejaConciliacion(entrenadorId: string): Promise<TransaccionPagoDetalleDTO[]> {
    const records = await this.db
      .select({
        tx: transaccionesPago,
        alumno: perfilesAlumno,
      })
      .from(transaccionesPago)
      .leftJoin(perfilesAlumno, eq(perfilesAlumno.usuarioId, transaccionesPago.clienteId))
      .where(
        and(
          eq(transaccionesPago.entrenadorId, entrenadorId),
          eq(transaccionesPago.estadoConciliacion, EstadoConciliacion.PENDIENTE)
        )
      )
      .orderBy(asc(transaccionesPago.fechaReporteUtc)); // FIFO

    return records.map(({ tx, alumno }) => ({
      id: tx.id,
      cuotaId: tx.cuotaId,
      clienteId: tx.clienteId,
      entrenadorId: tx.entrenadorId,
      registradoPor: tx.registradoPor,
      montoOriginal: tx.montoOriginal,
      monedaOriginal: tx.monedaOriginal,
      tasaCambioFijada: tx.tasaCambioFijada,
      montoEquivalenteUsd: tx.montoEquivalenteUsd,
      metodoPago: tx.metodoPago,
      referenciaBancaria: tx.referenciaBancaria,
      fechaOperacion: tx.fechaOperacion,
      comprobanteStorageKey: tx.comprobanteStorageKey,
      estadoConciliacion: tx.estadoConciliacion,
      motivoRechazo: tx.motivoRechazo,
      fechaReporteUtc: tx.fechaReporteUtc.toISOString(),
      fechaConciliacionUtc: tx.fechaConciliacionUtc?.toISOString() || null,
      clienteNombre: alumno ? `${alumno.nombres} ${alumno.apellidos}` : undefined,
      createdAtUtc: tx.createdAtUtc.toISOString(),
      updatedAtUtc: tx.updatedAtUtc.toISOString(),
    }));
  }

  // ===========================================================================
  // HELPERS PRIVADOS
  // ===========================================================================

  private async resolveClienteUsuarioId(idOrPerfilId: string): Promise<string> {
    // Si ya es un usuarioId en la tabla usuarios
    const [user] = await this.db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(eq(usuarios.id, idOrPerfilId));

    if (user) return user.id;

    // Si es un perfilId en perfilesAlumno
    const [perfil] = await this.db
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
      metodoPago: t.metodoPago,
      referenciaBancaria: t.referenciaBancaria,
      fechaOperacion: t.fechaOperacion,
      comprobanteStorageKey: t.comprobanteStorageKey,
      estadoConciliacion: t.estadoConciliacion,
      motivoRechazo: t.motivoRechazo,
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
      fechaEmisionUtc: toIsoSafe(c.fechaEmisionUtc),
      fechaCorteUtc: toIsoSafe(c.fechaCorteUtc),
      estado: c.estado,
      notas: c.notas,
      createdAtUtc: toIsoSafe(c.createdAtUtc),
      updatedAtUtc: toIsoSafe(c.updatedAtUtc),
    };
  }
}
