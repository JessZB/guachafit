import { describe, it, expect, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getTableName,
  plantillasRutina,
  rutinas,
  setTenantSession,
  withTenant,
} from '@guachafit/database';
import { ModoAsignacionPlantilla, NivelObjetivoPlantilla, Rol } from '@guachafit/shared';
import { EntrenamientoService } from '../../src/modules/entrenamiento/entrenamiento.service';
import { PlantillasService } from '../../src/modules/entrenamiento/plantillas.service';

// =============================================================================
// RNF-003 / ADR-009 / ADR-011: aislamiento multi-tenant con RLS
// -----------------------------------------------------------------------------
// Cubre sin Postgres real:
//   1. setTenantSession: aplica los GUCs por transacción con set_config(..., true)
//      (la gramática de SET LOCAL no acepta parámetros ligados).
//   2. withTenant: abre transacción, aplica el contexto y ejecuta el callback en tx.
//   3. Cableado de servicios: TODA consulta a las tablas con RLS habilitado
//      (`rutinas` en etapa 1 WU7; `plantillas_rutina` sumada en WU11) pasa por
//      withTenant; una consulta directa al pool hace fallar el test
//      (deny-by-default simulado).
//   4. Contrato de las migraciones 0004 (5 tablas, ENABLE solo en `rutinas`) y
//      0005 (`plantillas_rutina` en etapa 1): política, ENABLE, bypass
//      superadmin explícito y rollback documentado.
// La verificación real de las políticas corre en PostgreSQL (WU7/WU11).
// =============================================================================

/** Extrae el texto SQL (con params interpolados) de un SQL object de Drizzle. */
function sqlDebugText(sqlObj: any): string {
  const parts: string[] = [];
  const walk = (chunks: any) => {
    if (!Array.isArray(chunks)) return;
    for (const c of chunks) {
      if (Array.isArray(c)) {
        walk(c);
        continue;
      }
      if (c && typeof c === 'object') {
        if (Array.isArray(c.queryChunks)) {
          walk(c.queryChunks);
          continue;
        }
        if (Array.isArray(c.value)) {
          parts.push(c.value.join(''));
          continue;
        }
        if ('value' in c) {
          parts.push(String(c.value));
          continue;
        }
      } else if (typeof c === 'string') {
        parts.push(c);
      }
    }
  };
  walk(sqlObj?.queryChunks);
  return parts.join('');
}

// -----------------------------------------------------------------------------
// Superficie mock: `tx` (dentro de withTenant) vs `db` (pool directo).
// Toda consulta directa a una tabla con RLS habilitado por el pool revienta: es
// el equivalente de test al deny-by-default de RLS sin contexto de sesión.
// Etapa 1 (WU7 + WU11): `rutinas` y `plantillas_rutina`.
// -----------------------------------------------------------------------------
const TABLAS_RLS: string[] = [getTableName(rutinas), getTableName(plantillasRutina)];

interface SuperficieRls {
  db: any;
  tx: any;
  llamadasTx: string[];
  llamadasDb: string[];
  withTenant: any;
}

function crearSuperficieRls(rowsPorTabla: Record<string, any[]>): SuperficieRls {
  const llamadasTx: string[] = [];
  const llamadasDb: string[] = [];

  const crearQuery = (rows: any[]): any => {
    const q: any = {
      where: () => q,
      orderBy: () => q,
      limit: () => q,
      then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject),
    };
    return q;
  };

  const construir = (llamadas: string[], permitirRls: boolean) => {
    const registrar = (tabla: any): string => {
      const nombre = tabla ? getTableName(tabla) : '';
      llamadas.push(nombre);
      if (!permitirRls && TABLAS_RLS.includes(nombre)) {
        throw new Error(
          `Consulta a '${nombre}' FUERA de withTenant: violación del aislamiento RNF-003.`
        );
      }
      return nombre;
    };
    return {
      select: () => ({
        from: (tabla: any) => crearQuery(rowsPorTabla[registrar(tabla)] ?? []),
      }),
      update: (tabla: any) => {
        const nombre = registrar(tabla);
        return { set: () => ({ where: () => crearQuery(rowsPorTabla[nombre] ?? []) }) };
      },
      insert: (tabla: any) => {
        registrar(tabla);
        return {
          values: (vals: any) => ({
            returning: () => Promise.resolve([{ id: 'fila-insertada', ...vals }]),
          }),
        };
      },
    };
  };

  const tx = construir(llamadasTx, true);
  const db = construir(llamadasDb, false);
  const withTenantSpy = vi.fn(async (ctx: any, fn: any) => fn(tx));

  return { db, tx, llamadasTx, llamadasDb, withTenant: withTenantSpy };
}

