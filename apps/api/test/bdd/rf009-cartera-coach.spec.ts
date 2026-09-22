import { describe, it, expect, vi } from 'vitest';
import {
  CarteraService,
  construirMensajeRecordatorioManual,
  HORAS_COOLDOWN_RECORDATORIO_MANUAL,
  TIPO_EVENTO_RECORDATORIO_MANUAL,
} from '../../src/modules/finanzas/cartera.service';
import { condicionCuotaEnMora, calcularVentanaMesUtc } from '../../src/common/cartera.util';
import {
  EstadoConciliacion,
  EstadoCuota,
  FiltroCarteraSchema,
  Moneda,
  MetodoPago,
  type CarteraDTO,
  type FiltroCarteraDTO,
  type RecordatorioManualResultadoDTO,
} from '@guachafit/shared';
import { getTableName } from '@guachafit/database';
import { RecordatorioManualCobroEvent } from '../../src/modules/notificaciones/events/eventos-notificacion';

const DIA_MS = 24 * 60 * 60 * 1000;
const COACH_ID = 'coach-uuid-1';

type RespuestaTabla = any[] | ((n: number) => any[]);

/**
 * Mock de Drizzle basado en el nombre de tabla y contador por tabla, con soporte para las
 * cadenas del tablero de cartera (`innerJoin`, `groupBy`, `orderBy`, `limit`, `offset`).
 * Los predicados y los argumentos de orden/página se capturan para auditar el SQL generado.
 */
function crearMockDb(respuestas: Record<string, RespuestaTabla>) {
  const contadores: Record<string, number> = {};
  const predicados: any[] = [];
  const ordenes: any[][] = [];
  const limites: number[] = [];
  const offsets: number[] = [];

  const db: any = {
    select: vi.fn(() => ({
      from: vi.fn((table: any) => {
        const nombre = table ? getTableName(table) : '';
        contadores[nombre] = (contadores[nombre] ?? 0) + 1;
        const definicion = respuestas[nombre];
        const data =
          typeof definicion === 'function' ? definicion(contadores[nombre]) : definicion ?? [];

        const queryObj: any = {
          innerJoin: vi.fn(() => queryObj),
          leftJoin: vi.fn(() => queryObj),
          where: vi.fn((predicate: any) => {
            predicados.push(predicate);
            return queryObj;
          }),
          groupBy: vi.fn(() => queryObj),
          having: vi.fn(() => queryObj),
          orderBy: vi.fn((...args: any[]) => {
            ordenes.push(args);
            return queryObj;
          }),
          limit: vi.fn((n: number) => {
            limites.push(n);
            return queryObj;
          }),
          offset: vi.fn((n: number) => {
            offsets.push(n);
            return queryObj;
          }),
          then: (resolve: any) => resolve(data),
        };
        return queryObj;
      }),
    })),
    transaction: vi.fn(async (fn: any) => fn(db)),
  };

  return { db, contadores, predicados, ordenes, limites, offsets };
}

/** Texto SQL de una expresión Drizzle (fragmentos de texto + nombres de columna). */
function textoDeExpresion(expr: any): string {
  if (!expr || typeof expr !== 'object' || !Array.isArray(expr.queryChunks)) return '';
  const partes: string[] = [];
  const visitar = (chunks: any[]) => {
    for (const c of chunks) {
      if (Array.isArray(c)) {
        visitar(c);
        continue;
      }
      if (typeof c?.name === 'string') partes.push(c.name);
      if (Array.isArray(c?.value)) partes.push(c.value.join(' '));
      if (Array.isArray(c?.queryChunks)) visitar(c.queryChunks);
    }
  };
  visitar(expr.queryChunks);
  return partes.join(' ').toLowerCase();
}

