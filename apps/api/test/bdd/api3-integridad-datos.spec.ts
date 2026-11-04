/**
 * Integridad de datos.
 *
 * 1. Alta de alumno (manual y registro público): `usuarios` + `perfiles_alumno` en UNA transacción.
 *    Si falla el perfil no queda un usuario huérfano y el correo puede volver a registrarse.
 * 2. Registro de idempotencia en memoria con TTL y tope (expulsa lo más antiguo).
 * 3. Accesos cruzados entre coaches en `AlumnosService`: 403 + fila de auditoría (sin PII extra).
 * 4. Mensajes con tuteo (sin "su cartera"/"usted") y código `ALUMNO_BLOQUEADO` compartido.
 * 5. Entrenamiento usa el mismo registro de idempotencia: dos peticiones simultáneas con la misma
 *    clave ejecutan la operación una sola vez (el reporte de pago se prueba en finanzas-service).
 * 6. Un ejercicio que ya no está en la lista del coach se nombra en el mensaje de error.
 */
import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { getTableName } from '@guachafit/database';
import {
  CODIGO_ALUMNO_BLOQUEADO,
  EstadoAlumno,
  EstadoLicencia,
  Modalidad,
  Rol,
  TipoDocumento,
} from '@guachafit/shared';
import type { AltaManualAlumnoDTO, RegistroPublicoAlumnoDTO } from '@guachafit/shared';
import { AlumnosService } from '../../src/modules/alumnos/alumnos.service';
import { RegistroIdempotencia } from '../../src/common/idempotencia/registro-idempotencia';
import { EntrenamientoService } from '../../src/modules/entrenamiento/entrenamiento.service';
import { mensajeEjerciciosNoDisponibles } from '../../src/modules/entrenamiento/catalogo-ejercicios';

const COACH_ID = '11111111-1111-4111-8111-111111111111';
const COACH_AJENO_ID = '99999999-9999-4999-8999-999999999999';
const ALUMNO_PERFIL_ID = '44444444-4444-4444-8444-444444444444';
const ALUMNO_USUARIO_ID = '33333333-3333-4333-8333-333333333333';

const cryptoMock = {
  encryptHealthRecord: (texto: string) => `encrypted:${texto}`,
  decryptHealthRecord: (texto: string) => texto,
  hashPassword: async (password: string) => `hash-${password}`,
  generateInvitationToken: () => ({
    rawToken: 'raw-token-de-activacion-1234567890',
    tokenHash: 'token-hash-abc',
    expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
  }),
} as any;

const altaManualDto: AltaManualAlumnoDTO = {
  nombres: 'Marcos',
  apellidos: 'Pérez',
  email: 'marcos@guachafit.com',
  tipoDocumento: TipoDocumento.V,
  numeroDocumento: '18456123',
  fechaNacimiento: '1994-05-15',
  telefonoWhatsapp: '+584121234567',
  modalidad: Modalidad.PRESENCIAL,
};

const registroPublicoDto: RegistroPublicoAlumnoDTO = {
  coachCode: 'ALEXFIT',
  nombres: 'Valeria',
  apellidos: 'Castillo',
  email: 'valeria@guachafit.com',
  password: 'clave-segura-2026',
  tipoDocumento: TipoDocumento.V,
  numeroDocumento: '26123456',
  fechaNacimiento: '1999-03-10',
  telefonoWhatsapp: '+584149998877',
  modalidad: Modalidad.REMOTO,
};

const coachOperable = {
  usuarioId: COACH_ID,
  coachCode: 'ALEXFIT',
  nombres: 'Alejandro',
  apellidos: 'Fit',
  nombreComercial: 'AlexFit Gym',
  estadoLicencia: EstadoLicencia.ACTIVA,
  activo: true,
  captacionActiva: true,
  capacidadMaxima: 50,
};

/**
 * BD en memoria con semántica transaccional mínima: `transaction()` toma una foto de las tablas y
 * la restaura si el callback falla (ROLLBACK). Fuera de una transacción cada escritura es
 * definitiva (autocommit), como en el pool real.
 */