const COACH_ID = 'c1111111-1111-4111-8111-111111111111';
const SUPERADMIN_ID = '50000000-0000-4000-8000-000000000001';
const ALUMNO_USER_ID = 'a1111111-1111-4111-8111-111111111111';
const ALUMNO_PERFIL_ID = 'f1111111-1111-4111-8111-111111111111';

const perfilAlumno = {
  id: ALUMNO_PERFIL_ID,
  usuarioId: ALUMNO_USER_ID,
  entrenadorId: COACH_ID,
  rachaDias: 0,
  rachaUltimaFecha: null,
};

const rutinaActiva = {
  id: 'e1111111-1111-4111-8111-111111111111',
  alumnoId: ALUMNO_USER_ID,
  entrenadorId: COACH_ID,
  nombre: 'Planificación Semanal Activa',
  activa: true,
  bloques: [
    {
      diaId: 'd1',
      titulo: 'Día 1',
      ejercicios: [{ nombre: 'Sentadilla', series: 3, reps: '10', peso: '50' }],
    },
  ],
  createdAtUtc: new Date('2026-09-01T10:00:00Z'),
  updatedAtUtc: new Date('2026-09-01T10:00:00Z'),
};

const PLANTILLA_ID = 'b1111111-1111-4111-8111-111111111111';
const EJERCICIO_GLOBAL_ID = 'ee111111-1111-4111-8111-111111111111';

const ejercicioGlobal = {
  id: EJERCICIO_GLOBAL_ID,
  entrenadorId: null,
  nombre: 'Sentadilla',
  activo: true,
};

const plantillaRutina = {
  id: PLANTILLA_ID,
  entrenadorId: COACH_ID,
  nombre: 'Fullbody 3 Días',
  nivelObjetivo: NivelObjetivoPlantilla.PRINCIPIANTE,
  bloques: [
    {
      diaId: 'd1',
      titulo: 'Día 1',
      enfoque: 'Fixture',
      diaSugerido: 1,
      ejercicios: [
        {
          ejercicioId: EJERCICIO_GLOBAL_ID,
          nombre: 'Sentadilla',
          series: 3,
          reps: '10',
          peso: '50',
        },
      ],
    },
  ],
  activa: true,
  createdAtUtc: new Date('2026-09-01T10:00:00Z'),
  updatedAtUtc: new Date('2026-09-01T10:00:00Z'),
};

function crearServicio(rows: Record<string, any[]> = {}): {
  servicio: EntrenamientoService;
  superficie: SuperficieRls;
} {
  const superficie = crearSuperficieRls({
    perfiles_alumno: [perfilAlumno],
    rutinas: [rutinaActiva],
    ...rows,
  });
  const servicio = new EntrenamientoService(superficie.db, superficie.withTenant, undefined);
  return { servicio, superficie };
}

function crearServicioPlantillas(rows: Record<string, any[]> = {}): {
  servicio: PlantillasService;
  superficie: SuperficieRls;
} {
  const superficie = crearSuperficieRls({
    plantillas_rutina: [plantillaRutina],
    perfiles_alumno: [perfilAlumno],
    rutinas: [],
    ejercicios_catalogo: [ejercicioGlobal],
    ...rows,
  });
  const servicio = new PlantillasService(superficie.db, superficie.withTenant);
  return { servicio, superficie };
}

