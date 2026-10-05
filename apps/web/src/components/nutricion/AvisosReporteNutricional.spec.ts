/**
 * Módulo 3 · Nutrición: avisos del guardado del reporte de hoy (render a string en Node).
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  AvisosReporteNutricional,
  type AvisosReporteNutricionalProps,
} from './AvisosReporteNutricional';

const base: AvisosReporteNutricionalProps = {
  reporteRegistradoHoy: false,
  fechaRegistradaTexto: 'lunes, 21 de septiembre',
  reporteEncolado: false,
  confirmando: false,
  fotosEncoladas: 0,
  aviso: null,
};

function render(props: Partial<AvisosReporteNutricionalProps>): string {
  return renderToStaticMarkup(createElement(AvisosReporteNutricional, { ...base, ...props }));
}

describe('AvisosReporteNutricional', () => {
  it('la confirmación de reporte registrado se anuncia como estado', () => {
    expect(render({ reporteRegistradoHoy: true })).toMatch(
      /<p role="status"[^>]*>[^<]*Reporte registrado para hoy/
    );
  });

  it('el pendiente de envío se anuncia como estado, indica las fotos y no habla del servidor', () => {
    const html = render({ reporteEncolado: true, fotosEncoladas: 2 });
    expect(html).toMatch(/<p role="status"[^>]*>[^<]*Guardado en tu dispositivo con 2 fotos/);
    expect(html).toContain('cuando quede confirmado');
    expect(html).not.toMatch(/servidor/i);
  });

  it('mientras se confirma el envío lo anuncia como estado', () => {
    expect(render({ confirmando: true })).toMatch(
      /<p role="status"[^>]*>Comprobando si tu reporte quedó registrado…<\/p>/
    );
  });

  it('los avisos informativos usan role="status" y los errores role="alert"', () => {
    const info = render({ aviso: { tono: 'info', texto: 'Ya registraste tu reporte de hoy.' } });
    expect(info).toMatch(/<p role="status"[^>]*>Ya registraste tu reporte de hoy\.<\/p>/);

    const error = render({
      aviso: { tono: 'error', texto: 'Notas: usa como máximo 280 caracteres.' },
    });
    expect(error).toMatch(/<p role="alert"[^>]*>Notas: usa como máximo 280 caracteres\.<\/p>/);
    expect(error).not.toContain('role="status"');
  });
});
