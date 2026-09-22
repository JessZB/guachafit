import { describe, expect, it, vi } from 'vitest';
import {
  crearGestorActualizacion,
  inicializarActualizacion,
  obtenerGestorActualizacion,
  type OpcionesRegistroSW,
} from './pwa-actualizacion';

function crearRegistroFalso() {
  let opcionesCapturadas: OpcionesRegistroSW | undefined;
  const updateSW = vi.fn(async () => {});
  const registrar = vi.fn((opciones: OpcionesRegistroSW) => {
    opcionesCapturadas = opciones;
    return updateSW;
  });
  return {
    registrar,
    updateSW,
    opciones: () => {
      if (!opcionesCapturadas) throw new Error('El registro no recibió opciones');
      return opcionesCapturadas;
    },
    bloquearAplicar: () => {
      let resolverAplicar: (() => void) | undefined;
      updateSW.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolverAplicar = resolve;
          })
      );
      return () => resolverAplicar?.();
    },
  };
}

describe('pwa-actualizacion: aviso de versión nueva', () => {
  it('parte sin aviso y lo activa con onNeedRefresh, notificando a los suscriptores', () => {
    const { registrar, opciones } = crearRegistroFalso();
    const gestor = crearGestorActualizacion(registrar);
    const listener = vi.fn();
    gestor.suscribir(listener);

    expect(gestor.estadoActual()).toEqual({ hayVersionNueva: false, aplicando: false, error: null });
    expect(listener).toHaveBeenCalledWith(gestor.estadoActual());

    opciones().onNeedRefresh?.();

    expect(gestor.estadoActual().hayVersionNueva).toBe(true);
    expect(listener).toHaveBeenLastCalledWith({
      hayVersionNueva: true,
      aplicando: false,
      error: null,
    });
  });

  it('suscribir entrega el estado actual de inmediato y dejar de suscribirse detiene los avisos', () => {
    const { registrar, opciones } = crearRegistroFalso();
    const gestor = crearGestorActualizacion(registrar);
    const listener = vi.fn();

    const desuscribir = gestor.suscribir(listener);
    opciones().onNeedRefresh?.();
    expect(listener).toHaveBeenCalledTimes(2);

    desuscribir();
    gestor.aplicar();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('aplicar llama a updateSW(true) y, si la página no se recarga, deja un error honesto', async () => {
    const { registrar, updateSW, opciones } = crearRegistroFalso();
    const gestor = crearGestorActualizacion(registrar);

    // Simula el aviso previo (onNeedRefresh) para un estado realista.
    opciones().onNeedRefresh?.();

    await gestor.aplicar();

    expect(updateSW).toHaveBeenCalledWith(true);
    // Sin recarga real (test), no se puede afirmar éxito: el estado lo dice.
    expect(gestor.estadoActual().aplicando).toBe(false);
    expect(gestor.estadoActual().hayVersionNueva).toBe(false);
    expect(gestor.estadoActual().error).toContain('no se recargó automáticamente');
  });

  it('expone aplicando=true mientras updateSW está en vuelo', async () => {
    const registro = crearRegistroFalso();
    const gestor = crearGestorActualizacion(registro.registrar);
    const desbloquear = registro.bloquearAplicar();

    const aplicarPendiente = gestor.aplicar();
    expect(gestor.estadoActual().aplicando).toBe(true);
    expect(gestor.estadoActual().error).toBeNull();

    desbloquear();
    await aplicarPendiente;
    expect(gestor.estadoActual().aplicando).toBe(false);
  });

  it('si updateSW rechaza, informa el fallo sin dejar la app "aplicando" para siempre', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const updateSW = vi.fn(async () => {
      throw new Error('sin service worker en espera');
    });
    const registrar = vi.fn(() => updateSW);
    const gestor = crearGestorActualizacion(registrar);

    await gestor.aplicar();

    expect(gestor.estadoActual()).toEqual({
      hayVersionNueva: false,
      aplicando: false,
      error: 'No se pudo aplicar la actualización. Cierra la aplicación y vuelve a abrirla.',
    });
    warn.mockRestore();
  });

  it('sin registro disponible, aplicar deja un mensaje honesto en vez de fingir éxito', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const registrar = vi.fn(() => {
      throw new Error('registro no soportado');
    });
    const gestor = crearGestorActualizacion(registrar);

    await gestor.aplicar();

    expect(gestor.estadoActual().error).toContain('todavía no está disponible');
    expect(gestor.estadoActual().aplicando).toBe(false);
    warn.mockRestore();
  });

  it('onRegisterError se registra en consola sin romper el gestor', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { registrar, opciones } = crearRegistroFalso();
    const gestor = crearGestorActualizacion(registrar);

    opciones().onRegisterError?.(new Error('register falló'));

    expect(warn).toHaveBeenCalled();
    expect(gestor.estadoActual().hayVersionNueva).toBe(false);
    warn.mockRestore();
  });

  it('inicializarActualizacion es idempotente y registra una sola vez', () => {
    const { registrar } = crearRegistroFalso();

    const primero = inicializarActualizacion(registrar);
    const segundo = inicializarActualizacion(registrar);

    expect(primero).toBe(segundo);
    expect(obtenerGestorActualizacion()).toBe(primero);
    expect(registrar).toHaveBeenCalledTimes(1);
  });
});
