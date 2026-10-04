import { describe, expect, it } from 'vitest';
import {
  URL_CONEXION_OCULTA,
  URL_MIGRACIONES_LOCAL,
  enmascararUrlConexion,
  seleccionarUrlMigraciones,
} from '../../../../packages/database/src/url-migraciones';

/**
 * Migraciones en la imagen de producción (deploy-05b).
 *
 * La imagen ejecuta `node dist/migrate.js` (sin tsx). En producción la URL de
 * conexión debe venir del entorno: `DATABASE_URL_MIGRACIONES` (rol propietario de
 * las tablas) con respaldo en `DATABASE_URL`; si no hay ninguna, la migración no
 * puede caer al valor local por defecto. La selección vive en una función pura
 * para poder probarla sin base de datos.
 */
describe('selección de la URL de migraciones en producción', () => {
  it('prefiere DATABASE_URL_MIGRACIONES (rol propietario) sobre DATABASE_URL', () => {
    const resultado = seleccionarUrlMigraciones({
      DATABASE_URL_MIGRACIONES: 'postgres://dueno:clave-dueno@db:5432/guachafit',
      DATABASE_URL: 'postgres://api:clave-api@db:5432/guachafit',
    });

    expect(resultado).toEqual({
      ok: true,
      url: 'postgres://dueno:clave-dueno@db:5432/guachafit',
      origen: 'DATABASE_URL_MIGRACIONES',
    });
  });

  it('cae a DATABASE_URL cuando DATABASE_URL_MIGRACIONES no está definida', () => {
    const resultado = seleccionarUrlMigraciones({
      DATABASE_URL: 'postgres://api:clave-api@db:5432/guachafit',
    });

    expect(resultado).toEqual({
      ok: true,
      url: 'postgres://api:clave-api@db:5432/guachafit',
      origen: 'DATABASE_URL',
    });
  });

  it('trata como no definida una DATABASE_URL_MIGRACIONES vacía o en blanco', () => {
    const resultado = seleccionarUrlMigraciones({
      DATABASE_URL_MIGRACIONES: '   ',
      DATABASE_URL: 'postgres://api:clave-api@db:5432/guachafit',
    });

    expect(resultado).toEqual({
      ok: true,
      url: 'postgres://api:clave-api@db:5432/guachafit',
      origen: 'DATABASE_URL',
    });
  });

  it('en producción, con solo DATABASE_URL, la usa como respaldo', () => {
    const resultado = seleccionarUrlMigraciones({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://api:clave-api@db:5432/guachafit',
    });

    expect(resultado).toEqual({
      ok: true,
      url: 'postgres://api:clave-api@db:5432/guachafit',
      origen: 'DATABASE_URL',
    });
  });

  it('en producción, sin ninguna de las dos, falla y nombra ambas variables', () => {
    const resultado = seleccionarUrlMigraciones({ NODE_ENV: 'production' });

    expect(resultado.ok).toBe(false);
    if (resultado.ok) throw new Error('producción sin URL debía fallar');
    expect(resultado.mensaje).toContain('DATABASE_URL_MIGRACIONES');
    expect(resultado.mensaje).toContain('DATABASE_URL');
    // El error jamás debe filtrar una URL de conexión.
    expect(resultado.mensaje).not.toContain('postgres://');
  });

  it('fuera de producción conserva el valor local por defecto (comportamiento actual)', () => {
    const resultado = seleccionarUrlMigraciones({});

    expect(resultado).toEqual({
      ok: true,
      url: URL_MIGRACIONES_LOCAL,
      origen: 'desarrollo',
    });
  });
});

/**
 * El log del migrador es ahora una ruta de producción: la URL objetivo se imprime
 * enmascarada. La contraseña debe desaparecer POR COMPLETO, también cuando contiene
 * `@` o `:` (postgres.js/WHATWG cortan el userinfo en el ÚLTIMO `@`, así que un
 * enmascarado que corte en el primero filtraría parte del secreto).
 */
describe('enmascarado de la URL de conexión para el log', () => {
  it('oculta la contraseña de una URL normal conservando el resto', () => {
    expect(enmascararUrlConexion('postgres://postgres:postgres@127.0.0.1:5432/guachafit')).toBe(
      'postgres://postgres:****@127.0.0.1:5432/guachafit'
    );
  });

  it('oculta por completo una contraseña con @ (corte en el último @)', () => {
    const enmascarada = enmascararUrlConexion('postgres://owner:p@ss@db:5432/guachafit');

    expect(enmascarada).toBe('postgres://owner:****@db:5432/guachafit');
    expect(enmascarada).not.toContain('p@ss');
    expect(enmascarada).not.toContain('ss@');
  });

  it('oculta por completo una contraseña con :', () => {
    const enmascarada = enmascararUrlConexion('postgres://owner:p:ss@db:5432/guachafit');

    expect(enmascarada).toBe('postgres://owner:****@db:5432/guachafit');
    expect(enmascarada).not.toContain('p:ss');
  });

  it('oculta por completo una contraseña que mezcla @ y :', () => {
    expect(enmascararUrlConexion('postgres://owner:p@ss:w0rd@db:5432/guachafit')).toBe(
      'postgres://owner:****@db:5432/guachafit'
    );
  });

  it('deja intacta una URL sin contraseña (no hay secreto que ocultar)', () => {
    expect(enmascararUrlConexion('postgres://owner@db:5432/guachafit')).toBe(
      'postgres://owner@db:5432/guachafit'
    );
  });

  it('ante una cadena no parseable devuelve un marcador y jamás el texto original', () => {
    const entrada = 'no-es-una-url-con-secreto-de-prueba';
    const salida = enmascararUrlConexion(entrada);

    expect(salida).toBe(URL_CONEXION_OCULTA);
    expect(salida).not.toContain('secreto');
  });
});
