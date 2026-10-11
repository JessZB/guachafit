import { describe, it, expect, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getTableName,
  plantillasRutina,
  rutinas,
  cuotasMembresia,
  transaccionesPago,
  planesMembresia,
  perfilesAlumno,
  setTenantSession,
  withTenant,
} from '@guachafit/database';
import {
  EstadoAlumno,
  EstadoConciliacion,
  EstadoCuota,
  EstadoSesion,
  MetodoPago,
  ModoAsignacionPlantilla,
  Moneda,
  NivelObjetivoPlantilla,
  Rol,
} from '@guachafit/shared';
import { EntrenamientoService } from '../../src/modules/entrenamiento/entrenamiento.service';
import { PlantillasService } from '../../src/modules/entrenamiento/plantillas.service';
import { EntrenadorService } from '../../src/modules/entrenador/entrenador.service';
import { FinanzasService } from '../../src/modules/finanzas/finanzas.service';
import { CarteraService } from '../../src/modules/finanzas/cartera.service';
import { AlumnosService } from '../../src/modules/alumnos/alumnos.service';
import { AuthService } from '../../src/modules/auth/auth.service';
import { JWT_REFRESH_SECRET_DESARROLLO } from '../../src/common/config/secretos-jwt';
import { AlumnoHabilitadoGuard } from '../../src/common/guards/alumno-habilitado.guard';
import { AntropometriaService } from '../../src/modules/antropometria/antropometria.service';
import { NutricionService } from '../../src/modules/nutricion/nutricion.service';
import { AntropometriaRecordatorioProcessor } from '../../src/modules/antropometria/processors/antropometria-recordatorio.processor';
import { BillingReminderProcessor } from '../../src/modules/finanzas/billing-reminder.processor';
import { ResumenSemanalProcessor } from '../../src/modules/notificaciones/processors/resumen-semanal.processor';

// =============================================================================
// RNF-003 / ADR-009 / ADR-011: aislamiento multi-tenant con RLS
// -----------------------------------------------------------------------------
// Cubre sin Postgres real:
//   1. setTenantSession: aplica los GUCs por transacción con set_config(..., true)
//      (la gramática de SET LOCAL no acepta parámetros ligados).
//   2. withTenant: abre transacción, aplica el contexto y ejecuta el callback en tx.
//   3. Cableado de servicios: TODA consulta a las tablas con RLS habilitado pasa
//      por withTenant; una consulta directa al pool hace fallar el test
//      (deny-by-default simulado).
//      - Etapa 1 (WU7/WU11): `rutinas`, `plantillas_rutina`.
//      - Etapa 2 (ADR-011 finanzas): `planes_membresia`, `cuotas_membresia` y
//        `transacciones_pago` (coach con `entrenadorId`, alumno con `usuarioId`,
//        rutas de sistema con el bypass explícito `isSuperadmin`).
//   4. Contrato de las migraciones 0004 (5 tablas, ENABLE solo en `rutinas`),
//      0005 (`plantillas_rutina` en etapa 1) y 0012 (finanzas en etapa 2):
//      políticas, ENABLE, bypass superadmin explícito y rollback documentado.
// La verificación real de las políticas corre en PostgreSQL (WU7/WU11/etapa 2).
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
// Etapa 2 (ADR-011 finanzas): `planes_membresia`, `cuotas_membresia` y `transacciones_pago`.
// Etapa 3 (ADR-011 alumnos): `perfiles_alumno` (última tabla de RNF-003).
// -----------------------------------------------------------------------------
const TABLAS_RLS: string[] = [
  getTableName(rutinas),
  getTableName(plantillasRutina),
  getTableName(planesMembresia),
  getTableName(cuotasMembresia),
  getTableName(transaccionesPago),
  getTableName(perfilesAlumno),
];

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
      groupBy: () => q,
      limit: () => q,
      for: () => q,
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
    // La rutina valida sus ejercicios contra el catálogo visible del coach.
    const { servicio, superficie } = crearServicio({
      ejercicios_catalogo: [{ ...ejercicioGlobal, nombre: 'Sentadilla' }],
    });

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

    expect(monitor.items).toHaveLength(1);
    expect(monitor.total).toBe(1);
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

// =============================================================================
// RNF-003/ADR-011 (etapa 2): finanzas — `planes_membresia`, `cuotas_membresia` y
// `transacciones_pago` con RLS. Mismo contrato de test que la etapa 1: el pool raíz
// (`db`) revienta si toca una tabla con RLS; todo debe pasar por `withTenant`.
// =============================================================================

interface SuperficieFinanciera {
  db: any;
  tx: any;
  llamadasTx: string[];
  llamadasDb: string[];
  withTenant: any;
}

/**
 * Superficie mock más rica que la de etapa 1: soporta joins, agregados, `returning`,
 * `delete`, `execute` (set_config) y `transaction` (para los métodos con tx propia).
 */
function crearSuperficieFinanciera(
  rowsPorTabla: Record<string, any[]> = {}
): SuperficieFinanciera {
  const llamadasTx: string[] = [];
  const llamadasDb: string[] = [];

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

    const crearQuery = (data: any[]): any => {
      const q: any = {
        innerJoin: () => q,
        leftJoin: () => q,
        where: () => q,
        groupBy: () => q,
        orderBy: () => q,
        limit: () => q,
        offset: () => q,
        // M5 P1 (A4): la asignación de suscripción bloquea la fila del alumno (FOR UPDATE).
        for: () => q,
        then: (resolve: any, reject: any) => Promise.resolve(data).then(resolve, reject),
      };
      return q;
    };

    return {
      select: (seleccion?: any) => ({
        from: (tabla: any) => {
          const nombre = registrar(tabla);
          const rows = rowsPorTabla[nombre] ?? [];
          // Proyección de joins estilo `{ tx: transaccionesPago, ...camposPerfil }`.
          const data =
            seleccion && typeof seleccion === 'object' && seleccion.tx
              ? rows.map((row: any) => {
                  const perfil = (rowsPorTabla['perfiles_alumno'] ?? []).find(
                    (p: any) => p.usuarioId === row.clienteId
                  );
                  return {
                    tx: row,
                    alumno: perfil,
                    perfilId: perfil?.id,
                    nombres: perfil?.nombres,
                    apellidos: perfil?.apellidos,
                    telefonoWhatsapp: perfil?.telefonoWhatsapp,
                  };
                })
              : rows;
          return crearQuery(data);
        },
      }),
      update: (tabla: any) => {
        const nombre = registrar(tabla);
        return {
          set: () => ({
            where: () => ({
              returning: () => Promise.resolve(rowsPorTabla[nombre] ?? []),
              then: (resolve: any) => resolve(undefined),
            }),
          }),
        };
      },
      insert: (tabla: any) => {
        registrar(tabla);
        return {
          values: (vals: any) => {
            // Defaults de columna que PostgreSQL aplicaría (timestamps) para los DTOs del servicio.
            const record = {
              id: 'fila-insertada',
              ...vals,
              createdAtUtc: vals.createdAtUtc ?? new Date(),
              updatedAtUtc: vals.updatedAtUtc ?? new Date(),
            };
            return {
              returning: () => Promise.resolve([record]),
              then: (resolve: any) => resolve([record]),
            };
          },
        };
      },
      delete: (tabla: any) => {
        registrar(tabla);
        return { where: () => Promise.resolve(undefined) };
      },
      execute: vi.fn(async () => undefined),
    };
  };

  const tx = construir(llamadasTx, true);
  const db: any = construir(llamadasDb, false);
  db.transaction = vi.fn(async (cb: any) => cb(tx));
  const withTenantSpy = vi.fn(async (ctx: any, fn: any) => fn(tx));

  return { db, tx, llamadasTx, llamadasDb, withTenant: withTenantSpy };
}

