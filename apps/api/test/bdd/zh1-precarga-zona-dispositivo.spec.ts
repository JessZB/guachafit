import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  Rol,
  Modalidad,
  EstadoUsuario,
  EstadoLicencia,
  EstadoAlumno,
  TipoDocumento,
  LoginUsuarioSchema,
  EstablecerPasswordConTokenSchema,
} from '@guachafit/shared';
import {
  perfilesAlumno,
  usuarios,
  perfilesEntrenador,
  getTableName,
} from '@guachafit/database';
import { Logger } from '@nestjs/common';
import { AuthService } from '../../src/modules/auth/auth.service';
import { AlumnosService } from '../../src/modules/alumnos/alumnos.service';

/**
 * ZH-1 · Precarga única de la zona horaria del dispositivo (Fase Roja)
 * ADR-025 (§3.1 y §3.2)
 *
 * Pruebas de contrato, migración y casos de uso de autenticación y gestión de alumnos.
 * En esta fase roja, los tests deben fallar con AssertionError sobre la zona, el campo
 * o la sentencia debido a que la implementación de precarga aún no existe.
 */

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

interface CondicionWhere {
  column: string;
  value: any;
  op: OpCondicion;
}

interface RegistroUpdate {
  tabla: any;
  nombreTabla: string;
  valores: any;
  whereClause: any;
  condiciones: CondicionWhere[];
}

