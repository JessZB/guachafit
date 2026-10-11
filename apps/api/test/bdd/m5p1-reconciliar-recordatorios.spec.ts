import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EstadoAlumno, EstadoCuota, Rol } from '@guachafit/shared';
import { getTableName } from '@guachafit/database';
import { FinanzasService } from '../../src/modules/finanzas/finanzas.service';
import {
  BillingSchedulerService,
  TIEMPO_MAX_COLA_COBRANZA_MS,
} from '../../src/modules/finanzas/billing-scheduler.service';

/**
 * M5 · lote P1 (contrato E): reposición diaria de recordatorios.
 *
 * `FinanzasService.reconciliarRecordatorios(ahora?: Date): Promise<{ evaluadas: number; agendadas: number }>`
 * LECTURA como ruta de sistema (`withTenant({ isSuperadmin: true })`) de las cuotas:
 * - con estado distinto de `al_dia` y `anulada`;
 * - con `saldoPendienteUsd > 0`;
 * - con `fechaCorteUtc > ahora − 3 días`;
 * - y la `zonaHoraria` del perfil del alumno (unión INTERNA por
 *   `cuotas.clienteId = perfiles.usuarioId` con `deleted_at_utc IS NULL` y
 *   `estado_activacion = 'activo'`: las cuotas de alumnos archivados, pausados, suspendidos
 *   o sin perfil quedan fuera — decisión del dueño 2026-10-10; contrato V1).
 * Antes de leer sondea la cola con `billingSchedulerService.reanudarCola()` (contrato V2).
 * Por cada cuota llama a `billingSchedulerService.programarRecordatoriosCuota(
 * { id, fechaCorteUtc, zonaHoraria }, ahora, { incluirMismoDia: false })` (la zona `America/Caracas`
 * si el perfil no la tiene). `evaluadas` = cuotas leídas; `agendadas` = con al menos un hito devuelto.
 *
 * En fase roja FALLA: el método todavía no existe en `FinanzasService` (TypeError: not a function)
 * y serán esos fallos los que ya cubren cada caso, junto a la falta de lectura (`mockDb.select`
 * sin llamadas) cuando el planificador no está inyectado.
 */