const PLAN_FIN_ID = 'd1111111-1111-4111-8111-111111111111';
const CUOTA_FIN_ID = 'c2222222-2222-4222-8222-222222222222';
const TRANSACCION_FIN_ID = 'e2222222-2222-4222-8222-222222222222';

const planFinanzas = {
  id: PLAN_FIN_ID,
  entrenadorId: COACH_ID,
  nombre: 'Plan Mensual',
  descripcion: null,
  beneficios: [],
  precioBaseUsd: '50.00',
  duracionMeses: 1,
  activo: true,
  createdAtUtc: new Date('2026-09-01T10:00:00Z'),
  updatedAtUtc: new Date('2026-09-01T10:00:00Z'),
};

const cuotaFinanzas = {
  id: CUOTA_FIN_ID,
  clienteId: ALUMNO_USER_ID,
  entrenadorId: COACH_ID,
  planId: PLAN_FIN_ID,
  periodo: '2026-09',
  montoTotalUsd: '50.00',
  montoAbonadoUsd: '0.00',
  saldoPendienteUsd: '50.00',
  fechaEmisionUtc: new Date('2026-09-01T10:00:00Z'),
  fechaCorteUtc: new Date('2026-09-30T23:59:59Z'),
  estado: EstadoCuota.EMITIDA,
  notas: null,
  createdAtUtc: new Date('2026-09-01T10:00:00Z'),
  updatedAtUtc: new Date('2026-09-01T10:00:00Z'),
};

const transaccionFinanzas = {
  id: TRANSACCION_FIN_ID,
  cuotaId: CUOTA_FIN_ID,
  clienteId: ALUMNO_USER_ID,
  entrenadorId: COACH_ID,
  registradoPor: ALUMNO_USER_ID,
  montoOriginal: '50.00',
  monedaOriginal: Moneda.USD,
  tasaCambioFijada: '1.0000',
  montoEquivalenteUsd: '50.00',
  metodoPago: MetodoPago.TRANSFERENCIA_BANCARIA,
  referenciaBancaria: 'REF-1',
  fechaOperacion: '2026-09-10',
  comprobanteStorageKey: null,
  estadoConciliacion: EstadoConciliacion.PENDIENTE,
  motivoRechazo: null,
  fechaReporteUtc: new Date('2026-09-10T10:00:00Z'),
  fechaConciliacionUtc: null,
  createdAtUtc: new Date('2026-09-10T10:00:00Z'),
  updatedAtUtc: new Date('2026-09-10T10:00:00Z'),
};

const perfilFinanzas = {
  id: ALUMNO_PERFIL_ID,
  usuarioId: ALUMNO_USER_ID,
  entrenadorId: COACH_ID,
  tipoDocumento: 'V_',
  numeroDocumento: '24123456',
  nombres: 'Pedro',
  apellidos: 'Pérez',
  fechaNacimiento: '1998-05-14',
  telefonoWhatsapp: '+584121111111',
  fichaSaludPrivada: null,
  estadoActivacion: 'activo',
  modalidad: 'presencial',
  tasaFijadaOverride: null,
  deletedAtUtc: null,
  createdAtUtc: new Date('2026-09-01T10:00:00Z'),
  updatedAtUtc: new Date('2026-09-01T10:00:00Z'),
};

const coachPerfilFinanzas = {
  id: 'cf111111-1111-4111-8111-111111111111',
  usuarioId: COACH_ID,
  nombres: 'Carlos',
  apellidos: 'Silva',
  nombreComercial: 'Carlos Silva',
  coachCode: 'GUACHA-COACH',
  capacidadMaxima: 50,
  tasaCambioGlobal: '60.0000',
  estadoLicencia: 'activa',
  // RF-010 §6 (CASCADA-COACH): la operabilidad del coach une licencia y cuenta habilitada.
  activo: true,
};

const usuarioAlumnoFinanzas = { id: ALUMNO_USER_ID, email: 'alumno@guachafit.com' };

function filasFinanzasBase(): Record<string, any[]> {
  return {
    planes_membresia: [planFinanzas],
    cuotas_membresia: [cuotaFinanzas],
    transacciones_pago: [transaccionFinanzas],
    perfiles_alumno: [perfilFinanzas],
    perfiles_entrenador: [coachPerfilFinanzas],
    usuarios: [usuarioAlumnoFinanzas],
    overrides_cliente_plan: [],
    tasas_cambio_referencia: [],
    notificaciones_in_app: [],
    controles_antropometricos: [],
    sesiones_entrenamiento: [],
    checkins_nutricionales: [],
  };
}

function crearFinanzasFake() {
  return {
    obtenerTasaVigente: vi.fn(async () => ({
      entrenadorId: COACH_ID,
      tasaEfectiva: null,
      esTasaOverride: false,
      fuente: 'sin_configurar',
      fechaActualizacionUtc: null,
    })),
    resolverComprobanteUrl: vi.fn(async () => null),
    proyectarVES: vi.fn((saldo: string, tasa: string) =>
      (Number(saldo) * Number(tasa)).toFixed(2)
    ),
    // M5-L1 (H2 de fiabilidad): el barrido diario llama a `emitirCuotasProgramadas` ANTES del
    // barrido de estados; sin este método el TypeError quedaba enmascarado en los logs.
    emitirCuotasProgramadas: vi.fn(async () => ({ evaluadas: 0, emitidas: 0, omitidas: 0 })),
    // M5-P1 (validación 09, §6.3 del reporte 08): el barrido termina con la reposición; sin este
    // método la comprobación de deriva C10 no veía `reconciliarRecordatorios` y el fallo quedaba
    // enmascarado por el try/catch del barrido.
    reconciliarRecordatorios: vi.fn(async () => ({ evaluadas: 0, agendadas: 0 })),
  } as any;
}

