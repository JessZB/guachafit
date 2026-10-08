/**
 * RF-018 · Lote WEB: piezas presentacionales de la pantalla "Ajustes" (render a string, sin jsdom).
 * Fijan labels asociados, estados de error/éxito accesibles, tamaños táctiles y textos de ≥12px.
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Rol, TipoDocumento } from '@guachafit/shared';
import { FormularioDatosPerfil } from './FormularioDatosPerfil';
import { FormularioCambioCorreo } from './FormularioCambioCorreo';
import { FormularioCambioPassword } from './FormularioCambioPassword';
import { EstadoConfirmacionCorreo } from './EstadoConfirmacionCorreo';
import {
  AVISO_CAMBIO_CORREO,
  TEXTO_IDENTIDAD_SOLO_LECTURA,
  mensajeConfirmacionCorreo,
  type FormularioPerfil,
} from '../../lib/mi-perfil';
import {
  formatFechaCalendario,
  formatFechaLargaCalendario,
  formatFechaLocal,
} from '../../lib/date-format';
import { tamanosMenoresA12px } from '../entrenador/tamanos-texto.spec-helper';

const noop = () => undefined;

const VALORES_ALUMNO: FormularioPerfil = {
  nombres: 'Ana',
  apellidos: 'Pérez',
  telefono: '04141234567',
  nombreComercial: '',
};

const VALORES_ENTRENADOR: FormularioPerfil = {
  nombres: 'Luis',
  apellidos: 'Gómez',
  telefono: '04140000000',
  nombreComercial: 'Fit House',
};

const IDENTIDAD_ALUMNO = {
  tipoDocumento: TipoDocumento.V,
  numeroDocumento: '24123456',
  fechaNacimiento: '1990-05-15',
};

function inputsDe(html: string): string[] {
  return html.match(/<input\b[^>]*>/g) ?? [];
}

function botonesDe(html: string): string[] {
  return html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
}

function idsDeInputs(html: string): string[] {
  return inputsDe(html).map((tag) => tag.match(/\bid="([^"]+)"/)?.[1] ?? '');
}

function forsDeLabels(html: string): string[] {
  return [...html.matchAll(/<label\b[^>]*\bfor="([^"]+)"/g)].map((match) => match[1]);
}

function inputConId(html: string, id: string): string | undefined {
  return inputsDe(html).find((tag) => tag.includes(`id="${id}"`));
}

function inputPorEtiqueta(html: string, texto: string): string | undefined {
  const label = html.match(new RegExp(`<label\\b[^>]*for="([^"]+)"[^>]*>${texto}</label>`));
  if (!label) return undefined;
  return inputConId(html, label[1]);
}

/**
 * El contrato exige mostrar la fecha de nacimiento como TEXTO, sin fijar el formato humano:
 * se acepta el valor crudo o cualquiera de los formatos existentes del repo.
 */
function fechaVisibleComoTexto(html: string, iso: string): boolean {
  const variantes = [
    iso,
    formatFechaCalendario(iso),
    formatFechaLargaCalendario(iso),
    formatFechaLocal(iso),
  ].filter((valor): valor is string => Boolean(valor));
  return variantes.some((valor) => html.includes(valor));
}

function renderDatosPerfil(
  parcial: Partial<Parameters<typeof FormularioDatosPerfil>[0]> = {}
): string {
  return renderToStaticMarkup(
    createElement(FormularioDatosPerfil, {
      rol: Rol.ALUMNO,
      valores: VALORES_ALUMNO,
      errores: {},
      identidad: null,
      onCambiar: noop,
      onGuardar: noop,
      ...parcial,
    })
  );
}

function renderCambioCorreo(
  parcial: Partial<Parameters<typeof FormularioCambioCorreo>[0]> = {}
): string {
  return renderToStaticMarkup(
    createElement(FormularioCambioCorreo, {
      correoActual: 'actual@example.com',
      correoPendiente: null,
      valores: { correoNuevo: '', passwordActual: '' },
      onCambiar: noop,
      onEnviar: noop,
      onReenviar: noop,
      onCancelarPendiente: noop,
      ...parcial,
    })
  );
}

