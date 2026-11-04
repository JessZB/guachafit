import { describe, expect, it, vi } from 'vitest';
import { limpiarClavesEntrenamientoLocal } from './sesion-local';

/**
 * Almacén falso en memoria con soporte de indexación por clave y longitud.
 * En `sesion-local.ts`, `StorageLike` está definido como `Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>`.
 * Para poder inspeccionar o enumerar claves y limpiarlas, el test usa un almacén que también implementa
 * `key` y `length` según el estándar de Storage del navegador (Window.localStorage).
 */
interface StorageConClaves {
  getItem: (clave: string) => string | null;
  setItem: (clave: string, valor: string) => void;
  removeItem: (clave: string) => void;
  key: (indice: number) => string | null;
  length: number;
}

function crearAlmacenFalso(inicial: Record<string, string> = {}): StorageConClaves {
  const mapa = new Map<string, string>(Object.entries(inicial));
  return {
    getItem: (clave: string) => mapa.get(clave) ?? null,
    setItem: (clave: string, valor: string) => mapa.set(clave, valor),
    removeItem: (clave: string) => {
      mapa.delete(clave);
    },
    key: (indice: number) => Array.from(mapa.keys())[indice] ?? null,
    get length() {
      return mapa.size;
    },
  };
}

describe('sesion-local · limpiarClavesEntrenamientoLocal', () => {
  it('elimina todas las claves que empiezan por guachafit_cronometro_', () => {
    const almacen = crearAlmacenFalso({
      'guachafit_cronometro_sesion-1': '{"v":1}',
      'guachafit_cronometro_sesion-2': '{"v":1}',
      guachafit_user: '{"id":"usr-1"}',
      guachafit_token: 'jwt-token',
      guachafit_demo_mode: 'false',
      guachafit_ultimo_usuario_id: 'usr-1',
      'guachafit_foco_preferido_ej-1': 'foco',
      otra_clave_app: 'valor',
    });

    limpiarClavesEntrenamientoLocal(almacen);

    expect(almacen.getItem('guachafit_cronometro_sesion-1')).toBeNull();
    expect(almacen.getItem('guachafit_cronometro_sesion-2')).toBeNull();
  });

  it('no toca ninguna clave que no empiece por guachafit_cronometro_', () => {
    const inicial = {
      guachafit_user: '{"id":"usr-1"}',
      guachafit_token: 'jwt-token',
      guachafit_demo_mode: 'false',
      guachafit_ultimo_usuario_id: 'usr-1',
      'guachafit_foco_preferido_ej-1': 'foco',
      otra_clave_app: 'valor',
      'guachafit_cronometro_sesion-xyz': '{"v":1}',
    };
    const almacen = crearAlmacenFalso(inicial);

    limpiarClavesEntrenamientoLocal(almacen);

    expect(almacen.getItem('guachafit_user')).toBe('{"id":"usr-1"}');
    expect(almacen.getItem('guachafit_token')).toBe('jwt-token');
    expect(almacen.getItem('guachafit_demo_mode')).toBe('false');
    expect(almacen.getItem('guachafit_ultimo_usuario_id')).toBe('usr-1');
    expect(almacen.getItem('guachafit_foco_preferido_ej-1')).toBe('foco');
    expect(almacen.getItem('otra_clave_app')).toBe('valor');
  });

  it('no falla si el almacén está vacío o no contiene claves de cronómetro', () => {
    const almacen = crearAlmacenFalso({
      guachafit_user: '{"id":"usr-1"}',
    });

    expect(() => limpiarClavesEntrenamientoLocal(almacen)).not.toThrow();
    expect(almacen.getItem('guachafit_user')).toBe('{"id":"usr-1"}');
  });

  it('manejo de errores: si removeItem lanza error no rompe la ejecución', () => {
    const almacen = crearAlmacenFalso({
      'guachafit_cronometro_sesion-1': '{"v":1}',
      'guachafit_cronometro_sesion-2': '{"v":1}',
      guachafit_user: '{"id":"usr-1"}',
    });

    const removeItemOriginal = almacen.removeItem;
    almacen.removeItem = vi.fn((clave: string) => {
      if (clave === 'guachafit_cronometro_sesion-1') {
        throw new Error('Permiso denegado en removeItem');
      }
      removeItemOriginal(clave);
    });

    expect(() => limpiarClavesEntrenamientoLocal(almacen)).not.toThrow();
    expect(almacen.getItem('guachafit_cronometro_sesion-2')).toBeNull();
    expect(almacen.getItem('guachafit_user')).toBe('{"id":"usr-1"}');
  });

  it('manejo de errores: si key() lanza error no rompe la ejecución', () => {
    const almacen = crearAlmacenFalso({
      'guachafit_cronometro_sesion-1': '{"v":1}',
    });
    almacen.key = vi.fn(() => {
      throw new Error('Fallo al leer clave');
    });

    expect(() => limpiarClavesEntrenamientoLocal(almacen)).not.toThrow();
  });
});