describe('RNF-003/ADR-011 (etapa 2): tablas financieras siempre dentro de withTenant', () => {
  it('obtenerDashboardComando (coach) lee cuotas y transacciones con el GUC del entrenador', async () => {
    const superficie = crearSuperficieFinanciera(filasFinanzasBase());
    const servicio = new EntrenadorService(superficie.db, superficie.withTenant);

    await servicio.obtenerDashboardComando(COACH_ID);

    expect(superficie.withTenant).toHaveBeenCalledWith(
      { entrenadorId: COACH_ID },
      expect.any(Function)
    );
    expect(superficie.llamadasTx).toContain('cuotas_membresia');
    expect(superficie.llamadasTx).toContain('transacciones_pago');
    expect(superficie.llamadasDb).not.toContain('cuotas_membresia');
    expect(superficie.llamadasDb).not.toContain('transacciones_pago');
    // RNF-003/ADR-011 (etapa 3): la cartera de alumnos (`perfiles_alumno`) va con el GUC del coach.
    expect(superficie.llamadasTx).toContain('perfiles_alumno');
    expect(superficie.llamadasDb).not.toContain('perfiles_alumno');
  });

  it('crearPlan, listarPlanes y asignarSuscripcion usan { entrenadorId } en UNA transacción cada uno', async () => {
    // M5 P1 (A4): migrado de `emitirCuota` (ruta `POST /finanzas/cuotas/emitir` retirada) a
    // la única forma de emitir: la SUSCRIPCIÓN. La regla RNF-003 — emisión y suscripción
    // abren UNA transacción con el GUC `{ entrenadorId }`, `cuotas_membresia` y
    // `planes_membresia` dentro — queda cubierta en el mismo nivel, con la fecha de inicio
    // dentro de la ventana de 5 días para que la asignación emita la cuota del ciclo.
    const superficie = crearSuperficieFinanciera({
      ...filasFinanzasBase(),
      cuotas_membresia: [],
    });
    const scheduler = { programarRecordatoriosCuota: vi.fn(async () => undefined) };
    const servicio = new FinanzasService(
      superficie.db,
      undefined,
      undefined,
      scheduler as any,
      superficie.withTenant
    );

    await servicio.crearPlan(COACH_ID, {
      nombre: 'Plan Nuevo',
      beneficios: [],
      precioBaseUsd: '40.00',
      duracionMeses: 1,
      activo: true,
    } as any);
    await servicio.listarPlanesPorEntrenador(COACH_ID);
    await servicio.asignarSuscripcion(
      COACH_ID,
      ALUMNO_USER_ID,
      { planId: PLAN_FIN_ID, fechaInicio: '2026-10-11' },
      new Date('2026-10-09T15:00:00.000Z')
    );

    for (const [ctx] of superficie.withTenant.mock.calls) {
      expect(ctx).toEqual({ entrenadorId: COACH_ID });
    }
    expect(superficie.llamadasTx).toContain('planes_membresia');
    expect(superficie.llamadasTx).toContain('cuotas_membresia');
    expect(superficie.llamadasDb).not.toContain('planes_membresia');
    expect(superficie.llamadasDb).not.toContain('cuotas_membresia');
  });

  it('reportarPago (alumno) usa { usuarioId } para escribir y el detalle con { entrenadorId }', async () => {
    const superficie = crearSuperficieFinanciera({
      ...filasFinanzasBase(),
      transacciones_pago: [],
    });
    const servicio = new FinanzasService(
      superficie.db,
      undefined,
      undefined,
      undefined,
      superficie.withTenant
    );

    await servicio.reportarPago(CUOTA_FIN_ID, ALUMNO_USER_ID, {
      montoOriginal: '50.00',
      monedaOriginal: Moneda.USD,
      metodoPago: MetodoPago.TRANSFERENCIA_BANCARIA,
      fechaOperacion: '2026-09-20',
      referenciaBancaria: 'REF-E2E',
    } as any);

    expect(superficie.withTenant).toHaveBeenCalledWith(
      { usuarioId: ALUMNO_USER_ID },
      expect.any(Function)
    );
    expect(superficie.withTenant).toHaveBeenCalledWith(
      { entrenadorId: COACH_ID },
      expect.any(Function)
    );
    expect(superficie.llamadasTx).toContain('transacciones_pago');
    expect(superficie.llamadasDb).not.toContain('transacciones_pago');
    expect(superficie.llamadasDb).not.toContain('cuotas_membresia');
  });

  it('obtenerCuotaPorId distingue alumno ({ usuarioId }) de coach ({ entrenadorId })', async () => {
    const superficieAlumno = crearSuperficieFinanciera(filasFinanzasBase());
    const servicioAlumno = new FinanzasService(
      superficieAlumno.db,
      undefined,
      undefined,
      undefined,
      superficieAlumno.withTenant
    );
    await servicioAlumno.obtenerCuotaPorId(CUOTA_FIN_ID, ALUMNO_USER_ID, Rol.ALUMNO);
    expect(superficieAlumno.withTenant).toHaveBeenCalledWith(
      { usuarioId: ALUMNO_USER_ID },
      expect.any(Function)
    );
    expect(superficieAlumno.llamadasDb).not.toContain('cuotas_membresia');

    const superficieCoach = crearSuperficieFinanciera(filasFinanzasBase());
    const servicioCoach = new FinanzasService(
      superficieCoach.db,
      undefined,
      undefined,
      undefined,
      superficieCoach.withTenant
    );
    await servicioCoach.obtenerCuotaPorId(CUOTA_FIN_ID, COACH_ID, Rol.ENTRENADOR, COACH_ID);
    expect(superficieCoach.withTenant).toHaveBeenCalledWith(
      { entrenadorId: COACH_ID },
      expect.any(Function)
    );
    expect(superficieCoach.llamadasDb).not.toContain('cuotas_membresia');
  });

  it('obtenerHistorialCliente (alumno) lee cuotas y transacciones con { usuarioId }', async () => {
    const superficie = crearSuperficieFinanciera(filasFinanzasBase());
    const servicio = new FinanzasService(
      superficie.db,
      undefined,
      undefined,
      undefined,
      superficie.withTenant
    );

    await servicio.obtenerHistorialCliente(
      COACH_ID,
      ALUMNO_USER_ID,
      ALUMNO_USER_ID,
      Rol.ALUMNO
    );

    expect(superficie.withTenant).toHaveBeenCalledWith(
      { usuarioId: ALUMNO_USER_ID },
      expect.any(Function)
    );
    expect(superficie.llamadasTx).toContain('cuotas_membresia');
    expect(superficie.llamadasTx).toContain('transacciones_pago');
    expect(superficie.llamadasDb).not.toContain('cuotas_membresia');
  });

  it('listarBandejaConciliacion (coach) lee transacciones con { entrenadorId }', async () => {
    const superficie = crearSuperficieFinanciera(filasFinanzasBase());
    const servicio = new FinanzasService(
      superficie.db,
      undefined,
      undefined,
      undefined,
      superficie.withTenant
    );

    await servicio.listarBandejaConciliacion(COACH_ID);

    expect(superficie.withTenant).toHaveBeenCalledWith(
      { entrenadorId: COACH_ID },
      expect.any(Function)
    );
    expect(superficie.llamadasDb).not.toContain('transacciones_pago');
  });

  it('obtenerCartera (coach) resuelve KPIs y listas con { entrenadorId }', async () => {
    const superficie = crearSuperficieFinanciera(filasFinanzasBase());
    const servicio = new CarteraService(
      superficie.db,
      crearFinanzasFake(),
      undefined,
      superficie.withTenant
    );

    await servicio.obtenerCartera(COACH_ID, { pestana: 'mora' } as any);

    expect(superficie.withTenant).toHaveBeenCalledWith(
      { entrenadorId: COACH_ID },
      expect.any(Function)
    );
    expect(superficie.llamadasTx).toContain('cuotas_membresia');
    expect(superficie.llamadasDb).not.toContain('cuotas_membresia');
    expect(superficie.llamadasDb).not.toContain('transacciones_pago');
  });

  it('listarAlumnos (directorio) hidrata mora/semáforo/plan con { entrenadorId }', async () => {
    const superficie = crearSuperficieFinanciera(filasFinanzasBase());
    const crypto = {
      encryptHealthRecord: (t: string) => `encrypted:${t}`,
      decryptHealthRecord: (t: string) => t.replace('encrypted:', ''),
    } as any;
    const servicio = new AlumnosService(
      superficie.db,
      crypto,
      undefined,
      superficie.withTenant
    );

    await servicio.listarAlumnos(COACH_ID, {} as any);

    expect(superficie.withTenant).toHaveBeenCalledWith(
      { entrenadorId: COACH_ID },
      expect.any(Function)
    );
    expect(superficie.llamadasTx).toContain('cuotas_membresia');
    expect(superficie.llamadasTx).toContain('planes_membresia');
    expect(superficie.llamadasDb).not.toContain('cuotas_membresia');
    expect(superficie.llamadasDb).not.toContain('planes_membresia');
  });

  it('los processors de sistema (barrido y recordatorio) usan el bypass is_superadmin', async () => {
    const superficie = crearSuperficieFinanciera(filasFinanzasBase());
    const processor = new BillingReminderProcessor(
      superficie.db,
      { emitAsync: vi.fn(async () => []) } as any,
      crearFinanzasFake(),
      { add: vi.fn() } as any,
      superficie.withTenant
    );

    await processor.procesarBarridoDiario(new Date('2026-09-20T00:00:00Z'));
    expect(superficie.withTenant).toHaveBeenCalledWith(
      { isSuperadmin: true },
      expect.any(Function)
    );
    expect(superficie.llamadasDb).not.toContain('cuotas_membresia');

    superficie.withTenant.mockClear();
    await processor.procesarRecordatorio({
      data: { cuotaId: CUOTA_FIN_ID, hito: 'T_MINUS_1' },
    } as any);
    expect(superficie.withTenant).toHaveBeenCalledWith(
      { isSuperadmin: true },
      expect.any(Function)
    );
    expect(superficie.llamadasDb).not.toContain('cuotas_membresia');
  });

  it('C10: el fake de Finanzas cubre TODOS los métodos del servicio real usados por esta suite', async () => {
    // Proxy que registra cada método accedido y falla si falta en el fake: la suite usa el fake
    // como FinanzasService en CarteraService y BillingReminderProcessor.
    const accedidos = new Set<string>();
    const fake = crearFinanzasFake();
    const fakeEspiado = new Proxy(fake, {
      get(objetivo, prop, receptor) {
        if (typeof prop === 'string' && prop !== 'then') accedidos.add(prop);
        const valor = Reflect.get(objetivo, prop, receptor);
        if (valor === undefined && typeof prop === 'string' && prop !== 'then' && !(prop in objetivo)) {
          throw new Error(`Método ausente en el fake de FinanzasService: ${prop}`);
        }
        return valor;
      },
    });

    const superficie = crearSuperficieFinanciera(filasFinanzasBase());
    const cartera = new CarteraService(
      superficie.db,
      fakeEspiado,
      undefined,
      superficie.withTenant
    );
    await cartera.obtenerCartera(COACH_ID, { pestana: 'mora' } as any);

    const processor = new BillingReminderProcessor(
      superficie.db,
      { emitAsync: vi.fn(async () => []) } as any,
      fakeEspiado,
      { add: vi.fn() } as any,
      superficie.withTenant
    );
    await processor.procesarBarridoDiario(new Date('2026-09-20T00:00:00Z'));
    await processor.procesarRecordatorio({
      data: { cuotaId: CUOTA_FIN_ID, hito: 'T_MINUS_1' },
    } as any);

    // Todos los métodos usados por la suite existen en el servicio real (sin drift de nombres)…
    const prototipoReal = FinanzasService.prototype as unknown as Record<string, unknown>;
    for (const metodo of accedidos) {
      expect(typeof prototipoReal[metodo], `${metodo} debe existir en FinanzasService`).toBe(
        'function'
      );
    }
    // …y el barrido ejercitó la emisión nueva (antes ausente en el fake y enmascarada en logs).
    expect(accedidos.has('emitirCuotasProgramadas')).toBe(true);
    expect(fake.emitirCuotasProgramadas).toHaveBeenCalledTimes(1);
  });

  it('el resumen semanal (digest de sistema) lee cobros y cartera con bypass is_superadmin', async () => {
    const superficie = crearSuperficieFinanciera(filasFinanzasBase());
    const processor = new ResumenSemanalProcessor(
      superficie.db,
      { emitAsync: vi.fn(async () => []) } as any,
      { add: vi.fn() } as any,
      superficie.withTenant
    );

    await processor.generarYDespachar(new Date('2026-09-22T08:00:00Z'));

    expect(superficie.withTenant).toHaveBeenCalledWith(
      { isSuperadmin: true },
      expect.any(Function)
    );
    expect(superficie.llamadasTx).toContain('transacciones_pago');
    expect(superficie.llamadasTx).toContain('cuotas_membresia');
    expect(superficie.llamadasDb).not.toContain('transacciones_pago');
    expect(superficie.llamadasDb).not.toContain('cuotas_membresia');
  });

  it('conciliarTransaccion conserva su transacción propia con set_config manual (equivalente a withTenant)', async () => {
    const superficie = crearSuperficieFinanciera(filasFinanzasBase());
    const servicio = new FinanzasService(
      superficie.db,
      undefined,
      undefined,
      undefined,
      superficie.withTenant
    );

    await servicio.conciliarTransaccion(TRANSACCION_FIN_ID, COACH_ID, {
      accion: 'aprobar',
    } as any);

    expect(superficie.db.transaction).toHaveBeenCalledTimes(1);
    const textos = superficie.tx.execute.mock.calls.map(([sqlObj]: any[]) => sqlDebugText(sqlObj));
    expect(textos.some((t: string) => t.includes("set_config('app.current_entrenador_id'"))).toBe(
      true
    );
    expect(textos.some((t: string) => t.includes(COACH_ID))).toBe(true);
    expect(superficie.llamadasDb).not.toContain('transacciones_pago');
  });
});

