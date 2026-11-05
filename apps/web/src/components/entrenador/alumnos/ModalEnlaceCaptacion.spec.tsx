// @vitest-environment happy-dom
/**
 * Lote "Mis alumnos" (F4) · spec del diálogo "Invitar" (enlace de captación).
 *
 * F4: si la carga del perfil del coach falla, el error va en su propio
 * `role="alert"` y el botón de copiar queda deshabilitado. El error de la copia
 * (`errorCopia`) vive en otro `role="alert"` separado, para que el lector de
 * pantalla anuncie cada fallo por separado.
 *
 * C33 cubre a nivel página que el diálogo dice que no pudo cargar el enlace y
 * que la copia queda deshabilitada; aquí se pincha la estructura propia de los
 * `role="alert"` (lo que C33 no afirma).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ModalEnlaceCaptacion } from './ModalEnlaceCaptacion';

afterEach(() => {
  cleanup();
});

const ERROR_CARGA = 'No se pudo cargar tu enlace de captación. Recarga la página.';

function montar(parcial: Partial<Parameters<typeof ModalEnlaceCaptacion>[0]> = {}) {
  const props = {
    onCerrar: vi.fn(),
    registrationUrl: null as string | null,
    coachCode: null as string | null,
    coachCodeError: ERROR_CARGA,
    isDemoMode: false,
    copiado: false,
    errorCopia: null as string | null,
    onCopiar: vi.fn(),
    captacionActiva: true,
    registrosPorEnlace: 0,
    rotando: false,
    cambiandoCaptacion: false,
    errorCaptacion: null as string | null,
    mensajeCaptacion: null as string | null,
    onRotarEnlace: vi.fn(),
    onAlternarCaptacion: vi.fn(),
    ...parcial,
  };
  render(<ModalEnlaceCaptacion {...props} />);
  return props;
}

describe('ModalEnlaceCaptacion · error de carga (F4)', () => {
  it('el error de carga va en su propio role="alert" y la copia queda deshabilitada', () => {
    const props = montar();

    const dialogo = screen.getByRole('dialog');
    const alertas = within(dialogo).getAllByRole('alert');
    expect(alertas).toHaveLength(1);
    expect(alertas[0].textContent).toContain(ERROR_CARGA);

    const copiar = within(dialogo).getByRole('button', {
      name: 'Copiar enlace',
    }) as HTMLButtonElement;
    expect(copiar.disabled).toBe(true);
    fireEvent.click(copiar);
    expect(props.onCopiar).not.toHaveBeenCalled();
    expect(within(dialogo).getByText('Enlace no disponible')).toBeTruthy();
  });

  it('el error de carga y el error de copia viajan en alerts separados', () => {
    montar({ errorCopia: 'La copia automática falló. Copia el enlace a mano.' });

    const dialogo = screen.getByRole('dialog');
    const alertas = within(dialogo).getAllByRole('alert');
    expect(alertas).toHaveLength(2);
    expect(alertas[0].textContent).toContain(ERROR_CARGA);
    expect(alertas[1].textContent).toContain('Copia el enlace a mano');
  });
});
