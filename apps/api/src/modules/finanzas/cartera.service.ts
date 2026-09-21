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
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DRIZZLE_DB } from '../../database/database.module';
import {
  Database,
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  lte,
  max,
  min,
  ne,
  or,
  sql,
  cuotasMembresia,
  notificacionesInApp,
  perfilesAlumno,
  planesMembresia,
  transaccionesPago,
} from '@guachafit/database';
import {
  CarteraDTO,
  EstadoConciliacion,
  EstadoCuota,
  FilaCarteraDTO,
  FiltroCarteraDTO,
  LIMITE_CARTERA_POR_DEFECTO,
  RecordatorioManualResultadoDTO,
  ResumenCarteraDTO,
} from '@guachafit/shared';
import { NotificationDispatcherService } from '../notificaciones/notification-dispatcher.service';
import { FinanzasService, toIsoSafe } from './finanzas.service';
import {
  MS_POR_DIA,
  calcularDiasAtraso,
  calcularRecaudadoMesUsd,
  calcularVentanaMesUtc,
  condicionCuotaEnMora,
  condicionCuotaPorVencer,
  escaparPatronLike,
} from '../../common/cartera.util';

/**
 * Tipo de evento del recordatorio MANUAL (RF-009 RN-02). Distinto de los hitos automáticos de
 * WU-H (`CUOTA_VENCIDA`, `CUOTA_POR_VENCER`, ...) para no confundir una gestión del coach con un
 * recordatorio programado — y para poder medir el cooldown anti-spam.
 */
export const TIPO_EVENTO_RECORDATORIO_MANUAL = 'RECORDATORIO_MANUAL_COBRO';

/**
 * Horas mínimas entre dos recordatorios manuales al mismo alumno.
 *
 * El RF-009 no fija un límite; este cooldown evita el spam por doble clic o recordatorios
 * repetidos en la misma jornada sin bloquear una gestión legítima del día siguiente.
 */
export const HORAS_COOLDOWN_RECORDATORIO_MANUAL = 6;

/** Titular mínimo que necesita el compositor del mensaje manual (RN-02). */
export interface DatosMensajeRecordatorioManual {
  nombre: string;
  saldoPendienteUsd: string;
  saldoPendienteBs: string | null;
  periodo: string | null;
}

/**
 * Compositor PURO del mensaje manual (RN-02): incluye el saldo exacto en USD y, si existe tasa
 * vigente, su equivalente en Bs. Los datos bancarios del coach aún no se persisten en el modelo,
 * por lo que el mensaje no los inventa.
 */
export function construirMensajeRecordatorioManual(
  datos: DatosMensajeRecordatorioManual
): { titulo: string; cuerpo: string } {
  const saldoDual = datos.saldoPendienteBs
    ? `$${datos.saldoPendienteUsd} USD (o Bs. ${datos.saldoPendienteBs})`
    : `$${datos.saldoPendienteUsd} USD`;
  const ciclo = datos.periodo ? ` de ${datos.periodo}` : '';

  return {
    titulo: 'Recordatorio de pago',
    cuerpo:
      `Hola ${datos.nombre}, tu mensualidad${ciclo} tiene un saldo pendiente de ${saldoDual}. ` +
      'Puedes reportar tu pago desde la app para mantener tu plan al día.',
  };
}

/** Contexto de tasa por fila: override del alumno > tasa activa del coach. */
interface ContextoTasa {
  tasaBase: string | null;
}

