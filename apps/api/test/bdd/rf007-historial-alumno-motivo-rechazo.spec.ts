import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FinanzasService } from '../../src/modules/finanzas/finanzas.service';
import {
  Rol,
  Moneda,
  MetodoPago,
  EstadoCuota,
  EstadoConciliacion,
} from '@guachafit/shared';
import { getTableName } from '@guachafit/database';

describe('RF-007 / D15: motivo de rechazo en el historial del alumno (API)', () => {
  let finanzasService: FinanzasService;
  let mockDb: any;

  let mockPerfilesAlumno: any[];
  let mockCuotasMembresia: any[];
  let mockTransaccionesPago: any[];

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

  function getTableArray(tableName: string): any[] {
    let arr: any[] = [];
    if (tableName === 'cuotas_membresia') arr = mockCuotasMembresia;
    else if (tableName === 'transacciones_pago') arr = mockTransaccionesPago;
    else if (tableName === 'perfiles_alumno') arr = mockPerfilesAlumno;
    return arr.map(normalizeRecord);
  }

  function createMockDb() {
    const db: any = {
      select: vi.fn((fieldsSelection?: any) => ({
        from: vi.fn((table: any) => {
          const tableName = table ? getTableName(table) : '';
          const baseData = getTableArray(tableName);
          let filtered = [...baseData];

          let limiteAplicado: number | null = null;
          let desplazamientoAplicado = 0;

          const queryObj: any = {
            leftJoin: vi.fn(() => queryObj),
            innerJoin: vi.fn(() => queryObj),
            where: vi.fn((predicate: any) => {
              const conditions = extractConditions(predicate);
              if (conditions.length > 0) {
                filtered = filtered.filter((item) =>
                  conditions.every((cond) => matchesField(item, cond))
                );
              }
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
            then: (resolve: any) => {
              if (esSeleccionAgregada(fieldsSelection)) {
                const resultado: any = {};
                for (const [campo, expr] of Object.entries(fieldsSelection as Record<string, any>)) {
                  const texto = textoDeExpresion(expr);
                  if (texto.includes('count(')) {
                    resultado[campo] = filtered.length;
                  } else if (texto.includes('sum(')) {
                    const columna = buscarNombreColumna(expr);
                    const suma = filtered.reduce(
                      (acc, fila) => acc + Number(valorDeColumna(fila, columna!) ?? 0),
                      0
                    );
                    resultado[campo] = suma.toFixed(2);
                  }
                }
                return resolve([resultado]);
              }

              const pagina =
                limiteAplicado === null
                  ? filtered.slice(desplazamientoAplicado)
                  : filtered.slice(desplazamientoAplicado, desplazamientoAplicado + limiteAplicado);

              return resolve([...pagina]);
            },
          };

          return queryObj;
        }),
      })),
      execute: vi.fn().mockResolvedValue([]),
      transaction: vi.fn(async (cb: any) => cb(db)),
    };

    return db;
  }

  beforeEach(() => {
    mockPerfilesAlumno = [
      {
        id: 'perfil-alumno-1',
        usuarioId: 'alumno-uuid-1',
        entrenadorId: 'coach-uuid-1',
        nombres: 'Pedro',
        apellidos: 'Pérez',
        saldoAFavorUsd: '0.00',
      },
    ];

    mockCuotasMembresia = [
      {
        id: 'cuota-1',
        clienteId: 'alumno-uuid-1',
        entrenadorId: 'coach-uuid-1',
        planId: 'plan-1',
        periodo: '2026-10',
        montoTotalUsd: '40.00',
        montoAbonadoUsd: '0.00',
        saldoPendienteUsd: '40.00',
        fechaEmisionUtc: new Date('2026-10-01T00:00:00Z'),
        fechaCorteUtc: new Date('2026-10-15T00:00:00Z'),
        estado: EstadoCuota.EMITIDA,
      },
    ];

    mockTransaccionesPago = [
      {
        id: 'tx-rechazada',
        cuotaId: 'cuota-1',
        clienteId: 'alumno-uuid-1',
        entrenadorId: 'coach-uuid-1',
        registradoPor: 'alumno-uuid-1',
        montoOriginal: '40.00',
        monedaOriginal: Moneda.USD,
        tasaCambioFijada: '1.0000',
        montoEquivalenteUsd: '40.00',
        metodoPago: MetodoPago.ZELLE,
        referenciaBancaria: 'ref-rechazada',
        fechaOperacion: '2026-10-05',
        estadoConciliacion: EstadoConciliacion.RECHAZADO,
        motivoRechazo: 'Comprobante borroso',
        createdAtUtc: new Date('2026-10-05T12:00:00Z'),
        updatedAtUtc: new Date('2026-10-05T12:00:00Z'),
      },
      {
        id: 'tx-aprobada',
        cuotaId: 'cuota-1',
        clienteId: 'alumno-uuid-1',
        entrenadorId: 'coach-uuid-1',
        registradoPor: 'alumno-uuid-1',
        montoOriginal: '20.00',
        monedaOriginal: Moneda.USD,
        tasaCambioFijada: '1.0000',
        montoEquivalenteUsd: '20.00',
        metodoPago: MetodoPago.EFECTIVO_USD,
        referenciaBancaria: 'ref-aprobada',
        fechaOperacion: '2026-10-06',
        estadoConciliacion: EstadoConciliacion.APROBADO,
        motivoRechazo: null,
        createdAtUtc: new Date('2026-10-06T12:00:00Z'),
        updatedAtUtc: new Date('2026-10-06T12:00:00Z'),
      },
      {
        id: 'tx-pendiente',
        cuotaId: 'cuota-1',
        clienteId: 'alumno-uuid-1',
        entrenadorId: 'coach-uuid-1',
        registradoPor: 'alumno-uuid-1',
        montoOriginal: '15.00',
        monedaOriginal: Moneda.USD,
        tasaCambioFijada: '1.0000',
        montoEquivalenteUsd: '15.00',
        metodoPago: MetodoPago.PAGO_MOVIL,
        referenciaBancaria: 'ref-pendiente',
        fechaOperacion: '2026-10-07',
        estadoConciliacion: EstadoConciliacion.PENDIENTE,
        motivoRechazo: null,
        createdAtUtc: new Date('2026-10-07T12:00:00Z'),
        updatedAtUtc: new Date('2026-10-07T12:00:00Z'),
      },
    ];

    mockDb = createMockDb();
    finanzasService = new FinanzasService(mockDb);
  });

  it('P25: con un alumno que tiene tres transacciones (una rechazada con motivoRechazo: \'Comprobante borroso\', una aprobada y una pendiente), el historial devuelve motivoRechazo === \'Comprobante borroso\' en la rechazada y null en las otras dos', async () => {
    const resumen = await finanzasService.obtenerHistorialCliente(
      'coach-uuid-1',
      'perfil-alumno-1',
      'alumno-uuid-1',
      Rol.ALUMNO
    );

    const txRechazada = resumen.transacciones.find((t) => t.id === 'tx-rechazada');
    const txAprobada = resumen.transacciones.find((t) => t.id === 'tx-aprobada');
    const txPendiente = resumen.transacciones.find((t) => t.id === 'tx-pendiente');

    expect(txRechazada).toBeDefined();
    expect(txAprobada).toBeDefined();
    expect(txPendiente).toBeDefined();

    expect((txRechazada as any)?.motivoRechazo).toBe('Comprobante borroso');
    expect((txAprobada as any)?.motivoRechazo).toBeNull();
    expect((txPendiente as any)?.motivoRechazo).toBeNull();
  });
});