function renderCambioPassword(
  parcial: Partial<Parameters<typeof FormularioCambioPassword>[0]> = {}
): string {
  return renderToStaticMarkup(
    createElement(FormularioCambioPassword, {
      valores: { actual: '', nueva: '', confirmacion: '' },
      errores: {},
      onCambiar: noop,
      onGuardar: noop,
      ...parcial,
    })
  );
}

function renderConfirmacion(
  parcial: Partial<Parameters<typeof EstadoConfirmacionCorreo>[0]> = {}
): string {
  return renderToStaticMarkup(
    createElement(EstadoConfirmacionCorreo, { estado: 'confirmando', ...parcial })
  );
}

describe('FormularioDatosPerfil', () => {
  it('el alumno tiene un input con label por cada campo editable (teléfono con type=tel)', () => {
    const html = renderDatosPerfil();
    const ids = idsDeInputs(html);
    expect(ids).toHaveLength(3);
    expect(new Set(ids)).toEqual(new Set(['perfil-nombres', 'perfil-apellidos', 'perfil-telefono']));

    for (const id of ids) {
      expect(forsDeLabels(html)).toContain(id);
    }

    const telefono = inputConId(html, 'perfil-telefono');
    expect(telefono).toBeDefined();
    expect(telefono).toContain('type="tel"');
    // `renderToStaticMarkup` serializa la prop en camelCase (`autoComplete`); en HTML el nombre
    // del atributo no distingue mayúsculas, así que la aserción compara sin casing.
    expect(telefono).toMatch(/autocomplete="tel"/i);
  });

  it('el entrenador suma el nombre comercial', () => {
    const html = renderDatosPerfil({ rol: Rol.ENTRENADOR, valores: VALORES_ENTRENADOR });
    const ids = idsDeInputs(html);
    expect(ids).toHaveLength(4);
    expect(new Set(ids)).toEqual(
      new Set(['perfil-nombres', 'perfil-apellidos', 'perfil-telefono', 'perfil-nombre-comercial'])
    );
    expect(inputConId(html, 'perfil-nombre-comercial')).toBeDefined();
  });

  it('el alumno ve documento y fecha de nacimiento como texto, con el aviso de solo lectura', () => {
    const html = renderDatosPerfil({ identidad: IDENTIDAD_ALUMNO });
    expect(html).toContain('V-24123456');
    expect(html).toContain(TEXTO_IDENTIDAD_SOLO_LECTURA);
    expect(fechaVisibleComoTexto(html, IDENTIDAD_ALUMNO.fechaNacimiento)).toBe(true);
    expect(idsDeInputs(html)).not.toContain('perfil-documento');
    expect(idsDeInputs(html)).not.toContain('perfil-fecha-nacimiento');
  });

  it('el superadmin no tiene inputs y ve el mensaje de su cuenta', () => {
    const html = renderDatosPerfil({
      rol: Rol.SUPERADMIN,
      valores: { nombres: '', apellidos: '', telefono: '', nombreComercial: '' },
    });
    expect(inputsDe(html)).toHaveLength(0);
    expect(html).toContain('Tu cuenta de administrador no tiene datos de perfil.');
  });

  it('un error de campo marca el input con aria-invalid y lo describe', () => {
    const html = renderDatosPerfil({
      errores: { telefono: 'Escribe un teléfono de 8 a 30 caracteres.' },
    });
    const telefono = inputConId(html, 'perfil-telefono');
    expect(telefono).toBeDefined();
    expect(telefono).toContain('aria-invalid="true"');
    const descrito = telefono?.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(descrito).toBeTruthy();
    expect(html).toContain(`id="${descrito}"`);
    expect(html).toContain('Escribe un teléfono de 8 a 30 caracteres.');
    expect(html.match(/aria-invalid="true"/g)).toHaveLength(1);
  });

  it('el botón "Guardar cambios" mide 44px y se deshabilita mientras guarda', () => {
    const enReposo = botonesDe(renderDatosPerfil()).find((tag) => tag.includes('Guardar cambios'));
    expect(enReposo).toBeDefined();
    expect(enReposo).toContain('min-h-11');
    expect(enReposo).not.toContain('disabled');

    const guardando = botonesDe(renderDatosPerfil({ guardando: true })).find((tag) =>
      tag.includes('Guardar cambios')
    );
    expect(guardando).toBeDefined();
    expect(guardando).toContain('disabled');
  });

  it('con guardando los campos se deshabilitan y en reposo no (C6)', () => {
    const enReposo = inputsDe(renderDatosPerfil());
    expect(enReposo).toHaveLength(3);
    for (const tag of enReposo) {
      expect(tag).not.toContain('disabled');
    }

    const guardando = inputsDe(renderDatosPerfil({ guardando: true }));
    expect(guardando).toHaveLength(3);
    for (const tag of guardando) {
      expect(tag).toContain('disabled');
    }

    const entrenador = inputsDe(
      renderDatosPerfil({ rol: Rol.ENTRENADOR, valores: VALORES_ENTRENADOR, guardando: true })
    );
    expect(entrenador).toHaveLength(4);
    for (const tag of entrenador) {
      expect(tag).toContain('disabled');
    }
  });

  it('el error se anuncia con role="alert" y el éxito con role="status"', () => {
    const conError = renderDatosPerfil({ error: 'No pudimos guardar tus datos.' });
    expect(conError).toContain('role="alert"');
    expect(conError).toContain('No pudimos guardar tus datos.');

    const conExito = renderDatosPerfil({ exito: 'Datos guardados.' });
    expect(conExito).toContain('role="status"');
    expect(conExito).toContain('Datos guardados.');
  });

  it('no muestra textos de menos de 12px en ningún estado', () => {
    const html =
      renderDatosPerfil() +
      renderDatosPerfil({ identidad: IDENTIDAD_ALUMNO, guardando: true }) +
      renderDatosPerfil({
        errores: { telefono: 'Escribe un teléfono de 8 a 30 caracteres.' },
        error: 'No pudimos guardar tus datos.',
      }) +
      renderDatosPerfil({ exito: 'Datos guardados.' }) +
      renderDatosPerfil({ rol: Rol.ENTRENADOR, valores: VALORES_ENTRENADOR }) +
      renderDatosPerfil({
        rol: Rol.SUPERADMIN,
        valores: { nombres: '', apellidos: '', telefono: '', nombreComercial: '' },
      });
    expect(tamanosMenoresA12px(html)).toEqual([]);
  });
});