describe('RNF-003: setTenantSession y withTenant (mecanismo de sesión RLS)', () => {
  it('aplica los 3 GUCs con set_config(..., true) transaccional, sin usar SET LOCAL', async () => {
    const tx: any = { execute: vi.fn(async () => undefined) };

    await setTenantSession(tx, {
      entrenadorId: 'entrenador-1',
      usuarioId: 'usuario-1',
      isSuperadmin: true,
    });

    expect(tx.execute).toHaveBeenCalledTimes(3);
    const textos = tx.execute.mock.calls.map(([sqlObj]: any[]) => sqlDebugText(sqlObj));

    expect(textos[0]).toContain("set_config('app.current_entrenador_id'");
    expect(textos[0]).toContain('entrenador-1');
    expect(textos[0]).toContain('true'); // is_local => alcance de transacción
    expect(textos[1]).toContain("set_config('app.current_usuario_id'");
    expect(textos[1]).toContain('usuario-1');
    expect(textos[2]).toContain("set_config('app.is_superadmin'");
    expect(textos[2]).toContain('true');
    // SET LOCAL no acepta parámetros ligados: el mecanismo debe usar set_config.
    for (const texto of textos) {
      expect(texto).not.toContain('SET LOCAL');
    }
  });

  it('solo aplica los GUCs presentes en el contexto', async () => {
    const txEntrenador: any = { execute: vi.fn(async () => undefined) };
    await setTenantSession(txEntrenador, { entrenadorId: 'entrenador-1' });
    expect(txEntrenador.execute).toHaveBeenCalledTimes(1);
    expect(sqlDebugText(txEntrenador.execute.mock.calls[0][0])).toContain(
      'app.current_entrenador_id'
    );

    const txAlumno: any = { execute: vi.fn(async () => undefined) };
    await setTenantSession(txAlumno, { usuarioId: 'usuario-1' });
    expect(txAlumno.execute).toHaveBeenCalledTimes(1);
    expect(sqlDebugText(txAlumno.execute.mock.calls[0][0])).toContain('app.current_usuario_id');

    const txSuperadmin: any = { execute: vi.fn(async () => undefined) };
    await setTenantSession(txSuperadmin, { isSuperadmin: true });
    expect(txSuperadmin.execute).toHaveBeenCalledTimes(1);
    expect(sqlDebugText(txSuperadmin.execute.mock.calls[0][0])).toContain('app.is_superadmin');
  });

  it('falla ruidosamente si no hay ningún campo de contexto (sin bypass silencioso)', async () => {
    const tx: any = { execute: vi.fn(async () => undefined) };
    await expect(setTenantSession(tx, {})).rejects.toThrow(/al menos un campo de contexto/i);
    expect(tx.execute).not.toHaveBeenCalled();
  });

  it('withTenant abre transacción, aplica el contexto y ejecuta el callback con el tx', async () => {
    const tx: any = { execute: vi.fn(async () => undefined) };
    const transaction = vi.fn(async (cb: any) => cb(tx));

    const resultado = await withTenant(
      { entrenadorId: 'entrenador-1' },
      async (t) => {
        expect(t).toBe(tx);
        return 42;
      },
      { transaction } as any
    );

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(resultado).toBe(42);
    expect(tx.execute).toHaveBeenCalledTimes(1);
    expect(sqlDebugText(tx.execute.mock.calls[0][0])).toContain('app.current_entrenador_id');
  });

  it('withTenant propaga errores y no devuelve resultados parciales', async () => {
    const tx: any = { execute: vi.fn(async () => undefined) };
    const transaction = vi.fn(async (cb: any) => cb(tx));

    await expect(
      withTenant(
        { usuarioId: 'usuario-1' },
        async () => {
          throw new Error('fallo de negocio');
        },
        { transaction } as any
      )
    ).rejects.toThrow('fallo de negocio');
  });
});

