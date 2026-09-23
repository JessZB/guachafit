import { describe, it, expect, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { EstadoAlumno, Modalidad, Rol, TipoDocumento } from '@guachafit/shared';
import {
  AuditoriaAccesosDenegadosService,
  contextoPeticionHttp,
} from '../../src/common/auditoria/auditoria-accesos-denegados.service';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { AlumnoHabilitadoGuard } from '../../src/common/guards/alumno-habilitado.guard';
import { AlumnosController } from '../../src/modules/alumnos/alumnos.controller';
import { EntrenamientoController } from '../../src/modules/entrenamiento/entrenamiento.controller';

/**
 * RF-003 Escenario 3 (WU "RF-003 · cierre"): log de auditoría de intentos de mutación no
 * autorizados.
 *
 * Contrato:
 * 1. La denegación de `RolesGuard`/`AlumnoHabilitadoGuard` persiste UNA fila mínima
 *    (`usuarioId?`, `rol?`, `ruta`, `metodo`, `motivo`, `fechaUtc`) — sin payloads ni PII extra.
 * 2. El permiso concedido NO escribe fila.
 * 3. Una petición anónima escribe fila con `usuarioId: null`.
 * 4. Un fallo al auditar NUNCA cambia la respuesta 403 (best-effort).
 */

const COACH_ID = '11111111-1111-4111-8111-111111111111';
const ALUMNO_USUARIO_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ALUMNO_PERFIL_ID = 'a1111111-1111-4111-8111-111111111111';

function crearContexto(opciones: {
  user?: any;
  method?: string;
  url?: string;
  routePath?: string;
  handler: (...args: any[]) => any;
  controller: new (...args: any[]) => any;
}): ExecutionContext {
  return {
    getHandler: () => opciones.handler,
    getClass: () => opciones.controller,
    switchToHttp: () => ({
      getRequest: () => ({
        user: opciones.user,
        method: opciones.method,
        url: opciones.url,
        route: opciones.routePath ? { path: opciones.routePath } : undefined,
      }),
    }),
  } as unknown as ExecutionContext;
}

function perfilAlumno(overrides: Record<string, any> = {}) {
  return {
    id: ALUMNO_PERFIL_ID,
    usuarioId: ALUMNO_USUARIO_ID,
    entrenadorId: COACH_ID,
    tipoDocumento: TipoDocumento.V,
    numeroDocumento: '12345678',
    nombres: 'Ana',
    apellidos: 'Alumna',
    modalidad: Modalidad.PRESENCIAL,
    estadoActivacion: EstadoAlumno.ACTIVO,
    deletedAtUtc: null,
    ...overrides,
  };
}

/** Mock mínimo de Drizzle para el SELECT del perfil del guard (select → from → where → limit). */
function crearDbConPerfil(perfil: any | null) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(perfil ? [{ ...perfil }] : []),
        }),
      }),
    }),
  } as any;
}

/** Doble de la auditoría: registra las llamadas sin tocar la BD. */
function crearAuditoriaEspia() {
  return { registrar: vi.fn().mockResolvedValue(undefined) } as any;
}

/** BD en memoria mínima para el servicio real de auditoría (insert → values). */
function crearDbAuditoria(filas: any[], opciones: { fallar?: boolean } = {}) {
  return {
    insert: () => ({
      values: (vals: any) => {
        if (opciones.fallar) return Promise.reject(new Error('BD caída'));
        filas.push(vals);
        return Promise.resolve();
      },
    }),
  } as any;
}