describe('FormularioCambioCorreo', () => {
  it('muestra el correo actual y el aviso de la RN-03 antes del botón de envío', () => {
    const html = renderCambioCorreo();
    expect(html).toContain('actual@example.com');
    expect(html).toContain(AVISO_CAMBIO_CORREO);
    const posAviso = html.indexOf(AVISO_CAMBIO_CORREO);
    const posBoton = html.indexOf('Enviar correo de confirmación');
    expect(posAviso).toBeGreaterThan(-1);
    expect(posBoton).toBeGreaterThan(posAviso);
  });

  it('tiene un correo type=email y una contraseña actual, con labels asociados', () => {
    const html = renderCambioCorreo();
    const inputs = inputsDe(html);
    expect(inputs).toHaveLength(2);

    const correo = inputs.find((tag) => tag.includes('type="email"'));
    expect(correo).toBeDefined();
    expect(correo).toMatch(/autocomplete="email"/i);

    const password = inputs.find((tag) => tag.includes('type="password"'));
    expect(password).toBeDefined();
    expect(password).toMatch(/autocomplete="current-password"/i);

    for (const tag of inputs) {
      const id = tag.match(/\bid="([^"]+)"/)?.[1];
      expect(id).toBeTruthy();
      expect(forsDeLabels(html)).toContain(id);
    }
  });

  it('el botón "Enviar correo de confirmación" mide 44px', () => {
    const boton = botonesDe(renderCambioCorreo()).find((tag) =>
      tag.includes('Enviar correo de confirmación')
    );
    expect(boton).toBeDefined();
    expect(boton).toContain('min-h-11');
  });

  it('con un correo pendiente ofrece reenviar o cancelar, ambos de 44px', () => {
    const html = renderCambioCorreo({ correoPendiente: 'nuevo@example.com' });
    expect(html).toContain('Pendiente de confirmar: nuevo@example.com');

    const reenviar = botonesDe(html).find((tag) => tag.includes('Reenviar correo'));
    expect(reenviar).toBeDefined();
    expect(reenviar).toContain('min-h-11');

    const cancelar = botonesDe(html).find((tag) => tag.includes('Cancelar cambio'));
    expect(cancelar).toBeDefined();
    expect(cancelar).toContain('min-h-11');
  });

  it('con un correo pendiente indica dónde escribir la contraseña para reenviar (C9)', () => {
    const html = renderCambioCorreo({ correoPendiente: 'nuevo@example.com' });
    expect(html).toContain('Para reenviar el correo, escribe abajo tu contraseña actual.');
  });

  it('mientras envía, reenviar, cancelar y los dos campos quedan deshabilitados (C8)', () => {
    const html = renderCambioCorreo({ correoPendiente: 'nuevo@example.com', enviando: true });

    const reenviar = botonesDe(html).find((tag) => tag.includes('Reenviar correo'));
    expect(reenviar).toBeDefined();
    expect(reenviar).toContain('disabled');

    const cancelar = botonesDe(html).find((tag) => tag.includes('Cancelar cambio'));
    expect(cancelar).toBeDefined();
    expect(cancelar).toContain('disabled');

    for (const id of ['correo-nuevo', 'correo-password-actual']) {
      const input = inputConId(html, id);
      expect(input).toBeDefined();
      expect(input).toContain('disabled');
    }
  });

  it('en desarrollo muestra el enlace de confirmación como enlace', () => {
    const enlace = 'https://api.guachafit.com/auth/confirmar-cambio-correo?token=abc123';
    const html = renderCambioCorreo({ enlaceConfirmacion: enlace });
    expect(html).toContain(`href="${enlace}"`);
  });

  it('el error se anuncia con role="alert" y el éxito con role="status"', () => {
    const conError = renderCambioCorreo({ error: 'Tu contraseña actual no es correcta.' });
    expect(conError).toContain('role="alert"');
    expect(conError).toContain('Tu contraseña actual no es correcta.');

    const conExito = renderCambioCorreo({ exito: 'Te enviamos un correo de confirmación.' });
    expect(conExito).toContain('role="status"');
    expect(conExito).toContain('Te enviamos un correo de confirmación.');
  });

  it('no muestra textos de menos de 12px en ningún estado', () => {
    const html =
      renderCambioCorreo() +
      renderCambioCorreo({ correoPendiente: 'nuevo@example.com' }) +
      renderCambioCorreo({
        enlaceConfirmacion: 'https://api.guachafit.com/auth/confirmar-cambio-correo?token=1',
        error: 'Tu contraseña actual no es correcta.',
      }) +
      renderCambioCorreo({ exito: 'Te enviamos un correo de confirmación.', enviando: true });
    expect(tamanosMenoresA12px(html)).toEqual([]);
  });
});

