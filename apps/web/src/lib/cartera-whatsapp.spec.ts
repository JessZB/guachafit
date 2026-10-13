import { describe, expect, it } from 'vitest';
import { digitosWhatsApp, urlWhatsApp } from './cartera-whatsapp';

describe('cartera-whatsapp', () => {
  it('deja solo los dígitos del teléfono con formato humano', () => {
    expect(digitosWhatsApp('+58 412-1234567')).toBe('584121234567');
  });

  it('devuelve null sin teléfono', () => {
    expect(digitosWhatsApp(null)).toBeNull();
    expect(digitosWhatsApp(undefined)).toBeNull();
  });

  it('construye el enlace wa.me con el mensaje codificado', () => {
    expect(urlWhatsApp('584121234567', 'Hola Carlos, ¿cómo estás?')).toBe(
      'https://wa.me/584121234567?text=Hola%20Carlos%2C%20%C2%BFc%C3%B3mo%20est%C3%A1s%3F'
    );
  });
});
