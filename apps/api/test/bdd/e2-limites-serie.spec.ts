/**
 * LOTE E2 — Límites de las series en el contrato compartido y el API (fase roja).
 *
 * Contratos del prompt 14 (decisiones del dueño 2026-10-10/2026-10-11):
 *   C1. `LIMITES_SERIE`: pesoKgMax 999 · repsMax 200 · rpeMin 1 · rpeMax 10 · rpePaso 0.5.
 *   C2. `esPesoKgValido`: decimal de hasta 2 decimales entre 0 y 999 (ambos incluidos).
 *   C3. `esRpeValido`: número entre 1 y 10 en pasos de 0,5.
 *   C4. `extraerPesoKgDeTexto`: primer número del texto libre, con coma decimal; null si no hay.
 *   C5. Esquemas: RegistrarSerie, SeriePrescritaInput, AjusteEjercicioPlantilla y BloqueDiaRutina.
 *   C6. API (nivel servicio): registrar serie, guardar rutina semanal y asignar plantilla.
 *
 * FASE ROJA: C1–C4 fallan porque las exportaciones todavía no existen; en C5 y C6 fallan los
 * casos de rechazo porque hoy se aceptan. Los casos de aceptación y de control ya pasan y deben
 * seguir pasando cuando llegue la implementación.
 *
 * Las exportaciones de C1–C4 se consultan con `import * as shared` (precedente del repo:
 * `api2-errores-claros.spec.ts`): así la ausencia de cada exportación se reporta como un fallo
 * por caso y no aborta la carga del módulo completo (C5/C6 siguen siendo observables hoy).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { BadRequestException } from '@nestjs/common';
import {
  RegistrarSerieSchema,
  SeriePrescritaInputSchema,
  AjusteEjercicioPlantillaSchema,
  BloqueDiaRutinaSchema,
  Rol,
  EstadoAlumno,
  NivelObjetivoPlantilla,
  ModoAsignacionPlantilla,
} from '@guachafit/shared';
import * as shared from '@guachafit/shared';
import { getTableName } from '@guachafit/database';
import { EntrenamientoService } from '../../src/modules/entrenamiento/entrenamiento.service';
import { PlantillasService } from '../../src/modules/entrenamiento/plantillas.service';
// Mismo detector que `api2-errores-claros.spec.ts` (fuente única de `src/common/errores/jerga.ts`).
import { contieneJerga } from '../../src/common/errores/jerga';

/** Mensajes exactos que el issue de C5 exige para cada límite. */
const MENSAJE_PESO_FUERA_DE_RANGO = 'El peso no puede superar 999 kg';
const MENSAJE_ESFUERZO_INVALIDO =
  'El esfuerzo debe estar entre 1 y 10, en pasos de 0,5 (por ejemplo, 8 o 8.5)';
const MENSAJE_REPS_FUERA_DE_RANGO = 'Las repeticiones no pueden superar 200';

// -----------------------------------------------------------------------------
// Utilidades de C1–C4: acceso a exportaciones que hoy no existen.
// -----------------------------------------------------------------------------

/** Lee una exportación del contrato y falla con mensaje explícito si aún no existe. */
function exportacionDelContrato(nombre: string): unknown {
  const valor = (shared as unknown as Record<string, unknown>)[nombre];
  expect(
    valor,
    `@guachafit/shared.${nombre} todavía no existe (fase roja del lote E2)`
  ).toBeDefined();
  return valor;
}

function funcionDelContrato<T extends (...args: any[]) => unknown>(nombre: string): T {
  const valor = exportacionDelContrato(nombre);
  expect(typeof valor, `@guachafit/shared.${nombre} debe exportarse como función`).toBe('function');
  return valor as T;
}

/** Primer mensaje de issue cuya ruta coincide exactamente con `campo`. */
function mensajeDelCampo(
  resultado: z.SafeParseReturnType<unknown, unknown>,
  campo: string
): string | undefined {
  if (resultado.success) return undefined;
  return resultado.error.issues.find((issue) => issue.path.join('.') === campo)?.message;
}