describe('FormularioCambioPassword', () => {
  it('tiene los tres campos de contraseña con su label y autocompletado correcto', () => {
    const html = renderCambioPassword();
    expect(inputsDe(html)).toHaveLength(3);

    const actual = inputPorEtiqueta(html, 'Contraseña actual');
    const nueva = inputPorEtiqueta(html, 'Contraseña nueva');
    const confirmacion = inputPorEtiqueta(html, 'Repite la contraseña nueva');
    expect(actual).toBeDefined();
    expect(nueva).toBeDefined();
    expect(confirmacion).toBeDefined();

    for (const tag of [actual, nueva, confirmacion]) {
      expect(tag).toContain('type="password"');
    }
    expect(actual).toMatch(/autocomplete="current-password"/i);
    expect(nueva).toMatch(/autocomplete="new-password"/i);
    expect(confirmacion).toMatch(/autocomplete="new-password"/i);
  });

  it('los errores por campo describen al input correspondiente', () => {
    const html = renderCambioPassword({
      errores: { nueva: 'La contraseña nueva debe tener al menos 8 caracteres.' },
    });
    const nueva = inputPorEtiqueta(html, 'Contraseña nueva');
    expect(nueva).toBeDefined();
    expect(nueva).toContain('aria-invalid="true"');
    const descrito = nueva?.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(descrito).toBeTruthy();
    expect(html).toContain(`id="${descrito}"`);
    expect(html).toContain('La contraseña nueva debe tener al menos 8 caracteres.');
    expect(html.match(/aria-invalid="true"/g)).toHaveLength(1);
  });

  it('el botón "Cambiar contraseña" mide 44px', () => {
    const boton = botonesDe(renderCambioPassword()).find((tag) =>
      tag.includes('Cambiar contraseña')
    );
    expect(boton).toBeDefined();
    expect(boton).toContain('min-h-11');
  });

  it('con guardando los tres campos se deshabilitan y en reposo no (C6)', () => {
    const enReposo = inputsDe(renderCambioPassword());
    expect(enReposo).toHaveLength(3);
    for (const tag of enReposo) {
      expect(tag).not.toContain('disabled');
    }

    const guardando = inputsDe(renderCambioPassword({ guardando: true }));
    expect(guardando).toHaveLength(3);
    for (const tag of guardando) {
      expect(tag).toContain('disabled');
    }
  });

  it('el error se anuncia con role="alert" y el éxito con role="status"', () => {
    const conError = renderCambioPassword({ error: 'Tu contraseña actual no es correcta.' });
    expect(conError).toContain('role="alert"');

    const conExito = renderCambioPassword({ exito: 'Tu contraseña se cambió.' });
    expect(conExito).toContain('role="status"');
  });

  it('no muestra textos de menos de 12px en ningún estado', () => {
    const html =
      renderCambioPassword() +
      renderCambioPassword({ errores: { actual: 'Escribe tu contraseña actual.' } }) +
      renderCambioPassword({ error: 'Tu contraseña actual no es correcta.' }) +
      renderCambioPassword({ exito: 'Tu contraseña se cambió.' });
    expect(tamanosMenoresA12px(html)).toEqual([]);
  });
});