describe('M5 P1 · reconciliarRecordatorios: reposición diaria de recordatorios (contrato E)', () => {
  const AHORA = new Date('2026-10-09T15:00:00.000Z');
  const DIA_MS = 24 * 60 * 60 * 1000;

  let finanzasService: FinanzasService;
  let mockScheduler: any;
  let mockDb: any;
  let withTenantEspia: any;

  let mockUsuarios: any[];
  let mockPerfilesEntrenador: any[];
  let mockPerfilesAlumno: any[];
  let mockPlanesMembresia: any[];
  let mockOverridesClientePlan: any[];
  let mockCuotasMembresia: any[];
  let mockTransaccionesPago: any[];
  let mockTasasCambioReferencia: any[];

  type OpCondicion =
    | 'eq'
    | 'ne'
    | 'isNull'
    | 'isNotNull'
    | 'in'
    | 'notIn'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte';

  function extractConditions(sqlObj: any): Array<{ column: string; value: any; op: OpCondicion }> {
    const conditions: Array<{ column: string; value: any; op: OpCondicion }> = [];
    if (!sqlObj) return conditions;

    function traverse(chunks: any[]) {
      if (!Array.isArray(chunks)) return;
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (chunk && chunk.queryChunks) {
          traverse(chunk.queryChunks);
        } else if (chunk && typeof chunk.name === 'string') {
          const subsequent = chunks.slice(i + 1);
          let opText = '';
          for (const c of subsequent) {
            if (typeof c === 'string') {
              opText += ` ${c}`;
              continue;
            }
            if (Array.isArray(c)) continue;
            if (c && 'value' in c && !Array.isArray(c.value)) break;
            if (Array.isArray(c?.value)) opText += ` ${c.value.join(' ')}`;
          }
          const texto = opText.toLowerCase();

          const esNotIn = /\snot\s+in\s/.test(texto);
          const esIn = !esNotIn && /\sin\s/.test(texto);
          const comparador = texto.match(/>=|<=|>|</)?.[0];
          let op: OpCondicion = 'eq';
          if (texto.includes('is not null')) op = 'isNotNull';
          else if (texto.includes('is null')) op = 'isNull';
          else if (esNotIn) op = 'notIn';
          else if (esIn) op = 'in';
          else if (texto.includes('<>') || texto.includes('!=')) op = 'ne';
          else if (comparador === '>=') op = 'gte';
          else if (comparador === '<=') op = 'lte';
          else if (comparador === '>') op = 'gt';
          else if (comparador === '<') op = 'lt';

          if (op === 'isNull' || op === 'isNotNull') {
            conditions.push({ column: chunk.name, value: null, op });
            continue;
          }

          const params: any[] = [];
          for (const c of subsequent) {
            if (Array.isArray(c)) {
              for (const item of c) {
                if (
                  item &&
                  typeof item === 'object' &&
                  'value' in item &&
                  !Array.isArray(item.value) &&
                  !item.queryChunks
                ) {
                  params.push(item.value);
                }
              }
            } else if (
              c &&
              typeof c === 'object' &&
              'value' in c &&
              !Array.isArray(c.value) &&
              !c.queryChunks
            ) {
              params.push(c.value);
              break;
            }
          }

          if (params.length > 0) {
            conditions.push({
              column: chunk.name,
              value: op === 'in' || op === 'notIn' ? params : params[0],
              op,
            });
          }
        }
      }
    }

    if (sqlObj.queryChunks) {
      traverse(sqlObj.queryChunks);
    }
    return conditions;
  }

  function valorDeColumna(record: any, columna: string): any {
    if (record[columna] !== undefined) return record[columna];
    return record[columna.replace(/_([a-z])/g, (_: string, l: string) => l.toUpperCase())];
  }

  function compararValores(a: any, b: any): number {
    const normalizar = (v: any): any => {
      if (v instanceof Date) return v.getTime();
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return new Date(v).getTime();
      const numero = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(numero) && String(v).trim() !== '' ? numero : v;
    };
    const va = normalizar(a);
    const vb = normalizar(b);
    if (typeof va === 'number' && typeof vb === 'number') return va - vb;
    return va < vb ? -1 : va > vb ? 1 : 0;
  }

  function matchesField(record: any, cond: { column: string; value: any; op: OpCondicion }): boolean {
    const colVal = valorDeColumna(record, cond.column);

    switch (cond.op) {
      case 'ne':
        return colVal !== cond.value;
      case 'isNull':
        return colVal === null || colVal === undefined;
      case 'isNotNull':
        return colVal !== null && colVal !== undefined;
      case 'in':
        return Array.isArray(cond.value) && cond.value.includes(colVal);
      case 'notIn':
        return Array.isArray(cond.value) && !cond.value.includes(colVal);
      case 'gt':
        return compararValores(colVal, cond.value) > 0;
      case 'gte':
        return compararValores(colVal, cond.value) >= 0;
      case 'lt':
        return compararValores(colVal, cond.value) < 0;
      case 'lte':
        return compararValores(colVal, cond.value) <= 0;
      default:
        return colVal === cond.value;
    }
  }

  function extraerOrden(expr: any): { columna: string | null; direccion: 'asc' | 'desc' } {
    let columna: string | null = null;
    let direccion: 'asc' | 'desc' = 'asc';
    const visitar = (chunks: any[]) => {
      for (const c of chunks) {
        if (c && typeof c.name === 'string' && !columna) columna = c.name;
        if (c && Array.isArray(c.value)) {
          const texto = c.value.join(' ').toLowerCase();
          if (texto.includes('desc')) direccion = 'desc';
        }
        if (c && Array.isArray(c.queryChunks)) visitar(c.queryChunks);
      }
    };
    if (expr && Array.isArray(expr.queryChunks)) visitar(expr.queryChunks);
    return { columna, direccion };
  }

  function textoDeExpresion(expr: any): string {
    if (!expr || typeof expr !== 'object' || !Array.isArray(expr.queryChunks)) return '';
    const partes: string[] = [];
    const visitar = (chunks: any[]) => {
      for (const c of chunks) {
        if (Array.isArray(c?.value)) partes.push(c.value.join(' '));
        if (Array.isArray(c?.queryChunks)) visitar(c.queryChunks);
      }
    };
    visitar(expr.queryChunks);
    return partes.join(' ').toLowerCase();
  }

  function esSeleccionAgregada(seleccion: any): boolean {
    return Boolean(
      seleccion &&
        typeof seleccion === 'object' &&
        Object.values(seleccion).some((valor) => {
          const texto = textoDeExpresion(valor);
          return texto.includes('count(') || texto.includes('sum(');
        })
    );
  }

  function normalizeRecord(item: any): any {
    if (!item) return item;
    if (!item.createdAtUtc) item.createdAtUtc = new Date();
    if (!item.updatedAtUtc) item.updatedAtUtc = new Date();
    return item;
  }

  function getTablaCruda(tableName: string): any[] {
    if (tableName === 'planes_membresia') return mockPlanesMembresia;
    if (tableName === 'overrides_cliente_plan') return mockOverridesClientePlan;
    if (tableName === 'cuotas_membresia') return mockCuotasMembresia;
    if (tableName === 'transacciones_pago') return mockTransaccionesPago;
    if (tableName === 'tasas_cambio_referencia') return mockTasasCambioReferencia;
    if (tableName === 'perfiles_entrenador') return mockPerfilesEntrenador;
    if (tableName === 'perfiles_alumno') return mockPerfilesAlumno;
    if (tableName === 'usuarios') return mockUsuarios;
    return [];
  }

  function getTableArray(tableName: string): any[] {
    return getTablaCruda(tableName).map(normalizeRecord);
  }

  /** Columnas de una condición (nombre + tabla leída del objeto drizzle). */
  function columnasDeCondicion(cond: any): Array<{ nombre: string; tabla: string | null }> {
    const columnas: Array<{ nombre: string; tabla: string | null }> = [];
    const visitar = (chunks: any) => {
      if (!Array.isArray(chunks)) return;
      for (const chunk of chunks) {
        if (chunk && typeof chunk.name === 'string' && chunk.table) {
          columnas.push({ nombre: chunk.name, tabla: getTableName(chunk.table) });
        } else if (chunk && Array.isArray(chunk.queryChunks)) {
          visitar(chunk.queryChunks);
        }
      }
    };
    visitar(cond?.queryChunks);
    return columnas;
  }

  /** Evalúa la condición de un join sobre un par de filas (base + unida). */
  function evaluarJoin(filaBase: any, filaUnida: any, condicion: any, tablaUnida: any): boolean {
    const columnas = columnasDeCondicion(condicion);
    if (columnas.length < 2) return true;
    const nombreTablaUnida = getTableName(tablaUnida);
    const [a, b] = columnas;
    const intentar = (colUnida: any, colBase: any): boolean | null => {
      if (colUnida.tabla === nombreTablaUnida && colBase.tabla !== nombreTablaUnida) {
        return (
          valorDeColumna(filaUnida, colUnida.nombre) === valorDeColumna(filaBase, colBase.nombre)
        );
      }
      return null;
    };
    return (
      intentar(a, b) ??
      intentar(b, a) ?? (
        valorDeColumna(filaUnida, a.nombre) === valorDeColumna(filaBase, b.nombre) ||
        valorDeColumna(filaBase, a.nombre) === valorDeColumna(filaUnida, b.nombre)
      )
    );
  }

  function createMockDb() {
    const db: any = {
      select: vi.fn((fieldsSelection?: any) => ({
        from: vi.fn((table: any) => {
          const tableName = table ? getTableName(table) : '';
          let filtered = getTableArray(tableName);

          const tablasUnidas: Array<{ tabla: any; condicion: any; esInterna: boolean }> = [];
          let condicionesWhere: Array<{ column: string; value: any; op: OpCondicion }> = [];
          let limiteAplicado: number | null = null;
          let desplazamientoAplicado = 0;

          const queryObj: any = {
            leftJoin: vi.fn((tablaUnida: any, condicion: any) => {
              tablasUnidas.push({ tabla: tablaUnida, condicion, esInterna: false });
              return queryObj;
            }),
            innerJoin: vi.fn((tablaUnida: any, condicion: any) => {
              tablasUnidas.push({ tabla: tablaUnida, condicion, esInterna: true });
              return queryObj;
            }),
            where: vi.fn((predicate: any) => {
              // Las condiciones se aplican al final, sobre la fila ya fusionada con el join:
              // las columnas de `perfiles_alumno` (`estado_activacion`, `deleted_at_utc`) no
              // existen en la fila base y evaluarlas aquí las descartaría siempre.
              condicionesWhere = extractConditions(predicate);
              return queryObj;
            }),
            orderBy: vi.fn((...exprs: any[]) => {
              const criterios = exprs.map(extraerOrden).filter((c) => c.columna);
              if (criterios.length > 0) {
                filtered = [...filtered].sort((a, b) => {
                  for (const { columna, direccion } of criterios) {
                    const va = valorDeColumna(a, columna!);
                    const vb = valorDeColumna(b, columna!);
                    if (va === vb) continue;
                    const cmp = va > vb ? 1 : -1;
                    return direccion === 'desc' ? -cmp : cmp;
                  }
                  return 0;
                });
              }
              return queryObj;
            }),
            limit: vi.fn((count: number) => {
              limiteAplicado = count;
              return queryObj;
            }),
            offset: vi.fn((count: number) => {
              desplazamientoAplicado = count;
              return queryObj;
            }),
            for: vi.fn(() => queryObj),
            groupBy: vi.fn(() => queryObj),
            having: vi.fn(() => queryObj),
            then: (resolve: any) => {
              const aplicarCondiciones = (filas: any[]) =>
                condicionesWhere.length === 0
                  ? filas
                  : filas.filter((item) =>
                      condicionesWhere.every((cond) => matchesField(item, cond))
                    );
              const paginar = (filas: any[]) =>
                limiteAplicado === null
                  ? filas.slice(desplazamientoAplicado)
                  : filas.slice(desplazamientoAplicado, desplazamientoAplicado + limiteAplicado);

              if (esSeleccionAgregada(fieldsSelection)) {
                const base = aplicarCondiciones(filtered);
                const resultado: any = {};
                for (const [campo, expr] of Object.entries(fieldsSelection as Record<string, any>)) {
                  const texto = textoDeExpresion(expr);
                  if (texto.includes('count(')) {
                    resultado[campo] = base.length;
                  } else if (texto.includes('sum(')) {
                    const columna = buscarNombreColumna(expr);
                    const suma = base.reduce(
                      (acc, fila) => acc + Number(valorDeColumna(fila, columna!) ?? 0),
                      0
                    );
                    resultado[campo] = suma.toFixed(2);
                  }
                }
                return resolve([resultado]);
              }

              // Fusiona los JOIN: inner descarta la base sin pareja; left la conserva sola.
              if (tablasUnidas.length > 0) {
                const fusionadas: any[] = [];
                for (const filaBase of filtered) {
                  let fusionada = { ...filaBase };
                  let descartada = false;
                  const filasPorTabla: Record<string, any> = {
                    [getTableName(table)]: filaBase,
                  };
                  for (const { tabla: tablaUnida, condicion, esInterna } of tablasUnidas) {
                    const filasUnidas = getTableArray(getTableName(tablaUnida));
                    const objetivo = filasUnidas.find((filaUnida) =>
                      evaluarJoin(filaBase, filaUnida, condicion, tablaUnida)
                    );
                    if (!objetivo) {
                      if (esInterna) {
                        descartada = true;
                        break;
                      }
                      continue;
                    }
                    filasPorTabla[getTableName(tablaUnida)] = objetivo;
                    fusionada = { ...fusionada, ...objetivo };
                  }
                  if (descartada) continue;
                  // La proyección manda: cada campo del `select` se resuelve desde la tabla dueña
                  // de su columna, así una homónima de la tabla unida (p. ej. `id` del perfil) no
                  // pisa a la de la base (la consulta proyecta `cuotas_membresia.id`).
                  if (fieldsSelection && typeof fieldsSelection === 'object') {
                    for (const [campo, expr] of Object.entries(
                      fieldsSelection as Record<string, any>
                    )) {
                      const tablaColumna =
                        expr && typeof expr === 'object' ? expr.table : undefined;
                      const nombreColumna =
                        expr && typeof expr === 'object' ? expr.name : undefined;
                      if (tablaColumna && typeof nombreColumna === 'string') {
                        const fila = filasPorTabla[getTableName(tablaColumna)];
                        if (fila) fusionada[campo] = valorDeColumna(fila, nombreColumna);
                      }
                    }
                  }
                  fusionadas.push(fusionada);
                }
                // El `where` va después del join (semántica SQL): las condiciones sobre columnas
                // del perfil se evalúan sobre la fila fusionada.
                return resolve(paginar(aplicarCondiciones(fusionadas)));
              }

              return resolve([...paginar(aplicarCondiciones(filtered))]);
            },
          };

          return queryObj;
        }),
      })),
      insert: vi.fn((table: any) => ({
        values: vi.fn((vals: any) => {
          const tableName = table ? getTableName(table) : '';
          const targetArray = getTablaCruda(tableName);

          const record = {
            id: vals.id || `uuid-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            ...vals,
            createdAtUtc: vals.createdAtUtc || new Date(),
            updatedAtUtc: vals.updatedAtUtc || new Date(),
          };

          targetArray.push(record);

          return {
            returning: vi.fn().mockResolvedValue([record]),
            then: (resolve: any) => resolve([record]),
          };
        }),
      })),
      update: vi.fn((table: any) => ({
        set: vi.fn((setVals: any) => ({
          where: vi.fn((predicate: any) => {
            const tableName = table ? getTableName(table) : '';
            const targetArray = getTablaCruda(tableName);
            const conditions = extractConditions(predicate);

            const updatedRecords: any[] = [];
            targetArray.forEach((item) => {
              const matches =
                conditions.length === 0 ||
                conditions.every((cond) => matchesField(item, cond));

              if (matches) {
                Object.assign(item, setVals);
                updatedRecords.push(item);
              }
            });

            return {
              returning: vi.fn().mockResolvedValue(updatedRecords.slice(0, 1)),
              then: (resolve: any) => resolve(updatedRecords.slice(0, 1)),
            };
          }),
        })),
      })),
      delete: vi.fn((table: any) => ({
        where: vi.fn((predicate: any) => {
          const targetArray = getTablaCruda(getTableName(table));
          const conditions = extractConditions(predicate);
          for (let i = targetArray.length - 1; i >= 0; i--) {
            if (
              conditions.length === 0 ||
              conditions.every((cond) => matchesField(targetArray[i], cond))
            ) {
              targetArray.splice(i, 1);
            }
          }
          return Promise.resolve(undefined);
        }),
      })),
      execute: vi.fn().mockResolvedValue([]),
      transaction: vi.fn(async (cb: any) => cb(db)),
    };
    return db;
  }

  function buscarNombreColumna(expr: any): string | null {
    const visitar = (chunks: any[]): string | null => {
      for (const c of chunks) {
        if (c && typeof c.name === 'string') return c.name;
        if (c && Array.isArray(c.queryChunks)) {
          const encontrado = visitar(c.queryChunks);
          if (encontrado) return encontrado;
        }
      }
      return null;
    };
    return expr && Array.isArray(expr.queryChunks) ? visitar(expr.queryChunks) : null;
  }

  beforeEach(() => {
    mockUsuarios = [
      { id: 'coach-uuid-1', email: 'coach@guachafit.com', rol: Rol.ENTRENADOR },
      { id: 'alumno-uuid-1', email: 'alumno@guachafit.com', rol: Rol.ALUMNO },
      { id: 'alumno-uuid-2', email: 'alumno2@guachafit.com', rol: Rol.ALUMNO },
    ];

    mockPerfilesEntrenador = [
      {
        id: 'perfil-coach-1',
        usuarioId: 'coach-uuid-1',
        nombres: 'Carlos',
        apellidos: 'Coach',
        tasaCambioGlobal: '60.0000',
      },
    ];

    mockPerfilesAlumno = [
      {
        id: 'perfil-1',
        usuarioId: 'alumno-uuid-1',
        entrenadorId: 'coach-uuid-1',
        nombres: 'Madrid',
        apellidos: 'Zona Conocida',
        tasaFijadaOverride: null,
        zonaHoraria: 'Europe/Madrid',
        estadoActivacion: EstadoAlumno.ACTIVO,
        planSuscritoId: null,
        cicloAncla: null,
        proximoCorte: null,
        deletedAtUtc: null,
      },
      {
        id: 'perfil-2',
        usuarioId: 'alumno-uuid-2',
        entrenadorId: 'coach-uuid-1',
        nombres: 'Sin',
        apellidos: 'Zona',
        tasaFijadaOverride: null,
        estadoActivacion: EstadoAlumno.ACTIVO,
        planSuscritoId: null,
        cicloAncla: null,
        proximoCorte: null,
        deletedAtUtc: null,
        // SIN zonaHoraria: la reposición usa America/Caracas por defecto.
      },
    ];

    mockPlanesMembresia = [];
    mockOverridesClientePlan = [];
    mockCuotasMembresia = [];
    mockTransaccionesPago = [];
    mockTasasCambioReferencia = [];

    mockDb = createMockDb();

    mockScheduler = {
      programarRecordatoriosCuota: vi.fn(async () => ['T_MINUS_1']),
      cancelarRecordatoriosCuota: vi.fn(async () => 4),
      // Corrección del lote (contrato V2): la reposición sondea la cola al empezar.
      reanudarCola: vi.fn(),
    };
    withTenantEspia = vi.fn(async (ctx: any, fn: any) => fn(mockDb));
    finanzasService = new FinanzasService(
      mockDb,
      undefined,
      undefined,
      mockScheduler,
      withTenantEspia
    );
  });

  function sembrarCuota(overrides: Record<string, any> = {}) {
    mockCuotasMembresia.push({
      id: `cuota-r-${mockCuotasMembresia.length + 1}`,
      clienteId: 'alumno-uuid-1',
      entrenadorId: 'coach-uuid-1',
      planId: 'plan-x',
      periodo: '2026-10',
      montoTotalUsd: '40.00',
      montoAbonadoUsd: '0.00',
      saldoPendienteUsd: '40.00',
      fechaEmisionUtc: new Date(),
      fechaCorteUtc: new Date(AHORA.getTime() + 10 * DIA_MS),
      estado: EstadoCuota.EMITIDA,
      ...overrides,
    });
    return mockCuotasMembresia[mockCuotasMembresia.length - 1];
  }

  it('E0: FinanzasService expone reconciliarRecordatorios', () => {
    expect(
      typeof (finanzasService as unknown as Record<string, unknown>).reconciliarRecordatorios
    ).toBe('function');
  });

  it('E1: sin planificador inyectado devuelve { evaluadas: 0, agendadas: 0 } y no lee nada', async () => {
    sembrarCuota(); // hay cuotas, pero el servicio ni las mira sin scheduler
    const servicioSinScheduler = new FinanzasService(
      mockDb,
      undefined,
      undefined,
      undefined,
      withTenantEspia
    );

    const resultado = await (servicioSinScheduler as any).reconciliarRecordatorios(AHORA);

    expect(resultado).toEqual({ evaluadas: 0, agendadas: 0 });
    expect(mockDb.select).not.toHaveBeenCalled();
    expect(withTenantEspia).not.toHaveBeenCalled();
  });

  it('E2: lee como ruta de sistema, filtra saldadas/anuladas/vencidas hace más de 3 días y agenda con incluirMismoDia false', async () => {
    const incluida1 = sembrarCuota({
      id: 'cuota-r-madrid',
      saldoPendienteUsd: '40.00',
      fechaCorteUtc: new Date(AHORA.getTime() + 10 * DIA_MS),
      clienteId: 'alumno-uuid-1',
    });
    const incluida2 = sembrarCuota({
      id: 'cuota-r-recien-vencida',
      saldoPendienteUsd: '25.00',
      fechaCorteUtc: new Date(AHORA.getTime() - 1 * DIA_MS),
      clienteId: 'alumno-uuid-1',
    });
    sembrarCuota({
      id: 'cuota-r-muy-antigua',
      saldoPendienteUsd: '30.00',
      fechaCorteUtc: new Date(AHORA.getTime() - 4 * DIA_MS),
    });
    sembrarCuota({
      id: 'cuota-r-sin-saldo',
      saldoPendienteUsd: '0.00',
      fechaCorteUtc: new Date(AHORA.getTime() + 2 * DIA_MS),
    });
    sembrarCuota({
      id: 'cuota-r-al-dia',
      estado: EstadoCuota.AL_DIA,
      saldoPendienteUsd: '0.00',
      fechaCorteUtc: new Date(AHORA.getTime() + 15 * DIA_MS),
    });
    sembrarCuota({
      id: 'cuota-r-anulada',
      estado: EstadoCuota.ANULADA,
      saldoPendienteUsd: '40.00',
      fechaCorteUtc: new Date(AHORA.getTime() + 5 * DIA_MS),
    });

    const resultado = await (finanzasService as any).reconciliarRecordatorios(AHORA);

    expect(resultado).toEqual({ evaluadas: 2, agendadas: 2 });
    // Ruta de sistema: la primera lectura usa el bypass is_superadmin.
    expect(withTenantEspia.mock.calls[0][0]).toEqual({ isSuperadmin: true });
    // Planificador convocado (2, 4) por CUOTA con la zona del perfil y los hitos solo futuros.
    expect(mockScheduler.programarRecordatoriosCuota).toHaveBeenCalledTimes(2);
    expect(mockScheduler.programarRecordatoriosCuota).toHaveBeenCalledWith(
      expect.objectContaining({
        id: incluida1.id,
        zonaHoraria: 'Europe/Madrid',
        fechaCorteUtc: expect.anything(),
      }),
      AHORA,
      { incluirMismoDia: false }
    );
    expect(mockScheduler.programarRecordatoriosCuota).toHaveBeenCalledWith(
      expect.objectContaining({ id: incluida2.id }),
      AHORA,
      { incluirMismoDia: false }
    );
  });

  it('E3: sin zona en el perfil del alumno usa America/Caracas por defecto', async () => {
    const recienVencida = sembrarCuota({
      id: 'cuota-r-sin-zona',
      saldoPendienteUsd: '25.00',
      fechaCorteUtc: new Date(AHORA.getTime() - 2 * DIA_MS),
      clienteId: 'alumno-uuid-2', // perfil SIN zonaHoraria
    });

    const resultado = await (finanzasService as any).reconciliarRecordatorios(AHORA);

    expect(resultado).toEqual({ evaluadas: 1, agendadas: 1 });
    expect(mockScheduler.programarRecordatoriosCuota).toHaveBeenCalledWith(
      expect.objectContaining({ id: recienVencida.id, zonaHoraria: 'America/Caracas' }),
      AHORA,
      { incluirMismoDia: false }
    );
  });

  it('E4: si el planificador devuelve [] la cuota cuenta en evaluadas y NO en agendadas', async () => {
    sembrarCuota({ id: 'cuota-r-sin-hitos' });
    mockScheduler.programarRecordatoriosCuota.mockResolvedValue([]);

    const resultado = await (finanzasService as any).reconciliarRecordatorios(AHORA);

    expect(resultado).toEqual({ evaluadas: 1, agendadas: 0 });
    expect(mockScheduler.programarRecordatoriosCuota).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // Correcciones del lote (validación 08): contratos V1 y V2.
  // ---------------------------------------------------------------------------

  it('V1: con cuotas de un alumno archivado, uno pausado, uno suspendido y uno activo, solo se agenda la del activo', async () => {
    mockPerfilesAlumno.push(
      {
        id: 'perfil-v1-archivado',
        usuarioId: 'alumno-v1-archivado',
        entrenadorId: 'coach-uuid-1',
        estadoActivacion: EstadoAlumno.ACTIVO,
        zonaHoraria: 'Europe/Madrid',
        deletedAtUtc: new Date('2026-09-01T00:00:00Z'),
      },
      {
        id: 'perfil-v1-pausado',
        usuarioId: 'alumno-v1-pausado',
        entrenadorId: 'coach-uuid-1',
        estadoActivacion: EstadoAlumno.INACTIVO_PAUSADO,
        zonaHoraria: 'Europe/Madrid',
        deletedAtUtc: null,
      },
      {
        id: 'perfil-v1-suspendido',
        usuarioId: 'alumno-v1-suspendido',
        entrenadorId: 'coach-uuid-1',
        estadoActivacion: EstadoAlumno.SUSPENDIDO_PAGO,
        zonaHoraria: 'Europe/Madrid',
        deletedAtUtc: null,
      }
    );
    const activa = sembrarCuota({ id: 'cuota-v1-activa', clienteId: 'alumno-uuid-1' });
    sembrarCuota({ id: 'cuota-v1-archivado', clienteId: 'alumno-v1-archivado' });
    sembrarCuota({ id: 'cuota-v1-pausado', clienteId: 'alumno-v1-pausado' });
    sembrarCuota({ id: 'cuota-v1-suspendido', clienteId: 'alumno-v1-suspendido' });

    const resultado = await (finanzasService as any).reconciliarRecordatorios(AHORA);

    expect(resultado).toEqual({ evaluadas: 1, agendadas: 1 });
    expect(mockScheduler.programarRecordatoriosCuota).toHaveBeenCalledTimes(1);
    expect(mockScheduler.programarRecordatoriosCuota).toHaveBeenCalledWith(
      expect.objectContaining({ id: activa.id, zonaHoraria: 'Europe/Madrid' }),
      AHORA,
      { incluirMismoDia: false }
    );
  });

  it('V1: una cuota sin perfil de alumno queda excluida (innerJoin)', async () => {
    sembrarCuota({ id: 'cuota-v1-sin-perfil', clienteId: 'alumno-sin-perfil' });

    const resultado = await (finanzasService as any).reconciliarRecordatorios(AHORA);

    expect(resultado).toEqual({ evaluadas: 0, agendadas: 0 });
    expect(mockScheduler.programarRecordatoriosCuota).not.toHaveBeenCalled();
  });

  it('V2: la reposición sondea la cola al empezar: con la pausa abierta por un tiempo agotado previo, vuelve a llamar a add', async () => {
    vi.useFakeTimers();
    try {
      let colgada = true;
      const mockQueue = {
        add: vi.fn(() => (colgada ? new Promise(() => {}) : Promise.resolve({ id: 'job-v2a' }))),
        remove: vi.fn().mockResolvedValue(1),
      };
      const schedulerReal = new BillingSchedulerService(mockQueue as any);
      const servicio = new FinanzasService(
        mockDb,
        undefined,
        undefined,
        schedulerReal,
        withTenantEspia
      );
      const corte = new Date(AHORA.getTime() + 10 * DIA_MS);

      // 1) Un tiempo agotado previo abre la pausa de la cola.
      const previa = schedulerReal.programarRecordatoriosCuota(
        { id: 'cuota-v2-previa', fechaCorteUtc: corte },
        AHORA
      );
      await vi.advanceTimersByTimeAsync(TIEMPO_MAX_COLA_COBRANZA_MS + 1);
      await previa;
      expect(mockQueue.add).toHaveBeenCalledTimes(1);

      // 2) Redis sano: el sondeo (reanudarCola) permite volver a llamar a add y agendar.
      colgada = false;
      sembrarCuota({ id: 'cuota-v2-activa', clienteId: 'alumno-uuid-1', fechaCorteUtc: corte });
      const resultado = await servicio.reconciliarRecordatorios(AHORA);

      expect(resultado).toEqual({ evaluadas: 1, agendadas: 1 });
      expect(
        mockQueue.add.mock.calls.some((c: any[]) => (c[1] as any)?.cuotaId === 'cuota-v2-activa')
      ).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('V2: si el sondeo vuelve a agotar el tiempo, la pausa se reabre y el resto de cuotas no toca la cola', async () => {
    vi.useFakeTimers();
    try {
      const mockQueue = {
        add: vi.fn(() => new Promise(() => {})),
        remove: vi.fn().mockResolvedValue(1),
      };
      const schedulerReal = new BillingSchedulerService(mockQueue as any);
      const servicio = new FinanzasService(
        mockDb,
        undefined,
        undefined,
        schedulerReal,
        withTenantEspia
      );
      const corte = new Date(AHORA.getTime() + 10 * DIA_MS);

      const previa = schedulerReal.programarRecordatoriosCuota(
        { id: 'cuota-v2-previa', fechaCorteUtc: corte },
        AHORA
      );
      await vi.advanceTimersByTimeAsync(TIEMPO_MAX_COLA_COBRANZA_MS + 1);
      await previa;
      expect(mockQueue.add).toHaveBeenCalledTimes(1);

      sembrarCuota({ id: 'cuota-v2-1', clienteId: 'alumno-uuid-1', fechaCorteUtc: corte });
      sembrarCuota({ id: 'cuota-v2-2', clienteId: 'alumno-uuid-1', fechaCorteUtc: corte });

      const promesa = servicio.reconciliarRecordatorios(AHORA);
      await vi.advanceTimersByTimeAsync(TIEMPO_MAX_COLA_COBRANZA_MS + 1);
      const resultado = await promesa;

      // Solo la primera cuota llegó a tocar la cola: su tiempo agotado reabrió la pausa.
      expect(mockQueue.add).toHaveBeenCalledTimes(2);
      expect(resultado).toEqual({ evaluadas: 2, agendadas: 0 });

      // La pausa quedó reabierta: una llamada nueva devuelve corto sin tocar la cola.
      expect(
        await schedulerReal.programarRecordatoriosCuota(
          { id: 'cuota-v2-3', fechaCorteUtc: corte },
          AHORA
        )
      ).toEqual([]);
      expect(mockQueue.add).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