/** Valores de los parámetros ligados a una expresión Drizzle (incluye listas `IN` y strings). */
function parametrosDeExpresion(expr: any): any[] {
  const valores: any[] = [];
  const visitar = (chunks: any[]) => {
    for (const c of chunks) {
      if (Array.isArray(c)) {
        visitar(c);
        continue;
      }
      // Los strings sueltos en un template `sql` se ligan como parámetros (no son texto SQL).
      if (typeof c === 'string' || typeof c === 'number' || typeof c === 'boolean') {
        valores.push(c);
        continue;
      }
      if (c instanceof Date) {
        valores.push(c);
      } else if (c && 'value' in c && !Array.isArray(c.value)) {
        valores.push(c.value);
      }
      if (Array.isArray(c?.queryChunks)) visitar(c.queryChunks);
    }
  };
  if (expr && Array.isArray(expr.queryChunks)) visitar(expr.queryChunks);
  return valores;
}

/**
 * Doble del FinanzasService: tasa vigente configurable, proyección Bs real (multiplicación
 * decimal simple) y resolución de comprobantes simulada.
 */
function crearFinanzasFake(opciones: { tasaEfectiva?: string | null } = {}) {
  const tasaEfectiva = opciones.tasaEfectiva ?? null;
  const obtenerTasaVigente = vi.fn(async () => ({
    entrenadorId: COACH_ID,
    tasaOficialBcv: tasaEfectiva,
    tasaActivaEntrenador: tasaEfectiva,
    tasaAcordadaCliente: null,
    tasaEfectiva,
    esTasaOverride: false,
    fuente: tasaEfectiva ? 'entrenador_activa' : 'sin_configurar',
    fechaActualizacionUtc: null,
  }));
  const resolverComprobanteUrl = vi.fn(async () => 'https://r2.example/comprobante.webp');
  const proyectarVES = vi.fn((saldo: string, tasa: string) =>
    (Number(saldo) * Number(tasa)).toFixed(2)
  );

  return {
    finanzas: { obtenerTasaVigente, resolverComprobanteUrl, proyectarVES } as any,
    obtenerTasaVigente,
    resolverComprobanteUrl,
    proyectarVES,
  };
}

/** Respuestas del bloque `resumen` (recaudado, mora, por vencer, revisión, al día). */
function respuestasResumen(overrides: Partial<Record<string, any>> = {}) {
  return {
    transacciones_pago: (n: number) =>
      n === 1
        ? [{ montoEquivalenteUsd: '35.00' }, { montoEquivalenteUsd: '40.00' }]
        : [{ total: 3 }],
    cuotas_membresia: (n: number) => {
      if (n === 1) return [{ total: '105.00', alumnos: 2 }];
      if (n === 2) return [{ total: '60.00', alumnos: 1 }];
      if (n === 3) return [{ total: 4 }];
      return overrides.cuotas_membresia_fn?.(n) ?? [];
    },
    ...overrides,
  };
}

function filtro(parcial: Partial<FiltroCarteraDTO> = {}): FiltroCarteraDTO {
  return FiltroCarteraSchema.parse(parcial);
}

