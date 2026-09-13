import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  Rol,
  EstadoAlumno,
  TipoDocumento,
  Modalidad,
  Moneda,
  MetodoPago,
  EstadoCuota,
  EstadoConciliacion,
  FiltroDirectorioAlumnosSchema,
  RestaurarAlumnoSchema,
  CobroDirectoInteligenteSchema,
  CobroDirectoSchema,
} from '@guachafit/shared';
import {
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { AlumnosController } from '../../src/modules/alumnos/alumnos.controller';
import { AlumnosService } from '../../src/modules/alumnos/alumnos.service';
import { FinanzasController } from '../../src/modules/finanzas/finanzas.controller';
import { FinanzasService } from '../../src/modules/finanzas/finanzas.service';
import { getTableName } from '@guachafit/database';

describe('Hardening QA: Alumnos, Expediente 360° y Cobro Directo Inteligente (Edge Cases & Resilience)', () => {
  // UUIDs válidos para los tests
  const COACH_A_ID = '11111111-1111-4111-8111-111111111111';
  const COACH_B_ID = '22222222-2222-4222-8222-222222222222';
  const ALUMNO_A1_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const ALUMNO_A1_PERFIL_ID = 'a1111111-1111-4111-8111-111111111111';
  const ALUMNO_A2_USER_ID = 'aaaaaaaa-bbbb-4aaa-8aaa-aaaaaaaaaaaa';
  const ALUMNO_A2_PERFIL_ID = 'a2222222-2222-4222-8222-222222222222';
  const ALUMNO_B1_USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const ALUMNO_B1_PERFIL_ID = 'b1111111-1111-4111-8111-111111111111';
  const PLAN_COACH_A_ID = '99999999-9999-4999-8999-999999999999';
  const NON_EXISTENT_UUID = '00000000-0000-4000-8000-000000000000';

  let mockUsuarios: any[];
  let mockPerfilesAlumno: any[];
  let mockPerfilesEntrenador: any[];
  let mockPlanesMembresia: any[];
  let mockOverridesClientePlan: any[];
  let mockCuotasMembresia: any[];
  let mockTransaccionesPago: any[];
  let mockTasasCambioReferencia: any[];

  let alumnosService: AlumnosService;
  let alumnosController: AlumnosController;
  let finanzasService: FinanzasService;
  let finanzasController: FinanzasController;

  const mockCryptoService = {
    encryptHealthRecord: vi.fn((val: string) => `ENCRYPTED:${val}`),
    decryptHealthRecord: vi.fn((val: string) =>
      val.startsWith('ENCRYPTED:') ? val.replace('ENCRYPTED:', '') : val
    ),
    generateInvitationToken: vi.fn(() => ({
      rawToken: 'token-raw-1234567890abcdef',
      tokenHash: 'token-hash-1234567890abcdef',
      expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
    })),
    hashPassword: vi.fn(async (p: string) => `hash-${p}`),
  } as any;

  function extractConditions(sqlObj: any): Array<{ column: string; value: any; op?: string }> {
    const conditions: Array<{ column: string; value: any; op?: string }> = [];
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
            .map((c: any) =>
              typeof c === 'string'
                ? c
                : Array.isArray(c?.value)
                ? c.value.join('')
                : typeof c?.value === 'string'
                ? c.value
                : ''
            )
            .join(' ');
          const isNe =
            opText.includes('<>') ||
            opText.includes('!=') ||
            opText.includes('distinct');
          const nextParam = subsequent.find(
            (c: any) => c && 'value' in c && !Array.isArray(c.value)
          );
          if (nextParam) {
            conditions.push({ column: chunk.name, value: nextParam.value, op: isNe ? 'ne' : 'eq' });
          }
        }
      }
    }

    if (sqlObj.queryChunks) {
      traverse(sqlObj.queryChunks);
    }
    return conditions;
  }

  function matchesField(record: any, condOrCol: any, valueParam?: any, opParam?: string): boolean {
    const col = typeof condOrCol === 'string' ? condOrCol : condOrCol?.column;
    const val = typeof condOrCol === 'string' ? valueParam : condOrCol?.value;
    const op = typeof condOrCol === 'string' ? opParam : condOrCol?.op;

    if (!col) return true;

    const key = record[col] !== undefined ? col : col.replace(/_([a-z])/g, (_: string, l: string) => l.toUpperCase());
    const recordVal = record[key];

    if (op === 'ne') {
      return recordVal !== val;
    }
    return recordVal === val;
  }

  function getTableArray(tableName: string): any[] {
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

  function createMockDb() {
    const db: any = {
      select: vi.fn((fieldsSelection?: any) => ({
        from: vi.fn((table: any) => {
          const tableName = table ? getTableName(table) : '';
          const baseData = getTableArray(tableName);
          let filtered = [...baseData];

          const queryObj: any = {
            innerJoin: vi.fn((joinTable: any) => queryObj),
            leftJoin: vi.fn((joinTable: any) => queryObj),
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
            for: vi.fn(() => queryObj),
            then: (resolve: any) => {
              if (tableName === 'perfiles_alumno' && fieldsSelection && typeof fieldsSelection === 'object') {
                const joined = filtered.map((p) => {
                  const u = mockUsuarios.find((user) => user.id === p.usuarioId);
                  return {
                    ...p,
                    email: u?.email || null,
                  };
                });
                return resolve(joined);
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
            const targetArray = getTableArray(tableName);
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
      execute: vi.fn().mockResolvedValue([]),
      transaction: vi.fn(async (cb: any) => cb(db)),
    };
    return db;
  }

  beforeEach(() => {
    mockUsuarios = [
      { id: COACH_A_ID, email: 'coach.a@guachafit.com', rol: Rol.ENTRENADOR, activo: true },
      { id: COACH_B_ID, email: 'coach.b@guachafit.com', rol: Rol.ENTRENADOR, activo: true },
      { id: ALUMNO_A1_USER_ID, email: 'alumno.a1@guachafit.com', rol: Rol.ALUMNO, activo: true },
      { id: ALUMNO_A2_USER_ID, email: 'alumno.a2@guachafit.com', rol: Rol.ALUMNO, activo: true },
      { id: ALUMNO_B1_USER_ID, email: 'alumno.b1@guachafit.com', rol: Rol.ALUMNO, activo: true },
    ];

    mockPerfilesEntrenador = [
      { id: 'perfil-coach-a', usuarioId: COACH_A_ID, nombres: 'Carlos', apellidos: 'Coach A', tasaCambioGlobal: '65.0000' },
      { id: 'perfil-coach-b', usuarioId: COACH_B_ID, nombres: 'Bruno', apellidos: 'Coach B', tasaCambioGlobal: '65.0000' },
    ];

    mockPerfilesAlumno = [
      {
        id: ALUMNO_A1_PERFIL_ID,
        usuarioId: ALUMNO_A1_USER_ID,
        entrenadorId: COACH_A_ID,
        tipoDocumento: TipoDocumento.V,
        numeroDocumento: '11111111',
        nombres: 'Alejandro',
        apellidos: 'Alvarez',
        fechaNacimiento: '1995-05-15',
        telefonoWhatsapp: '+584121111111',
        modalidad: Modalidad.PRESENCIAL,
        estadoActivacion: EstadoAlumno.ACTIVO,
        fichaSaludPrivada: 'ENCRYPTED:Asma controlada',
        deletedAtUtc: null,
      },
      {
        id: ALUMNO_A2_PERFIL_ID,
        usuarioId: ALUMNO_A2_USER_ID,
        entrenadorId: COACH_A_ID,
        tipoDocumento: TipoDocumento.V,
        numeroDocumento: '22222222',
        nombres: 'Andrea',
        apellidos: 'Acosta',
        fechaNacimiento: '1998-10-20',
        telefonoWhatsapp: '+584122222222',
        modalidad: Modalidad.REMOTO,
        estadoActivacion: EstadoAlumno.INACTIVO_PAUSADO,
        fichaSaludPrivada: null,
        deletedAtUtc: '2026-01-10T12:00:00.000Z',
      },
      {
        id: ALUMNO_B1_PERFIL_ID,
        usuarioId: ALUMNO_B1_USER_ID,
        entrenadorId: COACH_B_ID,
        tipoDocumento: TipoDocumento.V,
        numeroDocumento: '33333333',
        nombres: 'Beatriz',
        apellidos: 'Blanco',
        fechaNacimiento: '2000-01-01',
        telefonoWhatsapp: '+584123333333',
        modalidad: Modalidad.HIBRIDO,
        estadoActivacion: EstadoAlumno.ACTIVO,
        fichaSaludPrivada: null,
        deletedAtUtc: null,
      },
    ];

    mockPlanesMembresia = [
      {
        id: PLAN_COACH_A_ID,
        entrenadorId: COACH_A_ID,
        nombre: 'Plan Full Presencial',
        precioBaseUsd: '45.00',
        duracionMeses: 1,
        activo: true,
      },
    ];

    mockOverridesClientePlan = [];
    mockCuotasMembresia = [];
    mockTransaccionesPago = [];
    mockTasasCambioReferencia = [];

    const mockDb = createMockDb();
    alumnosService = new AlumnosService(mockDb, mockCryptoService);
    alumnosController = new AlumnosController(alumnosService);

    const mockNotificaciones = { despacharEvento: vi.fn().mockResolvedValue(undefined) } as any;
    const mockR2 = { getPresignedGetUrl: vi.fn().mockResolvedValue('https://r2.mock.url') } as any;
    finanzasService = new FinanzasService(mockDb, mockNotificaciones, mockR2);
    finanzasController = new FinanzasController(finanzasService);
  });

  // ===========================================================================
  // SECCIÓN 1: Directorio y Búsqueda de Alumnos (GET /alumnos)
  // ===========================================================================
  describe('1. Directorio y Búsqueda de Alumnos (GET /alumnos & FiltroDirectorioAlumnosSchema)', () => {
    it('1.1 debe rechazar búsquedas con longitudes extremas (>200 caracteres) con error 400 Zod', () => {
      const longQuery = 'A'.repeat(501);
      expect(() =>
        FiltroDirectorioAlumnosSchema.parse({ busqueda: longQuery })
      ).toThrow();
    });

    it('1.2 debe procesar cadenas con inyección SQL o XSS sin romper ni ejecutar scripts', async () => {
      const maliciousSearch = "<script>alert('xss')</script>' OR '1'='1";
      const parsed = FiltroDirectorioAlumnosSchema.parse({ busqueda: maliciousSearch });
      expect(parsed.busqueda).toBe(maliciousSearch);

      // Ejecutar en el servicio: debe filtrar sin excepción 500 y retornar 0 resultados
      const req = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };
      const resultados = await alumnosController.listarAlumnos(req, parsed);
      expect(Array.isArray(resultados)).toBe(true);
      expect(resultados.length).toBe(0);
    });

    it('1.3 debe rechazar filtros de estado inválidos (ej. estado=HACKER) con error de validación', () => {
      expect(() =>
        FiltroDirectorioAlumnosSchema.parse({ estado: 'HACKER' })
      ).toThrow();
    });

    it('1.4 debe rechazar filtros de modalidad inválidos (ej. modalidad=TELEPATICO)', () => {
      expect(() =>
        FiltroDirectorioAlumnosSchema.parse({ modalidad: 'TELEPATICO' })
      ).toThrow();
    });

    it('1.5 debe coercer correctamente incluirArchivados válidos y rechazar valores no booleanos', () => {
      // Coerción válida
      expect(FiltroDirectorioAlumnosSchema.parse({ incluirArchivados: true }).incluirArchivados).toBe(true);
      expect(FiltroDirectorioAlumnosSchema.parse({ incluirArchivados: 'true' }).incluirArchivados).toBe(true);
      expect(FiltroDirectorioAlumnosSchema.parse({ incluirArchivados: '1' }).incluirArchivados).toBe(true);
      expect(FiltroDirectorioAlumnosSchema.parse({ incluirArchivados: false }).incluirArchivados).toBe(false);
      expect(FiltroDirectorioAlumnosSchema.parse({ incluirArchivados: 'false' }).incluirArchivados).toBe(false);
      expect(FiltroDirectorioAlumnosSchema.parse({ incluirArchivados: '0' }).incluirArchivados).toBe(false);

      // Valores basura deben fallar Zod
      expect(() =>
        FiltroDirectorioAlumnosSchema.parse({ incluirArchivados: 'not_a_boolean' })
      ).toThrow();
      expect(() =>
        FiltroDirectorioAlumnosSchema.parse({ incluirArchivados: 'hacker' })
      ).toThrow();
    });

    it('1.6 debe validar límites y offsets numéricos (rechazar negativos y disparatados)', () => {
      expect(() => FiltroDirectorioAlumnosSchema.parse({ limit: -5 })).toThrow();
      expect(() => FiltroDirectorioAlumnosSchema.parse({ limit: 0 })).toThrow();
      expect(() => FiltroDirectorioAlumnosSchema.parse({ limit: 500 })).toThrow();
      expect(() => FiltroDirectorioAlumnosSchema.parse({ offset: -1 })).toThrow();

      // Válidos coercidos
      const valid = FiltroDirectorioAlumnosSchema.parse({ limit: '20', offset: '5' });
      expect(valid.limit).toBe(20);
      expect(valid.offset).toBe(5);
    });

    it('1.7 Aislamiento Multi-inquilino: Entrenador A jamás debe ver los alumnos del Entrenador B', async () => {
      const reqCoachA = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };
      const reqCoachB = { user: { sub: COACH_B_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_B_ID } };

      const alumnosCoachA = await alumnosController.listarAlumnos(reqCoachA, {});
      const alumnosCoachB = await alumnosController.listarAlumnos(reqCoachB, {});

      // Coach A ve únicamente a Alejandro (y no a Andrea que está archivada por defecto)
      expect(alumnosCoachA.every((a) => a.entrenadorId === COACH_A_ID)).toBe(true);
      expect(alumnosCoachA.some((a) => a.id === ALUMNO_B1_PERFIL_ID)).toBe(false);

      // Coach B ve únicamente a Beatriz
      expect(alumnosCoachB.every((a) => a.entrenadorId === COACH_B_ID)).toBe(true);
      expect(alumnosCoachB.some((a) => a.id === ALUMNO_A1_PERFIL_ID)).toBe(false);
    });
  });

  // ===========================================================================
  // SECCIÓN 2: Ciclo de Vida y Restauración (PATCH /alumnos/:id/restaurar)
  // ===========================================================================
  describe('2. Ciclo de Vida y Restauración (PATCH /alumnos/:id/restaurar & RestaurarAlumnoSchema)', () => {
    it('2.1 debe arrojar BadRequestException (400) ante un ID malformado (no UUID)', async () => {
      const req = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };
      await expect(
        alumnosController.restaurarAlumno(req, '123-abc-no-uuid', {})
      ).rejects.toThrow(BadRequestException);
    });

    it('2.2 debe arrojar NotFoundException (404) ante un UUID inexistente', async () => {
      const req = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };
      await expect(
        alumnosController.restaurarAlumno(req, NON_EXISTENT_UUID, {})
      ).rejects.toThrow(NotFoundException);
    });

    it('2.3 debe arrojar ForbiddenException (403) si un entrenador intenta restaurar un alumno ajeno', async () => {
      // Coach A intenta restaurar a Beatriz (pertenece a Coach B)
      const reqCoachA = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };
      await expect(
        alumnosController.restaurarAlumno(reqCoachA, ALUMNO_B1_PERFIL_ID, {})
      ).rejects.toThrow(ForbiddenException);
    });

    it('2.4 debe ser idempotente al restaurar un alumno que ya está activo', async () => {
      const req = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };
      const res = await alumnosController.restaurarAlumno(req, ALUMNO_A1_PERFIL_ID, {
        motivo: 'Intento de restauración duplicada',
      });

      expect(res.id).toBe(ALUMNO_A1_PERFIL_ID);
      expect(res.estadoActivacion).toBe(EstadoAlumno.ACTIVO);
      expect(res.mensaje).toContain('ya se encuentra activo');
    });

    it('2.5 debe restaurar exitosamente un alumno archivado y limpiar deletedAtUtc', async () => {
      const req = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };
      const res = await alumnosController.restaurarAlumno(req, ALUMNO_A2_PERFIL_ID, {
        motivo: 'Regreso de viaje de estudios',
      });

      expect(res.id).toBe(ALUMNO_A2_PERFIL_ID);
      expect(res.estadoActivacion).toBe(EstadoAlumno.ACTIVO);
      expect(res.deletedAtUtc).toBeNull();
      expect(res.mensaje).toContain('restaurado exitosamente');
    });

    it('2.6 debe validar RestaurarAlumnoSchema: motivos vacíos aceptados, motivos gigantescos (5000+ chars) rechazados', () => {
      // Vacío o undefined es válido
      expect(RestaurarAlumnoSchema.parse({}).motivo).toBeUndefined();
      expect(RestaurarAlumnoSchema.parse({ motivo: '' }).motivo).toBe('');
      expect(RestaurarAlumnoSchema.parse({ motivo: '  Regreso  ' }).motivo).toBe('Regreso');

      // 5000+ caracteres rechazado con ZodError
      expect(() =>
        RestaurarAlumnoSchema.parse({ motivo: 'X'.repeat(5001) })
      ).toThrow();
    });
  });

  // ===========================================================================
  // SECCIÓN 3: Expediente 360° y Consulta de Alumno (GET /alumnos/:id)
  // ===========================================================================
  describe('3. Expediente 360° y Consulta de Alumno (GET /alumnos/:id)', () => {
    it('3.1 debe rechazar IDs no UUID con BadRequestException (400)', async () => {
      const req = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };
      await expect(
        alumnosController.obtenerPorId(req, 'not-a-uuid')
      ).rejects.toThrow(BadRequestException);
    });

    it('3.2 debe arrojar NotFoundException ante un UUID que no existe', async () => {
      const req = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };
      await expect(
        alumnosController.obtenerPorId(req, NON_EXISTENT_UUID)
      ).rejects.toThrow(NotFoundException);
    });

    it('3.3 Aislamiento Tenant: Entrenador no puede consultar el expediente de un alumno ajeno', async () => {
      const reqCoachA = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };
      await expect(
        alumnosController.obtenerPorId(reqCoachA, ALUMNO_B1_PERFIL_ID)
      ).rejects.toThrow(ForbiddenException);
    });

    it('3.4 Protección de Ficha Médica: Alumno no puede ver la ficha de salud privada pero el coach sí', async () => {
      const reqCoach = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };
      const reqAlumno = { user: { sub: ALUMNO_A1_USER_ID, rol: Rol.ALUMNO, entrenadorId: COACH_A_ID } };

      const perfilParaCoach = await alumnosController.obtenerPorId(reqCoach, ALUMNO_A1_PERFIL_ID);
      expect(perfilParaCoach.fichaSaludPrivada).toBe('Asma controlada');

      const perfilParaAlumno = await alumnosController.obtenerPorId(reqAlumno, ALUMNO_A1_PERFIL_ID);
      expect(perfilParaAlumno.fichaSaludPrivada).toBeNull();
    });
  });

  // ===========================================================================
  // SECCIÓN 4: Cobro Directo Inteligente e Historial Financiero
  // ===========================================================================
  describe('4. Cobro Directo Inteligente e Historial Financiero', () => {
    describe('4.1 Validación de Esquema CobroDirectoInteligenteSchema', () => {
      it('debe rechazar montos negativos (-20.00)', () => {
        expect(() =>
          CobroDirectoInteligenteSchema.parse({
            montoOriginal: '-20.00',
            monedaOriginal: Moneda.USD,
          })
        ).toThrow();
      });

      it('debe rechazar montos en cero (0.00)', () => {
        expect(() =>
          CobroDirectoInteligenteSchema.parse({
            montoOriginal: '0.00',
            monedaOriginal: Moneda.USD,
          })
        ).toThrow();
      });

      it('debe rechazar montos no numéricos ("gratis")', () => {
        expect(() =>
          CobroDirectoInteligenteSchema.parse({
            montoOriginal: 'gratis',
            monedaOriginal: Moneda.USD,
          })
        ).toThrow();
      });

      it('debe rechazar montos disparatados (>100,000)', () => {
        expect(() =>
          CobroDirectoInteligenteSchema.parse({
            montoOriginal: '999999.00',
            monedaOriginal: Moneda.USD,
          })
        ).toThrow();
      });

      it('debe rechazar métodos de pago inexistentes ("BITCOIN_FALSO")', () => {
        expect(() =>
          CobroDirectoInteligenteSchema.parse({
            montoOriginal: '40.00',
            monedaOriginal: Moneda.USD,
            metodoPago: 'BITCOIN_FALSO',
          })
        ).toThrow();
      });

      it('debe aceptar payload válido con valores por defecto', () => {
        const parsed = CobroDirectoInteligenteSchema.parse({
          montoOriginal: '50.00',
          monedaOriginal: Moneda.USD,
        });
        expect(parsed.montoOriginal).toBe('50.00');
        expect(parsed.metodoPago).toBe(MetodoPago.EFECTIVO_USD);
        expect(parsed.fechaOperacion).toBeDefined();
      });
    });

    describe('4.2 Endpoints Financieros: Edge Cases & Seguridad', () => {
      beforeEach(() => {
        mockOverridesClientePlan = [];
        mockCuotasMembresia = [];
        mockTransaccionesPago = [];
      });

      it('debe arrojar BadRequestException (400) si el clienteId en el endpoint es no-UUID', async () => {
        const req = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };

        await expect(
          finanzasController.obtenerHistorialCliente(req, 'invalido-no-uuid')
        ).rejects.toThrow(BadRequestException);

        await expect(
          finanzasController.cobroDirectoInteligente(req, 'invalido-no-uuid', {
            montoOriginal: '40.00',
            monedaOriginal: Moneda.USD,
          })
        ).rejects.toThrow(BadRequestException);
      });

      it('debe arrojar NotFoundException (404) si el alumno no existe', async () => {
        const req = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };

        await expect(
          finanzasController.obtenerHistorialCliente(req, NON_EXISTENT_UUID)
        ).rejects.toThrow(NotFoundException);

        await expect(
          finanzasController.cobroDirectoInteligente(req, NON_EXISTENT_UUID, {
            montoOriginal: '40.00',
            monedaOriginal: Moneda.USD,
          })
        ).rejects.toThrow(NotFoundException);
      });

      it('Aislamiento Multi-inquilino: Entrenador no puede consultar ni cobrar a alumno de otro entrenador', async () => {
        const reqCoachA = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };

        // Coach A intentando acceder a Beatriz (Coach B)
        await expect(
          finanzasController.obtenerHistorialCliente(reqCoachA, ALUMNO_B1_PERFIL_ID)
        ).rejects.toThrow(ForbiddenException);

        await expect(
          finanzasController.cobroDirectoInteligente(reqCoachA, ALUMNO_B1_PERFIL_ID, {
            montoOriginal: '45.00',
            monedaOriginal: Moneda.USD,
          })
        ).rejects.toThrow(ForbiddenException);
      });

      it('debe arrojar BadRequestException (400) si el alumno no tiene cuota abierta previa ni plan asignado', async () => {
        const req = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };

        // Alejandro no tiene cuotas emitidas ni override en overridesClientePlan
        await expect(
          finanzasController.cobroDirectoInteligente(req, ALUMNO_A1_PERFIL_ID, {
            montoOriginal: '45.00',
            monedaOriginal: Moneda.USD,
          })
        ).rejects.toThrow(BadRequestException);
      });

      it('debe rechazar métodos no en efectivo en cobro directo en sala', async () => {
        const req = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };

        await expect(
          finanzasController.cobroDirectoInteligente(req, ALUMNO_A1_PERFIL_ID, {
            montoOriginal: '45.00',
            monedaOriginal: Moneda.USD,
            metodoPago: MetodoPago.PAGO_MOVIL,
          })
        ).rejects.toThrow(BadRequestException);
      });

      it('Historial de cliente nuevo sin transacciones debe retornar arrays vacíos estructurados sin romper', async () => {
        const req = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };

        const historial = await finanzasController.obtenerHistorialCliente(req, ALUMNO_A1_PERFIL_ID);

        expect(historial.alumnoId).toBe(ALUMNO_A1_PERFIL_ID);
        expect(historial.usuarioId).toBe(ALUMNO_A1_USER_ID);
        expect(historial.saldoPendienteTotalUsd).toBe('0.00');
        expect(historial.totalPagadoHistoricoUsd).toBe('0.00');
        expect(historial.totalPagadoMesActualUsd).toBe('0.00');
        expect(historial.cuotaMesActual).toBeNull();
        expect(Array.isArray(historial.transacciones)).toBe(true);
        expect(historial.transacciones.length).toBe(0);
      });

      it('debe ejecutar exitosamente el cobro directo inteligente cuando el alumno tiene un plan asignado (override)', async () => {
        // Asignar plan al alumno mediante override
        mockOverridesClientePlan.push({
          id: 'override-1',
          planId: PLAN_COACH_A_ID,
          clienteId: ALUMNO_A1_USER_ID,
          precioAcordadoUsd: '45.00',
        });

        const req = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };

        const resultado = await finanzasController.cobroDirectoInteligente(req, ALUMNO_A1_PERFIL_ID, {
          montoOriginal: '45.00',
          monedaOriginal: Moneda.USD,
          metodoPago: MetodoPago.EFECTIVO_USD,
          notas: 'Cobro directo presencial primer mes',
        });

        expect(resultado.transaccion).toBeDefined();
        expect(resultado.transaccion.montoOriginal).toBe('45.00');
        expect(resultado.transaccion.estadoConciliacion).toBe(EstadoConciliacion.APROBADO);
        expect(resultado.cuota).toBeDefined();
        expect(resultado.cuota.estado).toBe(EstadoCuota.AL_DIA);
        expect(resultado.cuota.saldoPendienteUsd).toBe('0.00');
      });

      it('debe liquidar directamente una cuota abierta existente cuando el alumno ya tiene deuda pendiente', async () => {
        // Crear una cuota emitida existente para Alejandro
        const cuotaExistenteId = 'cuota-existente-1';
        mockCuotasMembresia.push({
          id: cuotaExistenteId,
          clienteId: ALUMNO_A1_USER_ID,
          entrenadorId: COACH_A_ID,
          planId: PLAN_COACH_A_ID,
          periodo: '2026-09',
          montoTotalUsd: '45.00',
          montoAbonadoUsd: '0.00',
          saldoPendienteUsd: '45.00',
          fechaEmisionUtc: new Date(),
          fechaCorteUtc: new Date(Date.now() + 15 * 24 * 3600 * 1000),
          estado: EstadoCuota.EMITIDA,
        });

        const req = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };

        const resultado = await finanzasController.cobroDirectoInteligente(req, ALUMNO_A1_PERFIL_ID, {
          montoOriginal: '45.00',
          monedaOriginal: Moneda.USD,
          metodoPago: MetodoPago.EFECTIVO_USD,
        });

        expect(resultado.cuota.id).toBe(cuotaExistenteId);
        expect(resultado.cuota.estado).toBe(EstadoCuota.AL_DIA);
        expect(resultado.cuota.saldoPendienteUsd).toBe('0.00');
        expect(resultado.transaccion.estadoConciliacion).toBe(EstadoConciliacion.APROBADO);
      });
    });
  });
});