describe('RNF-003: consultas a `rutinas` siempre dentro de withTenant (cableado de servicios)', () => {
  it('guardarRutinaSemanal ejecuta update+insert de rutinas con el GUC del coach', async () => {
    const { servicio, superficie } = crearServicio();

    await servicio.guardarRutinaSemanal(COACH_ID, ALUMNO_PERFIL_ID, {
      alumnoId: ALUMNO_PERFIL_ID,
      nombreRutina: 'Semana 1',
      bloques: [
        {
          diaId: 'd1',
          titulo: 'Día 1',
          ejercicios: [{ nombre: 'Sentadilla', series: 3, reps: '10', peso: '50' }],
        },
      ],
    });

    expect(superficie.withTenant).toHaveBeenCalledWith(
      { entrenadorId: COACH_ID },
      expect.any(Function)
    );
    expect(superficie.llamadasTx).toContain('rutinas');
    expect(superficie.llamadasDb).not.toContain('rutinas');
  });

  it('obtenerRutinaSemanalActiva (coach) lee rutinas con el GUC del entrenador', async () => {
    const { servicio, superficie } = crearServicio();

    const rutina = await servicio.obtenerRutinaSemanalActiva(
      COACH_ID,
      ALUMNO_PERFIL_ID,
      Rol.ENTRENADOR,
      COACH_ID
    );

    expect(rutina?.id).toBe(rutinaActiva.id);
    expect(superficie.withTenant).toHaveBeenCalledWith(
      expect.objectContaining({ entrenadorId: COACH_ID, isSuperadmin: false }),
      expect.any(Function)
    );
    expect(superficie.llamadasDb).not.toContain('rutinas');
  });

  it('obtenerRutinaSemanalActiva (alumno) lee su rutina vía `usuarioId` (política self_select)', async () => {
    const { servicio, superficie } = crearServicio();

    await servicio.obtenerRutinaSemanalActiva(
      COACH_ID,
      ALUMNO_PERFIL_ID,
      Rol.ALUMNO,
      ALUMNO_USER_ID
    );

    expect(superficie.withTenant).toHaveBeenCalledWith(
      expect.objectContaining({ usuarioId: ALUMNO_USER_ID, isSuperadmin: false }),
      expect.any(Function)
    );
    expect(superficie.llamadasDb).not.toContain('rutinas');
  });

  it('obtenerRutinaSemanalActiva (superadmin) usa el bypass explícito app.is_superadmin', async () => {
    const { servicio, superficie } = crearServicio();

    await servicio.obtenerRutinaSemanalActiva(
      SUPERADMIN_ID,
      ALUMNO_PERFIL_ID,
      Rol.SUPERADMIN,
      SUPERADMIN_ID
    );

    expect(superficie.withTenant).toHaveBeenCalledWith(
      expect.objectContaining({ isSuperadmin: true }),
      expect.any(Function)
    );
    expect(superficie.llamadasDb).not.toContain('rutinas');
  });

  it('obtenerSemanaActualProgreso (alumno) lee rutinas con su `usuarioId`', async () => {
    const { servicio, superficie } = crearServicio({ rutinas: [] });

    const progreso = await servicio.obtenerSemanaActualProgreso(ALUMNO_USER_ID, 'UTC');

    expect(progreso.totalBloques).toBe(0);
    expect(superficie.withTenant).toHaveBeenCalledWith(
      { usuarioId: ALUMNO_USER_ID },
      expect.any(Function)
    );
    expect(superficie.llamadasDb).not.toContain('rutinas');
  });

  it('entrenarBloqueHoy (alumno) lee rutinas con su `usuarioId` y falla si no hay rutina activa', async () => {
    const { servicio, superficie } = crearServicio({ rutinas: [] });

    await expect(servicio.entrenarBloqueHoy(ALUMNO_USER_ID, 'bloque-1', {})).rejects.toThrow(
      NotFoundException
    );

    expect(superficie.withTenant).toHaveBeenCalledWith(
      { usuarioId: ALUMNO_USER_ID },
      expect.any(Function)
    );
    expect(superficie.llamadasDb).not.toContain('rutinas');
  });

  it('calcularSemanaAdherencia (coach) lee rutinas en lote con el GUC del entrenador', async () => {
    const { servicio, superficie } = crearServicio();

    const monitor = await servicio.calcularSemanaAdherencia(COACH_ID, 'UTC');

    expect(monitor).toHaveLength(1);
    expect(superficie.withTenant).toHaveBeenCalledWith(
      { entrenadorId: COACH_ID },
      expect.any(Function)
    );
    expect(superficie.llamadasDb).not.toContain('rutinas');
  });
});