function crearBdTransaccional() {
  const tablas: Record<string, any[]> = { usuarios: [], perfiles_alumno: [] };
  const estado = { fallarPerfil: true };

  const db: any = {
    select: () => ({
      from: (tabla: any) => {
        const nombre = getTableName(tabla);
        const consulta: any = {
          innerJoin: () => consulta,
          for: () => consulta,
          where: () =>
            Promise.resolve(nombre === 'perfiles_entrenador' ? [coachOperable] : [...(tablas[nombre] ?? [])]),
        };
        return consulta;
      },
    }),
    insert: (tabla: any) => ({
      values: (valores: any) => ({
        returning: async () => {
          const nombre = getTableName(tabla);
          if (nombre === 'perfiles_alumno' && estado.fallarPerfil) {
            throw new Error('fallo simulado al insertar el perfil');
          }
          const fila = {
            id: `${nombre}-${tablas[nombre].length + 1}`,
            createdAtUtc: new Date(),
            ...valores,
          };
          tablas[nombre].push(fila);
          return [fila];
        },
      }),
    }),
    execute: async () => undefined,
  };
  db.transaction = async (cb: any) => {
    const foto = Object.fromEntries(Object.entries(tablas).map(([k, v]) => [k, [...v]]));
    try {
      return await cb(db);
    } catch (error) {
      for (const [k, v] of Object.entries(foto)) tablas[k] = v;
      throw error;
    }
  };

  return { db, tablas, estado };
}

// =============================================================================
// 1. Alta de alumno atómica
// =============================================================================
describe('API-3 · alta de alumno en una sola transacción', () => {
  it('alta manual: si falla el perfil no queda usuario huérfano y el correo se puede volver a usar', async () => {
    const { db, tablas, estado } = crearBdTransaccional();
    const service = new AlumnosService(db, cryptoMock);

    await expect(service.crearAlumnoManual(COACH_ID, altaManualDto)).rejects.toThrow(
      'fallo simulado al insertar el perfil'
    );
    expect(tablas.usuarios).toEqual([]);
    expect(tablas.perfiles_alumno).toEqual([]);

    // Reintento con el mismo correo: no hay 409 por un usuario huérfano.
    estado.fallarPerfil = false;
    const resultado = await service.crearAlumnoManual(COACH_ID, altaManualDto);
    expect(resultado.email).toBe('marcos@guachafit.com');
    expect(tablas.usuarios).toHaveLength(1);
    expect(tablas.perfiles_alumno).toHaveLength(1);
    expect(tablas.perfiles_alumno[0].usuarioId).toBe(tablas.usuarios[0].id);

    // Y ahora sí, el correo queda tomado.
    await expect(service.crearAlumnoManual(COACH_ID, altaManualDto)).rejects.toBeInstanceOf(
      ConflictException
    );
  });

  it('registro público: si falla el perfil no queda usuario huérfano y el correo se puede volver a usar', async () => {
    const { db, tablas, estado } = crearBdTransaccional();
    const emitAsync = vi.fn().mockResolvedValue([]);
    const service = new AlumnosService(db, cryptoMock, { emitAsync } as any);

    await expect(service.registroPublico(registroPublicoDto)).rejects.toThrow(
      'fallo simulado al insertar el perfil'
    );
    expect(tablas.usuarios).toEqual([]);
    expect(emitAsync).not.toHaveBeenCalled();

    estado.fallarPerfil = false;
    await expect(service.registroPublico(registroPublicoDto)).resolves.toMatchObject({
      email: 'valeria@guachafit.com',
    });
    expect(tablas.usuarios).toHaveLength(1);
    expect(tablas.perfiles_alumno).toHaveLength(1);
  });
});

