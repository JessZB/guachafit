import { describe, it, expect } from 'vitest';
import {
  construirLinkActivacion,
  construirLinkOnboarding,
  construirDestinoRegistro,
  esErrorCorreoYaRegistrado,
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

    it('expone mensajes claros para la UI, sin jerga técnica (B6/B7)', () => {
      expect(MENSAJE_COACH_NO_DISPONIBLE).toBe(
        'El código de entrenador no es válido o no está disponible. Por favor contacta a tu coach.'
      );
      expect(MENSAJE_ACTIVACION_INVALIDA).toBe(
        'Este enlace ya no sirve: venció o ya se usó. Pídele uno nuevo a tu entrenador.'
      );
      expect(MENSAJE_ACTIVACION_INVALIDA).not.toMatch(/TTL|token/i);
    });
  });

  describe('construirDestinoRegistro (A10: /registro → /onboarding)', () => {
    it('preserva la query y traduce coach_code → coach', () => {
      expect(construirDestinoRegistro('?coach_code=alexfit&utm=ig')).toBe(
        '/onboarding?utm=ig&coach=alexfit'
      );
    });

    it('respeta coach si ya viene y no lo duplica', () => {
      expect(construirDestinoRegistro('?coach=ALEXFIT&coach_code=OTRO')).toBe(
        '/onboarding?coach=ALEXFIT'
      );
    });

    it('sin query va a /onboarding a secas', () => {
      expect(construirDestinoRegistro('')).toBe('/onboarding');
    });
  });

  describe('esErrorCorreoYaRegistrado (C8)', () => {
    it('detecta el conflicto 409 del alta', () => {
      expect(esErrorCorreoYaRegistrado({ status: 409 })).toBe(true);
      expect(esErrorCorreoYaRegistrado({ status: 400 })).toBe(false);
      expect(esErrorCorreoYaRegistrado(new Error('x'))).toBe(false);
      expect(esErrorCorreoYaRegistrado(null)).toBe(false);
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
