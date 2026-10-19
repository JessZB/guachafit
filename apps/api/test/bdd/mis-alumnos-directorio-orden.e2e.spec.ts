import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Rol, EstadoAlumno, Modalidad, EstadoSesion } from '@guachafit/shared';

/**
 * Lote 02 · Contratos A4-A7 (orden por valor) contra PostgreSQL real.
 * Lote 03 (`.external-agents/03-mis-alumnos-tests.md`): además A2 y el valor de A7
 * (`ultimaSesionFecha` por valor; el mock no evalúa la subconsulta escalar).
 *
 * Origen: `.external-agents/02-mis-alumnos-tests.md` §Tareas-2 (A4-A7 por valor) +
 * `.external-agents/01-mis-alumnos-tests.md` §A (contratos vigentes sin cambios).
 * El mock de `mis-alumnos-directorio.spec.ts` ignora `orderBy` y aplica `limit`/`offset`
 * en inserción, así que paginar por orden solo pasaría si producción ordenara en JS
 * después de paginar (prohibido por ADR-013). El orden se valida aquí, en SQL real.
 *
 * Patrón de `rf007-indice-referencias.e2e.spec.ts`:
 * - GATE: sin `E2E_DATABASE_URL` el spec se salta limpio (`describe.runIf`), así la
 *   suite unitaria nunca depende de Docker.
 * - Siembra y limpieza propias con ids `randomUUID` para no chocar con otros datos.
 * - `process.env.DATABASE_URL` se apunta al E2E antes del import dinámico de
 *   `@guachafit/database` (el cliente lee la URL al importarse).
 * - La consulta corre por la misma vía que producción: `AlumnosService.listarAlumnos`
 *   con el `withTenant` real (default del servicio).
 *
 * Fase roja: `listarAlumnos` aún no acepta `orden` (el schema lo recorta), no devuelve
 * `ultimaSesionFecha`/`rachaDias` y ordena `createdAtUtc` desc + `id` asc. Estos tests
 * deben fallar por eso (orden ignorado / campo ausente), nunca por importación o config.
 *
 * Fixtures (coach A, zona `America/Caracas` para todos):
 * - ANA Alba: nunca entrenó, racha 9 vencida (`2020-01-01`) → efectiva 0.
 * - LUIS Luna: 1 COMPLETADA 2026-02-01, sin `rachaUltimaFecha` → 0.
 * - MARTA Mora: COMPLETADA 2026-01-20, racha 3 de ayer → 3.
 * - ZOE Zulu: COMPLETADA 2026-03-15 (MAX), racha 5 de hoy → 5.
 * - ALEX Arias / ALEX Bravo1 / ALEX Bravo2: mismo nombre `Alex` (desempate por
 *   apellido y por `id`); Bravo1 entrenó 2026-01-10, Arias y Bravo2 nunca.
 * - RITA Ramos / ROSA Robles: archivadas (`deleted_at_utc` no null).
 * - Coach B: BETO con COMPLETADA 2026-05-01 (posterior a todo lo de A; aislamiento).
 */

const ZONA = 'America/Caracas';

interface AlumnoFix {
  key: string;
  usuarioId: string;
  perfilId: string;
  nombres: string;
  apellidos: string;
  modalidad: Modalidad;
  estado: EstadoAlumno;
  rachaDias: number;
  rachaUltimaFecha: string | null;
  zonaHoraria: string;
  createdAtUtc: string;
  deletedAtUtc: string | null;
  numeroDocumento: string;
  email: string;
  sesionesCompletadas: string[];
  sesionesOmitidas: string[];
}

function fechaLocalYyyyMmDd(fecha: Date, zonaHoraria: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zonaHoraria,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(fecha);
}

function diaAnteriorYyyyMmDd(fechaYyyyMmDd: string): string {
  const [anio, mes, dia] = fechaYyyyMmDd.split('-').map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia) - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function diaSiguienteYyyyMmDd(fechaYyyyMmDd: string): string {
  const [anio, mes, dia] = fechaYyyyMmDd.split('-').map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia) + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Misma regla que `calcularRachaEfectiva`: hoy o ayer (día local) conserva, else 0. */
