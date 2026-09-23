/**
 * RF-010 (WU Admin): contrato puro del panel maestro de entrenadores.
 *
 * Fija los endpoints exactos que consume la UI, las etiquetas de acción por estado, la guarda de
 * auto-deshabilitación, la aplicación de cambios confirmados y el fixture demo paginado.
 */
import { describe, expect, it } from 'vitest';
import { EstadoLicencia, type EntrenadorAdminDTO } from '@guachafit/shared';
import {
  ENTRENADORES_ADMIN_DEMO,
  aplicarEstadoEnLista,
  aplicarLicenciaEnLista,
  endpointEstadoEntrenador,
  endpointLicenciaEntrenador,
  endpointListadoEntrenadores,
  esAutodeshabilitacion,
  etiquetaCuenta,
  etiquetaLicencia,
  listarEntrenadoresDemo,
  textoBotonEstado,
  textoBotonLicencia,
} from './admin-entrenadores';

function entrenador(parcial: Partial<EntrenadorAdminDTO> = {}): EntrenadorAdminDTO {
  return {
    usuarioId: 'coach-1',
    perfilId: 'perfil-1',
    nombres: 'Marcos',
    apellidos: 'Fitness',
    nombreComercial: null,
    email: 'marcos@gym.com',
    coachCode: 'MARCOS-921',
    estadoLicencia: EstadoLicencia.ACTIVA,
    activo: true,
    fechaAltaUtc: '2026-08-15T14:00:00.000Z',
    ...parcial,
  };
}

describe('admin-entrenadores: endpoints del panel (RF-010)', () => {
  it('el listado deriva `offset` de la página visible', () => {
    expect(endpointListadoEntrenadores(1, 25)).toBe('/auth/entrenadores?limit=25&offset=0');
    expect(endpointListadoEntrenadores(3, 10)).toBe('/auth/entrenadores?limit=10&offset=20');
  });

  it('las mutaciones apuntan al `usuarioId` con las rutas del contrato', () => {
    expect(endpointEstadoEntrenador('c1111111-1111-4111-8111-111111111111')).toBe(
      '/auth/entrenadores/c1111111-1111-4111-8111-111111111111/estado'
    );
    expect(endpointLicenciaEntrenador('c1111111-1111-4111-8111-111111111111')).toBe(
      '/auth/entrenadores/c1111111-1111-4111-8111-111111111111/licencia'
    );
  });

  it('un id con caracteres especiales viaja codificado (no rompe la URL)', () => {
    expect(endpointEstadoEntrenador('a/b c')).toBe('/auth/entrenadores/a%2Fb%20c/estado');
  });
});

describe('admin-entrenadores: etiquetas y acciones por estado', () => {
  it('la cuenta y la licencia tienen etiquetas independientes', () => {
    expect(etiquetaCuenta(true)).toBe('Cuenta activa');
    expect(etiquetaCuenta(false)).toBe('Cuenta deshabilitada');
    expect(etiquetaLicencia(EstadoLicencia.ACTIVA)).toBe('Licencia activa');
    expect(etiquetaLicencia(EstadoLicencia.SUSPENDIDA_SUPERADMIN)).toBe('Licencia suspendida');
  });

  it('las acciones ofrecen siempre el estado contrario', () => {
    expect(textoBotonEstado(true)).toBe('Deshabilitar');
    expect(textoBotonEstado(false)).toBe('Reactivar');
    expect(textoBotonLicencia(EstadoLicencia.ACTIVA)).toBe('Suspender licencia');
    expect(textoBotonLicencia(EstadoLicencia.SUSPENDIDA_SUPERADMIN)).toBe('Activar licencia');
  });
});

describe('admin-entrenadores: guarda de auto-deshabilitación', () => {
  it('solo aplica al usuario actual con cuenta activa', () => {
    const propio = entrenador({ usuarioId: 'superadmin-1' });

    expect(esAutodeshabilitacion(propio, 'superadmin-1')).toBe(true);
    expect(esAutodeshabilitacion(propio, 'otro-id')).toBe(false);
    expect(esAutodeshabilitacion(propio, undefined)).toBe(false);
    expect(esAutodeshabilitacion({ ...propio, activo: false }, 'superadmin-1')).toBe(false);
  });
});

describe('admin-entrenadores: aplicación de cambios confirmados', () => {
  it('aplica el estado solo a la fila indicada y no muta el resto', () => {
    const lista = [entrenador(), entrenador({ usuarioId: 'coach-2', activo: false })];

    const resultado = aplicarEstadoEnLista(lista, 'coach-1', false);

    expect(resultado[0].activo).toBe(false);
    expect(resultado[1].activo).toBe(false);
    expect(lista[0].activo).toBe(true);
  });

  it('aplica la licencia solo a la fila indicada', () => {
    const lista = [entrenador(), entrenador({ usuarioId: 'coach-2' })];

    const resultado = aplicarLicenciaEnLista(
      lista,
      'coach-2',
      EstadoLicencia.SUSPENDIDA_SUPERADMIN
    );

    expect(resultado[0].estadoLicencia).toBe(EstadoLicencia.ACTIVA);
    expect(resultado[1].estadoLicencia).toBe(EstadoLicencia.SUSPENDIDA_SUPERADMIN);
  });

  it('un usuarioId desconocido deja la lista intacta', () => {
    const lista = [entrenador()];
    expect(aplicarEstadoEnLista(lista, 'no-existe', false)).toEqual(lista);
  });
});

describe('admin-entrenadores: fixture demo', () => {
  it('cubre los tres escenarios de la UI (activa, suspendida y deshabilitada)', () => {
    const estados = ENTRENADORES_ADMIN_DEMO.map((e) => `${e.activo}-${e.estadoLicencia}`);

    expect(estados).toContain(`true-${EstadoLicencia.ACTIVA}`);
    expect(estados).toContain(`true-${EstadoLicencia.SUSPENDIDA_SUPERADMIN}`);
    expect(estados).toContain(`false-${EstadoLicencia.ACTIVA}`);
  });

  it('pagina con la misma aritmética del servidor y `total` real', () => {
    const pagina = listarEntrenadoresDemo(1, 2);

    expect(pagina.items).toHaveLength(2);
    expect(pagina.total).toBe(ENTRENADORES_ADMIN_DEMO.length);
    expect(pagina.limit).toBe(2);
    expect(pagina.offset).toBe(0);

    const segunda = listarEntrenadoresDemo(2, 2);
    expect(segunda.items).toHaveLength(1);
    expect(segunda.offset).toBe(2);
  });

  it('aplica los cambios de la sesión demo (sin persistencia real)', () => {
    const usuarioId = ENTRENADORES_ADMIN_DEMO[0].usuarioId;

    const pagina = listarEntrenadoresDemo(1, 25, {
      [usuarioId]: { activo: false, estadoLicencia: EstadoLicencia.SUSPENDIDA_SUPERADMIN },
    });

    expect(pagina.items[0]).toMatchObject({
      activo: false,
      estadoLicencia: EstadoLicencia.SUSPENDIDA_SUPERADMIN,
    });
  });
});
