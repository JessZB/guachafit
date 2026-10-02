import { describe, expect, it } from 'vitest';
import { Rol } from '@guachafit/shared';
import {
  CLAVES_SESION_LOCAL,
  asegurarUltimoUsuarioId,
  debeLimpiarDatosAlIniciarSesion,
  debeValidarSesion,
  leerUltimoUsuarioId,
  leerUsuarioGuardado,
} from './sesion-local';

function crearStorage(inicial: Record<string, string> = {}) {
  const datos = new Map<string, string>(Object.entries(inicial));
  return {
    datos,
    getItem: (clave: string) => (datos.has(clave) ? (datos.get(clave) as string) : null),
    setItem: (clave: string, valor: string) => void datos.set(clave, valor),
    removeItem: (clave: string) => void datos.delete(clave),
  };
}

const USUARIO = { id: 'u-1', email: 'coach@guachafit.com', rol: Rol.ENTRENADOR };

describe('sesion-local: lectura segura del usuario guardado (C9)', () => {
  it('devuelve el usuario cuando el JSON es válido', () => {
    const storage = crearStorage({ [CLAVES_SESION_LOCAL.usuario]: JSON.stringify(USUARIO) });
    expect(leerUsuarioGuardado(storage)).toEqual(USUARIO);
  });

  it('devuelve null sin datos guardados', () => {
    expect(leerUsuarioGuardado(crearStorage())).toBeNull();
  });

  it('con JSON corrupto devuelve null y limpia las claves de sesión', () => {
    const storage = crearStorage({
      [CLAVES_SESION_LOCAL.usuario]: '{roto',
      [CLAVES_SESION_LOCAL.accessToken]: 'abc',
      [CLAVES_SESION_LOCAL.refreshToken]: 'def',
      [CLAVES_SESION_LOCAL.modoDemo]: 'true',
    });

    expect(leerUsuarioGuardado(storage)).toBeNull();
    expect(storage.datos.size).toBe(0);
  });

  it('con una forma inesperada (sin id) también limpia', () => {
    const storage = crearStorage({
      [CLAVES_SESION_LOCAL.usuario]: JSON.stringify({ email: 'x@y.com' }),
      [CLAVES_SESION_LOCAL.accessToken]: 'abc',
    });

    expect(leerUsuarioGuardado(storage)).toBeNull();
    expect(storage.getItem(CLAVES_SESION_LOCAL.accessToken)).toBeNull();
  });

  it('si el almacenamiento lanza, no rompe el arranque', () => {
    const storage = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    expect(leerUsuarioGuardado(storage)).toBeNull();
  });
});

describe('sesion-local: cambio de usuario en el login (D2)', () => {
  it('limpia si no había usuario previo o si el id cambia', () => {
    expect(debeLimpiarDatosAlIniciarSesion(null, 'u-1')).toBe(true);
    expect(debeLimpiarDatosAlIniciarSesion('u-1', 'u-2')).toBe(true);
  });

  it('conserva los datos locales si vuelve a entrar el mismo usuario', () => {
    expect(debeLimpiarDatosAlIniciarSesion('u-1', 'u-1')).toBe(false);
  });

  it('lee el último usuario desde su clave o, en su defecto, desde el usuario guardado', () => {
    expect(
      leerUltimoUsuarioId(crearStorage({ [CLAVES_SESION_LOCAL.ultimoUsuarioId]: 'u-9' }))
    ).toBe('u-9');
    expect(
      leerUltimoUsuarioId(crearStorage({ [CLAVES_SESION_LOCAL.usuario]: JSON.stringify(USUARIO) }))
    ).toBe('u-1');
    expect(leerUltimoUsuarioId(crearStorage())).toBeNull();
  });
});

describe('sesion-local: migración del último usuario (sesiones previas a la clave)', () => {
  it('registra el id del usuario guardado si falta la clave', () => {
    const storage = crearStorage({ [CLAVES_SESION_LOCAL.usuario]: JSON.stringify(USUARIO) });
    asegurarUltimoUsuarioId(storage);
    expect(storage.getItem(CLAVES_SESION_LOCAL.ultimoUsuarioId)).toBe('u-1');
  });

  it('no pisa una clave existente ni escribe sin usuario guardado', () => {
    const conClave = crearStorage({
      [CLAVES_SESION_LOCAL.usuario]: JSON.stringify(USUARIO),
      [CLAVES_SESION_LOCAL.ultimoUsuarioId]: 'u-9',
    });
    asegurarUltimoUsuarioId(conClave);
    expect(conClave.getItem(CLAVES_SESION_LOCAL.ultimoUsuarioId)).toBe('u-9');

    const vacio = crearStorage();
    asegurarUltimoUsuarioId(vacio);
    expect(vacio.datos.size).toBe(0);
  });

  it('sesión antigua sin la clave: tras el cierre forzado, el login del mismo id conserva los datos', () => {
    const storage = crearStorage({
      [CLAVES_SESION_LOCAL.usuario]: JSON.stringify(USUARIO),
      [CLAVES_SESION_LOCAL.accessToken]: 'abc',
      [CLAVES_SESION_LOCAL.refreshToken]: 'def',
    });
    // Arranque con la sesión restaurada y cierre por vencimiento (borra usuario y tokens).
    asegurarUltimoUsuarioId(storage);
    storage.removeItem(CLAVES_SESION_LOCAL.usuario);
    storage.removeItem(CLAVES_SESION_LOCAL.accessToken);
    storage.removeItem(CLAVES_SESION_LOCAL.refreshToken);

    expect(debeLimpiarDatosAlIniciarSesion(leerUltimoUsuarioId(storage), 'u-1')).toBe(false);
  });

  it('si el almacenamiento lanza, no rompe', () => {
    const storage = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
      removeItem: () => undefined,
    };
    expect(() => asegurarUltimoUsuarioId(storage)).not.toThrow();
  });
});

describe('sesion-local: cuándo validar la sesión con /auth/me (A1)', () => {
  it('valida solo con sesión real, con red y con la app visible', () => {
    expect(debeValidarSesion({ hayToken: true, esDemo: false, enLinea: true, visible: true })).toBe(
      true
    );
  });

  it('no valida sin red (modo offline), en demo, sin sesión o en segundo plano', () => {
    expect(debeValidarSesion({ hayToken: true, esDemo: false, enLinea: false, visible: true })).toBe(
      false
    );
    expect(debeValidarSesion({ hayToken: true, esDemo: true, enLinea: true, visible: true })).toBe(
      false
    );
    expect(debeValidarSesion({ hayToken: false, esDemo: false, enLinea: true, visible: true })).toBe(
      false
    );
    expect(debeValidarSesion({ hayToken: true, esDemo: false, enLinea: true, visible: false })).toBe(
      false
    );
  });
});
