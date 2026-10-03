import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PlantillasService } from '../../src/modules/entrenamiento/plantillas.service';
import { EntrenamientoService } from '../../src/modules/entrenamiento/entrenamiento.service';
import {
  Rol,
  EstadoAlumno,
  NivelObjetivoPlantilla,
  ModoAsignacionPlantilla,
  BloqueDiaRutinaDTO,
} from '@guachafit/shared';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getTableName } from '@guachafit/database';

describe('RF-017: Banco de Plantillas de Rutina y Prescripción Reutilizable', () => {
  let plantillasService: PlantillasService;
  let entrenamientoService: EntrenamientoService;
  let mockDb: any;
  /** RNF-003/ADR-009: passthrough del envoltorio transaccional RLS para el mock. */
  let withTenantMock: any;

  // In-memory data store for the mock database
  let mockPlantillasRutina: any[];
  let mockRutinas: any[];
  let mockPerfilesAlumno: any[];
  let mockEjerciciosCatalogo: any[];
  let mockUsuarios: any[];

  // ---------------------------------------------------------------------------
  // Harness de mock Drizzle (mismo patrón que entrenamiento-service.spec.ts)
  // ---------------------------------------------------------------------------

  function isSqlSyntaxChunk(c: any): boolean {
    if (!c || !('value' in c)) return true;
    if (Array.isArray(c.value) && typeof c.value[0] === 'string') {
      const val = c.value[0].toLowerCase().trim();
      if (val === '') return true;
      if (
        /^[=><\s,()]+$/.test(val) ||
        val.includes('in') ||
        val.includes('and') ||
        val.includes('or') ||
        val.includes('null') ||
        val.includes(',')
      ) {
        return true;
      }
    }
    return false;
  }

  function getParamsFrom(item: any): any[] {
    if (!item) return [];
    if (Array.isArray(item)) return item.flatMap(getParamsFrom);
    if (item.queryChunks && Array.isArray(item.queryChunks)) {
      return item.queryChunks.flatMap(getParamsFrom);
    }
    if ('value' in item && item.value !== undefined && !isSqlSyntaxChunk(item)) {
      return Array.isArray(item.value) ? item.value : [item.value];
    }
    return [];
  }

  type OperadorSql = '>=' | '<=' | '>' | '<' | '=' | '<>' | 'in' | 'is null' | 'is not null';

  function detectarOperador(chunks: any[]): OperadorSql | undefined {
    const tokens = chunks
      .filter((c) => c && Array.isArray(c.value))
      .flatMap((c) => c.value)
      .filter((v: any) => typeof v === 'string')
      .map((v: string) => v.trim().toLowerCase());
    return tokens.find((t: string) =>
      ['>=', '<=', '>', '<', '=', '<>', 'in', 'is null', 'is not null'].includes(t)
    ) as OperadorSql | undefined;
  }

  function compararValores(a: any, b: any): number {
    const normalizar = (v: any): any => {
      if (v instanceof Date) return v.getTime();
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return new Date(v).getTime();
      return v;
    };
    const va = normalizar(a);
    const vb = normalizar(b);
    if (typeof va === 'number' && typeof vb === 'number') return va - vb;
    return va < vb ? -1 : va > vb ? 1 : 0;
  }

  function extractConditions(sqlObj: any): Array<{
    column: string;
    value: any;
    op?: OperadorSql;
    isIn?: boolean;
    isNull?: boolean;
    isNotNull?: boolean;
  }> {
    const conditions: Array<{
      column: string;
      value: any;
      op?: OperadorSql;
      isIn?: boolean;
      isNull?: boolean;
      isNotNull?: boolean;
    }> = [];
    if (!sqlObj) return conditions;

    function traverse(chunks: any[]) {
      if (!Array.isArray(chunks)) return;
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (chunk && chunk.queryChunks) {
          traverse(chunk.queryChunks);
        } else if (chunk && typeof chunk.name === 'string') {
          const subsequent = chunks.slice(i + 1);
          const op = detectarOperador(subsequent);
          const hasIn = op === 'in';
          const hasNull = op === 'is null';
          const hasNotNull = op === 'is not null';

          const params = subsequent.flatMap(getParamsFrom);

          if (hasNull) {
            conditions.push({ column: chunk.name, value: null, op, isNull: true });
          } else if (hasNotNull) {
            conditions.push({ column: chunk.name, value: null, op, isNotNull: true });
          } else if (hasIn || params.length > 1) {
            conditions.push({ column: chunk.name, value: params, op, isIn: true });
          } else if (params.length === 1) {
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

  function matchesField(
    record: any,
    cond: {
      column: string;
      value: any;
      op?: OperadorSql;
      isIn?: boolean;
      isNull?: boolean;
      isNotNull?: boolean;
    }
  ): boolean {
    const colVal =
      record[cond.column] !== undefined
        ? record[cond.column]
        : record[cond.column.replace(/_([a-z])/g, (_, l) => l.toUpperCase())];

    if (cond.isNull) {
      return colVal === null || colVal === undefined;
    }
    if (cond.isNotNull) {
      return colVal !== null && colVal !== undefined;
    }
    if (cond.isIn && Array.isArray(cond.value)) {
      return cond.value.includes(colVal);
    }

    switch (cond.op) {
      case '>=':
        return compararValores(colVal, cond.value) >= 0;
      case '<=':
        return compararValores(colVal, cond.value) <= 0;
      case '>':
        return compararValores(colVal, cond.value) > 0;
      case '<':
        return compararValores(colVal, cond.value) < 0;
      case '<>':
        return colVal !== cond.value;
      default:
        return colVal === cond.value;
    }
  }

  function normalizeRecord(item: any): any {
    if (!item) return item;
    if (!item.createdAtUtc) item.createdAtUtc = new Date();
    if (!item.updatedAtUtc) item.updatedAtUtc = new Date();
    return item;
  }

  function getTableArray(tableName: string): any[] {
    if (tableName === 'plantillas_rutina') return mockPlantillasRutina;
    if (tableName === 'rutinas') return mockRutinas;
    if (tableName === 'perfiles_alumno') return mockPerfilesAlumno;
    if (tableName === 'ejercicios_catalogo') return mockEjerciciosCatalogo;
    if (tableName === 'usuarios') return mockUsuarios;
    return [];
  }

  function createMockDb() {
    const db: any = {
      select: vi.fn(() => ({
        from: vi.fn((table: any) => {
          const tableName = table ? getTableName(table) : '';
          const baseData = getTableArray(tableName);
          let filtered = baseData.map(normalizeRecord);

          const queryObj: any = {
            where: vi.fn((predicate: any) => {
              const conditions = extractConditions(predicate);
              if (conditions.length > 0) {
                const conditionsByCol = new Map<string, any[]>();
                for (const cond of conditions) {
                  if (!conditionsByCol.has(cond.column)) {
                    conditionsByCol.set(cond.column, []);
                  }
                  conditionsByCol.get(cond.column)!.push(cond);
                }

                filtered = filtered.filter((item) => {
                  for (const [_, colConds] of conditionsByCol.entries()) {
                    const esRango = (op?: OperadorSql) =>
                      op === '>=' || op === '<=' || op === '>' || op === '<';
                    const colMatches = colConds.some((cond) => esRango(cond.op))
                      ? colConds.every((cond) => matchesField(item, cond))
                      : colConds.some((cond) => matchesField(item, cond));
                    if (!colMatches) return false;
                  }
                  return true;
                });
              }
              return queryObj;
            }),
            orderBy: vi.fn(() => queryObj),
            limit: vi.fn((count: number) => {
              filtered = filtered.slice(0, count);
              return queryObj;
            }),
            then: (resolve: any) => resolve([...filtered]),
          };

          return queryObj;
        }),
      })),
      insert: vi.fn((table: any) => ({
        values: vi.fn((vals: any) => {
          const tableName = table ? getTableName(table) : '';
          const targetArray = getTableArray(tableName);
          const registros = Array.isArray(vals) ? vals : [vals];

          const creados = registros.map((v) => {
            const record = {
              id: v.id || randomUUID(),
              ...v,
              createdAtUtc: v.createdAtUtc || new Date(),
              updatedAtUtc: v.updatedAtUtc || new Date(),
            };
            targetArray.push(record);
            return record;
          });

          return {
            returning: vi.fn().mockResolvedValue(creados),
            then: (resolve: any) => resolve(creados),
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
                conditions.length === 0 || conditions.every((cond) => matchesField(item, cond));

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
      transaction: vi.fn(async (cb: any) => cb(db)),
    };
    return db;
  }

  // ---------------------------------------------------------------------------
  // Fixtures
  // ---------------------------------------------------------------------------

  const coach1 = 'c1111111-1111-4111-8111-111111111111';
  const coach2 = 'c2222222-2222-4222-8222-222222222222';
  const alumnoUsuario1 = 'a1111111-1111-4111-8111-111111111111';
  const alumnoUsuario2 = 'a2222222-2222-4222-8222-222222222222';
  const alumnoUsuario3 = 'a3333333-3333-4333-8333-333333333333';
  const alumnoInexistente = 'a9999999-9999-4999-8999-999999999999';
  const ejercicioGlobal = 'e1111111-1111-4111-8111-111111111111';
  const ejercicioCoach1 = 'e2222222-2222-4222-8222-222222222222';
  const ejercicioCoach2 = 'e3333333-3333-4333-8333-333333333333';

  function bloqueFixture(
    diaId: string,
    titulo: string,
    ejercicios: Array<{
      ejercicioId?: string;
      nombre: string;
      series: number;
      reps: string;
      peso?: string;
      rpe?: string;
      descansoSegundos?: number;
      notas?: string;
    }>
  ): BloqueDiaRutinaDTO {
    return {
      diaId,
      titulo,
      enfoque: 'Fixture',
      diaSugerido: 1,
      ejercicios: ejercicios.map((e) => ({ ...e, peso: e.peso ?? '' })),
    };
  }

  function plantillaFixtureBloques(): BloqueDiaRutinaDTO[] {
    return [
      bloqueFixture('d1', 'Día 1: Empuje', [
        {
          ejercicioId: ejercicioGlobal,
          nombre: 'Press de Banca Plano con Barra',
          series: 4,
          reps: '8-10',
          peso: '70.00',
          rpe: '8.0',
          descansoSegundos: 90,
          notas: 'Escápulas retraídas.',
        },
        {
          ejercicioId: ejercicioCoach1,
          nombre: 'Press Militar con Mancuernas',
          series: 3,
          reps: '10-12',
          peso: '24.00',
          rpe: '8.5',
          descansoSegundos: 90,
        },
      ]),
      bloqueFixture('d2', 'Día 2: Tracción', [
        {
          ejercicioId: ejercicioGlobal,
          nombre: 'Remo con Barra Prono',
          series: 4,
          reps: '8-10',
          peso: '60.00',
          rpe: '8.5',
          descansoSegundos: 90,
        },
      ]),
    ];
  }

  async function crearPlantillaCoach1(nombre = 'Pierna Énfasis Isquios') {
    return plantillasService.crearPlantilla(coach1, {
      nombre,
      nivelObjetivo: NivelObjetivoPlantilla.INTERMEDIO,
      bloques: plantillaFixtureBloques(),
    });
  }

  function crearRutinaActiva(alumnoUsuarioId: string) {
    const rutina = {
      id: randomUUID(),
      alumnoId: alumnoUsuarioId,
      entrenadorId: coach1,
      nombre: 'Planificación previa',
      bloques: [
        bloqueFixture('previo-d1', 'Día previo', [
          { ejercicioId: ejercicioGlobal, nombre: 'Sentadilla', series: 3, reps: '10', peso: '50.00' },
        ]),
      ],
      activa: true,
      createdAtUtc: new Date('2026-09-01T10:00:00Z'),
      updatedAtUtc: new Date('2026-09-01T10:00:00Z'),
    };
    mockRutinas.push(rutina);
    return rutina;
  }

  beforeEach(() => {
    mockUsuarios = [
      { id: coach1, email: 'coach1@guachafit.com', rol: Rol.ENTRENADOR },
      { id: coach2, email: 'coach2@guachafit.com', rol: Rol.ENTRENADOR },
      { id: alumnoUsuario1, email: 'alumno1@guachafit.com', rol: Rol.ALUMNO },
      { id: alumnoUsuario2, email: 'alumno2@guachafit.com', rol: Rol.ALUMNO },
      { id: alumnoUsuario3, email: 'alumno3@guachafit.com', rol: Rol.ALUMNO },
    ];

    mockPerfilesAlumno = [
      {
        id: 'perfil-alumno-1',
        usuarioId: alumnoUsuario1,
        entrenadorId: coach1,
        nombres: 'Carlos',
        apellidos: 'Mendoza',
        estadoActivacion: EstadoAlumno.ACTIVO,
        deletedAtUtc: null,
      },
      {
        id: 'perfil-alumno-2',
        usuarioId: alumnoUsuario2,
        entrenadorId: coach2,
        nombres: 'María',
        apellidos: 'Gómez',
        estadoActivacion: EstadoAlumno.ACTIVO,
        deletedAtUtc: null,
      },
      {
        id: 'perfil-alumno-3',
        usuarioId: alumnoUsuario3,
        entrenadorId: coach1,
        nombres: 'Luis',
        apellidos: 'Rivas',
        estadoActivacion: EstadoAlumno.ACTIVO,
        deletedAtUtc: null,
      },
    ];

    mockEjerciciosCatalogo = [
      {
        id: ejercicioGlobal,
        entrenadorId: null,
        nombre: 'Press de Banca Plano con Barra',
        grupoMuscular: 'Pecho',
        activo: true,
        createdAtUtc: new Date(),
      },
      {
        id: ejercicioCoach1,
        entrenadorId: coach1,
        nombre: 'Press Militar con Mancuernas',
        grupoMuscular: 'Hombros',
        activo: true,
        createdAtUtc: new Date(),
      },
      {
        id: ejercicioCoach2,
        entrenadorId: coach2,
        nombre: 'Sentadilla Búlgara Privada',
        grupoMuscular: 'Piernas',
        activo: true,
        createdAtUtc: new Date(),
      },
      // Ejercicios adicionales para el caso "resolver por nombre"
      {
        id: 'e4444444-4444-4444-8444-444444444444',
        entrenadorId: null,
        nombre: 'Remo con Barra Prono',
        grupoMuscular: 'Espalda',
        activo: true,
        createdAtUtc: new Date(),
      },
    ];

    mockPlantillasRutina = [];
    mockRutinas = [];

    mockDb = createMockDb();
    withTenantMock = vi.fn(async (_ctx: any, fn: any) => fn(mockDb));
    plantillasService = new PlantillasService(mockDb, withTenantMock);
    entrenamientoService = new EntrenamientoService(mockDb, withTenantMock);
  });

  // ===========================================================================
  // Escenario 1: Creación de Plantilla de Entrenamiento
  // ===========================================================================
  describe('Escenario 1: Creación de plantilla (RN-01)', () => {
    it('guarda la plantilla en estado "Activa" asociada al tenant del coach', async () => {
      const plantilla = await crearPlantillaCoach1('Pierna Énfasis Isquios');

      expect(plantilla.id).toBeDefined();
      expect(plantilla.nombre).toBe('Pierna Énfasis Isquios');
      expect(plantilla.activa).toBe(true);
      expect(plantilla.entrenadorId).toBe(coach1);
      expect(plantilla.nivelObjetivo).toBe(NivelObjetivoPlantilla.INTERMEDIO);
      expect(plantilla.bloques).toHaveLength(2);
      expect(plantilla.bloques[0].ejercicios).toHaveLength(2);
      // Notas técnicas preservadas (RN-01)
      expect(plantilla.bloques[0].ejercicios[0].notas).toBe('Escápulas retraídas.');
      expect(mockPlantillasRutina[0].entrenadorId).toBe(coach1);
    });

    it('resuelve el ejercicioId por nombre cuando existe en el catálogo global o del coach', async () => {
      const plantilla = await plantillasService.crearPlantilla(coach1, {
        nombre: 'Plantilla por nombre',
        nivelObjetivo: NivelObjetivoPlantilla.PRINCIPIANTE,
        bloques: [
          bloqueFixture('n1', 'Día 1', [
            { nombre: 'Remo con Barra Prono', series: 3, reps: '10' },
          ]),
        ],
      });

      expect(plantilla.bloques[0].ejercicios[0].ejercicioId).toBe(
        'e4444444-4444-4444-8444-444444444444'
      );
    });

    it('rechaza un ejercicio inexistente en el catálogo (validación RN-01)', async () => {
      await expect(
        plantillasService.crearPlantilla(coach1, {
          nombre: 'Plantilla inválida',
          nivelObjetivo: NivelObjetivoPlantilla.INTERMEDIO,
          bloques: [
            bloqueFixture('x1', 'Día X', [
              {
                ejercicioId: 'e9999999-9999-4999-8999-999999999999',
                nombre: 'Ejercicio Fantasma',
                series: 3,
                reps: '10',
              },
            ]),
          ],
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza un ejercicio privado de OTRO entrenador (tenancy de catálogo)', async () => {
      await expect(
        plantillasService.crearPlantilla(coach1, {
          nombre: 'Plantilla con ejercicio ajeno',
          nivelObjetivo: NivelObjetivoPlantilla.INTERMEDIO,
          bloques: [
            bloqueFixture('x1', 'Día X', [
              {
                ejercicioId: ejercicioCoach2,
                nombre: 'Sentadilla Búlgara Privada',
                series: 3,
                reps: '10',
              },
            ]),
          ],
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('valida el contrato Zod: nivel objetivo inválido y bloques vacíos', async () => {
      await expect(
        plantillasService.crearPlantilla(coach1, {
          nombre: 'Nivel inválido',
          nivelObjetivo: 'ELITE' as any,
          bloques: plantillaFixtureBloques(),
        })
      ).rejects.toThrow(BadRequestException);

      await expect(
        plantillasService.crearPlantilla(coach1, {
          nombre: 'Sin bloques',
          nivelObjetivo: NivelObjetivoPlantilla.INTERMEDIO,
          bloques: [],
        })
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ===========================================================================
  // Listado y CRUD tenant-scoped
  // ===========================================================================
  describe('Listado y CRUD tenant-scoped', () => {
    it('lista únicamente las plantillas del coach autenticado', async () => {
      await crearPlantillaCoach1();
      await plantillasService.crearPlantilla(coach2, {
        nombre: 'Plantilla ajena',
        nivelObjetivo: NivelObjetivoPlantilla.AVANZADO,
        // Solo ejercicios globales: coach2 no puede usar el catálogo privado de coach1.
        bloques: [
          bloqueFixture('ajena-d1', 'Día 1', [
            { ejercicioId: ejercicioGlobal, nombre: 'Press de Banca Plano con Barra', series: 3, reps: '10' },
          ]),
        ],
      });

      const listaCoach1 = await plantillasService.listarPlantillas(coach1);
      expect(listaCoach1).toHaveLength(1);
      expect(listaCoach1[0].entrenadorId).toBe(coach1);
      expect(listaCoach1[0].totalDias).toBe(2);
      expect(listaCoach1[0].totalEjercicios).toBe(3);

      const listaCoach2 = await plantillasService.listarPlantillas(coach2);
      expect(listaCoach2).toHaveLength(1);
      expect(listaCoach2[0].nombre).toBe('Plantilla ajena');
    });

    it('filtra por estado activa e idempotencia del soft delete', async () => {
      const plantilla = await crearPlantillaCoach1();
      await plantillasService.desactivarPlantilla(coach1, plantilla.id);

      const activas = await plantillasService.listarPlantillas(coach1, true);
      const inactivas = await plantillasService.listarPlantillas(coach1, false);

      expect(activas).toHaveLength(0);
      expect(inactivas).toHaveLength(1);
      expect(inactivas[0].activa).toBe(false);

      // Idempotente
      const deNuevo = await plantillasService.desactivarPlantilla(coach1, plantilla.id);
      expect(deNuevo.activa).toBe(false);
    });

    it('edita nombre, nivel objetivo y bloques revalidando el catálogo', async () => {
      const plantilla = await crearPlantillaCoach1();

      const editada = await plantillasService.actualizarPlantilla(coach1, plantilla.id, {
        nombre: 'Pierna Énfasis Isquios v2',
        nivelObjetivo: NivelObjetivoPlantilla.AVANZADO,
        bloques: [
          bloqueFixture('d1', 'Día 1 editado', [
            { ejercicioId: ejercicioGlobal, nombre: 'Press de Banca Plano con Barra', series: 5, reps: '5', peso: '85.00' },
          ]),
        ],
      });

      expect(editada.nombre).toBe('Pierna Énfasis Isquios v2');
      expect(editada.nivelObjetivo).toBe(NivelObjetivoPlantilla.AVANZADO);
      expect(editada.bloques).toHaveLength(1);
      expect(editada.bloques[0].ejercicios[0].series).toBe(5);

      await expect(
        plantillasService.actualizarPlantilla(coach1, plantilla.id, {
          bloques: [
            bloqueFixture('d1', 'Día inválido', [
              {
                ejercicioId: 'e9999999-9999-4999-8999-999999999999',
                nombre: 'Fantasma',
                series: 3,
                reps: '10',
              },
            ]),
          ],
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('tenancy: otro coach no puede ver, editar ni desactivar una plantilla ajena (404)', async () => {
      const plantilla = await crearPlantillaCoach1();

      await expect(plantillasService.obtenerPlantilla(coach2, plantilla.id)).rejects.toThrow(
        NotFoundException
      );
      // LOTE API-2: mensaje claro, sin el identificador de la plantilla.
      await expect(plantillasService.obtenerPlantilla(coach2, plantilla.id)).rejects.toThrow(
        'No encontramos esa plantilla. Puede que se haya eliminado.'
      );
      await expect(
        plantillasService.actualizarPlantilla(coach2, plantilla.id, { nombre: 'Hackeada' })
      ).rejects.toThrow(NotFoundException);
      await expect(plantillasService.desactivarPlantilla(coach2, plantilla.id)).rejects.toThrow(
        NotFoundException
      );
      await expect(
        plantillasService.asignarPlantilla(coach2, plantilla.id, {
          alumnoIds: [alumnoUsuario2],
          modo: ModoAsignacionPlantilla.REEMPLAZAR,
        })
      ).rejects.toThrow(NotFoundException);
    });

    it('no permite asignar una plantilla desactivada', async () => {
      const plantilla = await crearPlantillaCoach1();
      await plantillasService.desactivarPlantilla(coach1, plantilla.id);

      await expect(
        plantillasService.asignarPlantilla(coach1, plantilla.id, {
          alumnoIds: [alumnoUsuario1],
          modo: ModoAsignacionPlantilla.REEMPLAZAR,
        })
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ===========================================================================
  // Escenario 2: Asignación REEMPLAZAR con copia profunda (RN-02)
  // ===========================================================================
  describe('Escenario 2: Asignación REEMPLAZAR y deep clone (RN-02)', () => {
    it('clona los bloques a una nueva rutina activa y desactiva la anterior sin borrar historial', async () => {
      const plantilla = await crearPlantillaCoach1();
      const rutinaPrevia = crearRutinaActiva(alumnoUsuario1);

      const respuesta = await plantillasService.asignarPlantilla(coach1, plantilla.id, {
        alumnoIds: [alumnoUsuario1],
        modo: ModoAsignacionPlantilla.REEMPLAZAR,
      });

      expect(respuesta.exitosos).toBe(1);
      expect(respuesta.fallidos).toBe(0);
      const resultado = respuesta.resultados[0];
      expect(resultado.exito).toBe(true);
      expect(resultado.rutinaId).toBeDefined();
      expect(resultado.rutinaId).not.toBe(rutinaPrevia.id);
      expect(resultado.bloquesTotal).toBe(2);

      // RNF-003/ADR-009: las escrituras sobre `rutinas` corren con el GUC del coach.
      expect(withTenantMock).toHaveBeenCalledWith(
        expect.objectContaining({ entrenadorId: coach1 }),
        expect.any(Function)
      );

      // La rutina previa sigue existiendo (historial intacto) pero desactivada.
      const previaPersistida = mockRutinas.find((r) => r.id === rutinaPrevia.id);
      expect(previaPersistida).toBeDefined();
      expect(previaPersistida.activa).toBe(false);

      // La rutina activa del alumno es la copia de la plantilla, legible por el módulo.
      const activa = await entrenamientoService.obtenerRutinaSemanalActiva(
        coach1,
        alumnoUsuario1,
        Rol.ENTRENADOR,
        coach1
      );
      expect(activa).not.toBeNull();
      expect(activa!.id).toBe(resultado.rutinaId);
      expect(activa!.nombre).toBe(plantilla.nombre);
      expect(activa!.bloques).toHaveLength(2);
      // Los diaId se regeneran: no se reutilizan los de la plantilla.
      expect(activa!.bloques.map((b) => b.diaId)).not.toContain('d1');
      expect(activa!.bloques[0].ejercicios[0].peso).toBe('70.00');
    });

    it('DEEP CLONE: editar la plantilla después NO afecta lo ya asignado', async () => {
      const plantilla = await crearPlantillaCoach1();
      await plantillasService.asignarPlantilla(coach1, plantilla.id, {
        alumnoIds: [alumnoUsuario1],
        modo: ModoAsignacionPlantilla.REEMPLAZAR,
      });

      // Mutación directa sobre el almacenamiento de la plantilla (peor caso de aliasing).
      const plantillaPersistida = mockPlantillasRutina[0];
      plantillaPersistida.bloques[0].ejercicios[0].peso = '999.99';
      plantillaPersistida.bloques[0].ejercicios[0].series = 99;

      const activa = await entrenamientoService.obtenerRutinaSemanalActiva(
        coach1,
        alumnoUsuario1,
        Rol.ENTRENADOR,
        coach1
      );
      expect(activa!.bloques[0].ejercicios[0].peso).toBe('70.00');
      expect(activa!.bloques[0].ejercicios[0].series).toBe(4);
    });

    it('DEEP CLONE: ajustes individuales del alumno NO tocan la plantilla base', async () => {
      const plantilla = await crearPlantillaCoach1();
      await plantillasService.asignarPlantilla(coach1, plantilla.id, {
        alumnoIds: [alumnoUsuario1],
        modo: ModoAsignacionPlantilla.REEMPLAZAR,
      });

      // Simula el ajuste individual del alumno sobre su rutina asignada.
      const rutinaAsignada = mockRutinas.find((r) => r.activa && r.alumnoId === alumnoUsuario1);
      rutinaAsignada.bloques[0].ejercicios[0].peso = '120.00';
      rutinaAsignada.bloques[0].ejercicios[0].series = 10;

      const plantillaActual = await plantillasService.obtenerPlantilla(coach1, plantilla.id);
      expect(plantillaActual.bloques[0].ejercicios[0].peso).toBe('70.00');
      expect(plantillaActual.bloques[0].ejercicios[0].series).toBe(4);
    });

    it('aplica los ajustes de cargas/series/reps antes de confirmar (Escenario 2)', async () => {
      const plantilla = await crearPlantillaCoach1();

      await plantillasService.asignarPlantilla(coach1, plantilla.id, {
        alumnoIds: [alumnoUsuario1],
        modo: ModoAsignacionPlantilla.REEMPLAZAR,
        ajustes: [
          {
            diaId: 'd1',
            ejercicioId: ejercicioGlobal,
            pesoPrescritoKg: '100.00',
            series: 5,
            reps: '5',
            rpe: '9.5',
          },
        ],
      });

      const activa = await entrenamientoService.obtenerRutinaSemanalActiva(
        coach1,
        alumnoUsuario1,
        Rol.ENTRENADOR,
        coach1
      );
      const ejercicioAjustado = activa!.bloques[0].ejercicios[0];
      expect(ejercicioAjustado.peso).toBe('100.00');
      expect(ejercicioAjustado.series).toBe(5);
      expect(ejercicioAjustado.reps).toBe('5');
      expect(ejercicioAjustado.rpe).toBe('9.5');

      // El ajuste se aplica solo a la copia del alumno, no a la plantilla.
      const plantillaActual = await plantillasService.obtenerPlantilla(coach1, plantilla.id);
      expect(plantillaActual.bloques[0].ejercicios[0].peso).toBe('70.00');
      expect(plantillaActual.bloques[0].ejercicios[0].series).toBe(4);
    });

    it('rechaza ajustes que no corresponden a la plantilla', async () => {
      const plantilla = await crearPlantillaCoach1();

      await expect(
        plantillasService.asignarPlantilla(coach1, plantilla.id, {
          alumnoIds: [alumnoUsuario1],
          modo: ModoAsignacionPlantilla.REEMPLAZAR,
          ajustes: [{ diaId: 'dia-inexistente', ejercicioId: ejercicioGlobal, series: 5 }],
        })
      ).rejects.toThrow(BadRequestException);
      // LOTE API-2: mensaje claro, sin el identificador técnico del día.
      await expect(
        plantillasService.asignarPlantilla(coach1, plantilla.id, {
          alumnoIds: [alumnoUsuario1],
          modo: ModoAsignacionPlantilla.REEMPLAZAR,
          ajustes: [{ diaId: 'dia-inexistente', ejercicioId: ejercicioGlobal, series: 5 }],
        })
      ).rejects.toThrow('Uno de los ajustes no corresponde a esta plantilla. Ábrela de nuevo.');

      await expect(
        plantillasService.asignarPlantilla(coach1, plantilla.id, {
          alumnoIds: [alumnoUsuario1],
          modo: ModoAsignacionPlantilla.REEMPLAZAR,
          ajustes: [{ diaId: 'd1', nombre: 'Ejercicio Inexistente', series: 5 }],
        })
      ).rejects.toThrow(BadRequestException);
      await expect(
        plantillasService.asignarPlantilla(coach1, plantilla.id, {
          alumnoIds: [alumnoUsuario1],
          modo: ModoAsignacionPlantilla.REEMPLAZAR,
          ajustes: [{ diaId: 'd1', nombre: 'Ejercicio Inexistente', series: 5 }],
        })
      ).rejects.toThrow('Uno de los ajustes no corresponde a esta plantilla. Ábrela de nuevo.');
    });
  });

  // ===========================================================================
  // Asignación FUSIONAR (RN-03)
  // ===========================================================================
  describe('Asignación FUSIONAR (RN-03)', () => {
    it('anexa los días de la plantilla a los bloques existentes sin borrar ninguno', async () => {
      const plantilla = await crearPlantillaCoach1();
      const rutinaPrevia = crearRutinaActiva(alumnoUsuario1);

      const respuesta = await plantillasService.asignarPlantilla(coach1, plantilla.id, {
        alumnoIds: [alumnoUsuario1],
        modo: ModoAsignacionPlantilla.FUSIONAR,
      });

      expect(respuesta.resultados[0].exito).toBe(true);
      expect(respuesta.resultados[0].rutinaId).toBe(rutinaPrevia.id);
      expect(respuesta.resultados[0].bloquesTotal).toBe(3); // 1 previo + 2 plantilla

      const activa = await entrenamientoService.obtenerRutinaSemanalActiva(
        coach1,
        alumnoUsuario1,
        Rol.ENTRENADOR,
        coach1
      );
      expect(activa!.id).toBe(rutinaPrevia.id);
      expect(activa!.bloques).toHaveLength(3);
      expect(activa!.bloques[0].diaId).toBe('previo-d1');
      expect(activa!.bloques[0].titulo).toBe('Día previo');
      expect(activa!.bloques[1].titulo).toBe('Día 1: Empuje');
      expect(activa!.bloques[2].titulo).toBe('Día 2: Tracción');
      // No se borró la rutina previa ni la plantilla.
      expect(mockRutinas).toHaveLength(1);
      expect(mockPlantillasRutina[0].bloques).toHaveLength(2);
    });

    it('FUSIONAR sin rutina activa crea una nueva rutina activa desde la plantilla', async () => {
      const plantilla = await crearPlantillaCoach1();

      const respuesta = await plantillasService.asignarPlantilla(coach1, plantilla.id, {
        alumnoIds: [alumnoUsuario3],
        modo: ModoAsignacionPlantilla.FUSIONAR,
      });

      expect(respuesta.resultados[0].exito).toBe(true);
      expect(respuesta.resultados[0].bloquesTotal).toBe(2);
      const activa = mockRutinas.find((r) => r.alumnoId === alumnoUsuario3 && r.activa);
      expect(activa).toBeDefined();
    });
  });

  // ===========================================================================
  // Asignación masiva con reporte parcial
  // ===========================================================================
  describe('Asignación masiva con reporte por alumno', () => {
    it('reporta éxito/fallo por alumno sin abortar el lote por un alumno inválido', async () => {
      const plantilla = await crearPlantillaCoach1();

      const respuesta = await plantillasService.asignarPlantilla(coach1, plantilla.id, {
        alumnoIds: [alumnoUsuario1, alumnoUsuario2, alumnoInexistente],
        modo: ModoAsignacionPlantilla.REEMPLAZAR,
      });

      expect(respuesta.totalSolicitados).toBe(3);
      expect(respuesta.exitosos).toBe(1);
      expect(respuesta.fallidos).toBe(2);

      const [exitoso, ajeno, inexistente] = respuesta.resultados;
      expect(exitoso.alumnoId).toBe(alumnoUsuario1);
      expect(exitoso.exito).toBe(true);

      expect(ajeno.alumnoId).toBe(alumnoUsuario2);
      expect(ajeno.exito).toBe(false);
      // LOTE API-2: mensajes claros por alumno (sin "tenant" ni identificadores).
      expect(ajeno.error).toBe('Este alumno no está en tu lista.');

      expect(inexistente.alumnoId).toBe(alumnoInexistente);
      expect(inexistente.exito).toBe(false);
      expect(inexistente.error).toBe('No encontramos a este alumno.');

      // El alumno válido sí recibió su rutina; el ajeno no fue tocado.
      expect(mockRutinas.filter((r) => r.alumnoId === alumnoUsuario1 && r.activa)).toHaveLength(1);
      expect(mockRutinas.filter((r) => r.alumnoId === alumnoUsuario2)).toHaveLength(0);
    });

    it('valida el contrato Zod de la asignación (alumnoIds vacío y modo inválido)', async () => {
      const plantilla = await crearPlantillaCoach1();

      await expect(
        plantillasService.asignarPlantilla(coach1, plantilla.id, {
          alumnoIds: [],
          modo: ModoAsignacionPlantilla.REEMPLAZAR,
        })
      ).rejects.toThrow(BadRequestException);

      await expect(
        plantillasService.asignarPlantilla(coach1, plantilla.id, {
          alumnoIds: [alumnoUsuario1],
          modo: 'SOBRESCRIBIR' as any,
        })
      ).rejects.toThrow(BadRequestException);
    });
  });
});
