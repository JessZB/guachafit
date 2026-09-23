/**
 * RF-010 (WU Admin): smoke tests de render de la tabla de entrenadores del panel maestro
 * (sin jsdom, con `react-dom/server`), igual que la tabla de cartera.
 *
 * Comprueban los estados honestos que la UI promete: carga, vacío, error con reintento, badges de
 * cuenta/licencia, etiquetas de acción correctas y el bloqueo del botón de auto-deshabilitación.
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EstadoLicencia, type EntrenadorAdminDTO } from '@guachafit/shared';
import { TablaEntrenadoresAdmin } from './TablaEntrenadoresAdmin';

function entrenador(parcial: Partial<EntrenadorAdminDTO> = {}): EntrenadorAdminDTO {
  return {
    usuarioId: 'coach-1',
    perfilId: 'perfil-1',
    nombres: 'Marcos',
    apellidos: 'Fitness',
    nombreComercial: 'Marcos Fitness',
    email: 'marcos@gym.com',
    coachCode: 'MARCOS-921',
    estadoLicencia: EstadoLicencia.ACTIVA,
    activo: true,
    fechaAltaUtc: '2026-08-15T14:00:00.000Z',
    ...parcial,
  };
}

function renderizar(
  opciones: Partial<Parameters<typeof TablaEntrenadoresAdmin>[0]> = {}
): string {
  return renderToStaticMarkup(
    createElement(TablaEntrenadoresAdmin, {
      items: [],
      cargando: false,
      error: null,
      procesandoUsuarioId: null,
      onReintentar: () => {},
      onCambiarEstado: () => {},
      onCambiarLicencia: () => {},
      ...opciones,
    })
  );
}

/** ¿El botón que contiene `texto` está deshabilitado? (mira el atributo, no las clases CSS). */
function botonDeshabilitado(markup: string, texto: string): boolean {
  const indice = markup.indexOf(texto);
  if (indice < 0) throw new Error(`No se encontró el texto "${texto}" en el render`);
  const apertura = markup.lastIndexOf('<button', indice);
  const etiqueta = markup.slice(apertura, markup.indexOf('>', apertura) + 1);
  return /\sdisabled(?:="")?(?=[\s>])/.test(etiqueta);
}

describe('TablaEntrenadoresAdmin (RF-010 WU Admin)', () => {
  it('sin entrenadores muestra el vacío honesto con la invitación al alta', () => {
    const markup = renderizar();
    expect(markup).toContain('Todavía no hay entrenadores');
    expect(markup).toContain('Crea el primero con el formulario de alta');
  });

  it('mientras carga sin datos muestra el estado de carga accesible', () => {
    const markup = renderizar({ cargando: true });
    expect(markup).toContain('role="status"');
    expect(markup).toContain('Cargando entrenadores');
  });

  it('con error muestra el mensaje real y el botón de reintento', () => {
    const markup = renderizar({ error: 'No se pudo cargar la lista de entrenadores.' });
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('No se pudo cargar la lista de entrenadores.');
    expect(markup).toContain('Reintentar');
  });

  it('una fila muestra nombre, correo, coachCode, alta y ambos badges', () => {
    const markup = renderizar({ items: [entrenador()] });

    expect(markup).toContain('Marcos Fitness');
    expect(markup).toContain('marcos@gym.com');
    expect(markup).toContain('MARCOS-921');
    expect(markup).toContain('Cuenta activa');
    expect(markup).toContain('Licencia activa');
    expect(markup).toContain('Alta:');
  });

  it('la cuenta deshabilitada ofrece "Reactivar" y la licencia suspendida "Activar licencia"', () => {
    const markupDeshabilitada = renderizar({ items: [entrenador({ activo: false })] });
    const markupSuspendida = renderizar({
      items: [entrenador({ estadoLicencia: EstadoLicencia.SUSPENDIDA_SUPERADMIN })],
    });

    expect(markupDeshabilitada).toContain('Cuenta deshabilitada');
    expect(markupDeshabilitada).toContain('Reactivar');
    expect(markupDeshabilitada).not.toContain('>Deshabilitar<');

    expect(markupSuspendida).toContain('Licencia suspendida');
    expect(markupSuspendida).toContain('Activar licencia');
    expect(markupSuspendida).not.toContain('>Suspender licencia<');
  });

  it('el botón de deshabilitar se bloquea para la propia cuenta (no auto-deshabilitarse)', () => {
    const markup = renderizar({
      items: [entrenador({ usuarioId: 'superadmin-1' })],
      usuarioActualId: 'superadmin-1',
    });

    expect(botonDeshabilitado(markup, 'Deshabilitar')).toBe(true);
    // La acción de licencia sigue disponible: no es auto-deshabilitación.
    expect(botonDeshabilitado(markup, 'Suspender licencia')).toBe(false);
  });

  it('los botones de la fila en vuelo se deshabilitan mientras la acción se procesa', () => {
    const markup = renderizar({
      items: [entrenador({ usuarioId: 'coach-9' })],
      procesandoUsuarioId: 'coach-9',
    });

    expect(botonDeshabilitado(markup, 'Deshabilitar')).toBe(true);
    expect(botonDeshabilitado(markup, 'Suspender licencia')).toBe(true);
  });
});
