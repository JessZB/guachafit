// @vitest-environment jsdom
/**
 * RF-018 · regresión: interacción de la sección "Perfil".
 *
 * Una recarga del perfil con el mismo contenido (otra referencia) no pisa lo que el usuario
 * escribió; sin cambios sin guardar, un perfil nuevo con otro teléfono sí reemplaza el campo.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Rol, TipoDocumento, type MiPerfilDTO } from '@guachafit/shared';
import { SeccionPerfil } from './SeccionPerfil';

const PERFIL_BASE: MiPerfilDTO = {
  id: 'u1',
  email: 'ana@example.com',
  rol: Rol.ALUMNO,
  correoPendiente: null,
  correoPendienteExpiraUtc: null,
  alumno: {
    nombres: 'Ana',
    apellidos: 'Pérez',
    telefonoWhatsapp: '+584121234567',
    tipoDocumento: TipoDocumento.V,
    numeroDocumento: '24123456',
    fechaNacimiento: '1998-05-14',
    zonaHoraria: 'America/Caracas',
  },
  entrenador: null,
};

function perfilConTelefono(telefono: string): MiPerfilDTO {
  return {
    ...PERFIL_BASE,
    alumno: { ...PERFIL_BASE.alumno!, telefonoWhatsapp: telefono },
  };
}

function renderizar(perfil: MiPerfilDTO) {
  return render(
    <SeccionPerfil perfil={perfil} isDemoMode={false} onActualizado={() => undefined} />
  );
}

afterEach(() => {
  cleanup();
});

describe('SeccionPerfil: una recarga no pisa lo escrito (RF-018)', () => {
  it('12: conserva el teléfono escrito si el perfil llega de nuevo con el mismo contenido (otra referencia)', () => {
    const { rerender } = renderizar(PERFIL_BASE);

    fireEvent.change(screen.getByLabelText('Teléfono'), {
      target: { value: '+584241112233' },
    });
    expect((screen.getByLabelText('Teléfono') as HTMLInputElement).value).toBe('+584241112233');

    // Mismo contenido del servidor, objeto nuevo: no debe pisar lo escrito.
    rerender(
      <SeccionPerfil
        perfil={perfilConTelefono('+584121234567')}
        isDemoMode={false}
        onActualizado={() => undefined}
      />
    );

    expect((screen.getByLabelText('Teléfono') as HTMLInputElement).value).toBe('+584241112233');
  });

  it('12: sin cambios sin guardar, un perfil nuevo con otro teléfono reemplaza el campo', () => {
    const { rerender } = renderizar(PERFIL_BASE);

    rerender(
      <SeccionPerfil
        perfil={perfilConTelefono('+584249998877')}
        isDemoMode={false}
        onActualizado={() => undefined}
      />
    );

    expect((screen.getByLabelText('Teléfono') as HTMLInputElement).value).toBe('+584249998877');
  });
});