// =============================================================================
// RNF-003/ADR-011 (etapa 3): `perfiles_alumno` — la última tabla de RNF-003.
// Mismo contrato de test que las etapas 1-2: el pool raíz (`db`) revienta si
// toca la tabla con RLS; todo acceso debe pasar por `withTenant` con el contexto
// correcto (coach `{ entrenadorId }`, alumno `{ usuarioId }`, sistema
// `{ isSuperadmin: true }`).
// =============================================================================

const SESION_ENTRENAMIENTO_ID = '5e511111-1111-4111-8111-111111111111';
const CONTROL_ANTROPOMETRICO_ID = 'c0111111-1111-4111-8111-111111111111';

const cryptoAuthFake = {
  comparePassword: vi.fn(async () => true),
  hashPassword: vi.fn(async (p: string) => `hash-${p}`),
  hashSha256: vi.fn((v: string) => `sha-${v}`),
  encryptHealthRecord: vi.fn((t: string) => `enc:${t}`),
  decryptHealthRecord: vi.fn((t: string) => t.replace('enc:', '')),
  generateInvitationToken: vi.fn(() => ({
    rawToken: 'raw-token-etapa-3',
    tokenHash: 'hash-token-etapa-3',
    expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
  })),
} as any;

const usuarioAlumnoLogin = {
  id: ALUMNO_USER_ID,
  email: 'alumno@guachafit.com',
  rol: Rol.ALUMNO,
  estado: 'activo',
  activo: true,
  passwordHash: 'hash-de-prueba',
};

