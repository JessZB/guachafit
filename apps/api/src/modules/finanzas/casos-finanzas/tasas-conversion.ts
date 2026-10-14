import { BadRequestException } from '@nestjs/common';
import {
  CalculoConversionDTO,
  CalcularConversionDTO,
  Moneda,
  Rol,
  TasaCambioVigenteDTO,
  ActualizarTasaCambioDTO,
} from '@guachafit/shared';
import {
  and,
  desc,
  eq,
  perfilesAlumno,
  perfilesEntrenador,
  tasasCambioReferencia,
  type TenantRlsContext,
  type TenantTransaction,
} from '@guachafit/database';
import {
  divideDecimalsBankers,
  multiplyDecimals,
  resolverTasa,
} from './finanzas-reglas';
import { contextoRlsDeActor, resolveClienteUsuarioId } from './acceso-rls-finanzas';
import type { ContextoFinanzas } from './contexto-finanzas';

// ===========================================================================
// 1-2. MOTOR BIMONETARIO Y TASAS DE CAMBIO (RF-006, ADR-003, RNF-002)
// ===========================================================================

export function proyectarVESCaso(saldoUsd: string, tasa: string): string {
  return multiplyDecimals(saldoUsd, tasa);
}

export function calcularContravalorUSDCaso(montoVES: string, tasaReporte: string): string {
  return divideDecimalsBankers(montoVES, tasaReporte);
}

export async function calcularConversionCaso(
  ctx: ContextoFinanzas,
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
      ? contextoRlsDeActor(actorUserId, actorRole, entrenadorId)
      : { entrenadorId };
  const tasaVigente = await obtenerTasaVigenteCaso(
    ctx,
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
    montoConvertido = proyectarVESCaso(dto.monto, tasaEfectiva);
  } else if (dto.monedaOrigen === Moneda.VES && dto.monedaDestino === Moneda.USD) {
    montoConvertido = calcularContravalorUSDCaso(dto.monto, tasaEfectiva);
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

export async function actualizarTasaCaso(
  ctx: ContextoFinanzas,
  entrenadorId: string,
  dto: ActualizarTasaCambioDTO
): Promise<TasaCambioVigenteDTO> {
  if (parseFloat(dto.tasaOficialBcv) <= 0 || parseFloat(dto.tasaActivaEntrenador) <= 0) {
    throw new BadRequestException('Las tasas de cambio deben ser mayores a 0.');
  }

  const nowUtc = new Date();

  const [nuevaTasa] = await ctx.db
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
  await ctx.db
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
export async function obtenerTasaVigenteCaso(
  ctx: ContextoFinanzas,
  entrenadorId: string,
  clienteId?: string,
  tx?: TenantTransaction,
  contexto?: TenantRlsContext
): Promise<TasaCambioVigenteDTO & { esTasaOverride: boolean }> {
  if (tx) {
    return obtenerTasaVigenteEnCaso(ctx, entrenadorId, clienteId, tx);
  }
  if (clienteId) {
    return ctx.withTenant(contexto ?? { entrenadorId }, (conexion) =>
      obtenerTasaVigenteEnCaso(ctx, entrenadorId, clienteId, conexion)
    );
  }
  return obtenerTasaVigenteEnCaso(
    ctx,
    entrenadorId,
    undefined,
    ctx.db as unknown as TenantTransaction
  );
}

async function obtenerTasaVigenteEnCaso(
  ctx: ContextoFinanzas,
  entrenadorId: string,
  clienteId: string | undefined,
  conn: TenantTransaction
): Promise<TasaCambioVigenteDTO & { esTasaOverride: boolean }> {
  void ctx;
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
    const clienteUsuarioId = await resolveClienteUsuarioId(clienteId, conn);

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

  const { tasaEfectiva, esTasaOverride } = resolverTasa(
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