describe('RNF-003/WU11: consultas a `plantillas_rutina` siempre dentro de withTenant (RF-017)', () => {
  it('listarPlantillas lee el banco con el GUC del entrenador', async () => {
    const { servicio, superficie } = crearServicioPlantillas();

    const lista = await servicio.listarPlantillas(COACH_ID);

    expect(lista).toHaveLength(1);
    expect(lista[0].id).toBe(PLANTILLA_ID);
    expect(lista[0].entrenadorId).toBe(COACH_ID);
    expect(superficie.withTenant).toHaveBeenCalledWith(
      { entrenadorId: COACH_ID },
      expect.any(Function)
    );
    expect(superficie.llamadasTx).toContain('plantillas_rutina');
    expect(superficie.llamadasDb).not.toContain('plantillas_rutina');
  });

  it('obtenerPlantilla lee dentro de withTenant y responde 404 si es de otro tenant', async () => {
    const { servicio, superficie } = crearServicioPlantillas();

    const plantilla = await servicio.obtenerPlantilla(COACH_ID, PLANTILLA_ID);
    expect(plantilla.id).toBe(PLANTILLA_ID);
    expect(superficie.llamadasTx).toContain('plantillas_rutina');
    expect(superficie.llamadasDb).not.toContain('plantillas_rutina');

    await expect(servicio.obtenerPlantilla('otro-coach', PLANTILLA_ID)).rejects.toThrow(
      NotFoundException
    );
  });

  it('crearPlantilla inserta la plantilla dentro de withTenant con el GUC del coach', async () => {
    const { servicio, superficie } = crearServicioPlantillas();

    const nueva = await servicio.crearPlantilla(COACH_ID, {
      nombre: 'Nueva plantilla',
      nivelObjetivo: NivelObjetivoPlantilla.INTERMEDIO,
      bloques: plantillaRutina.bloques as any,
    });

    expect(nueva.nombre).toBe('Nueva plantilla');
    expect(nueva.entrenadorId).toBe(COACH_ID);
    expect(superficie.llamadasTx).toContain('plantillas_rutina');
    expect(superficie.llamadasDb).not.toContain('plantillas_rutina');
    for (const [ctx] of superficie.withTenant.mock.calls) {
      expect(ctx).toEqual({ entrenadorId: COACH_ID });
    }
  });

  it('actualizarPlantilla y desactivarPlantilla leen y escriben dentro de withTenant', async () => {
    const { servicio, superficie } = crearServicioPlantillas();

    await servicio.actualizarPlantilla(COACH_ID, PLANTILLA_ID, { nombre: 'Renombrada' });
    await servicio.desactivarPlantilla(COACH_ID, PLANTILLA_ID);

    // Cada operación = cargarPlantillaDelCoach (select) + escritura (update).
    const toquesPlantillas = superficie.llamadasTx.filter((t) => t === 'plantillas_rutina');
    expect(toquesPlantillas).toHaveLength(4);
    expect(superficie.llamadasDb).not.toContain('plantillas_rutina');
    for (const [ctx] of superficie.withTenant.mock.calls) {
      expect(ctx).toEqual({ entrenadorId: COACH_ID });
    }
  });

  it('asignarPlantilla lee la plantilla con RLS y escribe la rutina con el GUC del coach', async () => {
    const { servicio, superficie } = crearServicioPlantillas();

    const respuesta = await servicio.asignarPlantilla(COACH_ID, PLANTILLA_ID, {
      alumnoIds: [ALUMNO_PERFIL_ID],
      modo: ModoAsignacionPlantilla.REEMPLAZAR,
    });

    expect(respuesta.exitosos).toBe(1);
    expect(respuesta.fallidos).toBe(0);
    expect(superficie.llamadasTx).toContain('plantillas_rutina');
    expect(superficie.llamadasTx).toContain('rutinas');
    expect(superficie.llamadasDb).not.toContain('plantillas_rutina');
    for (const [ctx] of superficie.withTenant.mock.calls) {
      expect(ctx).toEqual({ entrenadorId: COACH_ID });
    }
  });
});

