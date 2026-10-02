import { describe, expect, it } from 'vitest';
import {
  calcularEdad,
  componerTelefonoWhatsapp,
  fechaLocalHoyISO,
  PREFIJO_PAIS_POR_DEFECTO,
  textoEdad,
  validarFechaNacimiento,
  validarTelefonoWhatsapp,
} from './formulario-registro';

const HOY = new Date(2026, 9, 2); // 2 de octubre de 2026 (hora local)

describe('formulario-registro: WhatsApp (A2)', () => {
  it('el prefijo de país por defecto es +58', () => {
    expect(PREFIJO_PAIS_POR_DEFECTO).toBe('+58');
  });

  it('compone el número internacional quitando espacios, guiones y el 0 inicial', () => {
    expect(componerTelefonoWhatsapp('+58', '0412-123 4567')).toBe('+584121234567');
    expect(componerTelefonoWhatsapp('+57', '300 123 4567')).toBe('+573001234567');
    expect(componerTelefonoWhatsapp(' 58 ', '4121234567')).toBe('+584121234567');
  });

  it('acepta un número completo y respeta el rango del schema compartido (8 a 30)', () => {
    expect(validarTelefonoWhatsapp('+58', '4121234567')).toBeNull();
    expect(componerTelefonoWhatsapp('+58', '4121234567').length).toBeGreaterThanOrEqual(8);
  });

  it('exige el número', () => {
    expect(validarTelefonoWhatsapp('+58', '')).toBe('Escribe tu número de WhatsApp.');
  });

  it('rechaza números incompletos, demasiado largos o con letras', () => {
    const mensaje = 'Revisa tu número de WhatsApp: escribe solo números, sin el código de país.';
    expect(validarTelefonoWhatsapp('+58', '41212')).toBe(mensaje);
    expect(validarTelefonoWhatsapp('+58', '4121234567890123')).toBe(mensaje);
    expect(validarTelefonoWhatsapp('+58', '412abc4567')).toBe(mensaje);
  });

  it('detecta el código de país repetido en el número y no lo corrige en silencio', () => {
    expect(validarTelefonoWhatsapp('+58', '584121234567')).toBe(
      'Parece que incluiste el código de país. Escribe solo tu número, sin el +58.'
    );
  });

  it('quita como máximo un 0 troncal y solo para +58', () => {
    expect(componerTelefonoWhatsapp('+58', '04121234567')).toBe('+584121234567');
    expect(componerTelefonoWhatsapp('+58', '4121234567')).toBe('+584121234567');
    expect(componerTelefonoWhatsapp('+58', '004121234567')).toBe('+5804121234567');
    expect(componerTelefonoWhatsapp('+39', '0612345678')).toBe('+390612345678');
    expect(validarTelefonoWhatsapp('+39', '0612345678')).toBeNull();
  });

  it('rechaza un código de país inválido', () => {
    expect(validarTelefonoWhatsapp('', '4121234567')).toBe(
      'Revisa el código de país (por ejemplo, +58).'
    );
    expect(validarTelefonoWhatsapp('+58123', '4121234567')).toBe(
      'Revisa el código de país (por ejemplo, +58).'
    );
  });
});

describe('formulario-registro: fecha de nacimiento (A2)', () => {
  it('es obligatoria', () => {
    expect(validarFechaNacimiento('', HOY)).toBe('Indica tu fecha de nacimiento.');
  });

  it('no puede ser futura ni tener un formato inválido', () => {
    expect(validarFechaNacimiento('2030-01-01', HOY)).toBe(
      'La fecha de nacimiento no puede ser futura.'
    );
    expect(validarFechaNacimiento('01/02/2000', HOY)).toBe(
      'Indica tu fecha de nacimiento.'
    );
  });

  it('acepta una fecha válida', () => {
    expect(validarFechaNacimiento('2000-05-14', HOY)).toBeNull();
  });
});

describe('formulario-registro: fecha máxima local', () => {
  it('devuelve YYYY-MM-DD con la fecha local, no la UTC', () => {
    expect(fechaLocalHoyISO(new Date(2026, 9, 2, 23, 30))).toBe('2026-10-02');
    expect(fechaLocalHoyISO(new Date(2026, 0, 5, 0, 15))).toBe('2026-01-05');
  });
});

describe('formulario-registro: edad en vivo (A11)', () => {
  it('calcula la edad cumplida según el día local', () => {
    expect(calcularEdad('2000-10-02', HOY)).toBe(26);
    expect(calcularEdad('2000-10-03', HOY)).toBe(25);
    expect(calcularEdad('', HOY)).toBeNull();
    expect(calcularEdad('no-es-fecha', HOY)).toBeNull();
    expect(calcularEdad('2030-01-01', HOY)).toBeNull();
  });

  it('formatea "Edad: N años" con singular correcto', () => {
    expect(textoEdad('2000-10-02', HOY)).toBe('Edad: 26 años');
    expect(textoEdad('2025-09-01', HOY)).toBe('Edad: 1 año');
    expect(textoEdad('', HOY)).toBeNull();
  });
});