function extractConditions(sqlObj: any): CondicionWhere[] {
  const conditions: CondicionWhere[] = [];
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

describe('ZH-1 · Precarga única de zona del dispositivo (Fase Roja API / BD)', () => {
  const ALUMNO_ID = 'a3333333-3333-4333-8333-333333333333';
  const ALUMNO_PERFIL_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const COACH_ID = 'c1111111-1111-4111-8111-111111111111';
  const TOKEN_INVITACION = 'token-invitacion-valido-123456789012345678901234';
  const TOKEN_HASH = `sha256:${TOKEN_INVITACION}`;

  let filaUsuarioAlumno: any;
  let filaUsuarioCoach: any;
  let filaPerfilAlumno: any;
  let historialUpdates: RegistroUpdate[];
  let db: any;
  let withTenant: any;
  let authService: AuthService;
  let alumnosService: AlumnosService;

  const mockCrypto = {
    comparePassword: vi.fn().mockResolvedValue(true),
    hashPassword: vi.fn().mockResolvedValue('nuevo-hash-de-prueba'),
    hashSha256: vi.fn((val: string) => `sha256:${val}`),
    encryptHealthRecord: vi.fn((texto: string) => `encrypted:${texto}`),
    decryptHealthRecord: vi.fn((texto: string) => texto.replace('encrypted:', '')),
  };

  function crearMockDb() {
    const mockDb: any = {
      select: vi.fn((_selection?: any) => {
        let tablaSeleccionada: any = null;
        let tieneInnerJoin = false;
        const builder: any = {
          from: vi.fn((t: any) => {
            tablaSeleccionada = t;
            return builder;
          }),
          innerJoin: vi.fn(() => {
            tieneInnerJoin = true;
            return builder;
          }),
          where: vi.fn((whereClause?: any) => {
            const resolver = () => {
              const nombreTabla =
                typeof tablaSeleccionada === 'string'
                  ? tablaSeleccionada
                  : getTableName(tablaSeleccionada) ?? '';

              if (nombreTabla === 'perfiles_entrenador') {
                return [{ activo: true, estadoLicencia: EstadoLicencia.ACTIVA, nombres: 'Coach' }];
              }

              if (nombreTabla === 'usuarios') {
                const conds = extractConditions(whereClause);
                const condEmail = conds.find((c) => /email/i.test(c.column));
                if (
                  condEmail &&
                  typeof condEmail.value === 'string' &&
                  condEmail.value.includes('coach')
                ) {
                  return [filaUsuarioCoach];
                }
                return [filaUsuarioAlumno];
              }

              if (nombreTabla === 'perfiles_alumno') {
                if (tieneInnerJoin) {
                  return [{ ...filaPerfilAlumno, email: filaUsuarioAlumno.email }];
                }
                return [filaPerfilAlumno];
              }

              return [];
            };

            return {
              limit: vi.fn(() => ({
                then: (resolve: (v: any) => unknown) => resolve(resolver()),
              })),
              then: (resolve: (v: any) => unknown) => resolve(resolver()),
            };
          }),
        };
        return builder;
      }),
      update: vi.fn((table: any) => {
        const nombreTabla =
          typeof table === 'string' ? table : getTableName(table) ?? 'desconocida';
        return {
          set: vi.fn((valores: any) => ({
            where: vi.fn((whereClause: any) => {
              const condiciones = extractConditions(whereClause);
              historialUpdates.push({
                tabla: table,
                nombreTabla,
                valores,
                whereClause,
                condiciones,
              });

              let filasAfectadas: any[] = [];
              if (nombreTabla === 'perfiles_alumno') {
                const coincide = condiciones.every((cond) => {
                  const colName = cond.column.toLowerCase();
                  if (colName === 'usuario_id' || colName === 'usuarioid') {
                    return filaPerfilAlumno.usuarioId === cond.value;
                  }
                  if (colName === 'id') {
                    return (
                      filaPerfilAlumno.id === cond.value ||
                      filaPerfilAlumno.usuarioId === cond.value
                    );
                  }
                  if (
                    colName === 'zona_horaria_definida' ||
                    colName === 'zonahorariadefinida'
                  ) {
                    return filaPerfilAlumno.zonaHorariaDefinida === cond.value;
                  }
                  return true;
                });

                if (coincide) {
                  Object.assign(filaPerfilAlumno, valores);
                  filasAfectadas = [{ ...filaPerfilAlumno }];
                }
              } else if (nombreTabla === 'usuarios') {
                Object.assign(filaUsuarioAlumno, valores);
                filasAfectadas = [{ ...filaUsuarioAlumno }];
              }

              const resultado = Promise.resolve(filasAfectadas);
              return {
                returning: vi.fn(() => Promise.resolve(filasAfectadas)),
                then: resultado.then.bind(resultado),
                catch: resultado.catch.bind(resultado),
              };
            }),
          })),
        };
      }),
      transaction: vi.fn(async (cb: any) => cb(mockDb)),
      execute: vi.fn(async () => undefined),
    };
    return mockDb;
  }

  beforeEach(() => {
    filaUsuarioAlumno = {
      id: ALUMNO_ID,
      email: 'alumno@guachafit.com',
      rol: Rol.ALUMNO,
      estado: EstadoUsuario.ACTIVO,
      activo: true,
      passwordHash: 'hash-de-prueba',
      tokenInvitacionHash: TOKEN_HASH,
      tokenInvitacionExpira: new Date(Date.now() + 1000 * 60 * 60 * 24),
    };

    filaUsuarioCoach = {
      id: COACH_ID,
      email: 'coach@guachafit.com',
      rol: Rol.ENTRENADOR,
      estado: EstadoUsuario.ACTIVO,
      activo: true,
      passwordHash: 'hash-de-prueba',
    };

    filaPerfilAlumno = {
      id: ALUMNO_PERFIL_ID,
      usuarioId: ALUMNO_ID,
      entrenadorId: COACH_ID,
      modalidad: Modalidad.REMOTO,
      tipoDocumento: TipoDocumento.V,
      numeroDocumento: '24123456',
      nombres: 'Carlos',
      apellidos: 'Mendoza',
      fechaNacimiento: '1998-05-14',
      telefonoWhatsapp: '+584121234567',
      zonaHoraria: 'America/Caracas',
      zonaHorariaDefinida: false,
      deletedAtUtc: null,
      createdAtUtc: new Date(),
      updatedAtUtc: new Date(),
    };

    historialUpdates = [];
    db = crearMockDb();
    withTenant = vi.fn(async (_context: any, fn: any) => fn(db));

    authService = new AuthService(db, mockCrypto as any, withTenant);
    alumnosService = new AlumnosService(db, mockCrypto as any, undefined, withTenant);
    (alumnosService as any).ctx.hidratarPlanActivo = vi.fn().mockResolvedValue(new Map());
  });

  it('A1: Login de un alumno con perfil zonaHoraria "America/Caracas", zonaHorariaDefinida false, y body con zonaDispositivo "Europe/Madrid"', async () => {
    const resultado = await authService.login({
      email: 'alumno@guachafit.com',
      password: 'secreto-123',
      zonaDispositivo: 'Europe/Madrid',
    } as any);

    // 1. La respuesta trae la zona precargada del dispositivo
    expect(resultado.usuario.zonaHoraria).toBe('Europe/Madrid');

    // 2. La fila del perfil queda con zonaHoraria y zonaHorariaDefinida en true
    expect(filaPerfilAlumno.zonaHoraria).toBe('Europe/Madrid');
    expect(filaPerfilAlumno.zonaHorariaDefinida).toBe(true);

    // 3. La sentencia UPDATE filtra por usuarioId Y zona_horaria_definida = false
    const updatePerfil = historialUpdates.find((u) => u.nombreTabla === 'perfiles_alumno');
    expect(updatePerfil).toBeDefined();

    const condUsuario = updatePerfil?.condiciones.find((c) =>
      /usuario_id|usuarioid/i.test(c.column)
    );
    const condDefinida = updatePerfil?.condiciones.find((c) =>
      /zona_horaria_definida|zonahorariadefinida/i.test(c.column)
    );
    expect(condUsuario?.value).toBe(ALUMNO_ID);
    expect(condDefinida?.value).toBe(false);
  });

  it('A2: Login de un alumno con zonaHorariaDefinida true y zonaHoraria "America/Caracas", body con zonaDispositivo "Europe/Madrid"', async () => {
    filaPerfilAlumno.zonaHorariaDefinida = true;
    filaPerfilAlumno.zonaHoraria = 'America/Caracas';

    const resultado = await authService.login({
      email: 'alumno@guachafit.com',
      password: 'secreto-123',
      zonaDispositivo: 'Europe/Madrid',
    } as any);

    expect(resultado.usuario.zonaHoraria).toBe('America/Caracas');
    expect(filaPerfilAlumno.zonaHoraria).toBe('America/Caracas');
    expect(filaPerfilAlumno.zonaHorariaDefinida).toBe(true);

    const updatePerfil = historialUpdates.find((u) => u.nombreTabla === 'perfiles_alumno');
    expect(updatePerfil).toBeUndefined();
  });

  it('A3: Hecho A1, un segundo login con zonaDispositivo "Asia/Tokyo"', async () => {
    // Primer login con Europe/Madrid (como en A1)
    await authService.login({
      email: 'alumno@guachafit.com',
      password: 'secreto-123',
      zonaDispositivo: 'Europe/Madrid',
    } as any);

    // Segundo login con Asia/Tokyo
    const resultado2 = await authService.login({
      email: 'alumno@guachafit.com',
      password: 'secreto-123',
      zonaDispositivo: 'Asia/Tokyo',
    } as any);

    expect(resultado2.usuario.zonaHoraria).toBe('Europe/Madrid');
    expect(filaPerfilAlumno.zonaHoraria).toBe('Europe/Madrid');
  });

  it('A4: Login de un alumno con zonaHorariaDefinida false y zonaDispositivo inválida ("No/Existe", "", "  Europe/Madrid", y de 65 caracteres)', async () => {
    const zonasInvalidas = ['No/Existe', '', '  Europe/Madrid', 'A'.repeat(65)];

    for (const zonaInvalida of zonasInvalidas) {
      historialUpdates.length = 0;
      filaPerfilAlumno.zonaHoraria = 'America/Caracas';
      filaPerfilAlumno.zonaHorariaDefinida = false;

      const resultado = await authService.login({
        email: 'alumno@guachafit.com',
        password: 'secreto-123',
        zonaDispositivo: zonaInvalida,
      } as any);

      expect(resultado.usuario.zonaHoraria).toBe('America/Caracas');
      expect(filaPerfilAlumno.zonaHoraria).toBe('America/Caracas');
      expect(filaPerfilAlumno.zonaHorariaDefinida).toBe(false);

      const updatePerfil = historialUpdates.find((u) => u.nombreTabla === 'perfiles_alumno');
      expect(updatePerfil).toBeUndefined();
    }
  });

  it('A5: Login de un alumno con zonaHorariaDefinida false y sin zonaDispositivo', async () => {
    const resultado = await authService.login({
      email: 'alumno@guachafit.com',
      password: 'secreto-123',
    });

    expect(resultado.usuario.zonaHoraria).toBe('America/Caracas');
    expect(filaPerfilAlumno.zonaHoraria).toBe('America/Caracas');
    expect(filaPerfilAlumno.zonaHorariaDefinida).toBe(false);

    const updatePerfil = historialUpdates.find((u) => u.nombreTabla === 'perfiles_alumno');
    expect(updatePerfil).toBeUndefined();
  });

  it('A6: Login de un entrenador con zonaDispositivo "Europe/Madrid"', async () => {
    const resultado = await authService.login({
      email: 'coach@guachafit.com',
      password: 'secreto-123',
      zonaDispositivo: 'Europe/Madrid',
    } as any);

    expect(resultado.usuario.zonaHoraria).toBeNull();

    const updatePerfil = historialUpdates.find((u) => u.nombreTabla === 'perfiles_alumno');
    expect(updatePerfil).toBeUndefined();
  });

  it('A7: establecer-password con token válido de un alumno con zonaHorariaDefinida false y zonaDispositivo "Europe/Madrid"', async () => {
    const resultado = await authService.establecerPasswordConToken({
      token: TOKEN_INVITACION,
      password: 'password-seguro-123',
      zonaDispositivo: 'Europe/Madrid',
    } as any);

    expect(resultado.usuario.zonaHoraria).toBe('Europe/Madrid');
    expect(filaPerfilAlumno.zonaHoraria).toBe('Europe/Madrid');
    expect(filaPerfilAlumno.zonaHorariaDefinida).toBe(true);

    const updatePerfil = historialUpdates.find((u) => u.nombreTabla === 'perfiles_alumno');
    expect(updatePerfil).toBeDefined();

    const condUsuario = updatePerfil?.condiciones.find((c) =>
      /usuario_id|usuarioid/i.test(c.column)
    );
    const condDefinida = updatePerfil?.condiciones.find((c) =>
      /zona_horaria_definida|zonahorariadefinida/i.test(c.column)
    );
    expect(condUsuario?.value).toBe(ALUMNO_ID);
    expect(condDefinida?.value).toBe(false);
  });

  it('A8: establecer-password con token de un alumno con zonaHorariaDefinida true', async () => {
    filaPerfilAlumno.zonaHorariaDefinida = true;
    filaPerfilAlumno.zonaHoraria = 'America/Caracas';

    const resultado = await authService.establecerPasswordConToken({
      token: TOKEN_INVITACION,
      password: 'password-seguro-123',
      zonaDispositivo: 'Europe/Madrid',
    } as any);

    expect(resultado.usuario.zonaHoraria).toBe('America/Caracas');
    expect(filaPerfilAlumno.zonaHoraria).toBe('America/Caracas');
    expect(filaPerfilAlumno.zonaHorariaDefinida).toBe(true);

    const updatePerfil = historialUpdates.find((u) => u.nombreTabla === 'perfiles_alumno');
    expect(updatePerfil).toBeUndefined();
  });

  it('A9: PATCH /alumnos/me/zona-horaria de un alumno con zonaHorariaDefinida false', async () => {
    filaPerfilAlumno.zonaHoraria = 'America/Caracas';
    filaPerfilAlumno.zonaHorariaDefinida = false;

    const resultado = await alumnosService.actualizarZonaHorariaPropia(ALUMNO_ID, {
      zonaHoraria: 'Europe/Madrid',
    });

    expect(resultado.zonaHoraria).toBe('Europe/Madrid');

    const updatePropia = historialUpdates.find(
      (u) => u.nombreTabla === 'perfiles_alumno' && u.valores.zonaHoraria === 'Europe/Madrid'
    );
    expect(updatePropia).toBeDefined();
    expect(updatePropia?.valores).toMatchObject({
      zonaHoraria: 'Europe/Madrid',
      zonaHorariaDefinida: true,
    });
    expect(filaPerfilAlumno.zonaHorariaDefinida).toBe(true);
  });

  it('A10: PATCH /alumnos/:id del entrenador con zonaHoraria "America/Bogota"; y otro PATCH sin zonaHoraria', async () => {
    filaPerfilAlumno.zonaHoraria = 'America/Caracas';
    filaPerfilAlumno.zonaHorariaDefinida = false;

    // 1. PATCH del entrenador con zonaHoraria
    await alumnosService.actualizarAlumno(COACH_ID, ALUMNO_PERFIL_ID, {
      zonaHoraria: 'America/Bogota',
    });

    const update1 = historialUpdates.find(
      (u) => u.nombreTabla === 'perfiles_alumno' && u.valores.zonaHoraria === 'America/Bogota'
    );
    expect(update1).toBeDefined();
    expect(update1?.valores).toMatchObject({
      zonaHoraria: 'America/Bogota',
      zonaHorariaDefinida: true,
    });
    expect(filaPerfilAlumno.zonaHorariaDefinida).toBe(true);

    // 2. PATCH del entrenador sin zonaHoraria
    historialUpdates.length = 0;
    filaPerfilAlumno.zonaHorariaDefinida = false;

    await alumnosService.actualizarAlumno(COACH_ID, ALUMNO_PERFIL_ID, {
      nombres: 'Carlos Modificado',
    });

    const update2 = historialUpdates.find(
      (u) => u.nombreTabla === 'perfiles_alumno' && u.valores.nombres === 'Carlos Modificado'
    );
    expect(update2).toBeDefined();
    expect(update2?.valores).not.toHaveProperty('zonaHorariaDefinida');
    expect(filaPerfilAlumno.zonaHorariaDefinida).toBe(false);
  });

  it('A11: Contratos de packages/shared: LoginUsuarioSchema y EstablecerPasswordConTokenSchema', () => {
    // 1. Aceptan zonaDispositivo string y la preservan en el resultado parseado
    const loginConZona = LoginUsuarioSchema.parse({
      email: 'alumno@guachafit.com',
      password: 'password123',
      zonaDispositivo: 'Europe/Madrid',
    }) as any;
    expect(loginConZona.zonaDispositivo).toBe('Europe/Madrid');

    const passConZona = EstablecerPasswordConTokenSchema.parse({
      token: 'a'.repeat(32),
      password: 'password123',
      zonaDispositivo: 'Europe/Madrid',
    }) as any;
    expect(passConZona.zonaDispositivo).toBe('Europe/Madrid');

    // 2. Aceptan sin zonaDispositivo
    const loginSinZona = LoginUsuarioSchema.parse({
      email: 'alumno@guachafit.com',
      password: 'password123',
    }) as any;
    expect(loginSinZona.zonaDispositivo).toBeUndefined();

    const passSinZona = EstablecerPasswordConTokenSchema.parse({
      token: 'a'.repeat(32),
      password: 'password123',
    }) as any;
    expect(passSinZona.zonaDispositivo).toBeUndefined();

    // 3. Un valor string cualquiera no rompe el parseo
    const loginCualquiera = LoginUsuarioSchema.parse({
      email: 'alumno@guachafit.com',
      password: 'password123',
      zonaDispositivo: 'No/Existe',
    }) as any;
    expect(loginCualquiera.zonaDispositivo).toBe('No/Existe');

    // 4. Una zonaDispositivo que no es string se rechaza
    expect(() =>
      LoginUsuarioSchema.parse({
        email: 'alumno@guachafit.com',
        password: 'password123',
        zonaDispositivo: 12345,
      })
    ).toThrow();

    expect(() =>
      EstablecerPasswordConTokenSchema.parse({
        token: 'a'.repeat(32),
        password: 'password123',
        zonaDispositivo: 12345,
      })
    ).toThrow();
  });

  it('A12: Migración: archivo packages/database/drizzle/0024_*.sql y meta/_journal.json', () => {
    const drizzleDir = path.resolve(__dirname, '../../../../packages/database/drizzle');
    const archivos = fs.existsSync(drizzleDir) ? fs.readdirSync(drizzleDir) : [];
    const archivo0024 = archivos.find((f) => /^0024_.*\.sql$/.test(f));

    expect(archivo0024).toBeDefined();

    const rutaSql = path.join(drizzleDir, archivo0024!);
    const contenidoSql = fs.readFileSync(rutaSql, 'utf-8');

    // Comprobar ADD COLUMN sobre perfiles_alumno
    const addColRegex =
      /ALTER\s+TABLE\s+["']?perfiles_alumno["']?\s+ADD\s+COLUMN\s+["']?zona_horaria_definida["']?\s+boolean\s+DEFAULT\s+false\s+NOT\s+NULL/i;
    expect(contenidoSql).toMatch(addColRegex);

    // Comprobar UPDATE sin WHERE
    const updateRegex =
      /UPDATE\s+["']?perfiles_alumno["']?\s+SET\s+["']?zona_horaria_definida["']?\s*=\s*true\s*;/i;
    expect(contenidoSql).toMatch(updateRegex);

    // El ADD COLUMN debe ir antes del UPDATE
    const matchAdd = contenidoSql.search(addColRegex);
    const matchUpdate = contenidoSql.search(updateRegex);
    expect(matchAdd).toBeGreaterThanOrEqual(0);
    expect(matchUpdate).toBeGreaterThan(matchAdd);

    // Comprobar journal
    const rutaJournal = path.join(drizzleDir, 'meta', '_journal.json');
    expect(fs.existsSync(rutaJournal)).toBe(true);
    const journal = JSON.parse(fs.readFileSync(rutaJournal, 'utf-8'));
    const entrada0024 = journal.entries?.find((e: any) => e.tag?.startsWith('0024_'));
    expect(entrada0024).toBeDefined();
  });

  function hacerFallarUpdatePerfilesAlumno(error = new Error('connection reset')) {
    const updateOriginal = db.update.bind(db);
    db.update = vi.fn((table: any) => {
      const nombreTabla =
        typeof table === 'string' ? table : getTableName(table) ?? 'desconocida';
      if (nombreTabla === 'perfiles_alumno') {
        return {
          set: vi.fn(() => ({
            where: vi.fn(() => ({
              returning: vi.fn(() => Promise.reject(error)),
              then: (_resolve: any, reject: any) => Promise.reject(error).catch(reject),
              catch: (reject: any) => Promise.reject(error).catch(reject),
            })),
          })),
        };
      }
      return updateOriginal(table);
    });
  }

  it('A13: Login de un alumno con zonaHorariaDefinida false y zonaDispositivo cuando el UPDATE de perfiles_alumno lanza error', async () => {
    hacerFallarUpdatePerfilesAlumno(new Error('connection reset'));

    const resultado = await authService.login({
      email: 'alumno@guachafit.com',
      password: 'secreto-123',
      zonaDispositivo: 'Europe/Madrid',
    } as any);

    expect(resultado.usuario.zonaHoraria).toBe('America/Caracas');
    expect(filaPerfilAlumno.zonaHoraria).toBe('America/Caracas');
    expect(filaPerfilAlumno.zonaHorariaDefinida).toBe(false);
  });

  it('A14: Canje de token de activacion (establecer-password) de un alumno con zonaHorariaDefinida false cuando el UPDATE de la precarga lanza error', async () => {
    hacerFallarUpdatePerfilesAlumno(new Error('connection reset'));

    const resultado = await authService.establecerPasswordConToken({
      token: TOKEN_INVITACION,
      password: 'password-seguro-123',
      zonaDispositivo: 'Europe/Madrid',
    } as any);

    expect(resultado.usuario.zonaHoraria).toBe('America/Caracas');
    expect(filaPerfilAlumno.zonaHoraria).toBe('America/Caracas');
    expect(filaPerfilAlumno.zonaHorariaDefinida).toBe(false);
    expect(filaUsuarioAlumno.passwordHash).toBe('nuevo-hash-de-prueba');
    expect(filaUsuarioAlumno.tokenInvitacionHash).toBeNull();
  });

  it('A15: Misma situacion que A13 con espia sobre Logger.prototype.warn registra advertencia con id y motivo sin contrasena', async () => {
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      hacerFallarUpdatePerfilesAlumno(new Error('connection reset'));

      const resultado = await authService.login({
        email: 'alumno@guachafit.com',
        password: 'secreto-123',
        zonaDispositivo: 'Europe/Madrid',
      } as any);

      expect(resultado.usuario.zonaHoraria).toBe('America/Caracas');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const mensaje = warnSpy.mock.calls[0][0];
      expect(mensaje).toContain(ALUMNO_ID);
      expect(mensaje).toContain('connection reset');
      expect(mensaje).not.toContain('secreto-123');
    } finally {
      warnSpy.mockRestore();
    }
  });
});