describe('RF-009 WU-I: Tablero de control de cartera del coach', () => {
  describe('KPIs y contadores de la cartera completa', () => {
    it('calcula recaudado, mora (conteo + suma), por vencer (conteo + suma) y pagos por validar', async () => {
      const ahora = Date.now();
      const { db } = crearMockDb(
        respuestasResumen({
          cuotas_membresia_fn: (n: number) => {
            if (n === 4) return [{ total: 2 }]; // count de la lista de mora
            if (n === 5)
              return [
                {
                  clienteId: 'user-a',
                  perfilId: 'perfil-a',
                  nombres: 'Juan',
                  apellidos: 'Pérez',
                  telefonoWhatsapp: '+584121111111',
                  tasaOverride: null,
                  saldoTotalUsd: '80.00',
                  corteMasUrgente: new Date(ahora - 10 * DIA_MS),
                },
                {
                  clienteId: 'user-b',
                  perfilId: 'perfil-b',
                  nombres: 'Ana',
                  apellidos: 'López',
                  telefonoWhatsapp: null,
                  tasaOverride: null,
                  saldoTotalUsd: '25.00',
                  corteMasUrgente: new Date(ahora - 2 * DIA_MS),
                },
              ];
            if (n === 6)
              return [
                {
                  id: 'cuota-a',
                  clienteId: 'user-a',
                  estado: EstadoCuota.VENCIDA,
                  fechaCorteUtc: new Date(ahora - 10 * DIA_MS),
                  saldoPendienteUsd: '80.00',
                },
                {
                  id: 'cuota-b',
                  clienteId: 'user-b',
                  estado: EstadoCuota.VENCIDA,
                  fechaCorteUtc: new Date(ahora - 2 * DIA_MS),
                  saldoPendienteUsd: '25.00',
                },
              ];
            return [];
          },
          notificaciones_in_app: [{ usuarioId: 'user-a', ultimaGestionUtc: new Date(ahora - DIA_MS) }],
        })
      );

      const { finanzas } = crearFinanzasFake({ tasaEfectiva: null });
      const servicio = new CarteraService(db, finanzas);
      const resultado: CarteraDTO = await servicio.obtenerCartera(COACH_ID, filtro({ pestana: 'mora' }));

      expect(resultado.resumen.recaudadoMesUsd).toBe('75.00');
      expect(resultado.resumen.totalEnMoraUsd).toBe('105.00');
      expect(resultado.resumen.alumnosEnMora).toBe(2);
      expect(resultado.resumen.totalPorVencerUsd).toBe('60.00');
      expect(resultado.resumen.proximosAVencer).toBe(1);
      expect(resultado.resumen.pagosPorValidar).toBe(3);
      expect(resultado.resumen.contadores).toEqual({
        enMora: 2,
        porVencer: 1,
        revision: 3,
        alDia: 4,
      });

      // Sin tasa configurada el KPI y las filas son honestos: nada de Bs inventados.
      expect(resultado.resumen.tasaVigente).toBeNull();
      expect(resultado.items[0].saldoPendienteBs).toBeNull();
      expect(resultado.items[0].tasaAplicada).toBeNull();

      // Orden por urgencia (corte más antiguo primero) => días de atraso descendente.
      expect(resultado.items.map((f) => f.diasAtraso)).toEqual([10, 2]);
      expect(resultado.items[0].alumnoNombre).toBe('Juan Pérez');
      expect(resultado.items[0].cuotaId).toBe('cuota-a');
      expect(resultado.items[0].estadoCuota).toBe(EstadoCuota.VENCIDA);
      expect(resultado.items[0].ultimaGestionUtc).toBe(new Date(ahora - DIA_MS).toISOString());
      expect(resultado.items[1].ultimaGestionUtc).toBeNull();

      // Envelope estándar.
      expect(resultado.total).toBe(2);
      expect(resultado.limit).toBe(25);
      expect(resultado.offset).toBe(0);
    });

    it('proyecta Bs con la tasa del coach y respeta el override por alumno', async () => {
      const ahora = Date.now();
      const { db } = crearMockDb(
        respuestasResumen({
          cuotas_membresia_fn: (n: number) => {
            if (n === 4) return [{ total: 2 }];
            if (n === 5)
              return [
                {
                  clienteId: 'user-a',
                  perfilId: 'perfil-a',
                  nombres: 'Juan',
                  apellidos: 'Pérez',
                  telefonoWhatsapp: null,
                  tasaOverride: null,
                  saldoTotalUsd: '80.00',
                  corteMasUrgente: new Date(ahora - 10 * DIA_MS),
                },
                {
                  clienteId: 'user-b',
                  perfilId: 'perfil-b',
                  nombres: 'Ana',
                  apellidos: 'López',
                  telefonoWhatsapp: null,
                  tasaOverride: '70.0000',
                  saldoTotalUsd: '30.00',
                  corteMasUrgente: new Date(ahora - 2 * DIA_MS),
                },
              ];
            if (n === 6) return [];
            return [];
          },
          notificaciones_in_app: [],
        })
      );

      const { finanzas } = crearFinanzasFake({ tasaEfectiva: '65.0000' });
      const servicio = new CarteraService(db, finanzas);
      const resultado = await servicio.obtenerCartera(COACH_ID, filtro({ pestana: 'mora' }));

      expect(resultado.resumen.tasaVigente).toBe('65.0000');
      expect(resultado.items[0].tasaAplicada).toBe('65.0000');
      expect(resultado.items[0].saldoPendienteBs).toBe('5200.00');
      expect(resultado.items[1].tasaAplicada).toBe('70.0000');
      expect(resultado.items[1].saldoPendienteBs).toBe('2100.00');
    });

    it('excluye PENDIENTE_REVISION de la condición de mora (pausa de cobro RF-008)', () => {
      const condicion = condicionCuotaEnMora(new Date());
      const texto = textoDeExpresion(condicion);
      expect(texto).toContain('fecha_corte_utc');
      expect(texto).toContain('saldo_pendiente_usd');

      const parametros = parametrosDeExpresion(condicion);
      expect(parametros).toContain(EstadoCuota.PENDIENTE_REVISION);
      expect(parametros).toContain(EstadoCuota.POR_VENCER);
      expect(parametros).toContain(EstadoCuota.ANULADA);
      expect(parametros).toContain(EstadoCuota.AL_DIA);
    });

    it('ordena la lista de mora por el corte más antiguo (días de atraso descendente)', async () => {
      const { db, ordenes } = crearMockDb(
        respuestasResumen({
          cuotas_membresia_fn: (n: number) => (n === 4 ? [{ total: 0 }] : []),
          notificaciones_in_app: [],
        })
      );
      const { finanzas } = crearFinanzasFake();
      const servicio = new CarteraService(db, finanzas);
      await servicio.obtenerCartera(COACH_ID, filtro({ pestana: 'mora' }));

      // Primera llamada a orderBy del bloque de lista: la agregada por urgencia.
      expect(ordenes.length).toBeGreaterThan(0);
      const primerOrden = textoDeExpresion(ordenes[0][0]);
      expect(primerOrden).toContain('min');
      expect(primerOrden).toContain('fecha_corte_utc');
    });

    it('aplica el aislamiento de tenant en todas las consultas de cartera', async () => {
      const { db, predicados } = crearMockDb(
        respuestasResumen({
          cuotas_membresia_fn: (n: number) => (n === 4 ? [{ total: 0 }] : []),
          notificaciones_in_app: [],
        })
      );
      const { finanzas } = crearFinanzasFake();
      const servicio = new CarteraService(db, finanzas);
      await servicio.obtenerCartera(COACH_ID, filtro({ pestana: 'mora' }));

      const conEntrenador = predicados.filter((p) =>
        textoDeExpresion(p).includes('entrenador_id')
      );
      // recaudado + mora + por vencer + revisión + al día + count lista + filas lista + detalle.
      expect(conEntrenador.length).toBeGreaterThanOrEqual(7);
      for (const predicado of conEntrenador) {
        expect(parametrosDeExpresion(predicado)).toContain(COACH_ID);
      }
    });

    it('respeta limit y offset del envelope y los reenvía a la consulta', async () => {
      const { db, limites, offsets } = crearMockDb(
        respuestasResumen({
          cuotas_membresia_fn: (n: number) => (n === 4 ? [{ total: 40 }] : []),
          notificaciones_in_app: [],
        })
      );
      const { finanzas } = crearFinanzasFake();
      const servicio = new CarteraService(db, finanzas);
      const resultado = await servicio.obtenerCartera(
        COACH_ID,
        filtro({ pestana: 'mora', limit: 10, offset: 10 })
      );

      expect(resultado.total).toBe(40);
      expect(resultado.limit).toBe(10);
      expect(resultado.offset).toBe(10);
      expect(limites).toContain(10);
      expect(offsets).toContain(10);
    });

    it('FiltroCarteraSchema aplica defaults seguros (mora, 25, 0)', () => {
      const dto = FiltroCarteraSchema.parse({});
      expect(dto.pestana).toBe('mora');
      expect(dto.limit).toBe(25);
      expect(dto.offset).toBe(0);
    });

    it('la ventana del mes viaja como ISO string con cast ::timestamptz (nunca un Date crudo)', async () => {
      // Regresión real: un `Date` contra un fragmento SQL crudo (coalesce) llega sin encodear al
      // driver postgres-js, cuyo serializer de timestamptz es una identidad => ERR_INVALID_ARG_TYPE.
      const { db, predicados } = crearMockDb(
        respuestasResumen({
          cuotas_membresia_fn: (n: number) => (n === 4 ? [{ total: 0 }] : []),
          notificaciones_in_app: [],
        })
      );
      const { finanzas } = crearFinanzasFake();
      const servicio = new CarteraService(db, finanzas);
      await servicio.obtenerCartera(COACH_ID, filtro({ pestana: 'mora' }));

      const predicadoPagos = predicados.find((p) =>
        textoDeExpresion(p).includes('coalesce')
      );
      expect(predicadoPagos).toBeDefined();
      expect(textoDeExpresion(predicadoPagos)).toContain('timestamptz');

      const valores = parametrosDeExpresion(predicadoPagos);
      expect(valores.some((valor) => valor instanceof Date)).toBe(false);
      const { inicioMesUtc, inicioMesSiguienteUtc } = calcularVentanaMesUtc(new Date());
      expect(valores.map(String)).toContain(inicioMesUtc.toISOString());
      expect(valores.map(String)).toContain(inicioMesSiguienteUtc.toISOString());
    });
  });

  describe('Pestaña Pendiente de Revisión', () => {
    it('lista los comprobantes en verificación con su referencia, método y comprobante', async () => {
      const ahora = Date.now();
      const { db } = crearMockDb({
        ...respuestasResumen(),
        transacciones_pago: (n: number) => {
          if (n === 1) return [{ montoEquivalenteUsd: '35.00' }];
          if (n === 2) return [{ total: 1 }];
          if (n === 3) return [{ total: 1 }];
          if (n === 4)
            return [
              {
                tx: {
                  id: 'tx-1',
                  cuotaId: 'cuota-a',
                  clienteId: 'user-a',
                  montoOriginal: '1950.00',
                  monedaOriginal: Moneda.VES,
                  metodoPago: MetodoPago.PAGO_MOVIL,
                  referenciaBancaria: '445566',
                  comprobanteStorageKey: 'comprobantes/user-a/recibo.webp',
                  estadoConciliacion: EstadoConciliacion.PENDIENTE,
                  fechaReporteUtc: new Date(ahora - 2 * DIA_MS),
                },
                perfilId: 'perfil-a',
                nombres: 'Juan',
                apellidos: 'Pérez',
                telefonoWhatsapp: '+584121111111',
              },
            ];
          return [];
        },
      });

      const { finanzas, resolverComprobanteUrl } = crearFinanzasFake();
      const servicio = new CarteraService(db, finanzas);
      const resultado = await servicio.obtenerCartera(
        COACH_ID,
        filtro({ pestana: 'revision' })
      );

      expect(resultado.resumen.pagosPorValidar).toBe(1);
      expect(resultado.items).toHaveLength(1);
      const fila = resultado.items[0];
      expect(fila.pagoId).toBe('tx-1');
      expect(fila.alumnoNombre).toBe('Juan Pérez');
      expect(fila.referenciaBancaria).toBe('445566');
      expect(fila.metodoPago).toBe(MetodoPago.PAGO_MOVIL);
      expect(fila.montoReportado).toBe('1950.00');
      expect(fila.monedaOriginal).toBe(Moneda.VES);
      expect(fila.diasEspera).toBe(2);
      expect(fila.comprobanteUrl).toBe('https://r2.example/comprobante.webp');
      expect(resolverComprobanteUrl).toHaveBeenCalledWith('comprobantes/user-a/recibo.webp');
    });
  });

  describe('Pestaña Al Día', () => {
    it('lista las cuotas del ciclo cubiertas al 100% con su plan real', async () => {
      const ahora = new Date();
      const periodo = `${ahora.getUTCFullYear()}-${String(ahora.getUTCMonth() + 1).padStart(2, '0')}`;
      const { db } = crearMockDb({
        ...respuestasResumen(),
        cuotas_membresia: (n: number) => {
          if (n === 1) return [{ total: '0.00', alumnos: 0 }];
          if (n === 2) return [{ total: '0.00', alumnos: 0 }];
          if (n === 3) return [{ total: 1 }];
          if (n === 4) return [{ total: 1 }];
          if (n === 5)
            return [
              {
                cuotaId: 'cuota-a',
                clienteId: 'user-a',
                periodo,
                fechaCorteUtc: new Date(ahora.getTime() + 20 * DIA_MS),
                estado: EstadoCuota.AL_DIA,
                perfilId: 'perfil-a',
                nombres: 'Juan',
                apellidos: 'Pérez',
                telefonoWhatsapp: null,
                tasaOverride: null,
                planNombre: 'Presencial Completo',
              },
            ];
          return [];
        },
      });

      const { finanzas } = crearFinanzasFake();
      const servicio = new CarteraService(db, finanzas);
      const resultado = await servicio.obtenerCartera(COACH_ID, filtro({ pestana: 'al_dia' }));

      expect(resultado.total).toBe(1);
      expect(resultado.items[0].planNombre).toBe('Presencial Completo');
      expect(resultado.items[0].periodo).toBe(periodo);
      expect(resultado.items[0].saldoPendienteUsd).toBe('0.00');
      expect(resultado.items[0].estadoCuota).toBe(EstadoCuota.AL_DIA);
    });
  });

  describe('RN-02: recordatorio manual', () => {
    // RF-014 RN-01: el servicio publica el evento; el "despacho" se simula en el bus.
    function crearEmisorFake(pushEnqueued = false) {
      const emitAsync = vi.fn(async () => [
        {
          inAppId: 'notif-1',
          pushEnqueued,
          emailEnqueued: false,
          activeDeviceTokensCount: pushEnqueued ? 1 : 0,
        },
      ]);
      return { emisor: { emitAsync } as any, emitAsync };
    }

    function dbRecordatorio(opciones: {
      perfil?: any[];
      cuota?: any[];
      ultimaGestion?: any[];
    }) {
      return crearMockDb({
        perfiles_alumno: opciones.perfil ?? [
          { id: 'perfil-a', nombres: 'Juan', apellidos: 'Pérez' },
        ],
        cuotas_membresia:
          opciones.cuota ?? [
            {
              id: 'cuota-a',
              periodo: '2026-09',
              estado: EstadoCuota.VENCIDA,
              saldoPendienteUsd: '30.00',
            },
          ],
        notificaciones_in_app: opciones.ultimaGestion ?? [],
      });
    }

    it('despacha la notificación FINANZAS con el saldo exacto en USD y Bs', async () => {
      const { db } = dbRecordatorio({});
      const { finanzas } = crearFinanzasFake({ tasaEfectiva: '65.0000' });
      const { emisor, emitAsync } = crearEmisorFake();
      const servicio = new CarteraService(db, finanzas, emisor);

      const resultado: RecordatorioManualResultadoDTO = await servicio.enviarRecordatorioManual(
        COACH_ID,
        'user-a'
      );

      expect(resultado.enviado).toBe(true);
      expect(resultado.motivo).toBe('despachado');
      expect(resultado.saldoPendienteUsd).toBe('30.00');
      expect(resultado.saldoPendienteBs).toBe('1950.00');
      expect(resultado.mensajeSugerido).toContain('$30.00 USD');
      expect(resultado.mensajeSugerido).toContain('Bs. 1950.00');
      expect(resultado.proximoPermitidoUtc).not.toBeNull();

      expect(emitAsync).toHaveBeenCalledTimes(1);
      expect(emitAsync).toHaveBeenCalledWith(
        RecordatorioManualCobroEvent.NOMBRE,
        expect.objectContaining({
          payload: expect.objectContaining({
            tipoEvento: TIPO_EVENTO_RECORDATORIO_MANUAL,
            destinatarioUserId: 'user-a',
            entrenadorId: COACH_ID,
            categoria: 'FINANZAS',
            linkAccion: '/app/pagos',
            referenciaId: 'cuota-a',
          }),
        })
      );
    });

    it('menciona el push cuando el bus reporta que se encoló (resultado del emitAsync)', async () => {
      const { db } = dbRecordatorio({});
      const { finanzas } = crearFinanzasFake({ tasaEfectiva: '65.0000' });
      const { emisor } = crearEmisorFake(true);
      const servicio = new CarteraService(db, finanzas, emisor);

      const resultado = await servicio.enviarRecordatorioManual(COACH_ID, 'user-a');

      expect(resultado.enviado).toBe(true);
      expect(resultado.mensaje).toContain('notificación in-app + push');
    });

    it('no duplica: cooldown activo tras un recordatorio manual reciente', async () => {
      const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000);
      const { db } = dbRecordatorio({ ultimaGestion: [{ createdAtUtc: haceUnaHora }] });
      const { finanzas } = crearFinanzasFake({ tasaEfectiva: '65.0000' });
      const { emisor, emitAsync } = crearEmisorFake();
      const servicio = new CarteraService(db, finanzas, emisor);

      const resultado = await servicio.enviarRecordatorioManual(COACH_ID, 'user-a');

      expect(resultado.enviado).toBe(false);
      expect(resultado.motivo).toBe('cooldown_activo');
      expect(resultado.ultimaGestionUtc).toBe(haceUnaHora.toISOString());
      expect(resultado.proximoPermitidoUtc).toBe(
        new Date(haceUnaHora.getTime() + HORAS_COOLDOWN_RECORDATORIO_MANUAL * 3600 * 1000).toISOString()
      );
      expect(emitAsync).not.toHaveBeenCalled();
    });

    it('pausa el recordatorio si el pago está en revisión (RF-008)', async () => {
      const { db } = dbRecordatorio({
        cuota: [
          {
            id: 'cuota-a',
            periodo: '2026-09',
            estado: EstadoCuota.PENDIENTE_REVISION,
            saldoPendienteUsd: '30.00',
          },
        ],
      });
      const { finanzas } = crearFinanzasFake({ tasaEfectiva: '65.0000' });
      const { emisor, emitAsync } = crearEmisorFake();
      const servicio = new CarteraService(db, finanzas, emisor);

      const resultado = await servicio.enviarRecordatorioManual(COACH_ID, 'user-a');

      expect(resultado.enviado).toBe(false);
      expect(resultado.motivo).toBe('pausa_revision');
      expect(emitAsync).not.toHaveBeenCalled();
    });

    it('no envía nada si el alumno no tiene saldo pendiente', async () => {
      const { db } = dbRecordatorio({ cuota: [] });
      const { finanzas } = crearFinanzasFake();
      const { emisor, emitAsync } = crearEmisorFake();
      const servicio = new CarteraService(db, finanzas, emisor);

      const resultado = await servicio.enviarRecordatorioManual(COACH_ID, 'user-a');

      expect(resultado.enviado).toBe(false);
      expect(resultado.motivo).toBe('sin_saldo_pendiente');
      expect(emitAsync).not.toHaveBeenCalled();
    });

    it('rechaza alumnos fuera de la cartera del coach (404)', async () => {
      const { db } = dbRecordatorio({ perfil: [] });
      const { finanzas } = crearFinanzasFake();
      const servicio = new CarteraService(db, finanzas, crearEmisorFake().emisor);

      await expect(servicio.enviarRecordatorioManual(COACH_ID, 'user-ajeno')).rejects.toThrow(
        /no existe o no pertenece a tu cartera/
      );
    });

    it('construirMensajeRecordatorioManual omite Bs cuando no hay tasa (nunca inventa)', () => {
      const mensaje = construirMensajeRecordatorioManual({
        nombre: 'Juan',
        saldoPendienteUsd: '30.00',
        saldoPendienteBs: null,
        periodo: '2026-09',
      });
      expect(mensaje.cuerpo).toContain('$30.00 USD');
      expect(mensaje.cuerpo).not.toContain('Bs.');
    });
  });
});
