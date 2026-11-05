// @vitest-environment happy-dom
/**
 * RF-003 "fotos del check-in" · componente `SelectorFotosCheckin` (contratos 11-16 y estados de S-01).
 *
 * `apps/web/src/components/antropometria/SelectorFotosCheckin.tsx` está implementado: se importa en
 * dinámico dentro de cada prueba para aislar la resolución por caso. La suite fija los estados del
 * selector (vacía/subiendo/lista/error), la cancelación de subidas, los reintentos y el aviso.
 *
 * `subir` es inyectable: las pruebas pasan un falso y nunca tocan red.
 * jsdom no implementa `URL.createObjectURL`/`revokeObjectURL`: se mockean como pide el contrato.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AnguloFoto } from '@guachafit/shared';

const ALUMNO_ID = 'a3333333-3333-4333-8333-333333333333';

async function moduloSelector() {
  return import('./SelectorFotosCheckin');
}

function archivoFoto(nombre = 'progreso.webp'): File {
  return new File(['foto'], nombre, { type: 'image/webp' });
}

async function montar(props: {
  subir?: (archivo: File, angulo: AnguloFoto, signal?: AbortSignal) => Promise<string>;
  deshabilitado?: boolean;
} = {}) {
  const { SelectorFotosCheckin } = await moduloSelector();
  const onCambio = vi.fn();
  render(<SelectorFotosCheckin alumnoId={ALUMNO_ID} onCambio={onCambio} {...props} />);
  return { onCambio };
}

beforeEach(() => {
  (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:foto');
  (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SelectorFotosCheckin (contratos 11-16)', () => {
  it('contrato 11: pinta tres entradas de archivo (frontal, lateral, posterior) con accept en orden', async () => {
    await montar();

    for (const etiqueta of ['Foto frontal', 'Foto lateral', 'Foto posterior']) {
      const entrada = screen.getByLabelText(etiqueta);
      expect(entrada).toBeInstanceOf(HTMLInputElement);
      expect((entrada as HTMLInputElement).type).toBe('file');
      expect((entrada as HTMLInputElement).accept).toBe('image/*');
    }

    const todas = Array.from(document.querySelectorAll('input[type="file"]'));
    expect(todas.map((entrada) => entrada.getAttribute('aria-label'))).toEqual([
      'Foto frontal',
      'Foto lateral',
      'Foto posterior',
    ]);
  });

  it('contrato 12: al elegir en Foto lateral anuncia Subiendo…, marca onCambio y deja la foto lista con Quitar', async () => {
    const archivo = archivoFoto();
    let resolver: (clave: string) => void = () => undefined;
    const subir = vi.fn(
      (_archivo: File, _angulo: AnguloFoto) =>
        new Promise<string>((resolverClave) => {
          resolver = resolverClave;
        })
    );
    const { onCambio } = await montar({ subir });

    fireEvent.change(screen.getByLabelText('Foto lateral'), { target: { files: [archivo] } });

    const estados = await screen.findAllByRole('status');
    expect(estados.some((estado) => estado.textContent?.includes('Subiendo…'))).toBe(true);
    await waitFor(() =>
      expect(subir).toHaveBeenCalledWith(archivo, AnguloFoto.LATERAL, expect.any(AbortSignal))
    );
    expect(onCambio).toHaveBeenCalledWith(expect.objectContaining({ subiendo: true }));

    await act(async () => {
      resolver('k1');
    });

    expect(onCambio).toHaveBeenCalledWith({
      fotos: [{ angulo: AnguloFoto.LATERAL, storageKey: 'k1' }],
      subiendo: false,
    });
    expect(await screen.findByAltText('Foto lateral lista')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Quitar foto lateral' })).toBeTruthy();
  });

  it('contrato 13: un fallo de subida muestra el error y Reintentar repite con el mismo archivo y ángulo', async () => {
    const archivo = archivoFoto();
    const subir = vi.fn(async (_archivo: File, _angulo: AnguloFoto, _signal?: AbortSignal) => {
      throw new Error('x');
    });
    await montar({ subir });

    fireEvent.change(screen.getByLabelText('Foto lateral'), { target: { files: [archivo] } });

    expect(await screen.findByText('x')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar foto lateral' }));

    await waitFor(() => expect(subir).toHaveBeenCalledTimes(2));
    expect(subir.mock.calls[1]?.[0]).toBe(archivo);
    expect(subir.mock.calls[1]?.[1]).toBe(AnguloFoto.LATERAL);
    expect(subir.mock.calls[1]?.[2]).toBeInstanceOf(AbortSignal);
  });

  it('contrato 14: Quitar foto lateral vacía el slot y onCambio recibe fotos: []', async () => {
    const subir = vi.fn(async () => 'k1');
    const { onCambio } = await montar({ subir });

    fireEvent.change(screen.getByLabelText('Foto lateral'), { target: { files: [archivoFoto()] } });
    await screen.findByAltText('Foto lateral lista');

    fireEvent.click(screen.getByRole('button', { name: 'Quitar foto lateral' }));

    await waitFor(() => expect(screen.queryByAltText('Foto lateral lista')).toBeNull());
    expect(onCambio).toHaveBeenCalledWith({ fotos: [], subiendo: false });
  });

  it('contrato 15: el aviso de faltantes usa el orden canónico y desaparece con las tres listas', async () => {
    const subir = vi.fn(async (_archivo: File, angulo: AnguloFoto) => `k-${angulo}`);
    await montar({ subir });

    const avisoInicial = await screen.findByText(/^Sin foto: frontal, lateral y posterior\./);
    expect(avisoInicial.textContent).toContain(
      'Las fotos son opcionales: puedes enviar el check-in sin ellas.'
    );

    fireEvent.change(screen.getByLabelText('Foto lateral'), { target: { files: [archivoFoto()] } });
    const avisoParcial = await screen.findByText(/^Sin foto: frontal y posterior\./);
    expect(avisoParcial.textContent).toContain(
      'Las fotos son opcionales: puedes enviar el check-in sin ellas.'
    );

    fireEvent.change(screen.getByLabelText('Foto frontal'), { target: { files: [archivoFoto()] } });
    fireEvent.change(screen.getByLabelText('Foto posterior'), { target: { files: [archivoFoto()] } });
    await screen.findByAltText('Foto posterior lista');

    await waitFor(() => expect(screen.queryByText(/^Sin foto:/)).toBeNull());
  });

  it('contrato 16: con deshabilitado las tres entradas quedan disabled', async () => {
    await montar({ deshabilitado: true });

    for (const etiqueta of ['Foto frontal', 'Foto lateral', 'Foto posterior']) {
      expect((screen.getByLabelText(etiqueta) as HTMLInputElement).disabled).toBe(true);
    }
  });

  it('S-01: durante Subiendo…, Quitar cancela la señal y un resultado tardío no rellena el slot', async () => {
    const archivo = archivoFoto();
    let resolverSubida: (clave: string) => void = () => undefined;
    let senalRecibida: AbortSignal | undefined;
    const subir = vi.fn((_archivo: File, _angulo: AnguloFoto, signal?: AbortSignal) => {
      senalRecibida = signal;
      return new Promise<string>((resolver) => {
        resolverSubida = resolver;
      });
    });
    const { onCambio } = await montar({ subir });

    fireEvent.change(screen.getByLabelText('Foto lateral'), { target: { files: [archivo] } });
    await waitFor(() => expect(subir).toHaveBeenCalledTimes(1));
    // Una foto en subida también ofrece Quitar.
    expect(screen.getByRole('button', { name: 'Quitar foto lateral' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Quitar foto lateral' }));

    expect(senalRecibida?.aborted).toBe(true);
    await waitFor(() => expect(screen.queryByAltText(/Foto lateral/)).toBeNull());

    await act(async () => {
      resolverSubida('k1');
    });

    expect(screen.queryByAltText('Foto lateral lista')).toBeNull();
    expect(onCambio).toHaveBeenCalledWith({ fotos: [], subiendo: false });
    expect(
      onCambio.mock.calls.some(([estado]) =>
        (estado.fotos as { storageKey: string }[]).some((foto) => foto.storageKey === 'k1')
      )
    ).toBe(false);
  });

  it('S-01: si se elige otra foto mientras la anterior sube, gana la más reciente y la resolución tardía no la pisa', async () => {
    const archivoA = archivoFoto('primera.webp');
    const archivoB = archivoFoto('segunda.webp');
    let resolverA: (clave: string) => void = () => undefined;
    let senalA: AbortSignal | undefined;
    const subir = vi
      .fn()
      .mockImplementationOnce((_archivo: File, _angulo: AnguloFoto, signal?: AbortSignal) => {
        senalA = signal;
        return new Promise<string>((resolver) => {
          resolverA = resolver;
        });
      })
      .mockImplementationOnce(async () => 'k2');
    const { onCambio } = await montar({ subir });

    fireEvent.change(screen.getByLabelText('Foto lateral'), { target: { files: [archivoA] } });
    await waitFor(() => expect(subir).toHaveBeenCalledTimes(1));

    // Segundo cambio programático (la UI deshabilita el input mientras sube): gana el turno nuevo.
    fireEvent.change(screen.getByLabelText('Foto lateral'), { target: { files: [archivoB] } });
    await waitFor(() => expect(subir).toHaveBeenCalledTimes(2));
    expect(senalA?.aborted).toBe(true);
    expect(await screen.findByAltText('Foto lateral lista')).toBeTruthy();

    await act(async () => {
      resolverA('k1');
    });

    const ultima = onCambio.mock.calls[onCambio.mock.calls.length - 1]?.[0];
    expect(ultima).toEqual({
      fotos: [{ angulo: AnguloFoto.LATERAL, storageKey: 'k2' }],
      subiendo: false,
    });
    expect(
      onCambio.mock.calls.some(([estado]) =>
        (estado.fotos as { storageKey: string }[]).some((foto) => foto.storageKey === 'k1')
      )
    ).toBe(false);
  });

  it('S-01: una foto en error se puede quitar y onCambio queda vacío', async () => {
    const subir = vi.fn(async () => {
      throw new Error('fallo de red');
    });
    const { onCambio } = await montar({ subir });

    fireEvent.change(screen.getByLabelText('Foto posterior'), { target: { files: [archivoFoto()] } });
    expect(await screen.findByText('fallo de red')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Quitar foto posterior' }));

    await waitFor(() => expect(screen.queryByText('fallo de red')).toBeNull());
    expect(onCambio).toHaveBeenCalledWith({ fotos: [], subiendo: false });
  });

  it('S-01: un reintento que sale bien deja la foto lista', async () => {
    const archivo = archivoFoto();
    const subir = vi
      .fn()
      .mockRejectedValueOnce(new Error('fallo temporal'))
      .mockResolvedValueOnce('k2');
    const { onCambio } = await montar({ subir });

    fireEvent.change(screen.getByLabelText('Foto frontal'), { target: { files: [archivo] } });
    expect(await screen.findByText('fallo temporal')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar foto frontal' }));

    expect(await screen.findByAltText('Foto frontal lista')).toBeTruthy();
    await waitFor(() =>
      expect(onCambio).toHaveBeenCalledWith({
        fotos: [{ angulo: AnguloFoto.FRONTAL, storageKey: 'k2' }],
        subiendo: false,
      })
    );
  });

  it('S-01: mientras una foto sube, el aviso no la nombra como faltante', async () => {
    let resolverSubida: (clave: string) => void = () => undefined;
    const subir = vi.fn(
      (_archivo: File, _angulo: AnguloFoto) =>
        new Promise<string>((resolver) => {
          resolverSubida = resolver;
        })
    );
    await montar({ subir });

    expect(await screen.findByText(/^Sin foto: frontal, lateral y posterior\./)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Foto frontal'), { target: { files: [archivoFoto()] } });

    const aviso = await screen.findByText(/^Sin foto: lateral y posterior\./);
    expect(aviso.textContent).not.toContain('frontal');
    expect(screen.queryByText(/^Sin foto:.*frontal/)).toBeNull();

    await act(async () => {
      resolverSubida('k1');
    });
    // Al terminar sigue sin nombrar a la frontal: está lista, no faltante.
    expect(await screen.findByAltText('Foto frontal lista')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(/^Sin foto:.*frontal/)).toBeNull());
    expect(screen.getByText(/^Sin foto: lateral y posterior\./)).toBeTruthy();
  });
});
