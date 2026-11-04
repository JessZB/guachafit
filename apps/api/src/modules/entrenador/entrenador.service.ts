import { Injectable, Inject, Logger } from '@nestjs/common';
import { DRIZZLE_DB, WITH_TENANT } from '../../database/database.module';
import type { Database, WithTenantFn } from '@guachafit/database';
import type {
  ActualizarCaptacionDTO,
  CaptacionEntrenadorDTO,
  CaptacionEntrenadorResultadoDTO,
  DashboardComandoDTO,
  PerfilEntrenadorDTO,
} from '@guachafit/shared';
import { calcularVentanaMesUtc } from '../../common/cartera.util';
import type { ContextoEntrenador } from './casos-entrenador/contexto-entrenador';
import { obtenerPerfil as obtenerPerfilCaso } from './casos-entrenador/obtener-perfil';
import { obtenerDashboardComando as obtenerDashboardComandoCaso } from './casos-entrenador/obtener-dashboard-comando';
import {
  actualizarCaptacion as actualizarCaptacionCaso,
  obtenerCaptacion as obtenerCaptacionCaso,
  rotarEnlaceCaptacion as rotarEnlaceCaptacionCaso,
} from './casos-entrenador/captacion';

/**
 * Ventana del mes calendario en UTC para los KPIs financieros del dashboard (RF-013).
 *
 * Definida en `common/cartera.util` (WU-I) para que el dashboard y el tablero de cartera usen
 * EXACTAMENTE el mismo criterio; se re-exporta aquí por compatibilidad con los consumidores
 * históricos (`rf013-dashboard-comando.spec.ts`).
 */
export { calcularVentanaMesUtc };

@Injectable()
export class EntrenadorService {
  private readonly logger = new Logger(EntrenadorService.name);

  /** Contexto de dependencias explícito de los casos de uso (P2). */
  private readonly ctx: ContextoEntrenador;

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    // RNF-003/ADR-009: consultas a tablas con RLS (hoy `rutinas`) corren con GUC.
    @Inject(WITH_TENANT) private readonly withTenant: WithTenantFn
  ) {
    this.ctx = { db: this.db, withTenant: this.withTenant, logger: this.logger };
  }

  /**
   * Perfil operativo del entrenador autenticado (WU-E / RF-011 RN-06).
   * Es la fuente REAL del `coachCode` para el enlace único de captación del coach; el cliente
   * nunca debe inventar ni hardcodear este valor. Solo devuelve datos propios del solicitante.
   */
  async obtenerPerfil(usuarioId: string): Promise<PerfilEntrenadorDTO> {
    return obtenerPerfilCaso(this.ctx, usuarioId);
  }

  /** D17: estado del enlace de captación (código vigente, interruptor y contador de registros). */
  async obtenerCaptacion(entrenadorId: string): Promise<CaptacionEntrenadorDTO> {
    return obtenerCaptacionCaso(this.ctx, entrenadorId);
  }

  /** D17: genera un código nuevo; el anterior deja de resolver de inmediato. */
  async rotarEnlaceCaptacion(entrenadorId: string): Promise<CaptacionEntrenadorResultadoDTO> {
    return rotarEnlaceCaptacionCaso(this.ctx, entrenadorId);
  }

  /** D17: pausa o reanuda la captación por enlace (idempotente por estado). */
  async actualizarCaptacion(
    entrenadorId: string,
    dto: ActualizarCaptacionDTO
  ): Promise<CaptacionEntrenadorResultadoDTO> {
    return actualizarCaptacionCaso(this.ctx, entrenadorId, dto);
  }

  /**
   * Genera el payload consolidado del Dashboard de Comando Central del Entrenador (RF-013)
   */
  async obtenerDashboardComando(coachId: string): Promise<DashboardComandoDTO> {
    return obtenerDashboardComandoCaso(this.ctx, coachId);
  }
}
