/**
 * RF-010 (WU Admin): contrato puro de los textos de confirmación de cuenta y licencia.
 *
 * Fija los títulos, detalles de alcance y botones que `AdminPage` muestra en el
 * `DialogoConfirmacion` para cada una de las 4 acciones (recorte verbatim de la vista).
 */
import { describe, expect, it } from 'vitest';
import { EstadoLicencia, type EntrenadorAdminDTO } from '@guachafit/shared';
import {
  construirTextoConfirmacion,
  type AccionEntrenador,
} from './admin-confirmacion';

function entrenador(): EntrenadorAdminDTO {
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
  };
}

describe('admin-confirmacion: textos del diálogo por acción', () => {
  it('deshabilitar nombra al entrenador y advierte el cierre de sesión con su alcance', () => {
    const accion: AccionEntrenador = { tipo: 'estado', entrenador: entrenador(), activo: false };

    expect(construirTextoConfirmacion(accion)).toEqual({
      titulo: '¿Deshabilitar a Marcos Fitness?',
      detalle:
        'Ya no podrá entrar: su sesión se cerrará en unos minutos (máximo 15). Sus alumnos tampoco podrán entrar mientras la cuenta esté deshabilitada.',
      boton: 'Deshabilitar cuenta',
    });
  });

  it('reactivar promete el acceso del entrenador y de sus alumnos', () => {
    const accion: AccionEntrenador = { tipo: 'estado', entrenador: entrenador(), activo: true };

    expect(construirTextoConfirmacion(accion)).toEqual({
      titulo: '¿Reactivar a Marcos Fitness?',
      detalle: 'Podrá volver a iniciar sesión. Sus alumnos también recuperan el acceso.',
      boton: 'Reactivar cuenta',
    });
  });

  it('suspender la licencia advierte que el enlace de registro deja de funcionar', () => {
    const accion: AccionEntrenador = {
      tipo: 'licencia',
      entrenador: entrenador(),
      estadoLicencia: EstadoLicencia.SUSPENDIDA_SUPERADMIN,
    };

    expect(construirTextoConfirmacion(accion)).toEqual({
      titulo: '¿Suspender la licencia de Marcos Fitness?',
      detalle:
        'Ya no podrá entrar y su enlace de registro para alumnos dejará de funcionar. Sus alumnos tampoco podrán entrar mientras la licencia esté suspendida.',
      boton: 'Suspender licencia',
    });
  });

  it('activar la licencia promete acceso y enlace de registro de vuelta', () => {
    const accion: AccionEntrenador = {
      tipo: 'licencia',
      entrenador: entrenador(),
      estadoLicencia: EstadoLicencia.ACTIVA,
    };

    expect(construirTextoConfirmacion(accion)).toEqual({
      titulo: '¿Activar la licencia de Marcos Fitness?',
      detalle:
        'Podrá volver a iniciar sesión y su enlace de registro para alumnos vuelve a funcionar. Sus alumnos también recuperan el acceso.',
      boton: 'Activar licencia',
    });
  });

  it('sin acción pendiente no hay texto de confirmación', () => {
    expect(construirTextoConfirmacion(null)).toBeNull();
  });
});