describe('LOTE E2 · Límites de las series en el contrato y el API (fase roja)', () => {
  // ===========================================================================
  // C1 · Constantes
  // ===========================================================================
  describe('C1 · LIMITES_SERIE', () => {
    it('[C1] expone los cinco valores exactos del contrato', () => {
      const limites = exportacionDelContrato('LIMITES_SERIE') as {
        pesoKgMax: number;
        repsMax: number;
        rpeMin: number;
        rpeMax: number;
        rpePaso: number;
      };

      expect(limites.pesoKgMax).toBe(999);
      expect(limites.repsMax).toBe(200);
      expect(limites.rpeMin).toBe(1);
      expect(limites.rpeMax).toBe(10);
      expect(limites.rpePaso).toBe(0.5);
    });
  });

  // ===========================================================================
  // C2 · esPesoKgValido(valor)
  // ===========================================================================
  describe('C2 · esPesoKgValido(valor)', () => {
    type EsPesoKgValido = (valor: string) => boolean;

    it.each(['0', '60', '60.5', '60.25', '999', '999.00'])(
      '[C2] acepta %j',
      (valor: string) => {
        const esPesoKgValido = funcionDelContrato<EsPesoKgValido>('esPesoKgValido');
        expect(esPesoKgValido(valor)).toBe(true);
      }
    );

    it.each(['999.01', '1000', '-5', '60.555', 'abc', '', '60,5'])(
      '[C2] rechaza %j',
      (valor: string) => {
        const esPesoKgValido = funcionDelContrato<EsPesoKgValido>('esPesoKgValido');
        expect(esPesoKgValido(valor)).toBe(false);
      }
    );
  });

  // ===========================================================================
  // C3 · esRpeValido(valor)
  // ===========================================================================
  describe('C3 · esRpeValido(valor)', () => {
    type EsRpeValido = (valor: string) => boolean;

    it.each(['1', '1.5', '8', '8.5', '10', '10.0'])('[C3] acepta %j', (valor: string) => {
      const esRpeValido = funcionDelContrato<EsRpeValido>('esRpeValido');
      expect(esRpeValido(valor)).toBe(true);
    });

    it.each(['0', '0.5', '8.3', '10.5', '11', '8,5', '', 'alto'])(
      '[C3] rechaza %j',
      (valor: string) => {
        const esRpeValido = funcionDelContrato<EsRpeValido>('esRpeValido');
        expect(esRpeValido(valor)).toBe(false);
      }
    );
  });

  // ===========================================================================
  // C4 · extraerPesoKgDeTexto(texto)
  // ===========================================================================
  describe('C4 · extraerPesoKgDeTexto(texto)', () => {
    type ExtraerPesoKgDeTexto = (texto: string) => number | null;

    it.each([
      ['60 kg', 60],
      ['60,5 kg', 60.5],
      ['  72.25', 72.25],
      ['2x20 kg', 2],
      ['Corporal', null],
      ['', null],
      ['1200 kg', 1200],
    ] as Array<[string, number | null]>)(
      '[C4] extrae de %j → %j',
      (texto: string, esperado: number | null) => {
        const extraerPesoKgDeTexto =
          funcionDelContrato<ExtraerPesoKgDeTexto>('extraerPesoKgDeTexto');
        expect(extraerPesoKgDeTexto(texto)).toBe(esperado);
      }
    );
  });

  // ===========================================================================
  // C5 · Esquemas
  // ===========================================================================
  describe('C5 · límites de los esquemas del contrato', () => {
    const serieValida = {
      serieId: 'd5555555-5555-4555-8555-555555555501',
      repsLogradas: 10,
      completada: true,
    };

    // -------------------------------------------------------------------------
    // RegistrarSerieSchema (lado alumno)
    // -------------------------------------------------------------------------
    describe('C5 · RegistrarSerieSchema', () => {
      it.each([{ valor: '999' }, { valor: '' }, { valor: null }])(
        '[C5·RegistrarSerie] acepta pesoKg $valor',
        ({ valor }: { valor: string | null }) => {
          const resultado = RegistrarSerieSchema.safeParse({ ...serieValida, pesoKg: valor });
          expect(resultado.success).toBe(true);
        }
      );

      it.each([{ valor: '8.5' }, { valor: '' }, { valor: null }])(
        '[C5·RegistrarSerie] acepta rpe $valor',
        ({ valor }: { valor: string | null }) => {
          const resultado = RegistrarSerieSchema.safeParse({ ...serieValida, rpe: valor });
          expect(resultado.success).toBe(true);
        }
      );

      it("[C5·RegistrarSerie] rechaza pesoKg '1000' con el mensaje de tope", () => {
        const resultado = RegistrarSerieSchema.safeParse({ ...serieValida, pesoKg: '1000' });
        expect(resultado.success).toBe(false);
        expect(mensajeDelCampo(resultado, 'pesoKg')).toBe(MENSAJE_PESO_FUERA_DE_RANGO);
      });

      it("[C5·RegistrarSerie] rechaza pesoKg '999.01' con el mensaje de tope", () => {
        const resultado = RegistrarSerieSchema.safeParse({ ...serieValida, pesoKg: '999.01' });
        expect(resultado.success).toBe(false);
        expect(mensajeDelCampo(resultado, 'pesoKg')).toBe(MENSAJE_PESO_FUERA_DE_RANGO);
      });

      it.each(['8.3', '0', '11'])(
        "[C5·RegistrarSerie] rechaza rpe '%s' con el mensaje de esfuerzo",
        (rpe: string) => {
          const resultado = RegistrarSerieSchema.safeParse({ ...serieValida, rpe });
          expect(resultado.success).toBe(false);
          expect(mensajeDelCampo(resultado, 'rpe')).toBe(MENSAJE_ESFUERZO_INVALIDO);
        }
      );

      it('[C5·RegistrarSerie] control: rechaza repsLogradas 201 (ya se rechaza hoy)', () => {
        const resultado = RegistrarSerieSchema.safeParse({
          ...serieValida,
          repsLogradas: 201,
        });
        expect(resultado.success).toBe(false);
      });
    });

    // -------------------------------------------------------------------------
    // SeriePrescritaInputSchema (prescripción de sesión)
    // -------------------------------------------------------------------------
    describe('C5 · SeriePrescritaInputSchema', () => {
      const seriePrescritaValida = { repsObjetivo: 10 };

      it("[C5·SeriePrescrita] rechaza pesoPrescritoKg '1000' con el mensaje de tope", () => {
        const resultado = SeriePrescritaInputSchema.safeParse({
          ...seriePrescritaValida,
          pesoPrescritoKg: '1000',
        });
        expect(resultado.success).toBe(false);
        expect(mensajeDelCampo(resultado, 'pesoPrescritoKg')).toBe(MENSAJE_PESO_FUERA_DE_RANGO);
      });

      it("[C5·SeriePrescrita] rechaza pesoSugeridoKg '1000' con el mensaje de tope", () => {
        const resultado = SeriePrescritaInputSchema.safeParse({
          ...seriePrescritaValida,
          pesoSugeridoKg: '1000',
        });
        expect(resultado.success).toBe(false);
        expect(mensajeDelCampo(resultado, 'pesoSugeridoKg')).toBe(MENSAJE_PESO_FUERA_DE_RANGO);
      });

      it.each(['8.3', '11'])(
        "[C5·SeriePrescrita] rechaza rpeObjetivo '%s' con el mensaje de esfuerzo",
        (rpeObjetivo: string) => {
          const resultado = SeriePrescritaInputSchema.safeParse({
            ...seriePrescritaValida,
            rpeObjetivo,
          });
          expect(resultado.success).toBe(false);
          expect(mensajeDelCampo(resultado, 'rpeObjetivo')).toBe(MENSAJE_ESFUERZO_INVALIDO);
        }
      );

      it("[C5·SeriePrescrita] acepta pesoPrescritoKg '999'", () => {
        const resultado = SeriePrescritaInputSchema.safeParse({
          ...seriePrescritaValida,
          pesoPrescritoKg: '999',
        });
        expect(resultado.success).toBe(true);
      });

      it("[C5·SeriePrescrita] acepta rpeObjetivo '9.5'", () => {
        const resultado = SeriePrescritaInputSchema.safeParse({
          ...seriePrescritaValida,
          rpeObjetivo: '9.5',
        });
        expect(resultado.success).toBe(true);
      });
    });

    // -------------------------------------------------------------------------
    // AjusteEjercicioPlantillaSchema (ajustes al asignar plantilla)
    // -------------------------------------------------------------------------
    describe('C5 · AjusteEjercicioPlantillaSchema', () => {
      const uuidEjercicio = 'c3333333-3333-4333-8333-333333333333';

      it("[C5·Ajuste] rechaza pesoPrescritoKg '1000' con el mensaje de tope", () => {
        const resultado = AjusteEjercicioPlantillaSchema.safeParse({
          diaId: 'd1',
          ejercicioId: uuidEjercicio,
          pesoPrescritoKg: '1000',
        });
        expect(resultado.success).toBe(false);
        expect(mensajeDelCampo(resultado, 'pesoPrescritoKg')).toBe(MENSAJE_PESO_FUERA_DE_RANGO);
      });

      it("[C5·Ajuste] rechaza rpe '0' con el mensaje de esfuerzo", () => {
        const resultado = AjusteEjercicioPlantillaSchema.safeParse({
          diaId: 'd1',
          ejercicioId: uuidEjercicio,
          rpe: '0',
        });
        expect(resultado.success).toBe(false);
        expect(mensajeDelCampo(resultado, 'rpe')).toBe(MENSAJE_ESFUERZO_INVALIDO);
      });

      it("[C5·Ajuste] acepta pesoPrescritoKg '0'", () => {
        const resultado = AjusteEjercicioPlantillaSchema.safeParse({
          diaId: 'd1',
          ejercicioId: uuidEjercicio,
          pesoPrescritoKg: '0',
        });
        expect(resultado.success).toBe(true);
      });

      it("[C5·Ajuste] acepta rpe '10'", () => {
        const resultado = AjusteEjercicioPlantillaSchema.safeParse({
          diaId: 'd1',
          ejercicioId: uuidEjercicio,
          rpe: '10',
        });
        expect(resultado.success).toBe(true);
      });
    });

    // -------------------------------------------------------------------------
    // BloqueDiaRutinaSchema (texto libre prescrito por el entrenador)
    // -------------------------------------------------------------------------
    describe('C5 · BloqueDiaRutinaSchema', () => {
      const NOMBRE_EJERCICIO = 'Sentadilla Libre con Barra';

      function bloqueBase(campos: Record<string, unknown>) {
        return {
          diaId: 'e2-d1',
          titulo: 'Día 1: Pierna',
          ejercicios: [
            {
              nombre: NOMBRE_EJERCICIO,
              series: 3,
              reps: '10',
              peso: '60',
              rpe: '8',
              ...campos,
            },
          ],
        };
      }

      function bloqueConPeso(peso: string) {
        return bloqueBase({ peso });
      }

      function bloqueConReps(reps: string) {
        return bloqueBase({ reps });
      }

      /** `rpe: null` representa el campo ausente (los demás campos quedan válidos). */
      function bloqueConRpe(rpe: string | null) {
        const ejercicio: Record<string, unknown> = {
          nombre: NOMBRE_EJERCICIO,
          series: 3,
          reps: '10',
          peso: '60',
        };
        if (rpe !== null) ejercicio.rpe = rpe;
        return { diaId: 'e2-d1', titulo: 'Día 1: Pierna', ejercicios: [ejercicio] };
      }

      // peso
      it.each(['Corporal', '', '60 kg', '999', '60,5'])(
        '[C5·BloqueDia] acepta peso %j',
        (peso: string) => {
          const resultado = BloqueDiaRutinaSchema.safeParse(bloqueConPeso(peso));
          expect(resultado.success).toBe(true);
        }
      );

      it.each(['1000 kg', '1200'])(
        "[C5·BloqueDia] rechaza peso '%s' con el mensaje de tope",
        (peso: string) => {
          const resultado = BloqueDiaRutinaSchema.safeParse(bloqueConPeso(peso));
          expect(resultado.success).toBe(false);
          expect(mensajeDelCampo(resultado, 'ejercicios.0.peso')).toBe(
            MENSAJE_PESO_FUERA_DE_RANGO
          );
        }
      );

      // rpe
      it.each([null, '', '8', '8.5', '8,5'] as Array<string | null>)(
        '[C5·BloqueDia] acepta rpe %j',
        (rpe: string | null) => {
          const resultado = BloqueDiaRutinaSchema.safeParse(bloqueConRpe(rpe));
          expect(resultado.success).toBe(true);
        }
      );

      it.each(['8.3', '0', '11', 'alto'])(
        "[C5·BloqueDia] rechaza rpe '%s' con el mensaje de esfuerzo",
        (rpe: string) => {
          const resultado = BloqueDiaRutinaSchema.safeParse(bloqueConRpe(rpe));
          expect(resultado.success).toBe(false);
          expect(mensajeDelCampo(resultado, 'ejercicios.0.rpe')).toBe(MENSAJE_ESFUERZO_INVALIDO);
        }
      );

      // reps
      it.each(['10', '8-10', '200'])('[C5·BloqueDia] acepta reps %j', (reps: string) => {
        const resultado = BloqueDiaRutinaSchema.safeParse(bloqueConReps(reps));
        expect(resultado.success).toBe(true);
      });

      it.each(['201', '8-250'])(
        "[C5·BloqueDia] rechaza reps '%s' con el mensaje de tope",
        (reps: string) => {
          const resultado = BloqueDiaRutinaSchema.safeParse(bloqueConReps(reps));
          expect(resultado.success).toBe(false);
          expect(mensajeDelCampo(resultado, 'ejercicios.0.reps')).toBe(
            MENSAJE_REPS_FUERA_DE_RANGO
          );
        }
      );
    });

    // -------------------------------------------------------------------------
    // Mensajes claros (sin jerga técnica)
    // -------------------------------------------------------------------------
    describe('C5 · mensajes en lenguaje claro', () => {
      it('[C5·Jerga] los tres mensajes del contrato no contienen jerga técnica', () => {
        for (const mensaje of [
          MENSAJE_PESO_FUERA_DE_RANGO,
          MENSAJE_ESFUERZO_INVALIDO,
          MENSAJE_REPS_FUERA_DE_RANGO,
        ]) {
          expect(contieneJerga(mensaje), mensaje).toBe(false);
        }
      });
    });
  });

  // ===========================================================================
  // C6 · API (nivel servicio), con el patrón de rf001/rf017/entrenamiento-service
  // ===========================================================================
  describe('C6 · API (nivel servicio): los límites cortan el flujo real', () => {
    let entrenamientoService: EntrenamientoService;
    let plantillasService: PlantillasService;
    let mockDb: any;
    /** RNF-003/ADR-009: passthrough del envoltorio transaccional RLS para el mock. */
    let withTenantMock: any;

    let mockUsuarios: any[];
    let mockPerfilesAlumno: any[];
    let mockEjerciciosCatalogo: any[];
    let mockSesionesEntrenamiento: any[];
    let mockEjerciciosSesion: any[];
    let mockSeriesRegistro: any[];
    let mockRutinas: any[];
    let mockPlantillasRutina: any[];

    // -------------------------------------------------------------------------
    // Harness de mock Drizzle (mismo patrón que entrenamiento-service.spec.ts y
    // rf017-plantillas.spec.ts, autocontenido en este spec).
    // -------------------------------------------------------------------------

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
      if (tableName === 'usuarios') return mockUsuarios;
      if (tableName === 'perfiles_alumno') return mockPerfilesAlumno;
      if (tableName === 'ejercicios_catalogo') return mockEjerciciosCatalogo;
      if (tableName === 'sesiones_entrenamiento') return mockSesionesEntrenamiento;
      if (tableName === 'ejercicios_sesion') return mockEjerciciosSesion;
      if (tableName === 'series_registro') return mockSeriesRegistro;
      if (tableName === 'rutinas') return mockRutinas;
      if (tableName === 'plantillas_rutina') return mockPlantillasRutina;
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
              offset: vi.fn((count: number) => {
                filtered = filtered.slice(count);
                return queryObj;
              }),
              // El servicio bloquea filas de la rutina con SELECT ... FOR UPDATE.
              for: vi.fn(() => queryObj),
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

            const creados = registros.map((v: any) => {
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

    // -------------------------------------------------------------------------
    // Fixtures
    // -------------------------------------------------------------------------
    const coach1 = 'c1111111-1111-4111-8111-111111111111';
    const alumno1 = 'a1111111-1111-4111-8111-111111111111';
    const ejercicioGlobal = 'e1111111-1111-4111-8111-111111111111';

    beforeEach(() => {
      mockUsuarios = [
        { id: coach1, email: 'coach1@guachafit.com', rol: Rol.ENTRENADOR },
        { id: alumno1, email: 'alumno1@guachafit.com', rol: Rol.ALUMNO },
      ];

      mockPerfilesAlumno = [
        {
          id: 'perfil-alumno-1',
          usuarioId: alumno1,
          entrenadorId: coach1,
          nombres: 'Pedro',
          apellidos: 'Pérez',
          estadoActivacion: EstadoAlumno.ACTIVO,
          deletedAtUtc: null,
        },
      ];

      mockEjerciciosCatalogo = [
        {
          id: ejercicioGlobal,
          entrenadorId: null,
          nombre: 'Sentadilla Libre con Barra',
          grupoMuscular: 'Piernas',
          activo: true,
          createdAtUtc: new Date(),
        },
      ];

      mockSesionesEntrenamiento = [];
      mockEjerciciosSesion = [];
      mockSeriesRegistro = [];
      mockRutinas = [];
      mockPlantillasRutina = [];

      mockDb = createMockDb();
      withTenantMock = vi.fn(async (_ctx: any, fn: any) => fn(mockDb));
      entrenamientoService = new EntrenamientoService(mockDb, withTenantMock);
      plantillasService = new PlantillasService(mockDb, withTenantMock);
    });

    async function crearSesionEnProgreso() {
      const sesion = await entrenamientoService.crearSesion(coach1, {
        alumnoId: alumno1,
        fechaProgramada: '2026-10-11',
        ejercicios: [
          {
            ejercicioId: ejercicioGlobal,
            series: [{ numeroSerie: 1, repsObjetivo: 10 }],
          },
        ],
      });

      await entrenamientoService.iniciarSesion(sesion.id, alumno1, {
        timezoneCliente: 'America/Caracas',
      });

      return sesion;
    }

    // -------------------------------------------------------------------------
    // C6.1 · Registrar una serie (alumno)
    // -------------------------------------------------------------------------
    it("[C6·Serie] rechaza pesoKg '1000' y la serie no cambia en la base de datos", async () => {
      const sesion = await crearSesionEnProgreso();
      const serieId = sesion.ejercicios[0].series[0].id;

      await expect(
        entrenamientoService.sincronizarSeries(sesion.id, alumno1, {
          series: [{ serieId, repsLogradas: 10, pesoKg: '1000', completada: true }],
        })
      ).rejects.toThrow(BadRequestException);

      const persistida = mockSeriesRegistro.find((s) => s.id === serieId);
      expect(persistida?.pesoKg).toBeNull();
      expect(persistida?.completada).toBe(false);
    });

    it("[C6·Serie] control: acepta pesoKg '999' y lo persiste", async () => {
      const sesion = await crearSesionEnProgreso();
      const serieId = sesion.ejercicios[0].series[0].id;

      await entrenamientoService.sincronizarSeries(sesion.id, alumno1, {
        series: [{ serieId, repsLogradas: 10, pesoKg: '999', completada: true }],
      });

      const persistida = mockSeriesRegistro.find((s) => s.id === serieId);
      expect(persistida?.pesoKg).toBe('999');
      expect(persistida?.completada).toBe(true);
    });

    // -------------------------------------------------------------------------
    // C6.2 · Guardar rutina semanal (coach)
    // -------------------------------------------------------------------------
    const bloqueRutina = (peso: string) => ({
      diaId: 'e2-d1',
      titulo: 'Día 1: Pierna',
      ejercicios: [
        {
          ejercicioId: ejercicioGlobal,
          nombre: 'Sentadilla Libre con Barra',
          series: 3,
          reps: '10',
          peso,
        },
      ],
    });

    it("[C6·Rutina] rechaza peso '1200 kg' y no crea ni modifica ninguna rutina", async () => {
      const previa = {
        id: randomUUID(),
        alumnoId: alumno1,
        entrenadorId: coach1,
        nombre: 'Planificación previa',
        bloques: [],
        activa: true,
        createdAtUtc: new Date(),
        updatedAtUtc: new Date(),
      };
      mockRutinas.push(previa);

      await expect(
        entrenamientoService.guardarRutinaSemanal(coach1, alumno1, {
          alumnoId: alumno1,
          nombreRutina: 'Semana E2',
          bloques: [bloqueRutina('1200 kg')],
        })
      ).rejects.toThrow(BadRequestException);

      expect(previa.activa).toBe(true);
      expect(mockRutinas).toHaveLength(1);
    });

    it("[C6·Rutina] control: acepta peso '999 kg' y guarda la rutina", async () => {
      const rutina = await entrenamientoService.guardarRutinaSemanal(coach1, alumno1, {
        alumnoId: alumno1,
        nombreRutina: 'Semana E2',
        bloques: [bloqueRutina('999 kg')],
      });

      expect(rutina.bloques[0].ejercicios[0].peso).toBe('999 kg');
      expect(mockRutinas.filter((r) => r.alumnoId === alumno1 && r.activa)).toHaveLength(1);
    });

    // -------------------------------------------------------------------------
    // C6.3 · Asignar plantilla con ajustes (coach)
    // -------------------------------------------------------------------------
    async function crearPlantillaE2() {
      return plantillasService.crearPlantilla(coach1, {
        nombre: 'Empuje E2',
        nivelObjetivo: NivelObjetivoPlantilla.INTERMEDIO,
        bloques: [
          {
            diaId: 'd1',
            titulo: 'Día 1: Empuje',
            enfoque: 'Fixture E2',
            diaSugerido: 1,
            ejercicios: [
              {
                ejercicioId: ejercicioGlobal,
                nombre: 'Sentadilla Libre con Barra',
                series: 3,
                reps: '10',
                peso: '60.00',
                rpe: '8',
              },
            ],
          },
        ],
      });
    }

    it("[C6·Plantilla] rechaza un ajuste con pesoPrescritoKg '1000' y no asigna nada", async () => {
      const plantilla = await crearPlantillaE2();

      await expect(
        plantillasService.asignarPlantilla(coach1, plantilla.id, {
          alumnoIds: [alumno1],
          modo: ModoAsignacionPlantilla.REEMPLAZAR,
          ajustes: [{ diaId: 'd1', ejercicioId: ejercicioGlobal, pesoPrescritoKg: '1000' }],
        })
      ).rejects.toThrow(BadRequestException);

      expect(mockRutinas).toHaveLength(0);
      expect(mockRutinas.filter((r) => r.alumnoId === alumno1 && r.activa)).toHaveLength(0);
    });

    it("[C6·Plantilla] control: acepta un ajuste con pesoPrescritoKg '999' y asigna", async () => {
      const plantilla = await crearPlantillaE2();

      const respuesta = await plantillasService.asignarPlantilla(coach1, plantilla.id, {
        alumnoIds: [alumno1],
        modo: ModoAsignacionPlantilla.REEMPLAZAR,
        ajustes: [{ diaId: 'd1', ejercicioId: ejercicioGlobal, pesoPrescritoKg: '999' }],
      });

      expect(respuesta.exitosos).toBe(1);
      const activa = mockRutinas.find((r) => r.alumnoId === alumno1 && r.activa);
      expect(activa?.bloques[0].ejercicios[0].peso).toBe('999');
    });
  });
});