function rachaEfectiva(
  rachaDias: number,
  rachaUltimaFecha: string | null,
  hoyLocal: string,
): number {
  if (!rachaUltimaFecha) return 0;
  const ayer = diaAnteriorYyyyMmDd(hoyLocal);
  if (rachaUltimaFecha < ayer) return 0;
  return Math.max(0, rachaDias);
}

function ultimaDe(f: AlumnoFix): string | null {
  if (f.sesionesCompletadas.length === 0) return null;
  return [...f.sesionesCompletadas].sort().at(-1) ?? null;
}

let sql: any;
let db: any;
let service: any;
let coachA = '';
let coachB = '';
let fixtures: AlumnoFix[] = [];
let alumnosA: AlumnoFix[] = [];
let betoUsuarioId = '';
let HOY_LOCAL = '';

const cryptoMock = {
  encryptHealthRecord: (val: string) => `ENCRYPTED:${val}`,
  decryptHealthRecord: (val: string) =>
    val.startsWith('ENCRYPTED:') ? val.replace('ENCRYPTED:', '') : val,
  generateInvitationToken: () => ({
    rawToken: 'token-raw-1234567890abcdef',
    tokenHash: 'token-hash-1234567890abcdef',
    expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
  }),
  hashPassword: async (p: string) => `hash-${p}`,
} as any;

async function insertarUsuario(id: string, email: string, rol: Rol): Promise<void> {
  await sql.unsafe('INSERT INTO usuarios (id, email, rol) VALUES ($1, $2, $3)', [id, email, rol]);
}

async function insertarPerfil(f: AlumnoFix, entrenadorId: string): Promise<void> {
  await sql.unsafe(
    `INSERT INTO perfiles_alumno
      (id, usuario_id, entrenador_id, numero_documento, nombres, apellidos,
       fecha_nacimiento, telefono_whatsapp, estado_activacion, modalidad,
       racha_dias, racha_ultima_fecha, zona_horaria, deleted_at_utc, created_at_utc)
     VALUES ($1,$2,$3,$4,$5,$6,'1990-01-01','+584120000000',$7,$8,$9,$10,$11,$12,$13)`,
    [
      f.perfilId,
      f.usuarioId,
      entrenadorId,
      f.numeroDocumento,
      f.nombres,
      f.apellidos,
      f.estado,
      f.modalidad,
      f.rachaDias,
      f.rachaUltimaFecha,
      f.zonaHoraria ?? ZONA,
      f.deletedAtUtc,
      f.createdAtUtc,
    ],
  );
}

async function insertarSesion(alumnoUsuarioId: string, fechaFinUtc: string, estado: EstadoSesion): Promise<void> {
  const fechaProgramada = fechaFinUtc.slice(0, 10);
  await sql.unsafe(
    `INSERT INTO sesiones_entrenamiento
      (alumno_id, fecha_programada, fecha_fin_utc, estado)
     VALUES ($1, $2, $3, $4)`,
    [alumnoUsuarioId, fechaProgramada, fechaFinUtc, estado],
  );
}