// =============================================================================
// 2. Registro de idempotencia con TTL y tope
// =============================================================================
describe('API-3 · registro de idempotencia en memoria (TTL + tope)', () => {
  it('devuelve una copia de la respuesta guardada (no comparte referencias)', () => {
    const registro = new RegistroIdempotencia();
    const original = { resultados: [{ id: 'a' }] };
    registro.guardar('k1', original);

    const leida = registro.leer<typeof original>('k1')!;
    expect(leida).toEqual(original);
    leida.resultados.push({ id: 'b' });
    expect(registro.leer<typeof original>('k1')!.resultados).toHaveLength(1);
  });

  it('una clave nula o vacía nunca se guarda ni se lee', () => {
    const registro = new RegistroIdempotencia();
    registro.guardar(null, { a: 1 });
    expect(registro.leer(null)).toBeNull();
    expect(registro.tamano).toBe(0);
  });

  it('la respuesta caduca al cumplirse el TTL (reloj inyectable)', () => {
    let ahora = 1_000;
    const registro = new RegistroIdempotencia({ ttlMs: 60_000, ahora: () => ahora });
    registro.guardar('k1', { ok: true });

    ahora += 59_999;
    expect(registro.leer('k1')).toEqual({ ok: true });

    ahora += 1;
    expect(registro.leer('k1')).toBeNull();
    expect(registro.tamano).toBe(0);
  });

  it('por defecto el TTL es de 24 horas', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-02T10:00:00Z'));
      const registro = new RegistroIdempotencia();
      registro.guardar('k1', { ok: true });

      vi.setSystemTime(new Date('2026-10-03T09:59:59Z'));
      expect(registro.leer('k1')).toEqual({ ok: true });

      vi.setSystemTime(new Date('2026-10-03T10:00:00Z'));
      expect(registro.leer('k1')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('con el tope lleno expulsa la entrada más antigua', () => {
    const registro = new RegistroIdempotencia({ maxEntradas: 2 });
    registro.guardar('k1', 1);
    registro.guardar('k2', 2);
    registro.guardar('k3', 3);

    expect(registro.tamano).toBe(2);
    expect(registro.leer('k1')).toBeNull();
    expect(registro.leer('k2')).toBe(2);
    expect(registro.leer('k3')).toBe(3);
  });

  it('al guardar purga primero lo caducado (no expulsa una entrada vigente si sobra espacio)', () => {
    let ahora = 0;
    const registro = new RegistroIdempotencia({ ttlMs: 10, maxEntradas: 2, ahora: () => ahora });
    registro.guardar('vieja', 1);
    ahora = 5;
    registro.guardar('vigente', 2);
    ahora = 11; // 'vieja' caducó; 'vigente' no
    registro.guardar('nueva', 3);

    expect(registro.leer('vigente')).toBe(2);
    expect(registro.leer('nueva')).toBe(3);
    expect(registro.tamano).toBe(2);
  });

  it('ejecutar(): misma clave → una sola ejecución, también con reintentos simultáneos', async () => {
    const registro = new RegistroIdempotencia();
    let llamadas = 0;
    const operacion = async () => {
      llamadas++;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { n: llamadas };
    };

    const [a, b] = await Promise.all([
      registro.ejecutar('k1', operacion),
      registro.ejecutar('k1', operacion),
    ]);
    const c = await registro.ejecutar('k1', operacion);

    expect(llamadas).toBe(1);
    expect(a).toEqual({ n: 1 });
    expect(b).toEqual({ n: 1 });
    expect(c).toEqual({ n: 1 });
  });

  it('ejecutar(): un fallo no se guarda (el reintento vuelve a ejecutar)', async () => {
    const registro = new RegistroIdempotencia();
    const operacion = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('caída'))
      .mockResolvedValueOnce('ok');

    await expect(registro.ejecutar('k1', operacion)).rejects.toThrow('caída');
    await expect(registro.ejecutar('k1', operacion)).resolves.toBe('ok');
    expect(operacion).toHaveBeenCalledTimes(2);
  });

  it('ejecutar() sin clave ejecuta siempre', async () => {
    const registro = new RegistroIdempotencia();
    const operacion = vi.fn(async () => 'ok');
    await registro.ejecutar(null, operacion);
    await registro.ejecutar(null, operacion);
    expect(operacion).toHaveBeenCalledTimes(2);
  });
});

// =============================================================================
// 3. Auditoría de accesos cruzados entre coaches (RF-010 Escenario 2)
// =============================================================================
describe('API-3 · RF-010 Escenario 2: acceso a un alumno de otro coach queda auditado', () => {
  const perfilDeOtroCoach = {
    id: ALUMNO_PERFIL_ID,
    usuarioId: ALUMNO_USUARIO_ID,
    entrenadorId: COACH_AJENO_ID,
    tipoDocumento: TipoDocumento.V,
    numeroDocumento: '18456123',
    nombres: 'Marcos',
    apellidos: 'Pérez',
    email: 'marcos@guachafit.com',
    fechaNacimiento: '1994-05-15',
    telefonoWhatsapp: '+584121234567',
    fichaSaludPrivada: 'encrypted:Hernia discal',
    estadoActivacion: EstadoAlumno.ACTIVO,
    modalidad: Modalidad.PRESENCIAL,
    deletedAtUtc: null,
    createdAtUtc: new Date(),
  };

  function crearServicio(perfiles: any[]) {
    const tx: any = {
      select: () => ({
        from: () => {
          const consulta: any = {
            innerJoin: () => consulta,
            where: () => Promise.resolve([...perfiles]),
          };
          return consulta;
        },
      }),
      update: vi.fn(),
    };
    const withTenant = vi.fn(async (_ctx: any, fn: any) => fn(tx));
    const auditoria = { registrar: vi.fn().mockResolvedValue(undefined) };
    const service = new AlumnosService(
      {} as any,
      cryptoMock,
      undefined,
      withTenant as any,
      auditoria as any
    );
    return { service, auditoria, tx };
  }

  it('obtenerPorId con un coach ajeno → 403 y fila de auditoría sin PII', async () => {
    const { service, auditoria } = crearServicio([perfilDeOtroCoach]);

    await expect(
      service.obtenerPorId(ALUMNO_PERFIL_ID, COACH_ID, Rol.ENTRENADOR, COACH_ID)
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(auditoria.registrar).toHaveBeenCalledTimes(1);
    const registro = auditoria.registrar.mock.calls[0][0];
    expect(registro).toEqual({
      usuarioId: COACH_ID,
      rol: Rol.ENTRENADOR,
      ruta: '/alumnos/:id',
      metodo: 'GET',
      motivo: 'ALUMNO_DE_OTRO_ENTRENADOR',
    });
    // Sin PII del alumno (ni su id, ni su nombre, ni su correo).
    expect(JSON.stringify(registro)).not.toMatch(/Marcos|marcos@|44444444/);
  });

  it('obtenerPorId: un alumno que pide el perfil de otro alumno → 403 auditado', async () => {
    const { service, auditoria } = crearServicio([perfilDeOtroCoach]);
    const otroAlumno = '55555555-5555-4555-8555-555555555555';

    await expect(
      service.obtenerPorId(ALUMNO_PERFIL_ID, otroAlumno, Rol.ALUMNO, COACH_AJENO_ID)
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ usuarioId: otroAlumno, rol: Rol.ALUMNO, motivo: 'PERFIL_DE_OTRO_ALUMNO' })
    );
  });

  it('actualizarAlumno con un coach ajeno → 403 auditado y sin escribir', async () => {
    const { service, auditoria, tx } = crearServicio([perfilDeOtroCoach]);

    await expect(
      service.actualizarAlumno(COACH_ID, ALUMNO_PERFIL_ID, { nombres: 'Otro' })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.update).not.toHaveBeenCalled();
    expect(auditoria.registrar).toHaveBeenCalledWith({
      usuarioId: COACH_ID,
      rol: Rol.ENTRENADOR,
      ruta: '/alumnos/:id',
      metodo: 'PATCH',
      motivo: 'ALUMNO_DE_OTRO_ENTRENADOR',
    });
  });

  it('un fallo de la auditoría nunca cambia la respuesta 403', async () => {
    const { service, auditoria } = crearServicio([perfilDeOtroCoach]);
    auditoria.registrar.mockRejectedValue(new Error('BD caída'));

    await expect(
      service.obtenerPorId(ALUMNO_PERFIL_ID, COACH_ID, Rol.ENTRENADOR, COACH_ID)
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('el coach dueño accede sin auditoría', async () => {
    const tx: any = {
      select: () => ({
        from: () => {
          const consulta: any = {
            innerJoin: () => consulta,
            leftJoin: () => consulta,
            where: () => consulta,
            orderBy: () => consulta,
            limit: () => consulta,
            then: (resolve: any) => resolve([{ ...perfilDeOtroCoach, entrenadorId: COACH_ID }]),
          };
          return consulta;
        },
      }),
    };
    const auditoria = { registrar: vi.fn() };
    const service = new AlumnosService(
      {} as any,
      cryptoMock,
      undefined,
      (async (_ctx: any, fn: any) => fn(tx)) as any,
      auditoria as any
    );
    (service as any).hidratarPlanActivo = vi.fn(async () => new Map());

    await expect(
      service.obtenerPorId(ALUMNO_PERFIL_ID, COACH_ID, Rol.ENTRENADOR, COACH_ID)
    ).resolves.toMatchObject({ id: ALUMNO_PERFIL_ID });
    expect(auditoria.registrar).not.toHaveBeenCalled();
  });
});

// =============================================================================
// 4. Limpieza: tuteo en mensajes y código ALUMNO_BLOQUEADO compartido
// =============================================================================
describe('API-3 · mensajes con tuteo y códigos compartidos', () => {
  const RAIZ_API = path.resolve(__dirname, '../../src');

  function archivosTs(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const ruta = path.join(dir, e.name);
      if (e.isDirectory()) return archivosTs(ruta);
      return e.name.endsWith('.ts') ? [ruta] : [];
    });
  }

  /** Texto de `new XxxException('…')` y de `mensaje: '…'` (lo que llega al usuario). */
  function mensajesVisibles(fuente: string): string[] {
    const patron =
      /new \w*Exception\(\s*(['"`])([\s\S]*?)(?<!\\)\1|\bmensaje:\s*(['"`])([\s\S]*?)(?<!\\)\3/g;
    return [...fuente.matchAll(patron)].map((c) => (c[2] ?? c[4] ?? '').replace(/\s+/g, ' '));
  }

  it('ningún mensaje del API trata de "usted" ni habla de "su cartera"', () => {
    const hallazgos: string[] = [];
    for (const archivo of archivosTs(RAIZ_API)) {
      for (const texto of mensajesVisibles(fs.readFileSync(archivo, 'utf8'))) {
        if (/\busted\b|su cartera|Cuota no encontrada|no encontrada o no pertenece/i.test(texto)) {
          hallazgos.push(`${path.relative(RAIZ_API, archivo)}: ${texto}`);
        }
      }
    }
    expect(hallazgos).toEqual([]);
  });

  it('el código ALUMNO_BLOQUEADO vive en @guachafit/shared y no se repite como literal', () => {
    expect(CODIGO_ALUMNO_BLOQUEADO).toBe('ALUMNO_BLOQUEADO');
    const RAIZ_WEB = path.resolve(__dirname, '../../../web/src');
    const copias = [...archivosTs(RAIZ_API), ...archivosTs(RAIZ_WEB)].filter((archivo) => {
      const sinComentarios = fs
        .readFileSync(archivo, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
      return /(['"`])ALUMNO_BLOQUEADO\1/.test(sinComentarios);
    });
    expect(copias).toEqual([]);
  });
});

// =============================================================================
// 5. Idempotencia unificada en EntrenamientoService
// =============================================================================
describe('API-3 · entrenamiento: misma clave en paralelo → una sola ejecución', () => {
  type Caso = {
    operacion: string;
    interno: string;
    llamar: (servicio: EntrenamientoService, alumnoId: string, clave?: string) => Promise<unknown>;
  };
  const casos: Caso[] = [
    {
      operacion: 'entrenarBloqueHoy',
      interno: 'ejecutarEntrenarBloqueHoy',
      llamar: (s, alumno, clave) => s.entrenarBloqueHoy(alumno, 'bloque-1', {}, clave),
    },
    {
      operacion: 'iniciarSesion',
      interno: 'ejecutarIniciarSesion',
      llamar: (s, alumno, clave) => s.iniciarSesion('sesion-1', alumno, {} as any, clave),
    },
    {
      operacion: 'sincronizarSeries',
      interno: 'ejecutarSincronizarSeries',
      llamar: (s, alumno, clave) => s.sincronizarSeries('sesion-1', alumno, {} as any, clave),
    },
    {
      operacion: 'finalizarSesion',
      interno: 'ejecutarFinalizarSesion',
      llamar: (s, alumno, clave) => s.finalizarSesion('sesion-1', alumno, {} as any, clave),
    },
  ];

  function nuevoServicio() {
    return new EntrenamientoService({} as any, (async () => undefined) as any);
  }

  function servicioConOperacionLenta(interno: string) {
    const servicio = nuevoServicio();
    let llamadas = 0;
    const espia = vi.spyOn(servicio as any, interno).mockImplementation(async () => {
      llamadas++;
      const n = llamadas;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { n };
    });
    return { servicio, espia };
  }

  for (const caso of casos) {
    it(`${caso.operacion}: dos peticiones simultáneas con la misma clave ejecutan una sola vez`, async () => {
      const { servicio, espia } = servicioConOperacionLenta(caso.interno);

      const [a, b] = await Promise.all([
        caso.llamar(servicio, 'alumno-1', 'clave-1'),
        caso.llamar(servicio, 'alumno-1', 'clave-1'),
      ]);
      const reintento = await caso.llamar(servicio, 'alumno-1', 'clave-1');

      expect(espia).toHaveBeenCalledTimes(1);
      expect(a).toEqual({ n: 1 });
      expect(b).toEqual({ n: 1 });
      expect(reintento).toEqual({ n: 1 });
    });

    it(`${caso.operacion}: la clave sigue siendo por operación y alumno; sin clave ejecuta siempre`, async () => {
      const { servicio, espia } = servicioConOperacionLenta(caso.interno);

      await Promise.all([
        caso.llamar(servicio, 'alumno-1', 'clave-1'),
        caso.llamar(servicio, 'alumno-2', 'clave-1'),
      ]);
      await caso.llamar(servicio, 'alumno-1', undefined);
      await caso.llamar(servicio, 'alumno-1', '   ');

      expect(espia).toHaveBeenCalledTimes(4);
    });

    it(`${caso.operacion}: un fallo no se recuerda y el reintento vuelve a ejecutar`, async () => {
      const servicio = nuevoServicio();
      const espia = vi
        .spyOn(servicio as any, caso.interno)
        .mockRejectedValueOnce(new Error('caída'))
        .mockResolvedValueOnce({ ok: true });

      await expect(caso.llamar(servicio, 'alumno-1', 'clave-1')).rejects.toThrow('caída');
      await expect(caso.llamar(servicio, 'alumno-1', 'clave-1')).resolves.toEqual({ ok: true });
      expect(espia).toHaveBeenCalledTimes(2);
    });
  }

  it('la misma clave en dos operaciones distintas no se mezcla', async () => {
    const servicio = nuevoServicio();
    const iniciar = vi
      .spyOn(servicio as any, 'ejecutarIniciarSesion')
      .mockResolvedValue({ op: 'iniciar' });
    const finalizar = vi
      .spyOn(servicio as any, 'ejecutarFinalizarSesion')
      .mockResolvedValue({ op: 'finalizar' });

    await expect(servicio.iniciarSesion('s', 'alumno-1', {} as any, 'k')).resolves.toEqual({
      op: 'iniciar',
    });
    await expect(servicio.finalizarSesion('s', 'alumno-1', {} as any, 'k')).resolves.toEqual({
      op: 'finalizar',
    });
    expect(iniciar).toHaveBeenCalledTimes(1);
    expect(finalizar).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// 6. Ejercicio que ya no está en la lista del coach: el mensaje lo nombra
// =============================================================================
describe('API-3 · mensaje que nombra los ejercicios que ya no están en la lista', () => {
  it('un ejercicio: lo nombra en singular', () => {
    expect(mensajeEjerciciosNoDisponibles(['Press banca'])).toBe(
      '«Press banca» ya no está en tu lista de ejercicios. Quítalo o cámbialo por otro y vuelve a guardar.'
    );
  });

  it('varios: los nombra separados por coma, en plural', () => {
    expect(mensajeEjerciciosNoDisponibles(['Press banca', 'Remo'])).toBe(
      '«Press banca», «Remo» ya no están en tu lista de ejercicios. Quítalos o cámbialos por otros y vuelve a guardar.'
    );
  });

  it('más de 3: nombra los 3 primeros y cuenta el resto', () => {
    expect(mensajeEjerciciosNoDisponibles(['A', 'B', 'C', 'D', 'E'])).toBe(
      '«A», «B», «C» y 2 más ya no están en tu lista de ejercicios. Quítalos o cámbialos por otros y vuelve a guardar.'
    );
  });

  it('no repite un mismo nombre y usa un texto claro si el nombre viene vacío', () => {
    expect(mensajeEjerciciosNoDisponibles([' Press banca ', 'Press banca'])).toBe(
      '«Press banca» ya no está en tu lista de ejercicios. Quítalo o cámbialo por otro y vuelve a guardar.'
    );
    expect(mensajeEjerciciosNoDisponibles(['  '])).toBe(
      '«Ejercicio sin nombre» ya no está en tu lista de ejercicios. Quítalo o cámbialo por otro y vuelve a guardar.'
    );
  });
});
