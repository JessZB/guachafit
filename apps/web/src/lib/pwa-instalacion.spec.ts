import { describe, expect, it } from 'vitest';
import {
  CLAVE_DESCARTE_INSTALACION,
  MS_ESPERA_TRAS_DESCARTE,
  descarteVigente,
  esIOSSafari,
  esModoStandalone,
  leerDescarteDeInstalacion,
  registrarDescarteDeInstalacion,
} from './pwa-instalacion';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD_ESCRITORIO_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

describe('esModoStandalone', () => {
  it('detecta display-mode standalone', () => {
    expect(esModoStandalone(true, undefined)).toBe(true);
  });

  it('detecta navigator.standalone de iOS', () => {
    expect(esModoStandalone(false, true)).toBe(true);
  });

  it('es false en navegador normal', () => {
    expect(esModoStandalone(false, undefined)).toBe(false);
    expect(esModoStandalone(false, false)).toBe(false);
  });
});

describe('esIOSSafari', () => {
  it('detecta Safari en iPhone y iPad', () => {
    expect(esIOSSafari(IPHONE_SAFARI, 5)).toBe(true);
    expect(
      esIOSSafari(
        'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Safari/604.1',
        5
      )
    ).toBe(true);
  });

  it('detecta iPadOS 13+ que se reporta como Macintosh', () => {
    expect(esIOSSafari(IPAD_ESCRITORIO_SAFARI, 5)).toBe(true);
  });

  it('no confunde una Mac de escritorio con iPad', () => {
    expect(esIOSSafari(IPAD_ESCRITORIO_SAFARI, 0)).toBe(false);
  });

  it('excluye Android y Chrome/Edge/Firefox sobre iOS', () => {
    expect(esIOSSafari(ANDROID_CHROME, 5)).toBe(false);
    expect(
      esIOSSafari('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) CriOS/126.0 Safari/604.1', 5)
    ).toBe(false);
    expect(
      esIOSSafari('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) EdgiOS/126.0 Safari/604.1', 5)
    ).toBe(false);
  });

  it('excluye WebViews de apps (Instagram/WhatsApp) que no permiten instalar', () => {
    expect(
      esIOSSafari(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Instagram 320.0 Safari/604.1',
        5
      )
    ).toBe(false);
  });
});

describe('descarteVigente', () => {
  const ahora = 1_700_000_000_000;

  it('sin descarte registrado no está vigente', () => {
    expect(descarteVigente(null, ahora)).toBe(false);
  });

  it('un descarte reciente silencia la invitación', () => {
    expect(descarteVigente(ahora - 1000, ahora)).toBe(true);
  });

  it('un descarte vencido vuelve a permitir la invitación', () => {
    expect(descarteVigente(ahora - MS_ESPERA_TRAS_DESCARTE, ahora)).toBe(false);
  });

  it('un timestamp futuro (reloj movido) no cuenta como descarte', () => {
    expect(descarteVigente(ahora + 60_000, ahora)).toBe(false);
  });
});

describe('persistencia del descarte', () => {
  it('lee un timestamp válido y descarta valores corruptos', () => {
    const storage = {
      getItem: (clave: string) =>
        clave === CLAVE_DESCARTE_INSTALACION ? '1700000000000' : null,
    };
    expect(leerDescarteDeInstalacion(storage)).toBe(1_700_000_000_000);

    expect(leerDescarteDeInstalacion({ getItem: () => 'no-es-un-numero' })).toBeNull();
    expect(leerDescarteDeInstalacion({ getItem: () => null })).toBeNull();
    expect(leerDescarteDeInstalacion(null)).toBeNull();
  });

  it('escribe el timestamp y tolera fallos de localStorage', () => {
    const guardado: Record<string, string> = {};
    registrarDescarteDeInstalacion(
      {
        setItem: (clave: string, valor: string) => {
          guardado[clave] = valor;
        },
      },
      42
    );
    expect(guardado[CLAVE_DESCARTE_INSTALACION]).toBe('42');

    expect(() =>
      registrarDescarteDeInstalacion(
        {
          setItem: () => {
            throw new Error('modo privado');
          },
        },
        42
      )
    ).not.toThrow();

    expect(() => registrarDescarteDeInstalacion(null, 42)).not.toThrow();
  });
});