describe.runIf(Boolean(process.env.E2E_DATABASE_URL))(
  'Lote 02 E2E: orden del directorio "Mis alumnos" (PostgreSQL real)',
  () => {
    beforeAll(async () => {
      process.env.DATABASE_URL = process.env.E2E_DATABASE_URL as string;
      const database = await import('@guachafit/database');
      sql = (database as any).queryClient;
      db = (database as any).db;
      const { AlumnosService } = await import('../../src/modules/alumnos/alumnos.service');
      service = new AlumnosService(db, cryptoMock);

      HOY_LOCAL = fechaLocalYyyyMmDd(new Date(), ZONA);
      const AYER_LOCAL = diaAnteriorYyyyMmDd(HOY_LOCAL);

      coachA = randomUUID();
      coachB = randomUUID();
      await insertarUsuario(coachA, `coach-a-${coachA.slice(0, 8)}@e2e-misalumnos.local`, Rol.ENTRENADOR);
      await insertarUsuario(coachB, `coach-b-${coachB.slice(0, 8)}@e2e-misalumnos.local`, Rol.ENTRENADOR);

      const mk = (
        key: string,
        nombres: string,
        apellidos: string,
        createdAtUtc: string,
        extra: Partial<AlumnoFix> = {},
      ): AlumnoFix => {
        const usuarioId = randomUUID();
        return {
          key,
          usuarioId,
          perfilId: randomUUID(),
          nombres,
          apellidos,
          modalidad: Modalidad.PRESENCIAL,
          estado: EstadoAlumno.ACTIVO,
          rachaDias: 0,
          rachaUltimaFecha: null,
          zonaHoraria: ZONA,
          createdAtUtc,
          deletedAtUtc: null,
          numeroDocumento: `E2E-${usuarioId.slice(0, 8)}`,
          email: `${key}-${usuarioId.slice(0, 8)}@e2e-misalumnos.local`,
          sesionesCompletadas: [],
          sesionesOmitidas: [],
          ...extra,
        };
      };

      alumnosA = [
        mk('ana', 'Ana', 'Alba', '2026-01-01T08:00:00.000Z', {
          modalidad: Modalidad.REMOTO,
          rachaDias: 9,
          rachaUltimaFecha: '2020-01-01',
        }),
        mk('luis', 'Luis', 'Luna', '2026-01-02T08:00:00.000Z', {
          sesionesCompletadas: ['2026-02-01T12:00:00.000Z'],
          rachaDias: 7,
          rachaUltimaFecha: null,
        }),
        mk('marta', 'Marta', 'Mora', '2026-01-03T08:00:00.000Z', {
          sesionesCompletadas: ['2026-01-20T12:00:00.000Z'],
          rachaDias: 3,
          rachaUltimaFecha: AYER_LOCAL,
        }),
        mk('zoe', 'Zoe', 'Zulu', '2026-01-04T08:00:00.000Z', {
          modalidad: Modalidad.REMOTO,
          sesionesCompletadas: ['2026-02-10T12:00:00.000Z', '2026-03-15T12:00:00.000Z'],
          sesionesOmitidas: ['2026-03-20T12:00:00.000Z'],
          rachaDias: 5,
          rachaUltimaFecha: HOY_LOCAL,
        }),
        mk('alex-arias', 'Alex', 'Arias', '2026-01-05T08:00:00.000Z', {
          rachaDias: 4,
          rachaUltimaFecha: HOY_LOCAL,
        }),
        mk('alex-bravo1', 'Alex', 'Bravo', '2026-01-06T08:00:00.000Z', {
          sesionesCompletadas: ['2026-01-10T12:00:00.000Z'],
          rachaDias: 2,
          rachaUltimaFecha: AYER_LOCAL,
        }),
        mk('alex-bravo2', 'Alex', 'Bravo', '2026-01-07T08:00:00.000Z', {
          rachaDias: 6,
          rachaUltimaFecha: '2020-01-01',
        }),
        mk('rita', 'Rita', 'Ramos', '2026-01-08T08:00:00.000Z', {
          deletedAtUtc: new Date().toISOString(),
          sesionesCompletadas: ['2026-01-12T12:00:00.000Z'],
        }),
        mk('rosa', 'Rosa', 'Robles', '2026-01-09T08:00:00.000Z', {
          deletedAtUtc: new Date().toISOString(),
          modalidad: Modalidad.REMOTO,
        }),
      ];

      for (const f of alumnosA) {
        await insertarUsuario(f.usuarioId, f.email, Rol.ALUMNO);
        await insertarPerfil(f, coachA);
        for (const iso of f.sesionesCompletadas) {
          await insertarSesion(f.usuarioId, iso, EstadoSesion.COMPLETADA);
        }
        for (const iso of f.sesionesOmitidas) {
          await insertarSesion(f.usuarioId, iso, EstadoSesion.OMITIDA);
        }
      }

      // COMPLETADA con `fecha_fin_utc` null (no cuenta para `ultimaSesionFecha`).
      const marta = alumnosA.find((f) => f.key === 'marta');
      if (marta) {
        await sql.unsafe(
          `INSERT INTO sesiones_entrenamiento
            (alumno_id, fecha_programada, fecha_fin_utc, estado)
           VALUES ($1, '2026-02-01', NULL, $2)`,
          [marta.usuarioId, EstadoSesion.COMPLETADA],
        );
      }

      betoUsuarioId = randomUUID();
      const betoPerfilId = randomUUID();
      await insertarUsuario(betoUsuarioId, `beto-${betoUsuarioId.slice(0, 8)}@e2e-misalumnos.local`, Rol.ALUMNO);
      await sql.unsafe(
        `INSERT INTO perfiles_alumno
          (id, usuario_id, entrenador_id, numero_documento, nombres, apellidos,
           fecha_nacimiento, telefono_whatsapp, zona_horaria, created_at_utc)
         VALUES ($1,$2,$3,$4,'Beto','Beto','1990-01-01','+584120000000',$5,now())`,
        [betoPerfilId, betoUsuarioId, coachB, `E2E-${betoUsuarioId.slice(0, 8)}`, ZONA],
      );
      await insertarSesion(betoUsuarioId, '2026-05-01T12:00:00.000Z', EstadoSesion.COMPLETADA);

      fixtures = alumnosA;
    }, 60000);

    afterAll(async () => {
      if (!sql) return;
      try {
        const usuariosIds = [
          ...fixtures.map((f) => f.usuarioId),
          betoUsuarioId,
          coachA,
          coachB,
        ].filter(Boolean);
        const perfilesIds = fixtures.map((f) => f.perfilId);
        if (usuariosIds.length > 0) {
          await sql.unsafe('DELETE FROM sesiones_entrenamiento WHERE alumno_id = ANY($1::uuid[])', [
            usuariosIds,
          ]);
        }
        if (perfilesIds.length > 0) {
          await sql.unsafe('DELETE FROM perfiles_alumno WHERE id = ANY($1::uuid[])', [perfilesIds]);
          await sql.unsafe('DELETE FROM perfiles_alumno WHERE entrenador_id = ANY($1::uuid[])', [
            [coachA, coachB],
          ]);
        }
        if (usuariosIds.length > 0) {
          await sql.unsafe('DELETE FROM usuarios WHERE id = ANY($1::uuid[])', [usuariosIds]);
        }
      } catch (error) {
        console.warn('[Lote 02 E2E] limpieza de fixtures falló:', error);
      } finally {
        await sql.end({ timeout: 5 }).catch(() => {});
      }
    });

    const vigentes = () => fixtures.filter((f) => f.deletedAtUtc === null);

    const esperados = {
      alta_reciente: () =>
        [...vigentes()].sort((a, b) =>
          b.createdAtUtc.localeCompare(a.createdAtUtc) || a.perfilId.localeCompare(b.perfilId),
        ).map((f) => f.perfilId),
      nombre: () =>
        [...vigentes()].sort(
          (a, b) =>
            a.nombres.toLowerCase().localeCompare(b.nombres.toLowerCase()) ||
            a.apellidos.toLowerCase().localeCompare(b.apellidos.toLowerCase()) ||
            a.perfilId.localeCompare(b.perfilId),
        ).map((f) => f.perfilId),
      sin_entrenar: () =>
        [...vigentes()].sort((a, b) => {
          const ua = ultimaDe(a);
          const ub = ultimaDe(b);
          if (ua === null && ub === null) return a.perfilId.localeCompare(b.perfilId);
          if (ua === null) return -1;
          if (ub === null) return 1;
          return ua.localeCompare(ub) || a.perfilId.localeCompare(b.perfilId);
        }).map((f) => f.perfilId),
      mayor_racha: () =>
        [...vigentes()].sort((a, b) => {
          const ra = rachaEfectiva(a.rachaDias, a.rachaUltimaFecha, HOY_LOCAL);
          const rb = rachaEfectiva(b.rachaDias, b.rachaUltimaFecha, HOY_LOCAL);
          return (
            rb - ra ||
            a.nombres.toLowerCase().localeCompare(b.nombres.toLowerCase()) ||
            a.perfilId.localeCompare(b.perfilId)
          );
        }).map((f) => f.perfilId),
    };

    const listar = (filtro: Record<string, unknown>) =>
      service.listarAlumnos(coachA, { limit: 100, offset: 0, ...filtro });

    it('A4 alta_reciente: createdAtUtc desc e id asc', async () => {
      const res = await listar({ orden: 'alta_reciente' } as any);
      expect(res.items.map((i: any) => i.id)).toEqual(esperados.alta_reciente());
    });

    it('A4 nombre: lower(nombres) asc, apellidos asc, id asc', async () => {
      const res = await listar({ orden: 'nombre' } as any);
      expect(res.items.map((i: any) => i.id)).toEqual(esperados.nombre());
    });

    it('A4 sin_entrenar: última completada asc, NULLS FIRST, id asc', async () => {
      const res = await listar({ orden: 'sin_entrenar' } as any);
      expect(res.items.map((i: any) => i.id)).toEqual(esperados.sin_entrenar());
    });

    it('A4 mayor_racha: efectiva desc, nombres asc, id asc (vencida cuenta 0)', async () => {
      const res = await listar({ orden: 'mayor_racha' } as any);
      expect(res.items.map((i: any) => i.id)).toEqual(esperados.mayor_racha());
    });

    it('A2 ultimaSesionFecha es el MAX(fecha_fin_utc) COMPLETADA, en ISO UTC', async () => {
      const res = await listar({});
      const porId = new Map(res.items.map((i: any) => [i.id, i]));

      const idDe = (key: string) => fixtures.find((f) => f.key === key)?.perfilId;
      expect(porId.get(idDe('zoe'))?.ultimaSesionFecha).toBe('2026-03-15T12:00:00.000Z');
      expect(porId.get(idDe('marta'))?.ultimaSesionFecha).toBe('2026-01-20T12:00:00.000Z');
      expect(porId.get(idDe('luis'))?.ultimaSesionFecha).toBe('2026-02-01T12:00:00.000Z');
    });

    it('A2 una OMITIDA más reciente no cambia el valor', async () => {
      const res = await listar({});
      const porId = new Map(res.items.map((i: any) => [i.id, i]));

      // Zoe tiene una OMITIDA el 2026-03-20, posterior al MAX completado (03-15).
      const idZoe = fixtures.find((f) => f.key === 'zoe')?.perfilId;
      expect(porId.get(idZoe)?.ultimaSesionFecha).toBe('2026-03-15T12:00:00.000Z');
    });

    it('A2 sin sesiones → null', async () => {
      const res = await listar({});
      const porId = new Map(res.items.map((i: any) => [i.id, i]));

      const idAna = fixtures.find((f) => f.key === 'ana')?.perfilId;
      expect(porId.get(idAna)?.ultimaSesionFecha).toBeNull();
    });

    it('A2 una COMPLETADA con fecha_fin_utc null no cuenta', async () => {
      const res = await listar({});
      const porId = new Map(res.items.map((i: any) => [i.id, i]));

      // Marta tiene una COMPLETADA extra con fin null: sigue mandando el MAX con fecha.
      const idMarta = fixtures.find((f) => f.key === 'marta')?.perfilId;
      expect(porId.get(idMarta)?.ultimaSesionFecha).toBe('2026-01-20T12:00:00.000Z');
    });

    it.each(['alta_reciente', 'nombre', 'sin_entrenar', 'mayor_racha'] as const)(
      'A5 orden=%s: limit=2 por offsets === limit=100, total y resumen iguales',
      async (orden) => {
        const completa = await listar({ orden } as any);
        const pagina1 = await service.listarAlumnos(coachA, { limit: 2, offset: 0, orden } as any);
        const pagina2 = await service.listarAlumnos(coachA, { limit: 2, offset: 2, orden } as any);
        const pagina3 = await service.listarAlumnos(coachA, { limit: 2, offset: 4, orden } as any);
        const pagina4 = await service.listarAlumnos(coachA, { limit: 2, offset: 6, orden } as any);

        const recompuesta = [...pagina1.items, ...pagina2.items, ...pagina3.items, ...pagina4.items].map(
          (i: any) => i.id,
        );
        expect(recompuesta).toEqual(completa.items.map((i: any) => i.id));
        expect(pagina1.total).toBe(completa.total);
        expect(pagina1.resumen).toEqual(completa.resumen);
        const esperado =
          orden === 'alta_reciente'
            ? esperados.alta_reciente()
            : orden === 'nombre'
              ? esperados.nombre()
              : orden === 'sin_entrenar'
                ? esperados.sin_entrenar()
                : esperados.mayor_racha();
        expect(completa.items.map((i: any) => i.id)).toEqual(esperado);
      },
    );

    it('A6 q + orden: filtra sin perder el orden', async () => {
      const res = await listar({ q: 'alex', orden: 'nombre' } as any);
      const esperado = esperados.nombre().filter((id) =>
        ['alex-arias', 'alex-bravo1', 'alex-bravo2'].some(
          (k) => fixtures.find((f) => f.key === k)?.perfilId === id,
        ),
      );
      expect(res.items.length).toBe(3);
      expect(res.items.map((i: any) => i.id)).toEqual(esperado);
    });

    it('A6 estado + orden: filtra sin perder el orden', async () => {
      const res = await listar({ estado: 'activo', orden: 'nombre' } as any);
      expect(res.items.every((i: any) => i.estadoActivacion === EstadoAlumno.ACTIVO)).toBe(true);
      expect(res.items.map((i: any) => i.id)).toEqual(esperados.nombre());
    });

    it('A6 modalidad + orden: filtra sin perder el orden', async () => {
      const res = await listar({ modalidad: 'remoto', orden: 'nombre' } as any);
      expect(res.items.every((i: any) => i.modalidad === Modalidad.REMOTO)).toBe(true);
      const esperado = esperados.nombre().filter((id) =>
        ['ana', 'zoe'].some((k) => fixtures.find((f) => f.key === k)?.perfilId === id),
      );
      expect(res.items.map((i: any) => i.id)).toEqual(esperado);
    });

    it('A6 semaforoPago + orden: filtra sin perder el orden', async () => {
      const res = await listar({ semaforoPago: 'sin_cuota', orden: 'nombre' } as any);
      expect(res.items.every((i: any) => i.semaforoPago === 'sin_cuota')).toBe(true);
      expect(res.items.map((i: any) => i.id)).toEqual(esperados.nombre());
    });

    it('A6 soloArchivados + orden: filtra sin perder el orden', async () => {
      const res = await listar({ soloArchivados: true, orden: 'nombre' } as any);
      expect(res.items).toHaveLength(2);
      expect(res.items.every((i: any) => i.deletedAtUtc !== null)).toBe(true);
      const [rita, rosa] = ['rita', 'rosa'].map((k) => fixtures.find((f) => f.key === k)?.perfilId);
      expect(res.items.map((i: any) => i.id)).toEqual([rita, rosa]);
    });

    it('A7 la sesión del otro coach no altera el orden sin_entrenar', async () => {
      const res = await listar({ orden: 'sin_entrenar' } as any);
      const ids = res.items.map((i: any) => i.id);
      expect(ids.some((id: string) => id === betoUsuarioId)).toBe(false);
      expect(ids).toEqual(esperados.sin_entrenar());
    });

    it('A7 valor: una COMPLETADA más reciente de otro coach no altera ultimaSesionFecha', async () => {
      // Beto (coach B) entrenó el 2026-05-01, posterior a todo lo del coach A.
      const res = await listar({});
      const porId = new Map(res.items.map((i: any) => [i.id, i]));

      const idDe = (key: string) => fixtures.find((f) => f.key === key)?.perfilId;
      expect(porId.get(idDe('zoe'))?.ultimaSesionFecha).toBe('2026-03-15T12:00:00.000Z');
      expect(porId.get(idDe('marta'))?.ultimaSesionFecha).toBe('2026-01-20T12:00:00.000Z');
      expect(porId.get(idDe('luis'))?.ultimaSesionFecha).toBe('2026-02-01T12:00:00.000Z');
      expect(porId.get(idDe('ana'))?.ultimaSesionFecha).toBeNull();
      expect(porId.get(idDe('alex-bravo1'))?.ultimaSesionFecha).toBe('2026-01-10T12:00:00.000Z');
      expect(porId.get(idDe('alex-arias'))?.ultimaSesionFecha).toBeNull();
    });

    it('F1 el índice idx_sesiones_alumno_estado_fin existe en pg_indexes', async () => {
      const filas = await sql.unsafe(
        `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_sesiones_alumno_estado_fin'`,
      );
      expect(
        (filas as any[]).some((f) => f.indexname === 'idx_sesiones_alumno_estado_fin'),
      ).toBe(true);
    });

    describe('F2 racha por zona con orden=mayor_racha (PostgreSQL real)', () => {
      let fixturesF2: AlumnoFix[] = [];

      beforeAll(async () => {
        const ahoraSiembra = new Date();
        const ayerDef = diaAnteriorYyyyMmDd(fechaLocalYyyyMmDd(ahoraSiembra, ZONA));
        const ayerUtc = diaAnteriorYyyyMmDd(fechaLocalYyyyMmDd(ahoraSiembra, 'UTC'));
        const mananaMadrid = diaSiguienteYyyyMmDd(fechaLocalYyyyMmDd(ahoraSiembra, 'Europe/Madrid'));

        const mkF2 = (
          key: string,
          nombres: string,
          apellidos: string,
          createdAtUtc: string,
          extra: Partial<AlumnoFix> = {},
        ): AlumnoFix => {
          const usuarioId = randomUUID();
          return {
            key,
            usuarioId,
            perfilId: randomUUID(),
            nombres,
            apellidos,
            modalidad: Modalidad.PRESENCIAL,
            estado: EstadoAlumno.ACTIVO,
            rachaDias: 0,
            rachaUltimaFecha: null,
            zonaHoraria: ZONA,
            createdAtUtc,
            deletedAtUtc: null,
            numeroDocumento: `E2E-F2-${usuarioId.slice(0, 8)}`,
            email: `${key}-${usuarioId.slice(0, 8)}@e2e-misalumnos.local`,
            sesionesCompletadas: [],
            sesionesOmitidas: [],
            ...extra,
          };
        };

        // Siembra perezosa en el `beforeAll` anidado: los 19 `it` ya declarados
        // corren antes, así que sus expectativas sobre la cartera base no cambian.
        fixturesF2 = [
          mkF2('zona-vacia', 'Vacia', 'Vacia', '2026-01-10T08:00:00.000Z', {
            zonaHoraria: '',
            rachaDias: 6,
            rachaUltimaFecha: ayerDef,
          }),
          mkF2('zona-invalida', 'Marte', 'Olimpo', '2026-01-11T08:00:00.000Z', {
            zonaHoraria: 'Marte/Olimpo',
            rachaDias: 7,
            rachaUltimaFecha: ayerUtc,
          }),
          mkF2('manana', 'Manana', 'Futuro', '2026-01-12T08:00:00.000Z', {
            zonaHoraria: 'Europe/Madrid',
            rachaDias: 8,
            rachaUltimaFecha: mananaMadrid,
          }),
        ];

        for (const f of fixturesF2) {
          await insertarUsuario(f.usuarioId, f.email, Rol.ALUMNO);
          await insertarPerfil(f, coachA);
        }
      }, 60000);

      afterAll(async () => {
        if (!sql) return;
        try {
          const ids = fixturesF2.map((f) => f.usuarioId);
          const pids = fixturesF2.map((f) => f.perfilId);
          if (ids.length > 0) {
            await sql.unsafe('DELETE FROM sesiones_entrenamiento WHERE alumno_id = ANY($1::uuid[])', [
              ids,
            ]);
          }
          if (pids.length > 0) {
            await sql.unsafe('DELETE FROM perfiles_alumno WHERE id = ANY($1::uuid[])', [pids]);
          }
          if (ids.length > 0) {
            await sql.unsafe('DELETE FROM usuarios WHERE id = ANY($1::uuid[])', [ids]);
          }
        } catch (error) {
          console.warn('[Lote 02 E2E F2] limpieza de fixtures F2 falló:', error);
        }
      });

      const porIdMayorRacha = async () => {
        // Si la zona inválida rompiera el SQL, esta llamada lanzaría (500 del
        // directorio): que resuelva es la afirmación de 200.
        const res = await listar({ orden: 'mayor_racha' } as any);
        return new Map<string, any>(res.items.map((i: any) => [i.id, i]));
      };

      const fixtureF2 = (key: string): AlumnoFix => {
        const f = fixturesF2.find((x) => x.key === key);
        expect(f).toBeDefined();
        return f as AlumnoFix;
      };

      it("zona '' con racha de ayer en la zona por defecto conserva la racha", async () => {
        const porId = await porIdMayorRacha();
        const f = fixtureF2('zona-vacia');
        const item = porId.get(f.perfilId);
        expect(item).toBeDefined();
        const hoyDef = fechaLocalYyyyMmDd(new Date(), ZONA);
        expect(item?.rachaUltimaFecha).toBe(f.rachaUltimaFecha);
        expect(item?.rachaDias).toBe(f.rachaDias);
        expect(item?.rachaDias).toBe(rachaEfectiva(f.rachaDias, item?.rachaUltimaFecha ?? null, hoyDef));
      });

      it("zona inválida ('Marte/Olimpo') responde 200 y evalúa con día UTC", async () => {
        const porId = await porIdMayorRacha();
        const f = fixtureF2('zona-invalida');
        const item = porId.get(f.perfilId);
        expect(item).toBeDefined();
        const hoyUtc = fechaLocalYyyyMmDd(new Date(), 'UTC');
        expect(item?.rachaUltimaFecha).toBe(f.rachaUltimaFecha);
        expect(item?.rachaDias).toBe(f.rachaDias);
        expect(item?.rachaDias).toBe(rachaEfectiva(f.rachaDias, item?.rachaUltimaFecha ?? null, hoyUtc));
      });

      it('racha_ultima_fecha = mañana en su zona conserva la racha', async () => {
        const porId = await porIdMayorRacha();
        const f = fixtureF2('manana');
        const item = porId.get(f.perfilId);
        expect(item).toBeDefined();
        const hoyMadrid = fechaLocalYyyyMmDd(new Date(), 'Europe/Madrid');
        expect(item?.rachaUltimaFecha).toBe(f.rachaUltimaFecha);
        expect(item?.rachaDias).toBe(f.rachaDias);
        expect(item?.rachaDias).toBe(rachaEfectiva(f.rachaDias, item?.rachaUltimaFecha ?? null, hoyMadrid));
      });

      it('rachaDias de cada item coincide con la posición de mayor_racha (SQL y JS)', async () => {
        const res = await listar({ orden: 'mayor_racha' } as any);
        const rachas = res.items.map((i: any) => i.rachaDias as number);
        for (let k = 1; k < rachas.length; k++) {
          expect(rachas[k]).toBeLessThanOrEqual(rachas[k - 1]);
        }
        // Mismo desempate que `ordenDirectorio` para MAYOR_RACHA: nombres asc, id asc.
        const reordenado = [...res.items].sort(
          (a: any, b: any) =>
            (b.rachaDias as number) - (a.rachaDias as number) ||
            String(a.nombres).toLowerCase().localeCompare(String(b.nombres).toLowerCase()) ||
            String(a.id).localeCompare(String(b.id)),
        );
        expect(res.items.map((i: any) => i.id)).toEqual(reordenado.map((i: any) => i.id));
      });
    });
  },
);
