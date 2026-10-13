// @vitest-environment jsdom
/**
 * Prompt 86 (Ola 3) · spec del hook `useRegistroOnboarding` (mismo mecanismo que el
 * contenedor original: validaciones locales, POST con `skipAuth`, redireccion a `/login`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import { Modalidad, TipoDocumento } from '@guachafit/shared';

vi.mock('../../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api-client')>();
  return {
    ...actual,
    apiClient: Object.assign(vi.fn(), {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
      put: vi.fn(),
    }),
  };
});

import { apiClient } from '../../../lib/api-client';
import { MENSAJE_COACH_NO_DISPONIBLE } from '../../../lib/onboarding-links';
import { useRegistroOnboarding } from './use-registro-onboarding';
import type { DatosRegistroOnboarding } from '../../../lib/onboarding-registro';

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn;

const DATOS: DatosRegistroOnboarding = {
  nombres: 'Carlos Alberto',
  apellidos: 'Mendoza',
  email: 'carlos@email.com',
  password: 'secreta99',
  tipoDocumento: TipoDocumento.V,
  numeroDocumento: '24123456',
  fechaNacimiento: '1998-05-14',
  prefijoWhatsapp: '+58',
  numeroWhatsapp: '4121234567',
  modalidad: Modalidad.PRESENCIAL,
};

const navegar = vi.fn();

function Testigo({
  coach,
  datos = DATOS,
}: {
  coach: string | null;
  datos?: DatosRegistroOnboarding;
}) {
  const registro = useRegistroOnboarding(navegar);
  return (
    <div>
      <p data-testid="cargando">{String(registro.isLoading)}</p>
      <p data-testid="exito">{String(registro.success)}</p>
      <p data-testid="error">{registro.error ?? 'sin-error'}</p>
      <p data-testid="correo">{String(registro.correoYaRegistrado)}</p>
      <p data-testid="ewhatsapp">{registro.errorWhatsapp ?? 'sin-error'}</p>
      <p data-testid="efecha">{registro.errorFecha ?? 'sin-error'}</p>
      <button type="button" onClick={() => void registro.registrar(coach, datos)}>
        enviar
      </button>
    </div>
  );
}

function renderTestigo(coach: string | null, datos: DatosRegistroOnboarding = DATOS) {
  render(<Testigo coach={coach} datos={datos} />);
}

function pulsarEnviar() {
  return act(async () => {
    screen.getByRole('button', { name: 'enviar' }).click();
  });
}

beforeEach(() => {
  mockApi.mockReset();
  navegar.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useRegistroOnboarding', () => {
  it('sin coach validado fija el error y no hace POST', async () => {
    mockApi.mockResolvedValue({ ok: true });
    renderTestigo(null);
    await pulsarEnviar();

    expect(screen.getByTestId('error').textContent).toBe(MENSAJE_COACH_NO_DISPONIBLE);
    expect(mockApi).not.toHaveBeenCalled();
  });

  it('registra con POST skipAuth, marca exito y redirige a /login', async () => {
    mockApi.mockResolvedValue({ ok: true });
    renderTestigo('COACH1');
    await pulsarEnviar();

    await waitFor(() => expect(mockApi).toHaveBeenCalledWith(
      '/alumnos/registro-publico',
      expect.objectContaining({ method: 'POST', skipAuth: true })
    ));
    expect(screen.getByTestId('exito').textContent).toBe('true');
    await waitFor(() => expect(navegar).toHaveBeenCalledWith('/login'), { timeout: 5000 });
  });

  it('con 409 marca correo ya registrado', async () => {
    const error = Object.assign(new Error('ya existe'), { status: 409 });
    mockApi.mockRejectedValue(error);
    renderTestigo('COACH1');
    await pulsarEnviar();

    await waitFor(() => expect(screen.getByTestId('correo').textContent).toBe('true'));
    expect(screen.getByTestId('error').textContent).toBe('ya existe');
  });

  it('con whatsapp invalido fija el error de campo sin POST', async () => {
    mockApi.mockResolvedValue({ ok: true });
    renderTestigo('COACH1', { ...DATOS, numeroWhatsapp: '   ' });
    await pulsarEnviar();

    expect(screen.getByTestId('ewhatsapp').textContent).toBe(
      'Escribe tu número de WhatsApp.'
    );
    expect(mockApi).not.toHaveBeenCalled();
  });

  it('con fecha futura fija el error de campo sin POST', async () => {
    mockApi.mockResolvedValue({ ok: true });
    const manana = new Date(Date.now() + 86400000);
    const iso = `${manana.getFullYear()}-${String(manana.getMonth() + 1).padStart(2, '0')}-${String(manana.getDate()).padStart(2, '0')}`;
    renderTestigo('COACH1', { ...DATOS, fechaNacimiento: iso });
    await pulsarEnviar();

    expect(screen.getByTestId('efecha').textContent).toBe(
      'La fecha de nacimiento no puede ser futura.'
    );
    expect(mockApi).not.toHaveBeenCalled();
  });
});