describe('RF-003 Escenario 3 (cierre): auditoría de accesos denegados', () => {
  describe('AuditoriaAccesosDenegadosService (persistencia best-effort)', () => {
    it('persiste los metadatos mínimos del intento denegado', async () => {
      const filas: any[] = [];
      const servicio = new AuditoriaAccesosDenegadosService(crearDbAuditoria(filas));

      await servicio.registrar({
        usuarioId: ALUMNO_USUARIO_ID,
        rol: Rol.ALUMNO,
        ruta: '/antropometria/checkin',
        metodo: 'POST',
        motivo: 'ROL_NO_AUTORIZADO',
      });

      expect(filas).toHaveLength(1);
      expect(filas[0]).toMatchObject({
        usuarioId: ALUMNO_USUARIO_ID,
        rol: Rol.ALUMNO,
        ruta: '/antropometria/checkin',
        metodo: 'POST',
        motivo: 'ROL_NO_AUTORIZADO',
      });
      expect(filas[0].fechaUtc).toBeInstanceOf(Date);
    });

    it('un fallo de BD NO lanza (el 403 no cambia)', async () => {
      const servicio = new AuditoriaAccesosDenegadosService(
        crearDbAuditoria([], { fallar: true })
      );

      await expect(
        servicio.registrar({ ruta: '/x', metodo: 'POST', motivo: 'ROL_NO_AUTORIZADO' })
      ).resolves.toBeUndefined();
    });

    it('sin conexión inyectada (construcción directa en tests) es un no-op', async () => {
      const servicio = new AuditoriaAccesosDenegadosService(undefined);

      await expect(
        servicio.registrar({ ruta: '/x', metodo: 'POST', motivo: 'SIN_AUTENTICACION' })
      ).resolves.toBeUndefined();
    });

    it('contextoPeticionHttp prefiere el patrón del router y descarta el query string', () => {
      expect(
        contextoPeticionHttp({
          route: { path: '/alumnos/:id' },
          url: '/alumnos/abc?token=secreto',
          method: 'PATCH',
        })
      ).toEqual({ ruta: '/alumnos/:id', metodo: 'PATCH' });

      expect(contextoPeticionHttp({ url: '/nutricion/checkin?fecha=2026-09-07' })).toEqual({
        ruta: '/nutricion/checkin',
        metodo: 'SIN_METODO',
      });

      expect(contextoPeticionHttp(undefined)).toEqual({
        ruta: 'desconocida',
        metodo: 'SIN_METODO',
      });
    });
  });

  describe('RolesGuard: denegación por rol', () => {
    // Handler real con @Roles(Rol.ENTRENADOR): el alumno no puede ejecutarlo.
    const handler = AlumnosController.prototype.altaManual;
    const controller = AlumnosController;

    it('denegación → fila de auditoría con usuario, rol, ruta, método y motivo', () => {
      const filas: any[] = [];
      const auditoria = new AuditoriaAccesosDenegadosService(crearDbAuditoria(filas));
      const guard = new RolesGuard(new Reflector(), auditoria);
      const contexto = crearContexto({
        user: { sub: ALUMNO_USUARIO_ID, rol: Rol.ALUMNO },
        method: 'POST',
        routePath: '/alumnos/manual',
        handler,
        controller,
      });

      // El guard es SÍNCRONO (la auditoría es fire-and-forget): el 403 se lanza en el acto.
      expect(() => guard.canActivate(contexto)).toThrow(ForbiddenException);

      expect(filas).toHaveLength(1);
      expect(filas[0]).toMatchObject({
        usuarioId: ALUMNO_USUARIO_ID,
        rol: Rol.ALUMNO,
        ruta: '/alumnos/manual',
        metodo: 'POST',
        motivo: 'ROL_NO_AUTORIZADO',
      });
    });

    it('permiso concedido → sin fila (no se audita el acceso legítimo)', () => {
      const filas: any[] = [];
      const auditoria = new AuditoriaAccesosDenegadosService(crearDbAuditoria(filas));
      const guard = new RolesGuard(new Reflector(), auditoria);
      const contexto = crearContexto({
        user: { sub: COACH_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_ID },
        method: 'POST',
        routePath: '/alumnos/manual',
        handler,
        controller,
      });

      expect(guard.canActivate(contexto)).toBe(true);
      expect(filas).toHaveLength(0);
    });

    it('usuario anónimo → fila con usuarioId null y motivo SIN_AUTENTICACION', () => {
      const filas: any[] = [];
      const auditoria = new AuditoriaAccesosDenegadosService(crearDbAuditoria(filas));
      const guard = new RolesGuard(new Reflector(), auditoria);
      const contexto = crearContexto({
        user: undefined,
        method: 'POST',
        routePath: '/alumnos/manual',
        handler,
        controller,
      });

      expect(() => guard.canActivate(contexto)).toThrow(ForbiddenException);

      expect(filas).toHaveLength(1);
      expect(filas[0]).toMatchObject({
        usuarioId: null,
        rol: null,
        ruta: '/alumnos/manual',
        metodo: 'POST',
        motivo: 'SIN_AUTENTICACION',
      });
    });

    it('un fallo del servicio de auditoría NO cambia el 403 (best-effort)', async () => {
      const auditoria = { registrar: vi.fn().mockRejectedValue(new Error('BD caída')) } as any;
      const guard = new RolesGuard(new Reflector(), auditoria);
      const contexto = crearContexto({
        user: { sub: ALUMNO_USUARIO_ID, rol: Rol.ALUMNO },
        method: 'POST',
        routePath: '/alumnos/manual',
        handler,
        controller,
      });

      expect(() => guard.canActivate(contexto)).toThrow(ForbiddenException);
      expect(auditoria.registrar).toHaveBeenCalledTimes(1);
      await new Promise((resolve) => setImmediate(resolve));
    });
  });

  describe('AlumnoHabilitadoGuard: denegación por ciclo de vida', () => {
    const reflector = new Reflector();
    const handler = EntrenamientoController.prototype.obtenerSesionHoy;
    const controller = EntrenamientoController;

    it('alumno pausado → 403 y fila con motivo ESTADO_ACTIVACION', async () => {
      const filas: any[] = [];
      const auditoria = new AuditoriaAccesosDenegadosService(crearDbAuditoria(filas));
      const guard = new AlumnoHabilitadoGuard(
        crearDbConPerfil(perfilAlumno({ estadoActivacion: EstadoAlumno.INACTIVO_PAUSADO })),
        reflector,
        auditoria
      );
      const contexto = crearContexto({
        user: { sub: ALUMNO_USUARIO_ID, rol: Rol.ALUMNO },
        method: 'GET',
        routePath: '/entrenamiento/sesion-hoy',
        handler,
        controller,
      });

      await expect(guard.canActivate(contexto)).rejects.toBeInstanceOf(ForbiddenException);

      expect(filas).toHaveLength(1);
      expect(filas[0]).toMatchObject({
        usuarioId: ALUMNO_USUARIO_ID,
        rol: Rol.ALUMNO,
        ruta: '/entrenamiento/sesion-hoy',
        metodo: 'GET',
        motivo: 'ESTADO_ACTIVACION',
      });
    });

    it('alumno archivado → fila con motivo CUENTA_ARCHIVADA', async () => {
      const filas: any[] = [];
      const auditoria = new AuditoriaAccesosDenegadosService(crearDbAuditoria(filas));
      const guard = new AlumnoHabilitadoGuard(
        crearDbConPerfil(perfilAlumno({ deletedAtUtc: new Date('2026-01-10T12:00:00Z') })),
        reflector,
        auditoria
      );
      const contexto = crearContexto({
        user: { sub: ALUMNO_USUARIO_ID, rol: Rol.ALUMNO },
        method: 'GET',
        routePath: '/entrenamiento/sesion-hoy',
        handler,
        controller,
      });

      await expect(guard.canActivate(contexto)).rejects.toBeInstanceOf(ForbiddenException);

      expect(filas).toHaveLength(1);
      expect(filas[0]).toMatchObject({ motivo: 'CUENTA_ARCHIVADA' });
    });

    it('alumno activo → permiso concedido y sin fila', async () => {
      const filas: any[] = [];
      const auditoria = new AuditoriaAccesosDenegadosService(crearDbAuditoria(filas));
      const guard = new AlumnoHabilitadoGuard(crearDbConPerfil(perfilAlumno()), reflector, auditoria);
      const contexto = crearContexto({
        user: { sub: ALUMNO_USUARIO_ID, rol: Rol.ALUMNO },
        method: 'GET',
        routePath: '/entrenamiento/sesion-hoy',
        handler,
        controller,
      });

      await expect(guard.canActivate(contexto)).resolves.toBe(true);
      expect(filas).toHaveLength(0);
    });

    it('el coach NO se audita: el guard no evalúa su ciclo de vida', async () => {
      const auditoria = crearAuditoriaEspia();
      const guard = new AlumnoHabilitadoGuard(
        crearDbConPerfil(perfilAlumno({ estadoActivacion: EstadoAlumno.SUSPENDIDO_PAGO })),
        reflector,
        auditoria
      );
      const contexto = crearContexto({
        user: { sub: COACH_ID, rol: Rol.ENTRENADOR },
        method: 'GET',
        routePath: '/entrenamiento/sesion-hoy',
        handler,
        controller,
      });

      await expect(guard.canActivate(contexto)).resolves.toBe(true);
      expect(auditoria.registrar).not.toHaveBeenCalled();
    });
  });
});