@Injectable()
export class CarteraService {
  private readonly logger = new Logger(CarteraService.name);

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    private readonly finanzasService: FinanzasService,
    @Optional() private readonly dispatcherService?: NotificationDispatcherService
  ) {}

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
    const { periodoActual, inicioMesUtc, inicioMesSiguienteUtc } = calcularVentanaMesUtc(ahora);

    const [
      recaudadoMesUsd,
      [filaMora],
      [filaPorVencer],
      [filaRevision],
      [filaAlDia],
      tasa,
    ] = await Promise.all([
      calcularRecaudadoMesUsd(this.db, entrenadorId, { inicioMesUtc, inicioMesSiguienteUtc }),
      this.db
        .select({
          total: sql<string>`coalesce(sum(${cuotasMembresia.saldoPendienteUsd}), 0)`,
          alumnos: countDistinct(cuotasMembresia.clienteId),
        })
        .from(cuotasMembresia)
        .where(
          and(
            eq(cuotasMembresia.entrenadorId, entrenadorId),
            condicionCuotaEnMora(ahora)
          )
        ),
      this.db
        .select({
          total: sql<string>`coalesce(sum(${cuotasMembresia.saldoPendienteUsd}), 0)`,
          alumnos: countDistinct(cuotasMembresia.clienteId),
        })
        .from(cuotasMembresia)
        .where(
          and(
            eq(cuotasMembresia.entrenadorId, entrenadorId),
            condicionCuotaPorVencer(ahora)
          )
        ),
      this.db
        .select({ total: count() })
        .from(transaccionesPago)
        .where(
          and(
            eq(transaccionesPago.entrenadorId, entrenadorId),
            eq(transaccionesPago.estadoConciliacion, EstadoConciliacion.PENDIENTE)
          )
        ),
      this.db
        .select({ total: count() })
        .from(cuotasMembresia)
        .where(
          and(
            eq(cuotasMembresia.entrenadorId, entrenadorId),
            eq(cuotasMembresia.periodo, periodoActual),
            lte(cuotasMembresia.saldoPendienteUsd, '0'),
            ne(cuotasMembresia.estado, EstadoCuota.ANULADA)
          )
        ),
      this.finanzasService.obtenerTasaVigente(entrenadorId),
    ]);

    const alumnosEnMora = Number(filaMora?.alumnos ?? 0);
    const proximosAVencer = Number(filaPorVencer?.alumnos ?? 0);
    const pagosPorValidar = Number(filaRevision?.total ?? 0);
    const contadorAlDia = Number(filaAlDia?.total ?? 0);

    return {
      recaudadoMesUsd,
      totalEnMoraUsd: Number(filaMora?.total ?? 0).toFixed(2),
      alumnosEnMora,
      totalPorVencerUsd: Number(filaPorVencer?.total ?? 0).toFixed(2),
      proximosAVencer,
      pagosPorValidar,
      contadores: {
        enMora: alumnosEnMora,
        porVencer: proximosAVencer,
        revision: pagosPorValidar,
        alDia: contadorAlDia,
      },
      tasaVigente: tasa.tasaEfectiva,
    };
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
    const { entrenadorId, ahora, limit, offset, patron, contexto, condicion, tipo, resumen } =
      opciones;

    const filtroNombre = patron
      ? or(
          ilike(perfilesAlumno.nombres, patron),
          ilike(perfilesAlumno.apellidos, patron)
        )!
      : undefined;
    const whereLista = and(
      eq(cuotasMembresia.entrenadorId, entrenadorId),
      condicion,
      filtroNombre
    );

    const [filaTotal, filas] = await Promise.all([
      this.db
        .select({ total: countDistinct(cuotasMembresia.clienteId) })
        .from(cuotasMembresia)
        .innerJoin(perfilesAlumno, eq(perfilesAlumno.usuarioId, cuotasMembresia.clienteId))
        .where(whereLista),
      this.db
        .select({
          clienteId: cuotasMembresia.clienteId,
          perfilId: perfilesAlumno.id,
          nombres: perfilesAlumno.nombres,
          apellidos: perfilesAlumno.apellidos,
          telefonoWhatsapp: perfilesAlumno.telefonoWhatsapp,
          tasaOverride: perfilesAlumno.tasaFijadaOverride,
          saldoTotalUsd: sql<string>`sum(${cuotasMembresia.saldoPendienteUsd})`,
          corteMasUrgente: min(cuotasMembresia.fechaCorteUtc),
        })
        .from(cuotasMembresia)
        .innerJoin(perfilesAlumno, eq(perfilesAlumno.usuarioId, cuotasMembresia.clienteId))
        .where(whereLista)
        .groupBy(
          cuotasMembresia.clienteId,
          perfilesAlumno.id,
          perfilesAlumno.nombres,
          perfilesAlumno.apellidos,
          perfilesAlumno.telefonoWhatsapp,
          perfilesAlumno.tasaFijadaOverride
        )
        .orderBy(asc(min(cuotasMembresia.fechaCorteUtc)), asc(cuotasMembresia.clienteId))
        .limit(limit)
        .offset(offset),
    ]);

    // Detalle de la cuota más urgente de cada alumno de la página (una sola consulta en lote).
    const idsPagina = filas.map((fila) => fila.clienteId);
    const [cuotasPagina, gestiones] = await Promise.all([
      idsPagina.length > 0
        ? this.db
            .select({
              id: cuotasMembresia.id,
              clienteId: cuotasMembresia.clienteId,
              estado: cuotasMembresia.estado,
              fechaCorteUtc: cuotasMembresia.fechaCorteUtc,
              saldoPendienteUsd: cuotasMembresia.saldoPendienteUsd,
            })
            .from(cuotasMembresia)
            .where(
              and(
                eq(cuotasMembresia.entrenadorId, entrenadorId),
                condicion,
                inArray(cuotasMembresia.clienteId, idsPagina)
              )
            )
            .orderBy(asc(cuotasMembresia.fechaCorteUtc))
        : Promise.resolve([] as Array<{
            id: string;
            clienteId: string;
            estado: EstadoCuota;
            fechaCorteUtc: Date;
            saldoPendienteUsd: string;
          }>),
      this.obtenerUltimasGestiones(idsPagina),
    ]);

    const cuotaPorAlumno = new Map<string, (typeof cuotasPagina)[number]>();
    for (const cuota of cuotasPagina) {
      if (!cuotaPorAlumno.has(cuota.clienteId)) cuotaPorAlumno.set(cuota.clienteId, cuota);
    }

    const items = filas.map((fila) => {
      const cuota = cuotaPorAlumno.get(fila.clienteId);
      const fechaCorte = cuota?.fechaCorteUtc ?? fila.corteMasUrgente;
      const saldoUsd = Number(fila.saldoTotalUsd ?? 0).toFixed(2);
      const proyeccion = this.proyectarSaldo(saldoUsd, fila.tasaOverride, contexto.tasaBase);
      const base: FilaCarteraDTO = {
        alumnoUsuarioId: fila.clienteId,
        alumnoPerfilId: fila.perfilId ?? null,
        alumnoNombre: `${fila.nombres} ${fila.apellidos}`.trim(),
        telefonoWhatsapp: fila.telefonoWhatsapp ?? null,
        cuotaId: cuota?.id ?? null,
        estadoCuota: cuota?.estado ?? null,
        fechaCorteUtc: fechaCorte ? toIsoSafe(fechaCorte) : null,
        saldoPendienteUsd: saldoUsd,
        saldoPendienteBs: proyeccion.saldoPendienteBs,
        tasaAplicada: proyeccion.tasaAplicada,
        diasAtraso: null,
        diasRestantes: null,
        ultimaGestionUtc: gestiones.get(fila.clienteId) ?? null,
        planNombre: null,
        periodo: null,
        pagoId: null,
        montoReportado: null,
        monedaOriginal: null,
        metodoPago: null,
        referenciaBancaria: null,
        comprobanteUrl: null,
        fechaReporteUtc: null,
        diasEspera: null,
      };

      if (tipo === 'mora') {
        return {
          ...base,
          diasAtraso: fechaCorte ? calcularDiasAtraso(new Date(fechaCorte), ahora) : null,
        };
      }

      return {
        ...base,
        diasRestantes: fechaCorte
          ? Math.max(0, Math.round((new Date(fechaCorte).getTime() - ahora.getTime()) / MS_POR_DIA))
          : null,
      };
    });

    return {
      items,
      total: Number(filaTotal[0]?.total ?? 0),
      limit,
      offset,
      resumen,
    };
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
    const { entrenadorId, ahora, limit, offset, patron, resumen } = opciones;

    const filtroNombre = patron
      ? or(
          ilike(perfilesAlumno.nombres, patron),
          ilike(perfilesAlumno.apellidos, patron)
        )!
      : undefined;
    const whereLista = and(
      eq(transaccionesPago.entrenadorId, entrenadorId),
      eq(transaccionesPago.estadoConciliacion, EstadoConciliacion.PENDIENTE),
      filtroNombre
    );

    const [filaTotal, registros] = await Promise.all([
      this.db
        .select({ total: count() })
        .from(transaccionesPago)
        .innerJoin(perfilesAlumno, eq(perfilesAlumno.usuarioId, transaccionesPago.clienteId))
        .where(whereLista),
      this.db
        .select({
          tx: transaccionesPago,
          perfilId: perfilesAlumno.id,
          nombres: perfilesAlumno.nombres,
          apellidos: perfilesAlumno.apellidos,
          telefonoWhatsapp: perfilesAlumno.telefonoWhatsapp,
        })
        .from(transaccionesPago)
        .innerJoin(perfilesAlumno, eq(perfilesAlumno.usuarioId, transaccionesPago.clienteId))
        .where(whereLista)
        .orderBy(asc(transaccionesPago.fechaReporteUtc), asc(transaccionesPago.id))
        .limit(limit)
        .offset(offset),
    ]);

    const items = await Promise.all(
      registros.map(async ({ tx, perfilId, nombres, apellidos, telefonoWhatsapp }) => {
        const comprobanteUrl = await this.finanzasService.resolverComprobanteUrl(
          tx.comprobanteStorageKey
        );
        const fila: FilaCarteraDTO = {
          alumnoUsuarioId: tx.clienteId,
          alumnoPerfilId: perfilId ?? null,
          alumnoNombre: `${nombres} ${apellidos}`.trim(),
          telefonoWhatsapp: telefonoWhatsapp ?? null,
          cuotaId: tx.cuotaId,
          estadoCuota: null,
          fechaCorteUtc: null,
          saldoPendienteUsd: null,
          saldoPendienteBs: null,
          tasaAplicada: null,
          diasAtraso: null,
          diasRestantes: null,
          ultimaGestionUtc: null,
          planNombre: null,
          periodo: null,
          pagoId: tx.id,
          montoReportado: tx.montoOriginal,
          monedaOriginal: tx.monedaOriginal,
          metodoPago: tx.metodoPago,
          referenciaBancaria: tx.referenciaBancaria,
          comprobanteUrl,
          fechaReporteUtc: toIsoSafe(tx.fechaReporteUtc),
          diasEspera: Math.max(
            0,
            Math.floor((ahora.getTime() - new Date(tx.fechaReporteUtc).getTime()) / MS_POR_DIA)
          ),
        };
        return fila;
      })
    );

    return {
      items,
      total: Number(filaTotal[0]?.total ?? 0),
      limit,
      offset,
      resumen,
    };
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
    const { entrenadorId, ahora, limit, offset, patron, contexto, resumen } = opciones;
    const { periodoActual } = calcularVentanaMesUtc(ahora);

    const filtroNombre = patron
      ? or(
          ilike(perfilesAlumno.nombres, patron),
          ilike(perfilesAlumno.apellidos, patron)
        )!
      : undefined;
    const whereLista = and(
      eq(cuotasMembresia.entrenadorId, entrenadorId),
      eq(cuotasMembresia.periodo, periodoActual),
      lte(cuotasMembresia.saldoPendienteUsd, '0'),
      ne(cuotasMembresia.estado, EstadoCuota.ANULADA),
      filtroNombre
    );

    const [filaTotal, filas] = await Promise.all([
      this.db
        .select({ total: count() })
        .from(cuotasMembresia)
        .innerJoin(perfilesAlumno, eq(perfilesAlumno.usuarioId, cuotasMembresia.clienteId))
        .where(whereLista),
      this.db
        .select({
          cuotaId: cuotasMembresia.id,
          clienteId: cuotasMembresia.clienteId,
          periodo: cuotasMembresia.periodo,
          fechaCorteUtc: cuotasMembresia.fechaCorteUtc,
          estado: cuotasMembresia.estado,
          perfilId: perfilesAlumno.id,
          nombres: perfilesAlumno.nombres,
          apellidos: perfilesAlumno.apellidos,
          telefonoWhatsapp: perfilesAlumno.telefonoWhatsapp,
          tasaOverride: perfilesAlumno.tasaFijadaOverride,
          planNombre: planesMembresia.nombre,
        })
        .from(cuotasMembresia)
        .innerJoin(perfilesAlumno, eq(perfilesAlumno.usuarioId, cuotasMembresia.clienteId))
        .innerJoin(planesMembresia, eq(planesMembresia.id, cuotasMembresia.planId))
        .where(whereLista)
        .orderBy(
          asc(perfilesAlumno.apellidos),
          asc(perfilesAlumno.nombres),
          asc(cuotasMembresia.id)
        )
        .limit(limit)
        .offset(offset),
    ]);

    const items = filas.map((fila) => {
      // La cuota está cubierta: su proyección en Bs es 0 solo si existe tasa real; sin tasa el
      // dato se omite (misma honestidad que las demás pestañas).
      const proyeccionCero = this.proyectarSaldo('0.00', fila.tasaOverride, contexto.tasaBase);
      return {
        alumnoUsuarioId: fila.clienteId,
        alumnoPerfilId: fila.perfilId ?? null,
        alumnoNombre: `${fila.nombres} ${fila.apellidos}`.trim(),
        telefonoWhatsapp: fila.telefonoWhatsapp ?? null,
        cuotaId: fila.cuotaId,
        estadoCuota: fila.estado,
        fechaCorteUtc: toIsoSafe(fila.fechaCorteUtc),
        saldoPendienteUsd: '0.00',
        saldoPendienteBs: proyeccionCero.saldoPendienteBs,
        tasaAplicada: proyeccionCero.tasaAplicada,
        diasAtraso: null,
        diasRestantes: null,
        ultimaGestionUtc: null,
        planNombre: fila.planNombre,
        periodo: fila.periodo,
        pagoId: null,
        montoReportado: null,
        monedaOriginal: null,
        metodoPago: null,
        referenciaBancaria: null,
        comprobanteUrl: null,
        fechaReporteUtc: null,
        diasEspera: null,
      };
    });

    return {
      items,
      total: Number(filaTotal[0]?.total ?? 0),
      limit,
      offset,
      resumen,
    };
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
    const [perfil] = await this.db
      .select({
        id: perfilesAlumno.id,
        nombres: perfilesAlumno.nombres,
        apellidos: perfilesAlumno.apellidos,
      })
      .from(perfilesAlumno)
      .where(
        and(
          eq(perfilesAlumno.usuarioId, clienteId),
          eq(perfilesAlumno.entrenadorId, entrenadorId)
        )
      );

    if (!perfil) {
      throw new NotFoundException('El alumno no existe o no pertenece a tu cartera.');
    }

    const nombreCompleto = `${perfil.nombres} ${perfil.apellidos}`.trim();
    const ahora = new Date();

    // Cuota abierta más urgente: la que primero debería pagarse.
    const [cuotaAbierta] = await this.db
      .select({
        id: cuotasMembresia.id,
        periodo: cuotasMembresia.periodo,
        estado: cuotasMembresia.estado,
        saldoPendienteUsd: cuotasMembresia.saldoPendienteUsd,
      })
      .from(cuotasMembresia)
      .where(
        and(
          eq(cuotasMembresia.clienteId, clienteId),
          eq(cuotasMembresia.entrenadorId, entrenadorId),
          ne(cuotasMembresia.estado, EstadoCuota.ANULADA),
          gt(cuotasMembresia.saldoPendienteUsd, '0')
        )
      )
      .orderBy(asc(cuotasMembresia.fechaCorteUtc))
      .limit(1);

    if (!cuotaAbierta) {
      return {
        enviado: false,
        motivo: 'sin_saldo_pendiente',
        mensaje: `${nombreCompleto} no tiene saldo pendiente: no hay nada que recordar.`,
        mensajeSugerido: null,
        saldoPendienteUsd: null,
        saldoPendienteBs: null,
        ultimaGestionUtc: null,
        proximoPermitidoUtc: null,
      };
    }

    if (cuotaAbierta.estado === EstadoCuota.PENDIENTE_REVISION) {
      return {
        enviado: false,
        motivo: 'pausa_revision',
        mensaje:
          `${nombreCompleto} tiene un pago en verificación: los recordatorios se pausan mientras ` +
          'se revisa el comprobante.',
        mensajeSugerido: null,
        saldoPendienteUsd: cuotaAbierta.saldoPendienteUsd,
        saldoPendienteBs: null,
        ultimaGestionUtc: null,
        proximoPermitidoUtc: null,
      };
    }

    // Cooldown anti-spam: se mide solo contra recordatorios MANUALES (los automáticos de WU-H
    // son otra cosa y no cuentan como gestión del coach).
    const [ultimaGestion] = await this.db
      .select({ createdAtUtc: notificacionesInApp.createdAtUtc })
      .from(notificacionesInApp)
      .where(
        and(
          eq(notificacionesInApp.usuarioId, clienteId),
          eq(notificacionesInApp.tipoEvento, TIPO_EVENTO_RECORDATORIO_MANUAL)
        )
      )
      .orderBy(desc(notificacionesInApp.createdAtUtc))
      .limit(1);

    const ultimaGestionUtc = ultimaGestion ? toIsoSafe(ultimaGestion.createdAtUtc) : null;
    const cooldownMs = HORAS_COOLDOWN_RECORDATORIO_MANUAL * 60 * 60 * 1000;

    if (ultimaGestion && ahora.getTime() - new Date(ultimaGestion.createdAtUtc).getTime() < cooldownMs) {
      const proximoPermitido = new Date(new Date(ultimaGestion.createdAtUtc).getTime() + cooldownMs);
      return {
        enviado: false,
        motivo: 'cooldown_activo',
        mensaje:
          `Ya enviaste un recordatorio manual a ${nombreCompleto} hace menos de ` +
          `${HORAS_COOLDOWN_RECORDATORIO_MANUAL} horas. Espera para no saturar al alumno.`,
        mensajeSugerido: null,
        saldoPendienteUsd: cuotaAbierta.saldoPendienteUsd,
        saldoPendienteBs: null,
        ultimaGestionUtc,
        proximoPermitidoUtc: proximoPermitido.toISOString(),
      };
    }

    const tasa = await this.finanzasService.obtenerTasaVigente(entrenadorId, clienteId);
    const saldoPendienteBs = tasa.tasaEfectiva
      ? this.finanzasService.proyectarVES(cuotaAbierta.saldoPendienteUsd, tasa.tasaEfectiva)
      : null;

    const mensaje = construirMensajeRecordatorioManual({
      nombre: perfil.nombres,
      saldoPendienteUsd: cuotaAbierta.saldoPendienteUsd,
      saldoPendienteBs,
      periodo: cuotaAbierta.periodo,
    });

    if (!this.dispatcherService) {
      throw new ServiceUnavailableException(
        'El servicio de notificaciones no está disponible en este momento.'
      );
    }

    const despacho = await this.dispatcherService.despacharEvento({
      tipoEvento: TIPO_EVENTO_RECORDATORIO_MANUAL,
      destinatarioUserId: clienteId,
      entrenadorId,
      categoria: 'FINANZAS',
      titulo: mensaje.titulo,
      cuerpo: mensaje.cuerpo,
      linkAccion: '/app/pagos',
      datosAdicionales: {
        cuotaId: cuotaAbierta.id,
        saldoPendienteUsd: cuotaAbierta.saldoPendienteUsd,
        saldoPendienteBs,
        origen: 'recordatorio_manual',
      },
      esCriticoSeguridad: false,
    });

    this.logger.log(
      `Recordatorio manual despachado a ${clienteId} (cuota ${cuotaAbierta.id}) por coach ${entrenadorId}.`
    );

    return {
      enviado: true,
      motivo: 'despachado',
      mensaje: despacho.pushEnqueued
        ? `Recordatorio enviado a ${nombreCompleto} (notificación in-app + push).`
        : `Recordatorio enviado a ${nombreCompleto} (notificación in-app).`,
      mensajeSugerido: mensaje.cuerpo,
      saldoPendienteUsd: cuotaAbierta.saldoPendienteUsd,
      saldoPendienteBs,
      ultimaGestionUtc: ahora.toISOString(),
      proximoPermitidoUtc: new Date(ahora.getTime() + cooldownMs).toISOString(),
    };
  }

  /** Último recordatorio manual por alumno (para la columna "última gestión" de la lista). */
  private async obtenerUltimasGestiones(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();

    const filas = await this.db
      .select({
        usuarioId: notificacionesInApp.usuarioId,
        ultimaGestionUtc: max(notificacionesInApp.createdAtUtc),
      })
      .from(notificacionesInApp)
      .where(
        and(
          inArray(notificacionesInApp.usuarioId, ids),
          eq(notificacionesInApp.tipoEvento, TIPO_EVENTO_RECORDATORIO_MANUAL)
        )
      )
      .groupBy(notificacionesInApp.usuarioId);

    const gestiones = new Map<string, string>();
    for (const fila of filas) {
      if (fila.ultimaGestionUtc) {
        gestiones.set(fila.usuarioId, toIsoSafe(fila.ultimaGestionUtc));
      }
    }
    return gestiones;
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
    const tasa =
      tasaOverride && parseFloat(tasaOverride) > 0 ? tasaOverride : tasaBase;
    if (!tasa || parseFloat(tasa) <= 0) {
      return { tasaAplicada: null, saldoPendienteBs: null };
    }
    return {
      tasaAplicada: tasa,
      saldoPendienteBs: this.finanzasService.proyectarVES(saldoUsd, tasa),
    };
  }
}
