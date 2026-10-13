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
  LIMITE_CARTERA_POR_DEFECTO,
  RecordatorioManualResultadoDTO,
  ResumenCarteraDTO,
} from '@guachafit/shared';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FinanzasService } from './finanzas.service';
import {
  condicionCuotaEnMora,
  condicionCuotaPorVencer,
  escaparPatronLike,
} from '../../common/cartera.util';

import {
  type DatosMensajeRecordatorioManual,
  construirMensajeRecordatorioManual,
  TIPO_EVENTO_RECORDATORIO_MANUAL,
  HORAS_COOLDOWN_RECORDATORIO_MANUAL,
} from './casos-cartera/mensaje-recordatorio-reglas';
import { proyectarSaldoCon } from './casos-cartera/proyectar-saldo-reglas';
import type { ContextoCartera, ContextoTasa } from './casos-cartera/contexto-cartera';
import { calcularResumenCartera } from './casos-cartera/calcular-resumen-cartera';
import { listarCuotasPorUrgencia as listarCuotasPorUrgenciaCaso } from './casos-cartera/listar-cuotas-urgencia';
import { listarRevisionCartera } from './casos-cartera/listar-revision-cartera';
import { listarAlDiaCartera } from './casos-cartera/listar-al-dia-cartera';
import { obtenerUltimasGestiones as obtenerUltimasGestionesCaso } from './casos-cartera/obtener-ultimas-gestiones';
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
    const ahora = new Date();
    const limit = filtro.limit ?? LIMITE_CARTERA_POR_DEFECTO;
    const offset = filtro.offset ?? 0;
    const busqueda = (filtro.q ?? '').trim();
    const patron = busqueda.length > 0 ? `%${escaparPatronLike(busqueda)}%` : null;

    const resumen = await this.calcularResumen(entrenadorId, ahora);
    const contexto: ContextoTasa = { tasaBase: resumen.tasaVigente };

    switch (filtro.pestana) {
      case 'mora':
        return this.listarCuotasPorUrgencia({
          entrenadorId,
          ahora,
          limit,
          offset,
          patron,
          contexto,
          condicion: condicionCuotaEnMora(ahora),
          tipo: 'mora',
          resumen,
        });
      case 'por_vencer':
        return this.listarCuotasPorUrgencia({
          entrenadorId,
          ahora,
          limit,
          offset,
          patron,
          contexto,
          condicion: condicionCuotaPorVencer(ahora),
          tipo: 'por_vencer',
          resumen,
        });
      case 'revision':
        return this.listarRevision({ entrenadorId, ahora, limit, offset, patron, resumen });
      case 'al_dia':
      default:
        return this.listarAlDia({ entrenadorId, ahora, limit, offset, patron, contexto, resumen });
    }
  }

  /**
   * KPIs y contadores de la cartera COMPLETA del coach (nunca de la página cargada).
   *
   * Todas las consultas van filtradas por `entrenador_id` (aislamiento de tenant) y se resuelven
   * en paralelo; ninguno de estos números se deriva de datos demo o heurísticas.
   */
  private async calcularResumen(entrenadorId: string, ahora: Date): Promise<ResumenCarteraDTO> {
    return calcularResumenCartera(this.ctx, entrenadorId, ahora);
  }

  /**
   * Lista agregada por alumno de las pestañas de cuotas (mora / por vencer).
   *
   * El orden es por la cuota más urgente (`MIN(fecha_corte_utc)` ascendente): en mora eso
   * equivale a días de atraso DESCENDENTE (RF-009 Escenario 2) y en por vencer al vencimiento
   * más próximo. El desempate por `cliente_id` mantiene la paginación estable.
   */
  private async listarCuotasPorUrgencia(opciones: {
    entrenadorId: string;
    ahora: Date;
    limit: number;
    offset: number;
    patron: string | null;
    contexto: ContextoTasa;
    condicion: ReturnType<typeof condicionCuotaEnMora>;
    tipo: 'mora' | 'por_vencer';
    resumen: ResumenCarteraDTO;
  }): Promise<CarteraDTO> {
    return listarCuotasPorUrgenciaCaso(this.ctx, opciones);
  }

  /**
   * Pestaña "Pendiente de Revisión" (RF-009 §4.B): comprobantes en verificación, en orden FIFO.
   * Reenvía la misma fuente de verdad de la bandeja de conciliación (`transacciones_pago`),
   * con búsqueda server-side por nombre del alumno.
   */
  private async listarRevision(opciones: {
    entrenadorId: string;
    ahora: Date;
    limit: number;
    offset: number;
    patron: string | null;
    resumen: ResumenCarteraDTO;
  }): Promise<CarteraDTO> {
    return listarRevisionCartera(this.ctx, opciones);
  }

  /**
   * Pestaña "Al Día" (RF-009 §4.B): cuotas del ciclo en curso cubiertas al 100%.
   *
   * La lista es por cuota (un alumno con dos planes vigentes pagados aparece una vez por plan),
   * mientras que el contador de la pestaña cuenta cuotas — la misma magnitud que `total`.
   * "Próxima fecha de facturación" no existe como dato persistido: se expone el corte real del
   * ciclo cubierto (`fechaCorteUtc`) y nunca se inventa una fecha futura.
   */
  private async listarAlDia(opciones: {
    entrenadorId: string;
    ahora: Date;
    limit: number;
    offset: number;
    patron: string | null;
    contexto: ContextoTasa;
    resumen: ResumenCarteraDTO;
  }): Promise<CarteraDTO> {
    return listarAlDiaCartera(this.ctx, opciones);
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

  /** Último recordatorio manual por alumno (para la columna "última gestión" de la lista). */
  private async obtenerUltimasGestiones(ids: string[]): Promise<Map<string, string>> {
    return obtenerUltimasGestionesCaso(this.ctx, ids);
  }

  /**
   * Proyección informativa en Bs: override del alumno > tasa activa del coach.
   * Sin tasa utilizable devuelve `null` (nunca una tasa inventada).
   */
  private proyectarSaldo(
    saldoUsd: string,
    tasaOverride: string | null,
    tasaBase: string | null
  ): { tasaAplicada: string | null; saldoPendienteBs: string | null } {
    return proyectarSaldoCon(
      (saldo, tasa) => this.finanzasService.proyectarVES(saldo, tasa),
      saldoUsd,
      tasaOverride,
      tasaBase
    );
  }
}
