import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AntropometriaService } from '../../src/modules/antropometria/antropometria.service';
import { AntropometriaController } from '../../src/modules/antropometria/antropometria.controller';
import { R2StorageService } from '../../src/modules/antropometria/r2-storage.service';
import {
  Rol,
  Modalidad,
  OrigenAntropometria,
  EstadoMedicion,
  AnguloFoto,
  EstadoAlumno,
  CheckinAntropometricoSchema,
} from '@guachafit/shared';
import {
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { getTableName } from '@guachafit/database';

describe('Módulo 4: Control Antropométrico & Bóveda R2 (AntropometriaService & AntropometriaController)', () => {
  let antropometriaService: AntropometriaService;
  let antropometriaController: AntropometriaController;
  let r2StorageService: R2StorageService;

  let mockUsuarios: any[];
  let mockPerfilesAlumno: any[];
  let mockControlesAntropometricos: any[];
  let mockFotosAntropometria: any[];

  function isSqlSyntaxChunk(c: any): boolean {
    if (!c || !('value' in c)) return true;
    if (Array.isArray(c.value)) {
      if (
        typeof c.value[0] === 'string' &&
        (/^[=><\s,()]+$/.test(c.value[0].trim()) ||
          c.value[0].trim() === 'in' ||
          c.value[0].trim() === 'and' ||
          c.value[0].trim() === 'or' ||
          c.value[0].trim() === 'is null' ||
          c.value[0].trim() === 'is not null')
      ) {
        return true;
      }
    }
    return false;
  }

  function getParamsFrom(item: any): any[] {
    if (item === null || item === undefined) return [];
    if (typeof item === 'string') return item.length > 0 ? [item] : [];
    if (typeof item === 'number' || typeof item === 'boolean') return [item];
    if (Array.isArray(item)) return item.flatMap(getParamsFrom);
    if ('value' in item && !isSqlSyntaxChunk(item)) {
      const values = Array.isArray(item.value) ? item.value.flatMap(getParamsFrom) : [item.value];
      return values.filter((v) => v !== '');
    }
    if (item.queryChunks && Array.isArray(item.queryChunks)) {
      return item.queryChunks.flatMap(getParamsFrom);
    }
    return [];
  }

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
          const opText = subsequent
            .map((c: any) => {
              if (typeof c === 'string') return c;
              if (Array.isArray(c?.value)) return c.value.join(' ');
              if (typeof c?.value === 'string') return c.value;
              return '';
            })
            .join(' ')
            .toLowerCase();

          const params = subsequent.flatMap(getParamsFrom);

          let op: OpCondicion = 'eq';
          if (opText.includes('is not null')) op = 'isNotNull';
          else if (opText.includes('is null')) op = 'isNull';
          else if (/\snot\s+in\s/.test(opText)) op = 'notIn';
          else if (/\sin\s/.test(opText)) op = 'in';
          else if (opText.includes('<>') || opText.includes('!=')) op = 'ne';
          else {
            const comparador = opText.match(/>=|<=|>|</)?.[0];
            if (comparador === '>=') op = 'gte';
            else if (comparador === '<=') op = 'lte';
            else if (comparador === '>') op = 'gt';
            else if (comparador === '<') op = 'lt';
          }

          if (op === 'isNull' || op === 'isNotNull') {
            conditions.push({ column: chunk.name, value: null, op });
          } else if (op === 'in' || op === 'notIn') {
            conditions.push({ column: chunk.name, value: params, op });
          } else if (params.length > 0) {
            conditions.push({ column: chunk.name, value: params[0], op });
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
      case 'isNull':
        return colVal === null || colVal === undefined;
      case 'isNotNull':
        return colVal !== null && colVal !== undefined;
      case 'ne':
        return colVal !== cond.value;
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

  /** WU24b: extrae columna y dirección de una expresión `asc(col)`/`desc(col)` de Drizzle. */
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

  /** WU24b: detecta `count(...)` dentro de una selección agregada de Drizzle. */
  function esExpresionCount(expr: any): boolean {
    if (!expr || typeof expr !== 'object' || !Array.isArray(expr.queryChunks)) return false;
    return expr.queryChunks.some(
      (c: any) =>
        Array.isArray(c?.value) &&
        c.value.some((v: any) => typeof v === 'string' && v.toLowerCase().includes('count('))
    );
  }

  function esSeleccionAgregada(seleccion: any): boolean {
    return Boolean(
      seleccion &&
        typeof seleccion === 'object' &&
        Object.values(seleccion).some((valor) => esExpresionCount(valor))
    );
  }

  function normalizeRecord(item: any): any {
    if (!item) return item;
    if (!item.createdAtUtc) item.createdAtUtc = new Date();
    if (!item.updatedAtUtc) item.updatedAtUtc = new Date();
    return item;
  }

  function getTableArray(tableName: string): any[] {
    if (tableName === 'controles_antropometricos') return mockControlesAntropometricos;
    if (tableName === 'fotos_antropometria') return mockFotosAntropometria;
    if (tableName === 'perfiles_alumno') return mockPerfilesAlumno;
    if (tableName === 'usuarios') return mockUsuarios;
    return [];
  }

  function createMockDb() {
    const db: any = {
      select: vi.fn((fields?: any) => ({
        from: vi.fn((table: any) => {
          const tableName = table ? getTableName(table) : '';
          const baseData = getTableArray(tableName);
          let filtered = baseData.map(normalizeRecord);

          let limiteAplicado: number | null = null;
          let desplazamientoAplicado = 0;

          const queryObj: any = {
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
            then: (resolve: any) => {
              const pagina =
                limiteAplicado === null
                  ? filtered.slice(desplazamientoAplicado)
                  : filtered.slice(desplazamientoAplicado, desplazamientoAplicado + limiteAplicado);

              // WU24b: selección agregada (COUNT real del envelope): una sola fila.
              if (esSeleccionAgregada(fields)) {
                const resultado: any = {};
                for (const [campo, expr] of Object.entries(fields as Record<string, any>)) {
                  if (esExpresionCount(expr)) resultado[campo] = filtered.length;
                }
                return resolve([resultado]);
              }

              if (fields && typeof fields === 'object' && Object.keys(fields).length > 0) {
                const mapped = pagina.map((item) => {
                  const res: any = {};
                  for (const key of Object.keys(fields)) {
                    res[key] = item[key] !== undefined ? item[key] : item.usuarioId;
                  }
                  return res;
                });
                return resolve(mapped);
              }
              return resolve([...pagina]);
            },
          };

          return queryObj;
        }),
      })),
      insert: vi.fn((table: any) => ({
        values: vi.fn((vals: any) => {
          const tableName = table ? getTableName(table) : '';
          const targetArray = getTableArray(tableName);

          const record = {
            id: vals.id || `uuid-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
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
        set: vi.fn((updates: any) => {
          const tableName = table ? getTableName(table) : '';
          const targetArray = getTableArray(tableName);

          return {
            where: vi.fn((predicate: any) => {
              const conditions = extractConditions(predicate);
              const found = targetArray.find((item) =>
                conditions.every((cond) => matchesField(item, cond))
              );
              if (found) {
                Object.assign(found, updates, { updatedAtUtc: new Date() });
              }
              return {
                returning: vi.fn().mockResolvedValue(found ? [found] : []),
                then: (resolve: any) => resolve(found ? [found] : []),
              };
            }),
          };
        }),
      })),
      transaction: vi.fn(async (cb: any) => cb(db)),
    };

    return db;
  }

  const coachId = 'c1111111-1111-4111-8111-111111111111';
  const otherCoachId = 'c9999999-9999-4999-8999-999999999999';
  const alumnoPresencialId = 'a2222222-2222-4222-8222-222222222222';
  const alumnoRemotoId = 'a3333333-3333-4333-8333-333333333333';

  beforeEach(() => {
    mockUsuarios = [
      { id: coachId, email: 'coach@guachafit.com', rol: Rol.ENTRENADOR },
      { id: otherCoachId, email: 'othercoach@guachafit.com', rol: Rol.ENTRENADOR },
      { id: alumnoPresencialId, email: 'presencial@guachafit.com', rol: Rol.ALUMNO },
      { id: alumnoRemotoId, email: 'remoto@guachafit.com', rol: Rol.ALUMNO },
    ];

    mockPerfilesAlumno = [
      {
        id: 'prof-1',
        usuarioId: alumnoPresencialId,
        entrenadorId: coachId,
        nombres: 'Carlos',
        apellidos: 'Presencial',
        modalidad: Modalidad.PRESENCIAL,
        estadoActivacion: EstadoAlumno.ACTIVO,
      },
      {
        id: 'prof-2',
        usuarioId: alumnoRemotoId,
        entrenadorId: coachId,
        nombres: 'Laura',
        apellidos: 'Remota',
        modalidad: Modalidad.REMOTO,
        estadoActivacion: EstadoAlumno.ACTIVO,
      },
    ];

    mockControlesAntropometricos = [];
    mockFotosAntropometria = [];

    const mockDb = createMockDb();
    r2StorageService = new R2StorageService(
      'guachafit-biometric-vault',
      'https://mock-account.r2.cloudflarestorage.com'
    );
    antropometriaService = new AntropometriaService(mockDb, r2StorageService);
    antropometriaController = new AntropometriaController(antropometriaService);
  });

  describe('solicitarPresignedUploadUrl', () => {
    it('debe rechazar a alumno presencial intentando subir fotos antropométricas (ADR-001, RBAC Híbrido)', async () => {
      const caller = { id: alumnoPresencialId, rol: Rol.ALUMNO };
      const dto = {
        modulo: 'antropometria' as const,
        alumnoId: alumnoPresencialId,
        angulo: AnguloFoto.FRONTAL,
        mimeType: 'image/webp' as const,
      };

      await expect(
        antropometriaService.solicitarPresignedUploadUrl(caller, dto)
      ).rejects.toThrow(ForbiddenException);

      await expect(
        antropometriaService.solicitarPresignedUploadUrl(caller, dto)
      ).rejects.toThrow(/no registran sus propias medidas/i);
    });

    it('debe rechazar si un alumno solicita URL para otro alumno', async () => {
      const caller = { id: alumnoRemotoId, rol: Rol.ALUMNO };
      const dto = {
        modulo: 'antropometria' as const,
        alumnoId: alumnoPresencialId,
        angulo: AnguloFoto.FRONTAL,
        mimeType: 'image/webp' as const,
      };

      await expect(
        antropometriaService.solicitarPresignedUploadUrl(caller, dto)
      ).rejects.toThrow(ForbiddenException);
    });

    it('debe generar presigned URL para alumno remoto para sus propias fotos', async () => {
      const caller = { id: alumnoRemotoId, rol: Rol.ALUMNO };
      const dto = {
        modulo: 'antropometria' as const,
        alumnoId: alumnoRemotoId,
        angulo: AnguloFoto.FRONTAL,
        mimeType: 'image/webp' as const,
      };

      const res = await antropometriaService.solicitarPresignedUploadUrl(caller, dto);
      expect(res.expiresInSeconds).toBe(900);
      expect(res.uploadUrl).toContain('X-Amz-Expires=900');
      expect(res.storageKey).toContain(`antropometria/${alumnoRemotoId}/`);
    });

    it('debe permitir al entrenador generar presigned URL para su alumno', async () => {
      const caller = { id: coachId, rol: Rol.ENTRENADOR, entrenadorId: coachId };
      const dto = {
        modulo: 'antropometria' as const,
        alumnoId: alumnoPresencialId,
        angulo: AnguloFoto.FRONTAL,
        mimeType: 'image/webp' as const,
      };

      const res = await antropometriaService.solicitarPresignedUploadUrl(caller, dto);
      expect(res.expiresInSeconds).toBe(900);
      expect(res.uploadUrl).toContain('X-Amz-Expires=900');
    });

    it('debe rechazar al entrenador si el alumno pertenece a otro entrenador', async () => {
      const caller = { id: otherCoachId, rol: Rol.ENTRENADOR, entrenadorId: otherCoachId };
      const dto = {
        modulo: 'antropometria' as const,
        alumnoId: alumnoPresencialId,
        angulo: AnguloFoto.FRONTAL,
        mimeType: 'image/webp' as const,
      };

      await expect(
        antropometriaService.solicitarPresignedUploadUrl(caller, dto)
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('registrarCheckin', () => {
    it('debe registrar como aprobado inmediato cuando lo ejecuta el Entrenador (ADR-001)', async () => {
      const caller = { id: coachId, rol: Rol.ENTRENADOR, entrenadorId: coachId };
      const dto = {
        alumnoId: alumnoPresencialId,
        fechaEvaluacion: '2026-09-06',
        pesoKg: '80.00',
        alturaCm: '180.00',
        porcentajeGrasa: '16.50',
        fotos: [
          {
            angulo: AnguloFoto.FRONTAL,
            storageKey: `antropometria/${alumnoPresencialId}/2026/f1.webp`,
          },
        ],
      };

      const registro = await antropometriaService.registrarCheckin(caller, dto);

      expect(registro.origen).toBe(OrigenAntropometria.PRESENCIAL_VERIFICADO);
      expect(registro.estado).toBe(EstadoMedicion.APROBADO);
      expect(registro.registradoPor).toBe(coachId);
      expect(registro.fechaAprobacionUtc).not.toBeNull();
      expect(registro.fotos.length).toBe(1);
    });

    it('debe registrar como pendiente de aprobación cuando lo envía el Alumno Remoto', async () => {
      const caller = { id: alumnoRemotoId, rol: Rol.ALUMNO };
      const dto = {
        alumnoId: alumnoRemotoId,
        fechaEvaluacion: '2026-09-06',
        pesoKg: '65.00',
        porcentajeGrasa: '22.00',
      };

      const registro = await antropometriaService.registrarCheckin(caller, dto);

      expect(registro.origen).toBe(OrigenAntropometria.REMOTO_AUTOREPORTE);
      expect(registro.estado).toBe(EstadoMedicion.PENDIENTE_APROBACION);
      expect(registro.registradoPor).toBe(alumnoRemotoId);
      expect(registro.fechaAprobacionUtc).toBeNull();
    });

    it('debe rechazar con 403 si el alumno presencial intenta registrarse medidas', async () => {
      const caller = { id: alumnoPresencialId, rol: Rol.ALUMNO };
      const dto = {
        alumnoId: alumnoPresencialId,
        fechaEvaluacion: '2026-09-06',
        pesoKg: '79.00',
      };

      await expect(antropometriaService.registrarCheckin(caller, dto)).rejects.toThrow(ForbiddenException);
    });

    it('acepta por el endpoint real (POST /antropometria/checkin, rol ALUMNO) el payload del formulario web sin fotos', async () => {
      // Payload del builder web (`construirPayloadCheckinAntropometrico`): alumnoId = usuarioId,
      // fechaEvaluacion local YYYY-MM-DD, medidas básicas y SIN fotos (la UX de subida no existe
      // todavía). Debe superar el contrato Zod y persistir como remoto pendiente de aprobación.
      const reqAlumno = { user: { sub: alumnoRemotoId, rol: Rol.ALUMNO } };
      const body = {
        alumnoId: alumnoRemotoId,
        fechaEvaluacion: '2026-09-20',
        pesoKg: '74.50',
        porcentajeGrasa: '14.80',
        perimetros: { cinturaCm: '81.00', brazoCm: '37.50' },
      };

      const registro = await antropometriaController.registrarCheckin(reqAlumno, body);

      expect(registro.alumnoId).toBe(alumnoRemotoId);
      expect(registro.fechaEvaluacion).toBe('2026-09-20');
      expect(registro.origen).toBe(OrigenAntropometria.REMOTO_AUTOREPORTE);
      expect(registro.estado).toBe(EstadoMedicion.PENDIENTE_APROBACION);
      expect(registro.registradoPor).toBe(alumnoRemotoId);
      expect(registro.fechaAprobacionUtc).toBeNull();
      expect(registro.perimetros?.cinturaCm).toBe('81.00');
      expect(registro.perimetros?.brazoCm).toBe('37.50');
      expect(registro.fotos.length).toBe(0);
    });

    it('rechaza el body legacy del check-in remoto sin alumnoId ni fechaEvaluacion (regresión del 400)', () => {
      const bodyLegacy = {
        pesoKg: '74.50',
        porcentajeGrasa: '14.80',
        perimetros: { cinturaCm: '81.00', brazoCm: '37.50' },
        fotos: [],
      };

      expect(CheckinAntropometricoSchema.safeParse(bodyLegacy).success).toBe(false);
    });
  });

  describe('conciliarControl', () => {
    let controlPendienteId: string;

    beforeEach(async () => {
      const control = await antropometriaService.registrarCheckin(
        { id: alumnoRemotoId, rol: Rol.ALUMNO },
        {
          alumnoId: alumnoRemotoId,
          fechaEvaluacion: '2026-09-06',
          pesoKg: '65.00',
        },
        'ctrl-pend-1'
      );
      controlPendienteId = control.id;
    });

    it('debe aprobar el control y estampar fechaAprobacionUtc', async () => {
      const res = await antropometriaService.conciliarControl(coachId, controlPendienteId, {
        accion: 'aprobar',
        observacionesCoach: 'Correcto',
      });

      expect(res.estado).toBe(EstadoMedicion.APROBADO);
      expect(res.fechaAprobacionUtc).not.toBeNull();
      expect(res.motivoRechazo).toBeNull();
    });

    it('debe rechazar el control guardando el motivo de rechazo', async () => {
      const res = await antropometriaService.conciliarControl(coachId, controlPendienteId, {
        accion: 'rechazar',
        motivoRechazo: 'Foto borrosa y peso incongruente',
      });

      expect(res.estado).toBe(EstadoMedicion.RECHAZADO);
      expect(res.motivoRechazo).toBe('Foto borrosa y peso incongruente');
      expect(res.fechaAprobacionUtc).toBeNull();
    });

    it('debe rechazar la conciliación de un coach de otro tenant', async () => {
      await expect(
        antropometriaService.conciliarControl(otherCoachId, controlPendienteId, {
          accion: 'aprobar',
        })
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('listarPendientes (WU20: nombre del alumno en la cola)', () => {
    it('expone alumnoNombre con nombres + apellidos del perfil', async () => {
      const control = await antropometriaService.registrarCheckin(
        { id: alumnoRemotoId, rol: Rol.ALUMNO },
        {
          alumnoId: alumnoRemotoId,
          fechaEvaluacion: '2026-09-18',
          pesoKg: '64.00',
        }
      );

      const pendientes = await antropometriaService.listarPendientes(coachId);

      expect(pendientes.items).toHaveLength(1);
      expect(pendientes.total).toBe(1);
      expect(pendientes.limit).toBe(25);
      expect(pendientes.offset).toBe(0);
      expect(pendientes.items[0].id).toBe(control.id);
      expect(pendientes.items[0].alumnoNombre).toBe('Laura Remota');
    });

    it('mantiene el aislamiento de tenant: un coach ajeno no ve la cola', async () => {
      await antropometriaService.registrarCheckin(
        { id: alumnoRemotoId, rol: Rol.ALUMNO },
        {
          alumnoId: alumnoRemotoId,
          fechaEvaluacion: '2026-09-18',
          pesoKg: '64.00',
        }
      );

      await expect(antropometriaService.listarPendientes(otherCoachId)).resolves.toEqual({
        items: [],
        total: 0,
        limit: 25,
        offset: 0,
      });
    });
  });

  // ===========================================================================
  // WU24b: PAGINACIÓN SERVER-SIDE (COLA DE PENDIENTES + EVOLUCIÓN)
  // ===========================================================================
  describe('WU24b: paginación server-side de antropometría', () => {
    it('pendientes: envelope con total real y paginación sin repetidos (fecha descendente)', async () => {
      await antropometriaService.registrarCheckin(
        { id: alumnoRemotoId, rol: Rol.ALUMNO },
        { alumnoId: alumnoRemotoId, fechaEvaluacion: '2026-09-10', pesoKg: '64.00' },
        '00000000-0000-4000-8000-000000000010'
      );
      await antropometriaService.registrarCheckin(
        { id: alumnoRemotoId, rol: Rol.ALUMNO },
        { alumnoId: alumnoRemotoId, fechaEvaluacion: '2026-09-11', pesoKg: '63.50' },
        '00000000-0000-4000-8000-000000000011'
      );
      await antropometriaService.registrarCheckin(
        { id: alumnoRemotoId, rol: Rol.ALUMNO },
        { alumnoId: alumnoRemotoId, fechaEvaluacion: '2026-09-12', pesoKg: '63.00' },
        '00000000-0000-4000-8000-000000000012'
      );

      const pagina1 = await antropometriaService.listarPendientes(coachId, 2, 0);
      const pagina2 = await antropometriaService.listarPendientes(coachId, 2, 2);

      expect(pagina1.total).toBe(3);
      expect(pagina1.limit).toBe(2);
      expect(pagina1.offset).toBe(0);
      expect(pagina1.items.map((c) => c.fechaEvaluacion)).toEqual(['2026-09-12', '2026-09-11']);
      expect(pagina2.total).toBe(3);
      expect(pagina2.items.map((c) => c.fechaEvaluacion)).toEqual(['2026-09-10']);

      const ids = [...pagina1.items, ...pagina2.items].map((c) => c.id);
      expect(new Set(ids).size).toBe(3);
    });

    it('evolucion: sin controlesLimit/controlesOffset devuelve la serie COMPLETA + controlesTotal', async () => {
      await antropometriaService.registrarCheckin(
        { id: coachId, rol: Rol.ENTRENADOR, entrenadorId: coachId },
        { alumnoId: alumnoRemotoId, fechaEvaluacion: '2026-01-01', pesoKg: '70.00' },
        '00000000-0000-4000-8000-000000000021'
      );
      await antropometriaService.registrarCheckin(
        { id: coachId, rol: Rol.ENTRENADOR, entrenadorId: coachId },
        { alumnoId: alumnoRemotoId, fechaEvaluacion: '2026-02-01', pesoKg: '68.00' },
        '00000000-0000-4000-8000-000000000022'
      );

      const evolucion = await antropometriaService.obtenerEvolucion(alumnoRemotoId, undefined, {
        id: alumnoRemotoId,
        rol: Rol.ALUMNO,
      });

      expect(evolucion.controlesTotal).toBe(2);
      expect(evolucion.totalEvaluaciones).toBe(2);
      expect(evolucion.evaluaciones.map((c) => c.fechaEvaluacion)).toEqual([
        '2026-01-01',
        '2026-02-01',
      ]);
    });

    it('evolucion: controlesLimit/controlesOffset devuelven el slice y el delta se calcula sobre la serie completa', async () => {
      await antropometriaService.registrarCheckin(
        { id: coachId, rol: Rol.ENTRENADOR, entrenadorId: coachId },
        {
          alumnoId: alumnoRemotoId,
          fechaEvaluacion: '2026-01-01',
          pesoKg: '70.00',
          porcentajeGrasa: '25.00',
        },
        '00000000-0000-4000-8000-000000000031'
      );
      await antropometriaService.registrarCheckin(
        { id: coachId, rol: Rol.ENTRENADOR, entrenadorId: coachId },
        {
          alumnoId: alumnoRemotoId,
          fechaEvaluacion: '2026-02-01',
          pesoKg: '68.00',
          porcentajeGrasa: '23.00',
        },
        '00000000-0000-4000-8000-000000000032'
      );
      await antropometriaService.registrarCheckin(
        { id: coachId, rol: Rol.ENTRENADOR, entrenadorId: coachId },
        {
          alumnoId: alumnoRemotoId,
          fechaEvaluacion: '2026-03-01',
          pesoKg: '66.50',
          porcentajeGrasa: '21.00',
        },
        '00000000-0000-4000-8000-000000000033'
      );

      const primeraPagina = await antropometriaService.obtenerEvolucion(
        alumnoRemotoId,
        { controlesLimit: 1 },
        { id: alumnoRemotoId, rol: Rol.ALUMNO }
      );
      expect(primeraPagina.controlesTotal).toBe(3);
      expect(primeraPagina.totalEvaluaciones).toBe(3);
      expect(primeraPagina.evaluaciones.map((c) => c.fechaEvaluacion)).toEqual(['2026-01-01']);
      expect(primeraPagina.cambioNetoPesoKg).toBe('-3.50');
      expect(primeraPagina.cambioNetoGrasaPorcentaje).toBe('-4.00');

      const segundaPagina = await antropometriaService.obtenerEvolucion(
        alumnoRemotoId,
        { controlesLimit: 1, controlesOffset: 2 },
        { id: alumnoRemotoId, rol: Rol.ALUMNO }
      );
      expect(segundaPagina.evaluaciones.map((c) => c.fechaEvaluacion)).toEqual(['2026-03-01']);
      // El delta no depende de la página: sigue siendo el de la serie completa.
      expect(segundaPagina.cambioNetoPesoKg).toBe('-3.50');
    });

    it('controller: pendientes aplica el techo de limit (100) y normaliza offset inválido a 0', async () => {
      const reqCoach = {
        user: { sub: coachId, rol: Rol.ENTRENADOR, entrenadorId: coachId },
      };

      const pendientes = await antropometriaController.listarPendientes(reqCoach, '500', '-4');

      expect(pendientes.limit).toBe(100);
      expect(pendientes.offset).toBe(0);
      expect(pendientes.total).toBe(0);
    });
  });

  describe('obtenerEvolucion y Comparador', () => {
    beforeEach(async () => {
      // 2 Controles Aprobados
      await antropometriaService.registrarCheckin(
        { id: coachId, rol: Rol.ENTRENADOR, entrenadorId: coachId },
        {
          alumnoId: alumnoRemotoId,
          fechaEvaluacion: '2026-01-01',
          pesoKg: '70.00',
          porcentajeGrasa: '25.00',
          fotos: [
            {
              angulo: AnguloFoto.FRONTAL,
              storageKey: `antropometria/${alumnoRemotoId}/2026/ctrl1-front.webp`,
            },
            {
              angulo: AnguloFoto.LATERAL,
              storageKey: `antropometria/${alumnoRemotoId}/2026/ctrl1-lat.webp`,
            },
          ],
        },
        '00000000-0000-0000-0000-000000000001'
      );

      await antropometriaService.registrarCheckin(
        { id: coachId, rol: Rol.ENTRENADOR, entrenadorId: coachId },
        {
          alumnoId: alumnoRemotoId,
          fechaEvaluacion: '2026-03-01',
          pesoKg: '66.50',
          porcentajeGrasa: '21.00',
          fotos: [
            {
              angulo: AnguloFoto.FRONTAL,
              storageKey: `antropometria/${alumnoRemotoId}/2026/ctrl2-front.webp`,
            },
          ],
        },
        '00000000-0000-0000-0000-000000000002'
      );

      // 1 Control Rechazado (no debe salir en la curva)
      const ctrlRech = await antropometriaService.registrarCheckin(
        { id: alumnoRemotoId, rol: Rol.ALUMNO },
        {
          alumnoId: alumnoRemotoId,
          fechaEvaluacion: '2026-02-01',
          pesoKg: '80.00',
        },
        '00000000-0000-0000-0000-000000000003'
      );
      await antropometriaService.conciliarControl(coachId, ctrlRech.id, {
        accion: 'rechazar',
        motivoRechazo: 'Datos no válidos',
      });
    });

    it('obtenerEvolucion debe retornar solo aprobados y calcular delta peso y grasa', async () => {
      const evolucion = await antropometriaService.obtenerEvolucion(alumnoRemotoId, undefined, {
        id: alumnoRemotoId,
        rol: Rol.ALUMNO,
      });

      expect(evolucion.totalEvaluaciones).toBe(2);
      expect(evolucion.cambioNetoPesoKg).toBe('-3.50');
      expect(evolucion.cambioNetoGrasaPorcentaje).toBe('-4.00');
    });

    it('obtenerComparativaFotografica debe comparar fotos y calcular diferencias', async () => {
      const comp = await antropometriaService.obtenerComparativaFotografica(
        alumnoRemotoId,
        {
          controlIdA: '00000000-0000-0000-0000-000000000001',
          controlIdB: '00000000-0000-0000-0000-000000000002',
          angulo: AnguloFoto.FRONTAL,
        },
        { id: alumnoRemotoId, rol: Rol.ALUMNO }
      );

      expect(comp.fotoDisponible).toBe(true);
      expect(comp.diferenciaPesoKg).toBe('-3.50');
      expect(comp.diferenciaGrasaPorcentaje).toBe('-4.00');
      expect(comp.fotoA?.presignedGetUrl).toContain('X-Amz-Expires=900');
      expect(comp.fotoB?.presignedGetUrl).toContain('X-Amz-Expires=900');
    });

    it('obtenerComparativaFotografica debe manejar foto faltante sin error 500', async () => {
      const comp = await antropometriaService.obtenerComparativaFotografica(
        alumnoRemotoId,
        {
          controlIdA: '00000000-0000-0000-0000-000000000001',
          controlIdB: '00000000-0000-0000-0000-000000000002',
          angulo: AnguloFoto.LATERAL,
        },
        { id: alumnoRemotoId, rol: Rol.ALUMNO }
      );

      expect(comp.fotoDisponible).toBe(false);
      expect(comp.fotoA).not.toBeNull();
      expect(comp.fotoB).toBeNull();
      expect(comp.diferenciaPesoKg).toBe('-3.50');
    });
  });

  describe('AntropometriaController', () => {
    it('debe ejecutar los endpoints del controlador llamando al servicio', async () => {
      const reqCoach = {
        user: { sub: coachId, rol: Rol.ENTRENADOR, entrenadorId: coachId },
      };

      // 1. solicitarPresignedUploadUrl
      const uploadRes = await antropometriaController.solicitarPresignedUploadUrl(reqCoach, {
        modulo: 'antropometria',
        alumnoId: alumnoRemotoId,
        angulo: AnguloFoto.FRONTAL,
        mimeType: 'image/webp',
      });
      expect(uploadRes.expiresInSeconds).toBe(900);

      // 2. registrarCheckin
      const checkinRes = await antropometriaController.registrarCheckin(reqCoach, {
        alumnoId: alumnoRemotoId,
        fechaEvaluacion: '2026-09-06',
        pesoKg: '68.00',
      });
      expect(checkinRes.estado).toBe(EstadoMedicion.APROBADO);

      // 3. obtenerControlPorId
      const detalle = await antropometriaController.obtenerControlPorId(reqCoach, checkinRes.id);
      expect(detalle.id).toBe(checkinRes.id);

      // 4. listarPendientes (WU24b: envelope paginado; el check-in del coach quedó APROBADO)
      const pendientes = await antropometriaController.listarPendientes(reqCoach);
      expect(pendientes.total).toBe(0);
      expect(pendientes.items).toEqual([]);

      // 5. obtenerEvolucion
      const evol = await antropometriaController.obtenerEvolucion(reqCoach, alumnoRemotoId, {});
      expect(evol.alumnoId).toBe(alumnoRemotoId);
    });
  });
});