const perfilAlumnoEtapa3 = {
  id: ALUMNO_PERFIL_ID,
  usuarioId: ALUMNO_USER_ID,
  entrenadorId: COACH_ID,
  tipoDocumento: 'V_',
  numeroDocumento: '24123456',
  nombres: 'Pedro',
  apellidos: 'Pérez',
  fechaNacimiento: '1998-05-14',
  telefonoWhatsapp: '+584121111111',
  fichaSaludPrivada: null,
  estadoActivacion: EstadoAlumno.ACTIVO,
  modalidad: 'presencial',
  periodicidadAntropometria: null,
  antropometriaInicio: null,
  tasaFijadaOverride: null,
  rachaDias: 0,
  rachaUltimaFecha: null,
  deletedAtUtc: null,
  createdAtUtc: new Date('2026-09-01T10:00:00Z'),
  updatedAtUtc: new Date('2026-09-01T10:00:00Z'),
};

const sesionEnProgresoEtapa3 = {
  id: SESION_ENTRENAMIENTO_ID,
  alumnoId: ALUMNO_USER_ID,
  rutinaId: null,
  bloqueId: null,
  fechaProgramada: '2026-09-20',
  fechaInicioUtc: new Date('2026-09-20T10:00:00Z'),
  fechaFinUtc: null,
  timezoneCliente: 'America/Caracas',
  estado: EstadoSesion.EN_PROGRESO,
  porcentajeCumplimiento: '0.00',
  notasAlumno: null,
  createdAtUtc: new Date('2026-09-20T10:00:00Z'),
  updatedAtUtc: new Date('2026-09-20T10:00:00Z'),
};

function filasEtapa3(extra: Record<string, any[]> = {}): Record<string, any[]> {
  return {
    usuarios: [usuarioAlumnoLogin],
    perfiles_alumno: [perfilAlumnoEtapa3],
    perfiles_entrenador: [coachPerfilFinanzas],
    ...extra,
  };
}

