import { describe, it, expect } from 'vitest';
import {
  MENSAJE_ENLACE_RECUPERACION_INVALIDO,
  MENSAJE_PASSWORD_ACTUALIZADA,
  MENSAJE_RECUPERACION_SOLICITADA,
} from '@guachafit/shared';
import {
  AVISO_PASSWORD_ACTUALIZADA,
  MENSAJE_RECUPERACION_ENVIADA,
  MENSAJE_RECUPERACION_INVALIDA,
  VIGENCIA_RECUPERACION_TEXTO,
  construirEstadoLoginConAviso,
  esEnlaceRecuperacionInvalido,
  leerAvisoLogin,
  leerTokenDeBusqueda,
  normalizarCorreoRecuperacion,
  validarCorreoRecuperacion,
} from './recuperacion-password';
import { PATRON_MENSAJE_TECNICO } from './mensajes-error';
import {
  MENSAJE_CORREO_BIENVENIDA_ENVIADO,
  VIGENCIA_ACTIVACION_TEXTO,
  mensajeCorreoBienvenida,
  validarPasswordActivacion,
} from './onboarding-links';

describe('Recuperación de contraseña (lógica pura)', () => {
  it('los textos visibles son claros, con tuteo y pasan el filtro de mensajes técnicos', () => {
    expect(MENSAJE_RECUPERACION_ENVIADA).toBe(
      'Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña.'
    );
    expect(MENSAJE_RECUPERACION_INVALIDA).toBe(
      'Este enlace ya no sirve: venció o ya se usó. Pide uno nuevo.'
    );
    expect(AVISO_PASSWORD_ACTUALIZADA).toBe('Tu contraseña se actualizó. Ya puedes iniciar sesión.');
    expect(MENSAJE_CORREO_BIENVENIDA_ENVIADO).toBe(
      'Le enviamos un correo con el enlace. Si no le llega, compártele este enlace.'
    );
    for (const texto of [
      MENSAJE_RECUPERACION_ENVIADA,
      MENSAJE_RECUPERACION_INVALIDA,
      AVISO_PASSWORD_ACTUALIZADA,
      MENSAJE_CORREO_BIENVENIDA_ENVIADO,
    ]) {
      expect(PATRON_MENSAJE_TECNICO.test(texto), texto).toBe(false);
    }
  });

  it('los textos que la web compara por igualdad son los del API (@guachafit/shared)', () => {
    expect(MENSAJE_RECUPERACION_ENVIADA).toBe(MENSAJE_RECUPERACION_SOLICITADA);
    expect(MENSAJE_RECUPERACION_INVALIDA).toBe(MENSAJE_ENLACE_RECUPERACION_INVALIDO);
    expect(AVISO_PASSWORD_ACTUALIZADA).toBe(MENSAJE_PASSWORD_ACTUALIZADA);
  });

  it('las vigencias visibles salen de la constante compartida', () => {
    expect(VIGENCIA_RECUPERACION_TEXTO).toBe('1 hora');
    expect(VIGENCIA_ACTIVACION_TEXTO).toBe('48 horas');
  });

  describe('mensajeCorreoBienvenida: solo afirma el envío si el servidor lo confirmó', () => {
    it('correo en camino → avisa del correo y deja el enlace como respaldo', () => {
      expect(mensajeCorreoBienvenida(true, 'alumno')).toBe(MENSAJE_CORREO_BIENVENIDA_ENVIADO);
      expect(mensajeCorreoBienvenida(true, 'entrenador')).toBe(MENSAJE_CORREO_BIENVENIDA_ENVIADO);
    });

    it('sin correo (modo simulado, fallo o respuesta sin el dato) → pide compartir el enlace', () => {
      expect(mensajeCorreoBienvenida(false, 'alumno')).toBe(
        'Comparte este enlace con tu alumno para que cree su contraseña.'
      );
      expect(mensajeCorreoBienvenida(false, 'entrenador')).toBe(
        'Comparte este enlace con el entrenador para que cree su contraseña.'
      );
      expect(mensajeCorreoBienvenida(undefined, 'alumno')).not.toMatch(/correo/i);
    });

    it('los textos pasan el filtro de mensajes técnicos', () => {
      for (const enviado of [true, false]) {
        for (const destinatario of ['alumno', 'entrenador'] as const) {
          const texto = mensajeCorreoBienvenida(enviado, destinatario);
          expect(PATRON_MENSAJE_TECNICO.test(texto), texto).toBe(false);
        }
      }
    });
  });

  describe('validarCorreoRecuperacion / normalizarCorreoRecuperacion', () => {
    it('exige un correo con formato válido', () => {
      expect(validarCorreoRecuperacion('')).toBe('Escribe tu correo electrónico.');
      expect(validarCorreoRecuperacion('   ')).toBe('Escribe tu correo electrónico.');
      expect(validarCorreoRecuperacion('ana')).toBe(
        'Revisa tu correo: no tiene un formato válido.'
      );
      expect(validarCorreoRecuperacion('ana@guachafit')).toBe(
        'Revisa tu correo: no tiene un formato válido.'
      );
      expect(validarCorreoRecuperacion(' ana@guachafit.com ')).toBeNull();
    });

    it('normaliza espacios y mayúsculas', () => {
      expect(normalizarCorreoRecuperacion('  Ana@Guachafit.com ')).toBe('ana@guachafit.com');
    });
  });

  it('la nueva contraseña usa la misma regla que la activación', () => {
    expect(validarPasswordActivacion('corta', 'corta')).toMatch(/al menos 8/);
    expect(validarPasswordActivacion('clave-segura', 'otra-clave')).toBe(
      'Las contraseñas no coinciden.'
    );
    expect(validarPasswordActivacion('clave-segura', 'clave-segura')).toBeNull();
  });

  it('leerTokenDeBusqueda: toma el parámetro del enlace recortado (vacío si falta)', () => {
    expect(leerTokenDeBusqueda('?token=abc123')).toBe('abc123');
    expect(leerTokenDeBusqueda('?token=%20abc%20')).toBe('abc');
    expect(leerTokenDeBusqueda('')).toBe('');
    expect(leerTokenDeBusqueda('?otro=1')).toBe('');
  });

  it('esEnlaceRecuperacionInvalido: el 404 del servidor es un enlace vencido o usado', () => {
    expect(esEnlaceRecuperacionInvalido({ status: 404 })).toBe(true);
    expect(esEnlaceRecuperacionInvalido({ status: 400 })).toBe(false);
    expect(esEnlaceRecuperacionInvalido(null)).toBe(false);
    expect(esEnlaceRecuperacionInvalido(new Error('x'))).toBe(false);
  });

  it('aviso al volver al inicio de sesión: se escribe y se lee del estado de navegación', () => {
    const estado = construirEstadoLoginConAviso();
    expect(leerAvisoLogin(estado)).toBe(AVISO_PASSWORD_ACTUALIZADA);
    expect(leerAvisoLogin(null)).toBeNull();
    expect(leerAvisoLogin(undefined)).toBeNull();
    expect(leerAvisoLogin({ aviso: 42 })).toBeNull();
    // Solo se muestran avisos conocidos (el estado de navegación no es una fuente de texto libre).
    expect(leerAvisoLogin({ aviso: '<b>texto inventado</b>' })).toBeNull();
  });
});