describe('EstadoConfirmacionCorreo', () => {
  it('mientras confirma lo anuncia con role="status"', () => {
    const html = renderConfirmacion();
    expect(html).toContain('role="status"');
    expect(html).toContain('Confirmando tu correo…');
  });

  it('confirmado muestra el mensaje del API y ofrece ir a iniciar sesión', () => {
    const html = renderConfirmacion({
      estado: 'confirmado',
      mensaje: 'Tu correo de acceso ahora es nuevo@example.com.',
    });
    expect(html).toContain('role="status"');
    expect(html).toContain('Tu correo de acceso ahora es nuevo@example.com.');
    expect(html).toMatch(/<a\b[^>]*href="\/login"[^>]*>[\s\S]*?Ir a iniciar sesión[\s\S]*?<\/a>/);
  });

  it('cada estado de error se anuncia con role="alert" y su copy, con salida a /login', () => {
    for (const estado of ['invalido', 'en-uso', 'sin-conexion', 'error'] as const) {
      const html = renderConfirmacion({ estado });
      expect(html).toContain('role="alert"');
      expect(html).toContain(mensajeConfirmacionCorreo(estado));
      expect(html).toMatch(
        /<a\b[^>]*href="\/login"[^>]*>[\s\S]*?Ir a iniciar sesión[\s\S]*?<\/a>/
      );
    }
  });

  it('con onReintentar ofrece un botón "Reintentar" de 44px en sin-conexion y error (C2)', () => {
    for (const estado of ['sin-conexion', 'error'] as const) {
      const html = renderConfirmacion({ estado, onReintentar: noop });
      const reintentar = botonesDe(html).find((tag) => tag.includes('Reintentar'));
      expect(reintentar).toBeDefined();
      expect(reintentar).toContain('min-h-11');
    }
  });

  it('sin onReintentar no hay botón "Reintentar" y en confirmado nunca aparece', () => {
    for (const estado of ['invalido', 'en-uso', 'sin-conexion', 'error'] as const) {
      const html = renderConfirmacion({ estado });
      expect(botonesDe(html).some((tag) => tag.includes('Reintentar'))).toBe(false);
    }

    const confirmado = renderConfirmacion({ estado: 'confirmado', onReintentar: noop });
    expect(botonesDe(confirmado).some((tag) => tag.includes('Reintentar'))).toBe(false);
  });

  it('no muestra textos de menos de 12px en ningún estado', () => {
    const html =
      renderConfirmacion() +
      renderConfirmacion({
        estado: 'confirmado',
        mensaje: 'Tu correo de acceso ahora es nuevo@example.com.',
      }) +
      renderConfirmacion({ estado: 'invalido' }) +
      renderConfirmacion({ estado: 'en-uso' }) +
      renderConfirmacion({ estado: 'sin-conexion' }) +
      renderConfirmacion({ estado: 'error' });
    expect(tamanosMenoresA12px(html)).toEqual([]);
  });
});