describe('RNF-003/ADR-011 (etapa 3): perfiles_alumno siempre dentro de withTenant', () => {
  it('login del alumno lee el perfil con { usuarioId } (self-select) y nunca por el pool raíz', async () => {
    const superficie = crearSuperficieFinanciera(filasEtapa3());
    const servicio = new AuthService(superficie.db, cryptoAuthFake, superficie.withTenant);

    const res = await servicio.login({ email: 'alumno@guachafit.com', password: 'x' } as any);

    expect(res.usuario.entrenadorId).toBe(COACH_ID);
    expect(superficie.withTenant).toHaveBeenCalledWith(
      { usuarioId: ALUMNO_USER_ID },
      expect.any(Function)
    );
    expect(superficie.llamadasDb).not.toContain('perfiles_alumno');
  });

  it('refresh y /auth/me del alumno leen el perfil con { usuarioId } (self-select)', async () => {
    const superficie = crearSuperficieFinanciera(filasEtapa3());
    const servicio = new AuthService(superficie.db, cryptoAuthFake, superficie.withTenant);

    const refreshToken = jwt.sign(
      { sub: ALUMNO_USER_ID, email: 'alumno@guachafit.com', rol: Rol.ALUMNO },
      process.env.JWT_REFRESH_SECRET || JWT_REFRESH_SECRET_DESARROLLO,
      { expiresIn: '7d' }
    );
    await servicio.refresh(refreshToken);
    await servicio.obtenerSesion(ALUMNO_USER_ID);

    expect(superficie.withTenant).toHaveBeenCalledWith(
      { usuarioId: ALUMNO_USER_ID },
      expect.any(Function)
    );
    expect(superficie.withTenant).toHaveBeenCalledTimes(2);
    expect(superficie.llamadasDb).not.toContain('perfiles_alumno');
  });

  it('el canje de invitación del alumno lee el perfil con { usuarioId } antes de escribir', async () => {
    const superficie = crearSuperficieFinanciera(
      filasEtapa3({
        usuarios: [
          {
            ...usuarioAlumnoLogin,
            passwordHash: null,
            tokenInvitacionHash: 'sha-token-etapa-3',
            tokenInvitacionExpira: new Date(Date.now() + 3600 * 1000),
          },
        ],
      })
    );
    const servicio = new AuthService(superficie.db, cryptoAuthFake, superficie.withTenant);

    const res = await servicio.establecerPasswordConToken({
      token: 'token-etapa-3',
      password: 'nueva-clave-2026',
    } as any);

    expect(res.usuario.entrenadorId).toBe(COACH_ID);
    expect(superficie.withTenant).toHaveBeenCalledWith(
      { usuarioId: ALUMNO_USER_ID },
      expect.any(Function)
    );
    expect(superficie.llamadasDb).not.toContain('perfiles_alumno');
  });

  it('el guard de alumno habilitado lee el ciclo de vida con { usuarioId }', async () => {
    const superficie = crearSuperficieFinanciera(filasEtapa3());
    const guard = new AlumnoHabilitadoGuard(
      superficie.db,
      new Reflector(),
      undefined,
      superficie.withTenant
    );
    const contexto: any = {
      switchToHttp: () => ({
        getRequest: () => ({ user: { sub: ALUMNO_USER_ID, rol: Rol.ALUMNO } }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    };

    await expect(guard.canActivate(contexto)).resolves.toBe(true);
    expect(superficie.withTenant).toHaveBeenCalledWith(
      { usuarioId: ALUMNO_USER_ID },
      expect.any(Function)
    );
    expect(superficie.llamadasDb).not.toContain('perfiles_alumno');
  });

  it('alta manual: el INSERT del perfil corre con { entrenadorId } del coach creador', async () => {
    const superficie = crearSuperficieFinanciera(filasEtapa3({ usuarios: [] }));
    const servicio = new AlumnosService(
      superficie.db,
      cryptoAuthFake,
      undefined,
      superficie.withTenant
    );

    await servicio.crearAlumnoManual(COACH_ID, {
      nombres: 'Marcos',
      apellidos: 'Pérez',
      email: 'marcos@guachafit.com',
      tipoDocumento: 'V_',
      numeroDocumento: '18456123',
      fechaNacimiento: '1994-05-15',
      telefonoWhatsapp: '+584121234567',
      modalidad: 'presencial',
    } as any);

    expect(superficie.withTenant).toHaveBeenCalledWith(
      { entrenadorId: COACH_ID },
      expect.any(Function)
    );
    expect(superficie.llamadasTx).toContain('perfiles_alumno');
    expect(superficie.llamadasDb).not.toContain('perfiles_alumno');
  });

  it('registro público (RF-011): el INSERT anónimo usa { entrenadorId: coachResuelto }', async () => {
    const superficie = crearSuperficieFinanciera(filasEtapa3({ usuarios: [] }));
    const servicio = new AlumnosService(
      superficie.db,
      cryptoAuthFake,
      undefined,
      superficie.withTenant
    );

    await servicio.registroPublico({
      coachCode: 'GUACHA-COACH',
      nombres: 'Valeria',
      apellidos: 'Castillo',
      email: 'valeria@guachafit.com',
      password: 'clave-segura-2026',
      tipoDocumento: 'V_',
      numeroDocumento: '26123456',
      fechaNacimiento: '1999-03-10',
      telefonoWhatsapp: '+584149998877',
      modalidad: 'remoto',
    } as any);

    expect(superficie.withTenant).toHaveBeenCalledWith(
      { entrenadorId: COACH_ID },
      expect.any(Function)
    );
    expect(superficie.llamadasTx).toContain('perfiles_alumno');
    expect(superficie.llamadasDb).not.toContain('perfiles_alumno');
  });

  it('softDelete y restaurarAlumno leen/escriben el perfil con { entrenadorId }', async () => {
    const superficieSoft = crearSuperficieFinanciera(filasEtapa3());
    const servicioSoft = new AlumnosService(
      superficieSoft.db,
      cryptoAuthFake,
      undefined,
      superficieSoft.withTenant
    );
    await servicioSoft.softDelete(COACH_ID, ALUMNO_PERFIL_ID);

    expect(superficieSoft.withTenant).toHaveBeenCalledWith(
      { entrenadorId: COACH_ID },
      expect.any(Function)
    );
    expect(superficieSoft.llamadasDb).not.toContain('perfiles_alumno');

    const superficieRestaurar = crearSuperficieFinanciera(
      filasEtapa3({
        perfiles_alumno: [
          { ...perfilAlumnoEtapa3, estadoActivacion: EstadoAlumno.INACTIVO_PAUSADO, deletedAtUtc: new Date() },
        ],
      })
    );
    const servicioRestaurar = new AlumnosService(
      superficieRestaurar.db,
      cryptoAuthFake,
      undefined,
      superficieRestaurar.withTenant
    );
    await servicioRestaurar.restaurarAlumno(COACH_ID, ALUMNO_PERFIL_ID);

    expect(superficieRestaurar.withTenant).toHaveBeenCalledWith(
      { entrenadorId: COACH_ID },
      expect.any(Function)
    );
    expect(superficieRestaurar.llamadasDb).not.toContain('perfiles_alumno');
  });

  it('obtenerPorId es actor-aware: coach { entrenadorId } y alumno { usuarioId }', async () => {
    const superficieCoach = crearSuperficieFinanciera(filasEtapa3());
    const servicioCoach = new AlumnosService(
      superficieCoach.db,
      cryptoAuthFake,
      undefined,
      superficieCoach.withTenant
    );
    await servicioCoach.obtenerPorId(ALUMNO_PERFIL_ID, COACH_ID, Rol.ENTRENADOR, COACH_ID);
    expect(superficieCoach.withTenant).toHaveBeenCalledWith(
      { entrenadorId: COACH_ID },
      expect.any(Function)
    );
    expect(superficieCoach.llamadasDb).not.toContain('perfiles_alumno');

    const superficieAlumno = crearSuperficieFinanciera(filasEtapa3());
    const servicioAlumno = new AlumnosService(
      superficieAlumno.db,
      cryptoAuthFake,
      undefined,
      superficieAlumno.withTenant
    );
    await servicioAlumno.obtenerPorId(ALUMNO_PERFIL_ID, ALUMNO_USER_ID, Rol.ALUMNO);
    expect(superficieAlumno.withTenant).toHaveBeenCalledWith(
      { usuarioId: ALUMNO_USER_ID },
      expect.any(Function)
    );
    expect(superficieAlumno.llamadasDb).not.toContain('perfiles_alumno');
  });

  it('finalizarSesion (alumno) persiste la racha con { usuarioId } (self-update de 0013)', async () => {
    const superficie = crearSuperficieFinanciera({
      perfiles_alumno: [perfilAlumnoEtapa3],
      sesiones_entrenamiento: [sesionEnProgresoEtapa3],
      ejercicios_sesion: [
        { id: 'es-1', sesionId: SESION_ENTRENAMIENTO_ID, ejercicioId: 'ej-1', orden: 1 },
      ],
      series_registro: [
        {
          id: 'sr-1',
          ejercicioSesionId: 'es-1',
          numeroSerie: 1,
          repsObjetivo: 10,
          repsLogradas: 10,
          pesoKg: '50.00',
          pesoPrescritoKg: '50.00',
          rpe: '8.0',
          completada: true,
        },
      ],
      ejercicios_catalogo: [],
    });
    const servicio = new EntrenamientoService(
      superficie.db,
      superficie.withTenant,
      undefined
    );

    await servicio.finalizarSesion(SESION_ENTRENAMIENTO_ID, ALUMNO_USER_ID, {} as any);

    expect(superficie.withTenant).toHaveBeenCalledWith(
      { usuarioId: ALUMNO_USER_ID },
      expect.any(Function)
    );
    expect(superficie.llamadasTx).toContain('perfiles_alumno');
    expect(superficie.llamadasDb).not.toContain('perfiles_alumno');
  });

  it('crearSesion (coach) valida la tenancy del alumno con { entrenadorId }', async () => {
    const superficie = crearSuperficieFinanciera(
      filasEtapa3({
        sesiones_entrenamiento: [
          {
            ...sesionEnProgresoEtapa3,
            id: 'fila-insertada',
            estado: EstadoSesion.PLANIFICADA,
            fechaInicioUtc: null,
          },
        ],
        ejercicios_sesion: [],
      })
    );
    const servicio = new EntrenamientoService(
      superficie.db,
      superficie.withTenant,
      undefined
    );

    await servicio.crearSesion(COACH_ID, {
      alumnoId: ALUMNO_USER_ID,
      fechaProgramada: '2026-09-25',
      ejercicios: [
        {
          ejercicioId: 'ee111111-1111-4111-8111-111111111111',
          series: [{ numeroSerie: 1, repsObjetivo: 10 }],
        },
      ],
    } as any);

    expect(superficie.withTenant).toHaveBeenCalledWith(
      { entrenadorId: COACH_ID },
      expect.any(Function)
    );
    expect(superficie.llamadasDb).not.toContain('perfiles_alumno');
  });

  it('antropometría (coach) lee la cartera y el perfil con { entrenadorId }', async () => {
    const superficie = crearSuperficieFinanciera(
      filasEtapa3({
        controles_antropometricos: [
          {
            id: CONTROL_ANTROPOMETRICO_ID,
            alumnoId: ALUMNO_USER_ID,
            fechaEvaluacion: '2026-09-20',
            pesoKg: '78.50',
            estado: 'pendiente_aprobacion',
            modalidad: 'remoto',
            origen: 'remoto_autoreporte',
            registradoPor: ALUMNO_USER_ID,
            createdAtUtc: new Date('2026-09-20T10:00:00Z'),
            updatedAtUtc: new Date('2026-09-20T10:00:00Z'),
          },
        ],
        fotos_antropometria: [],
      })
    );
    const servicio = new AntropometriaService(
      superficie.db,
      { generarPresignedGetUrl: vi.fn(async () => 'https://r2/x') } as any,
      { emitAsync: vi.fn(async () => []) } as any,
      superficie.withTenant
    );

    await servicio.listarPendientes(COACH_ID);
    await servicio.obtenerControlPorId(CONTROL_ANTROPOMETRICO_ID, {
      id: COACH_ID,
      rol: Rol.ENTRENADOR,
      entrenadorId: COACH_ID,
    });

    expect(superficie.withTenant).toHaveBeenCalledWith(
      { entrenadorId: COACH_ID },
      expect.any(Function)
    );
    expect(superficie.llamadasDb).not.toContain('perfiles_alumno');
  });

  it('el barrido de recordatorios antropométricos (sistema) lee perfiles con is_superadmin', async () => {
    const superficie = crearSuperficieFinanciera({
      perfiles_alumno: [
        {
          ...perfilAlumnoEtapa3,
          periodicidad: 'mensual',
          inicio: '2026-01-01',
          timezone: 'America/Caracas',
          modalidad: 'remoto',
        },
      ],
      controles_antropometricos: [],
      notificaciones_in_app: [],
    });
    const processor = new AntropometriaRecordatorioProcessor(
      superficie.db,
      { emitAsync: vi.fn(async () => []) } as any,
      superficie.withTenant
    );

    await processor.generarYDespachar(new Date('2026-09-07T10:00:00Z'));

    expect(superficie.withTenant).toHaveBeenCalledWith(
      { isSuperadmin: true },
      expect.any(Function)
    );
    expect(superficie.llamadasDb).not.toContain('perfiles_alumno');
  });

  it('nutrición: tenancy del coach ({ entrenadorId }) y self del alumno ({ usuarioId })', async () => {
    const superficieCoach = crearSuperficieFinanciera(filasEtapa3());
    const servicioCoach = new NutricionService(
      superficieCoach.db,
      undefined,
      superficieCoach.withTenant
    );
    await servicioCoach.obtenerMetasDeAlumno(COACH_ID, ALUMNO_USER_ID);

    expect(superficieCoach.withTenant).toHaveBeenCalledWith(
      { entrenadorId: COACH_ID },
      expect.any(Function)
    );
    expect(superficieCoach.llamadasDb).not.toContain('perfiles_alumno');

    const superficieAlumno = crearSuperficieFinanciera(
      filasEtapa3({
        checkins_nutricionales: [
          {
            id: 'chk-1',
            alumnoId: ALUMNO_USER_ID,
            fecha: '2026-09-20',
            semaforo: 'cumplido',
            createdAtUtc: new Date('2026-09-20T22:00:00Z'),
            updatedAtUtc: new Date('2026-09-20T22:00:00Z'),
          },
        ],
        fotos_comida: [],
      })
    );
    const servicioAlumno = new NutricionService(
      superficieAlumno.db,
      undefined,
      superficieAlumno.withTenant
    );
    await servicioAlumno.obtenerCheckinHoy(ALUMNO_USER_ID, '2026-09-20');

    expect(superficieAlumno.withTenant).toHaveBeenCalledWith(
      { usuarioId: ALUMNO_USER_ID },
      expect.any(Function)
    );
    expect(superficieAlumno.llamadasDb).not.toContain('perfiles_alumno');
  });

  it('obtenerTasaVigente con cliente abre su propia transacción con el contexto del actor', async () => {
    const superficie = crearSuperficieFinanciera(filasEtapa3({ tasas_cambio_referencia: [] }));
    const servicio = new FinanzasService(
      superficie.db,
      undefined,
      undefined,
      undefined,
      superficie.withTenant
    );

    await servicio.obtenerTasaVigente(COACH_ID, ALUMNO_USER_ID);

    expect(superficie.withTenant).toHaveBeenCalledWith(
      { entrenadorId: COACH_ID },
      expect.any(Function)
    );
    expect(superficie.llamadasDb).not.toContain('perfiles_alumno');
  });

  it('el digest semanal (sistema) lee la cartera de alumnos con is_superadmin', async () => {
    const superficie = crearSuperficieFinanciera(filasEtapa3());
    const processor = new ResumenSemanalProcessor(
      superficie.db,
      { emitAsync: vi.fn(async () => []) } as any,
      { add: vi.fn() } as any,
      superficie.withTenant
    );

    await processor.generarYDespachar(new Date('2026-09-22T08:00:00Z'));

    expect(superficie.withTenant).toHaveBeenCalledWith(
      { isSuperadmin: true },
      expect.any(Function)
    );
    expect(superficie.llamadasDb).not.toContain('perfiles_alumno');
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

describe('RNF-003/ADR-011 (etapa 2): contrato de la migración 0012 (finanzas)', () => {
  const drizzleDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../../packages/database/drizzle'
  );
  const sql = readFileSync(path.join(drizzleDir, '0012_rls_finanzas.sql'), 'utf8');

  it('es aditiva: no redefine funciones ni reescribe políticas de 0004', () => {
    expect(sql).not.toMatch(/CREATE (OR REPLACE )?FUNCTION/);
    // No vuelve a crear las políticas base de 0004 (solo las que faltaban).
    for (const politica of [
      'rls_planes_membresia ',
      'rls_cuotas_membresia ',
      'rls_transacciones_pago ',
    ]) {
      expect(sql).not.toMatch(new RegExp(`CREATE POLICY ${politica.trim()} ON`, 'i'));
    }
    expect(sql).toContain('is_superadmin()');
    // El contrato de sesión documenta el GUC del coach aunque las políticas nuevas sean self.
    expect(sql).toContain('app.current_entrenador_id');
    expect(sql).toContain('current_usuario_id()');
  });

  it('crea las políticas self que faltaban (plan propio, self-update y self-insert)', () => {
    expect(sql).toMatch(/CREATE POLICY rls_planes_membresia_self_select ON planes_membresia/);
    expect(sql).toMatch(/CREATE POLICY rls_cuotas_membresia_self_update ON cuotas_membresia/);
    expect(sql).toMatch(/CREATE POLICY rls_transacciones_pago_self_insert ON transacciones_pago/);
    // Las escrituras self exigen `cliente_id = current_usuario_id()` en el WITH CHECK.
    const checks = sql
      .split('\n')
      .filter((linea) => !linea.trim().startsWith('--') && /WITH CHECK \(/.test(linea));
    for (const linea of checks) {
      expect(linea).toContain('cliente_id = current_usuario_id()');
    }
  });

  it('habilita RLS SOLO en las 3 tablas financieras y no usa FORCE', () => {
    const tablasHabilitadas = sql
      .split('\n')
      .filter((linea) => !linea.trim().startsWith('--') && /ENABLE ROW LEVEL SECURITY/i.test(linea))
      .map((linea) => linea.match(/ALTER TABLE\s+(\w+)/i)?.[1]);

    expect(tablasHabilitadas).toEqual([
      'planes_membresia',
      'cuotas_membresia',
      'transacciones_pago',
    ]);
    const forceActivo = sql
      .split('\n')
      .some((linea) => !linea.trim().startsWith('--') && /FORCE ROW LEVEL SECURITY/i.test(linea));
    expect(forceActivo).toBe(false);
  });

  it('no habilita perfiles_alumno (queda para la etapa 3)', () => {
    const lineasEjecutables = sql
      .split('\n')
      .filter((linea) => !linea.trim().startsWith('--'));
    expect(
      lineasEjecutables.some((linea) => /ALTER TABLE\s+perfiles_alumno/i.test(linea))
    ).toBe(false);
  });

  it('incluye el rollback (DISABLE + DROP POLICY de las políticas nuevas)', () => {
    expect(sql).toContain('DISABLE ROW LEVEL SECURITY');
    expect(sql).toContain('DROP POLICY IF EXISTS rls_planes_membresia_self_select ON planes_membresia');
    expect(sql).toContain('DROP POLICY IF EXISTS rls_cuotas_membresia_self_update ON cuotas_membresia');
    expect(sql).toContain('DROP POLICY IF EXISTS rls_transacciones_pago_self_insert ON transacciones_pago');
  });

  it('está registrada en el journal de Drizzle (sin migraciones huérfanas)', () => {
    const journal = JSON.parse(readFileSync(path.join(drizzleDir, 'meta/_journal.json'), 'utf8'));
    const entrada = journal.entries.find((e: any) => e.idx === 12);
    expect(entrada?.tag).toBe('0012_rls_finanzas');
    expect(entrada?.breakpoints).toBe(true);
  });
});

describe('RNF-003/ADR-011 (etapa 3): contrato de la migración 0013 (perfiles_alumno)', () => {
  const drizzleDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../../packages/database/drizzle'
  );
  const sql = readFileSync(path.join(drizzleDir, '0013_rls_perfiles_alumno.sql'), 'utf8');

  it('es aditiva: no redefine funciones ni reescribe las políticas base de 0004', () => {
    expect(sql).not.toMatch(/CREATE (OR REPLACE )?FUNCTION/);
    expect(sql).not.toMatch(/CREATE POLICY rls_perfiles_alumno ON/);
    expect(sql).not.toMatch(/CREATE POLICY rls_perfiles_alumno_self_select ON/);
    expect(sql).toContain('current_usuario_id()');
    // El contrato de sesión documenta los 3 GUCs.
    expect(sql).toContain('app.current_entrenador_id');
    expect(sql).toContain('app.current_usuario_id');
    expect(sql).toContain('app.is_superadmin');
  });

  it('crea el self-update que faltaba para el camino real del alumno (racha, RF-001 RN-02)', () => {
    expect(sql).toMatch(/CREATE POLICY rls_perfiles_alumno_self_update ON perfiles_alumno/);
    const checks = sql
      .split('\n')
      .filter((linea) => !linea.trim().startsWith('--') && /WITH CHECK \(/.test(linea));
    expect(checks).toHaveLength(1);
    for (const linea of checks) {
      expect(linea).toContain('usuario_id = current_usuario_id()');
    }
  });

  it('habilita RLS SOLO en perfiles_alumno y no usa FORCE ROW LEVEL SECURITY', () => {
    const tablasHabilitadas = sql
      .split('\n')
      .filter((linea) => !linea.trim().startsWith('--') && /ENABLE ROW LEVEL SECURITY/i.test(linea))
      .map((linea) => linea.match(/ALTER TABLE\s+(\w+)/i)?.[1]);

    expect(tablasHabilitadas).toEqual(['perfiles_alumno']);
    const forceActivo = sql
      .split('\n')
      .some((linea) => !linea.trim().startsWith('--') && /FORCE ROW LEVEL SECURITY/i.test(linea));
    expect(forceActivo).toBe(false);
  });

  it('incluye el rollback (DISABLE + DROP POLICY)', () => {
    expect(sql).toContain('DISABLE ROW LEVEL SECURITY');
    expect(sql).toContain('DROP POLICY IF EXISTS rls_perfiles_alumno_self_update ON perfiles_alumno');
  });

  it('está registrada en el journal con un `when` real (nunca futuro, incidente D1 de 0012)', () => {
    const journal = JSON.parse(readFileSync(path.join(drizzleDir, 'meta/_journal.json'), 'utf8'));
    const entrada = journal.entries.find((e: any) => e.idx === 13);
    expect(entrada?.tag).toBe('0013_rls_perfiles_alumno');
    expect(entrada?.breakpoints).toBe(true);

    const anterior = journal.entries.find((e: any) => e.idx === 12);
    expect(entrada?.when).toBeGreaterThan(anterior?.when);
    expect(entrada?.when).toBeLessThanOrEqual(Date.now());
  });
});

/**
 * M5-L1 §D (RF-007 / RNF-002): contrato de la migración 0018.
 *
 * El índice único global `uq_transaccion_idempotencia (metodo_pago, referencia_bancaria,
 * fecha_operacion)` se sustituye por uno POR ENTRENADOR y PARCIAL (solo métodos electrónicos,
 * referencias no nulas y transacciones no rechazadas), y `perfiles_alumno` gana las columnas de
 * suscripción. En fase roja este bloque FALLA porque la migración 0018 aún no existe.
 */
describe('M5-L1 §D: contrato de la migración 0018 (referencias por entrenador y suscripción)', () => {
  const drizzleDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../../packages/database/drizzle'
  );
  const archivos0018 = readdirSync(drizzleDir).filter((archivo) => /^0018_.+\.sql$/.test(archivo));
  const sql =
    archivos0018.length === 1 ? readFileSync(path.join(drizzleDir, archivos0018[0]), 'utf8') : '';
  const esquemaSrc = readFileSync(path.resolve(drizzleDir, '../src/schema/index.ts'), 'utf8');
  const bloqueIndice =
    sql.match(/CREATE UNIQUE INDEX[^;]*uq_transaccion_referencia_entrenador[\s\S]*?;/i)?.[0] ?? '';

  it('existe exactamente un archivo de migración 0018_*.sql', () => {
    expect(archivos0018).toHaveLength(1);
  });

  it('perfiles_alumno gana las 3 columnas anulables de suscripción', () => {
    expect(sql).toMatch(/plan_suscrito_id/);
    expect(sql).toMatch(/ciclo_ancla/);
    expect(sql).toMatch(/proximo_corte/);
  });

  it('elimina el índice global uq_transaccion_idempotencia', () => {
    expect(sql).toMatch(/DROP INDEX (IF EXISTS )?"?uq_transaccion_idempotencia"?/i);
  });

  it('crea uq_transaccion_referencia_entrenador sobre (entrenador_id, metodo_pago, referencia_bancaria, fecha_operacion)', () => {
    expect(bloqueIndice).not.toBe('');
    expect(bloqueIndice).toMatch(/entrenador_id/);
    expect(bloqueIndice).toMatch(/metodo_pago/);
    expect(bloqueIndice).toMatch(/referencia_bancaria/);
    expect(bloqueIndice).toMatch(/fecha_operacion/);
  });

  it('el índice nuevo es PARCIAL: excluye efectivo y transacciones rechazadas', () => {
    expect(bloqueIndice).toMatch(/WHERE[\s\S]*IS NOT NULL/i);
    expect(bloqueIndice).toMatch(/efectivo_usd/);
    expect(bloqueIndice).toMatch(/efectivo_ves/);
    expect(bloqueIndice).toMatch(/estado_conciliacion"?\s*<>\s*'rechazado'/i);
  });

  it('limpia la referencia centinela COBRO_DIRECTO_SALA a NULL', () => {
    expect(sql).toMatch(
      /UPDATE\s+"?transacciones_pago"?\s+SET\s+"?referencia_bancaria"?\s*=\s*NULL/i
    );
    expect(sql).toMatch(/COBRO_DIRECTO_SALA/);
  });

  it('el esquema TS declara las columnas y el índice nuevo, y ya no declara el viejo', () => {
    expect(esquemaSrc).toMatch(/plan_suscrito_id/);
    expect(esquemaSrc).toMatch(/ciclo_ancla/);
    expect(esquemaSrc).toMatch(/proximo_corte/);
    expect(esquemaSrc).toContain('uq_transaccion_referencia_entrenador');
    expect(esquemaSrc).not.toContain('uq_transaccion_idempotencia');
  });
});
