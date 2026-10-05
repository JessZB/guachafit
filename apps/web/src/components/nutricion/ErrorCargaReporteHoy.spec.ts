import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ErrorCargaReporteHoy } from './ErrorCargaReporteHoy';

describe('ErrorCargaReporteHoy', () => {
  it('muestra el mensaje claro con la opción de reintentar', () => {
    const html = renderToStaticMarkup(
      createElement(ErrorCargaReporteHoy, {
        mensaje: 'No pudimos cargar tu reporte de hoy. Revisa tu conexión e inténtalo de nuevo.',
        onReintentar: () => undefined,
      })
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('No pudimos cargar tu reporte de hoy.');
    expect(html).toMatch(/<button[^>]*>Reintentar<\/button>/);
  });
});
