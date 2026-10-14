/**
 * WU-I (RF-009): servicio del Tablero de Control de Cartera del entrenador.
 *
 * Entrega en una sola consulta paginada:
 * 1. Los KPIs superiores (recaudado del mes, total en mora con suma, próximos a vencer con
 *    conteo y suma, pagos por validar) calculados sobre la cartera COMPLETA del coach.
 * 2. La lista de la pestaña activa (`mora`, `por_vencer`, `revision`, `al_dia`) con envelope
 *    estándar `{ items, total, limit, offset }` y búsqueda por nombre server-side.
 * 3. La acción RN-02 de recordatorio manual un-clic, con cooldown anti-spam y despacho por el
 *    Despachador de Notificaciones (categoría FINANZAS, In-App universal garantizado).
 *
 * Reglas clave (compartidas con directorio y dashboard vía `common/cartera.util`):
 * - Mora = `condicionCuotaEnMora`: corte superado con saldo > 0; POR_VENCER no es mora y
 *   PENDIENTE_REVISION pausa la mora mientras el comprobante se verifica.
 * - Próximo a vencer = `condicionCuotaPorVencer` (≤ 5 días).
 * - La proyección a Bs usa la tasa del alumno (override) o la tasa activa del coach; sin tasa
 *   vigente el saldo en Bs es `null` honesto, nunca un valor inventado.
 */
import {
  Injectable,
  Inject,
  Logger,
  Optional,
} from '@nestjs/common';
import { DRIZZLE_DB, WITH_TENANT } from '../../database/database.module';
import {
  Database,
  WithTenantFn,
  withTenant as withTenantBase,
} from '@guachafit/database';
import {
  CarteraDTO,
  FiltroCarteraDTO,
  RecordatorioManualResultadoDTO,
} from '@guachafit/shared';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FinanzasService } from './finanzas.service';

import {
  type DatosMensajeRecordatorioManual,
  construirMensajeRecordatorioManual,
  TIPO_EVENTO_RECORDATORIO_MANUAL,
  HORAS_COOLDOWN_RECORDATORIO_MANUAL,
} from './casos-cartera/mensaje-recordatorio-reglas';
import type { ContextoCartera } from './casos-cartera/contexto-cartera';
import { obtenerCartera as obtenerCarteraCaso } from './casos-cartera/obtener-cartera';
import { enviarRecordatorioManual as enviarRecordatorioManualCaso } from './casos-cartera/enviar-recordatorio-manual';

export type { DatosMensajeRecordatorioManual };
export {
  construirMensajeRecordatorioManual,
  TIPO_EVENTO_RECORDATORIO_MANUAL,
  HORAS_COOLDOWN_RECORDATORIO_MANUAL,
};

@Injectable()
export class CarteraService {
  private readonly logger = new Logger(CarteraService.name);

  /**
   * RNF-003/ADR-011 (etapa 2): `cuotas_membresia`, `transacciones_pago` y `planes_membresia`
   * tienen RLS. Todas las lecturas financieras del tablero corren dentro de `withTenant`
   * con el GUC del coach; se inyecta para que los tests puedan espiarlo.
   */
  private readonly withTenant: WithTenantFn;

  /** Contexto de dependencias explícito de los casos de uso (P2). */
  private readonly ctx: ContextoCartera;

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    private readonly finanzasService: FinanzasService,
    // RF-014 RN-01: publica el evento de dominio; el despachador (suscriptor) resuelve canales.
    @Optional() private readonly eventEmitter?: EventEmitter2,
    @Optional() @Inject(WITH_TENANT) withTenant?: WithTenantFn
  ) {
    this.withTenant = withTenant ?? ((context, fn) => withTenantBase(context, fn, this.db));
    this.ctx = {
      db: this.db,
      withTenant: this.withTenant,
      finanzasService: this.finanzasService,
      eventEmitter: this.eventEmitter,
      logger: this.logger,
    };
  }

  /**
   * Tablero de cartera: KPIs + pestaña activa (RF-009 §4.A y §4.B).
   *
   * El resumen se calcula SIEMPRE sobre la cartera completa; los filtros de búsqueda y la
   * paginación solo recortan la lista de la pestaña.
   */
  async obtenerCartera(entrenadorId: string, filtro: FiltroCarteraDTO): Promise<CarteraDTO> {
    return obtenerCarteraCaso(this.ctx, entrenadorId, filtro);
  }

  /**
   * RN-02: recordatorio manual de un clic al alumno.
   *
   * Despacha por el Despachador (categoría FINANZAS: In-App universal garantizado y canales
   * Push/Email según las preferencias del alumno) con el saldo exacto y su proyección en Bs.
   * No dispara si no hay saldo pendiente, si el pago está en revisión (pausa de cobro, WU-H) o
   * si ya se envió un recordatorio manual dentro del cooldown anti-spam.
   */
  async enviarRecordatorioManual(
    entrenadorId: string,
    clienteId: string
  ): Promise<RecordatorioManualResultadoDTO> {
    return enviarRecordatorioManualCaso(this.ctx, entrenadorId, clienteId);
  }
}