describe('RNF-003: contrato de la migración 0004 (alcance por etapas)', () => {
  const migrationPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../../packages/database/drizzle/0004_rls_multitenant.sql'
  );
  const sql = readFileSync(migrationPath, 'utf8');

  it('crea políticas para las 5 tablas que exige RNF-003 (incluida rutinas)', () => {
    for (const tabla of [
      'perfiles_alumno',
      'planes_membresia',
      'cuotas_membresia',
      'transacciones_pago',
      'rutinas',
    ]) {
      expect(sql).toMatch(new RegExp(`CREATE POLICY \\w+ ON ${tabla}\\b`));
    }
  });

  it('habilita RLS SOLO en rutinas en esta etapa (las demás quedan preparadas sin ENABLE)', () => {
    const tablasHabilitadas = sql
      .split('\n')
      .filter((linea) => !linea.trim().startsWith('--') && /ENABLE ROW LEVEL SECURITY/i.test(linea))
      .map((linea) => linea.match(/ALTER TABLE\s+(\w+)/i)?.[1]);

    expect(tablasHabilitadas).toEqual(['rutinas']);
    // Las 4 restantes quedan documentadas como etapa 2 (comentadas, sin efecto).
    for (const tabla of ['perfiles_alumno', 'planes_membresia', 'cuotas_membresia', 'transacciones_pago']) {
      expect(sql).toContain(`-- ALTER TABLE ${tabla} ENABLE ROW LEVEL SECURITY;`);
    }
  });

  it('no usa FORCE ROW LEVEL SECURITY y documenta el bypass superadmin explícito', () => {
    const forceActivo = sql
      .split('\n')
      .some((linea) => !linea.trim().startsWith('--') && /FORCE ROW LEVEL SECURITY/i.test(linea));

    expect(forceActivo).toBe(false);
    expect(sql).toContain('app.is_superadmin');
    expect(sql).toContain('is_superadmin()');
  });

  it('incluye el rollback exacto (DISABLE + DROP POLICY + DROP FUNCTION)', () => {
    expect(sql).toContain('DISABLE ROW LEVEL SECURITY');
    expect(sql).toContain('DROP POLICY IF EXISTS rls_rutinas ON rutinas');
    expect(sql).toContain('DROP FUNCTION IF EXISTS is_superadmin()');
    expect(sql).toContain('DROP FUNCTION IF EXISTS current_entrenador_id()');
    expect(sql).toContain('DROP FUNCTION IF EXISTS current_usuario_id()');
  });
});

describe('RNF-003/WU11: contrato de la migración 0005 (plantillas_rutina en etapa 1)', () => {
  const drizzleDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../../packages/database/drizzle'
  );
  const sql = readFileSync(path.join(drizzleDir, '0005_rls_plantillas.sql'), 'utf8');

  it('crea la política tenant de plantillas_rutina con USING y WITH CHECK equivalentes', () => {
    expect(sql).toMatch(/CREATE POLICY rls_plantillas_rutina ON plantillas_rutina\b/);

    const usando = sql
      .split('\n')
      .filter((linea) => !linea.trim().startsWith('--') && /USING \(/.test(linea));
    const check = sql
      .split('\n')
      .filter((linea) => !linea.trim().startsWith('--') && /WITH CHECK \(/.test(linea));

    expect(usando).toHaveLength(1);
    expect(check).toHaveLength(1);
    for (const linea of [...usando, ...check]) {
      expect(linea).toContain('is_superadmin() OR entrenador_id = current_entrenador_id()');
    }
  });

  it('habilita RLS SOLO en plantillas_rutina y no usa FORCE ROW LEVEL SECURITY', () => {
    const tablasHabilitadas = sql
      .split('\n')
      .filter((linea) => !linea.trim().startsWith('--') && /ENABLE ROW LEVEL SECURITY/i.test(linea))
      .map((linea) => linea.match(/ALTER TABLE\s+(\w+)/i)?.[1]);

    expect(tablasHabilitadas).toEqual(['plantillas_rutina']);
    const forceActivo = sql
      .split('\n')
      .some((linea) => !linea.trim().startsWith('--') && /FORCE ROW LEVEL SECURITY/i.test(linea));
    expect(forceActivo).toBe(false);
  });

  it('reutiliza las funciones de sesión de 0004 y no las redefine', () => {
    expect(sql).not.toMatch(/CREATE (OR REPLACE )?FUNCTION/);
    expect(sql).toContain('is_superadmin()');
    expect(sql).toContain('current_entrenador_id()');
  });

  it('incluye el rollback (DISABLE + DROP POLICY)', () => {
    expect(sql).toContain('DISABLE ROW LEVEL SECURITY');
    expect(sql).toContain('DROP POLICY IF EXISTS rls_plantillas_rutina ON plantillas_rutina');
  });

  it('está registrada en el journal de Drizzle (sin migraciones huérfanas)', () => {
    const journal = JSON.parse(readFileSync(path.join(drizzleDir, 'meta/_journal.json'), 'utf8'));
    const entrada = journal.entries.find((e: any) => e.idx === 5);
    expect(entrada?.tag).toBe('0005_rls_plantillas');
    expect(entrada?.breakpoints).toBe(true);
  });
});
