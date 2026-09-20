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

  function extractConditions(sqlObj: any): Array<{ column: string; value: any; isIn?: boolean; isNull?: boolean }> {
    const conditions: Array<{ column: string; value: any; isIn?: boolean; isNull?: boolean }> = [];
    if (!sqlObj) return conditions;

    function traverse(chunks: any[]) {
      if (!Array.isArray(chunks)) return;
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (chunk && chunk.queryChunks) {
          traverse(chunk.queryChunks);
        } else if (chunk && typeof chunk.name === 'string') {
          const subsequent = chunks.slice(i + 1);
          const hasIn = subsequent.some(
            (c: any) =>
              c &&
              Array.isArray(c.value) &&
              typeof c.value[0] === 'string' &&
              c.value[0].includes('in')
          );
          const hasNull = subsequent.some(
            (c: any) =>
              c &&
              Array.isArray(c.value) &&
              typeof c.value[0] === 'string' &&
              c.value[0].includes('null')
          );

          const params = subsequent.flatMap(getParamsFrom);

          if (hasNull && params.length === 0) {
            conditions.push({ column: chunk.name, value: null, isNull: true });
          } else if (params.length > 1 || hasIn) {
            conditions.push({ column: chunk.name, value: params, isIn: true });
          } else if (params.length === 1) {
            conditions.push({ column: chunk.name, value: params[0] });
          }
        }
      }
    }

    if (sqlObj.queryChunks) {
      traverse(sqlObj.queryChunks);
    }
    return conditions;
  }

  function matchesField(record: any, cond: { column: string; value: any; isIn?: boolean; isNull?: boolean }): boolean {
    const colVal =
      record[cond.column] !== undefined
        ? record[cond.column]
        : record[cond.column.replace(/_([a-z])/g, (_, l) => l.toUpperCase())];

    if (cond.isNull) {
      return colVal === null || colVal === undefined;
    }
    if (cond.isIn && Array.isArray(cond.value)) {
      return cond.value.includes(colVal);
    }
    return colVal === cond.value;
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
            orderBy: vi.fn(() => queryObj),
            limit: vi.fn((count: number) => {
              filtered = filtered.slice(0, count);
              return queryObj;
            }),
            then: (resolve: any) => {
              if (fields && typeof fields === 'object' && Object.keys(fields).length > 0) {
                const mapped = filtered.map((item) => {
                  const res: any = {};
                  for (const key of Object.keys(fields)) {
                    res[key] = item[key] !== undefined ? item[key] : item.usuarioId;
                  }
                  return res;
                });
                return resolve(mapped);
              }
              return resolve([...filtered]);
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
      ).rejects.toThrow(/modalidad presencial tienen permisos de solo lectura/i);
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

      expect(pendientes).toHaveLength(1);
      expect(pendientes[0].id).toBe(control.id);
      expect(pendientes[0].alumnoNombre).toBe('Laura Remota');
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

      await expect(antropometriaService.listarPendientes(otherCoachId)).resolves.toEqual([]);
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

      // 4. listarPendientes
      const pendientes = await antropometriaController.listarPendientes(reqCoach);
      expect(Array.isArray(pendientes)).toBe(true);

      // 5. obtenerEvolucion
      const evol = await antropometriaController.obtenerEvolucion(reqCoach, alumnoRemotoId, {});
      expect(evol.alumnoId).toBe(alumnoRemotoId);
    });
  });
});
