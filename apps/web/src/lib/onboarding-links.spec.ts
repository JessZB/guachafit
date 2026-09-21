import { describe, it, expect } from 'vitest';
import {
  construirLinkActivacion,
  construirLinkOnboarding,
  esFormatoCoachCodeValido,
  MENSAJE_ACTIVACION_INVALIDA,
  MENSAJE_COACH_NO_DISPONIBLE,
  normalizarCoachCode,
  validarPasswordActivacion,
} from './onboarding-links';

describe('WU-E (RF-011): helpers de onboarding', () => {
  describe('normalizarCoachCode / esFormatoCoachCodeValido', () => {
    it('normaliza espacios y minúsculas al formato que persiste la API', () => {
      expect(normalizarCoachCode(' alexfit ')).toBe('ALEXFIT');
      expect(normalizarCoachCode(null)).toBe('');
      expect(normalizarCoachCode(undefined)).toBe('');
    });

    it('acepta códigos del formato canónico y rechaza basura', () => {
      expect(esFormatoCoachCodeValido('ALEXFIT')).toBe(true);
      expect(esFormatoCoachCodeValido('guacha-coach')).toBe(true);
      expect(esFormatoCoachCodeValido('AB')).toBe(false);
      expect(esFormatoCoachCodeValido('CODIGO CON ESPACIOS')).toBe(false);
      expect(esFormatoCoachCodeValido('CÓDIGO-Ñ')).toBe(false);
      expect(esFormatoCoachCodeValido('')).toBe(false);
    });
  });

  describe('construcción de enlaces con el origen real', () => {
    it('el deep link usa el coachCode real y no un valor fijo', () => {
      const url = construirLinkOnboarding('guacha-coach', 'https://app.guachafit.com');
      expect(url).toBe('https://app.guachafit.com/onboarding?coach=GUACHA-COACH');
      expect(url).not.toContain('ALEXFIT');
    });

    it('codifica el código para URL', () => {
      expect(construirLinkOnboarding('a b', 'http://localhost:5173')).toBe(
        'http://localhost:5173/onboarding?coach=A%20B'
      );
    });

    it('el enlace de activación apunta a /activar con el token codificado', () => {
      const url = construirLinkActivacion('tok/en+con espacios', 'http://localhost:5173');
      expect(url).toBe(
        'http://localhost:5173/activar?token=tok%2Fen%2Bcon%20espacios'
      );
    });

    it('expone mensajes claros para la UI', () => {
      expect(MENSAJE_COACH_NO_DISPONIBLE).toContain('no válido');
      expect(MENSAJE_ACTIVACION_INVALIDA).toContain('expirado');
    });
  });

  describe('validarPasswordActivacion', () => {
    it('exige mínimo 8 caracteres (misma regla del schema del backend)', () => {
      expect(validarPasswordActivacion('corta', 'corta')).toContain('al menos 8');
    });

    it('rechaza confirmación distinta', () => {
      expect(validarPasswordActivacion('clave-segura', 'clave-distinta')).toBe(
        'Las contraseñas no coinciden.'
      );
    });

    it('rechaza contraseñas que superan el máximo del schema', () => {
      const larga = 'x'.repeat(101);
      expect(validarPasswordActivacion(larga, larga)).toContain('no puede superar');
    });

    it('acepta una contraseña válida confirmada', () => {
      expect(validarPasswordActivacion('clave-segura-2026', 'clave-segura-2026')).toBeNull();
    });
  });
});
