import { describe, expect, it, vi } from 'vitest';
import { PresignedUploadUrlSchema, type PresignedUploadUrlResponseDTO } from '@guachafit/shared';
import {
  MENSAJE_COMPROBANTE_FORMATO,
  MENSAJE_COMPROBANTE_SIN_CLAVE,
  MENSAJE_COMPROBANTE_SIN_URL,
  prepararComprobanteParaSubida,
  subirComprobantePago,
  validarArchivoComprobante,
  type DepsSubirComprobante,
  type RespuestaSubidaComprobante,
} from './comprobante-pago';

const ALUMNO_ID = 'a1111111-1111-4111-8111-111111111111';
const STORAGE_KEY = `comprobantes/${ALUMNO_ID}/2026/comprobante.webp`;
const ENDPOINT_PRESIGN = '/antropometria/presigned-upload-url';
const URL_PUT = 'https://r2.test/put/comprobante.webp';

function archivoWebp(): File {
  return new File(['bytes-webp'], 'comprobante.webp', { type: 'image/webp' });
}

function presignValida(
  sobrescribir: Partial<PresignedUploadUrlResponseDTO> = {}
): PresignedUploadUrlResponseDTO {
  return {
    uploadUrl: URL_PUT,
    storageKey: STORAGE_KEY,
    expiresInSeconds: 900,
    key: STORAGE_KEY,
    ...sobrescribir,
  };
}

interface DepsFake {
  deps: DepsSubirComprobante;
  apiClient: ReturnType<typeof vi.fn>;
  fetchFn: ReturnType<typeof vi.fn>;
}

function crearDeps(presign: unknown, respuestaPut: RespuestaSubidaComprobante): DepsFake {
  const apiClient = vi.fn().mockResolvedValue(presign);
  const fetchFn = vi.fn().mockResolvedValue(respuestaPut);
  return {
    deps: { apiClient, fetchFn } as unknown as DepsSubirComprobante,
    apiClient,
    fetchFn,
  };
}

describe('subirComprobantePago: firma y subida del comprobante (RF-007/ADR-007)', () => {
  it('pide la presign con el MIME del archivo preparado (webp), hace el PUT y devuelve la storageKey', async () => {
    const archivo = archivoWebp();
    const { deps, apiClient, fetchFn } = crearDeps(presignValida(), { ok: true, status: 200 });

    await expect(subirComprobantePago(archivo, ALUMNO_ID, deps)).resolves.toBe(STORAGE_KEY);

    expect(apiClient).toHaveBeenCalledTimes(1);
    const [endpoint, opciones] = apiClient.mock.calls[0];
    expect(endpoint).toBe(ENDPOINT_PRESIGN);
    expect(opciones.method).toBe('POST');
    const cuerpo = JSON.parse(opciones.body);
    expect(cuerpo).toEqual({
      modulo: 'comprobantes',
      alumnoId: ALUMNO_ID,
      mimeType: 'image/webp',
    });
    // El cuerpo generado cumple el contrato compartido y jamás pide firmar un PNG.
    expect(PresignedUploadUrlSchema.safeParse(cuerpo).success).toBe(true);
    expect(JSON.stringify(cuerpo)).not.toContain('image/png');

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(URL_PUT);
    expect(init.method).toBe('PUT');
    expect(init.headers).toEqual({ 'Content-Type': 'image/webp' });
    expect(init.body).toBe(archivo);
  });

  it('el contrato compartido rechaza image/png en comprobantes (por eso se prepara antes de firmar)', () => {
    const base = { modulo: 'comprobantes', alumnoId: ALUMNO_ID };
    expect(PresignedUploadUrlSchema.safeParse({ ...base, mimeType: 'image/png' }).success).toBe(
      false
    );
    expect(PresignedUploadUrlSchema.safeParse({ ...base, mimeType: 'image/webp' }).success).toBe(
      true
    );
    expect(PresignedUploadUrlSchema.safeParse({ ...base, mimeType: 'image/jpeg' }).success).toBe(
      true
    );
  });

  it('un archivo preparado JPEG viaja como image/jpeg en la presign y en el PUT', async () => {
    const archivo = new File(['bytes-jpeg'], 'comprobante.jpg', { type: 'image/jpeg' });
    const { deps, apiClient, fetchFn } = crearDeps(presignValida(), { ok: true, status: 200 });

    await subirComprobantePago(archivo, ALUMNO_ID, deps);

    const mimePresign = JSON.parse(apiClient.mock.calls[0][1].body).mimeType;
    expect(mimePresign).toBe('image/jpeg');
    expect(fetchFn.mock.calls[0][1].headers).toEqual({ 'Content-Type': mimePresign });
  });

  for (const status of [403, 500]) {
    it(`un PUT con status ${status} rechaza con mensaje honesto y no devuelve clave`, async () => {
      const { deps } = crearDeps(presignValida(), { ok: false, status });

      await expect(subirComprobantePago(archivoWebp(), ALUMNO_ID, deps)).rejects.toThrow(
        new RegExp(`No se pudo subir el comprobante \\(${status}\\)`)
      );
    });
  }

  it('sin uploadUrl en la presign rechaza y NO intenta el PUT (antes se reportaba en silencio)', async () => {
    const { deps, fetchFn } = crearDeps({ storageKey: STORAGE_KEY }, { ok: true, status: 200 });

    await expect(subirComprobantePago(archivoWebp(), ALUMNO_ID, deps)).rejects.toThrow(
      MENSAJE_COMPROBANTE_SIN_URL
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('sin storageKey en la presign rechaza aunque el PUT haya respondido ok', async () => {
    const { deps } = crearDeps({ uploadUrl: URL_PUT }, { ok: true, status: 200 });

    await expect(subirComprobantePago(archivoWebp(), ALUMNO_ID, deps)).rejects.toThrow(
      MENSAJE_COMPROBANTE_SIN_CLAVE
    );
  });

  it('propaga el mensaje del apiClient cuando la presign falla y no llega a subir', async () => {
    const apiClient = vi.fn().mockRejectedValue(new Error('Tu sesión expiró. Vuelve a iniciar sesión.'));
    const fetchFn = vi.fn();
    const deps = { apiClient, fetchFn } as unknown as DepsSubirComprobante;

    await expect(subirComprobantePago(archivoWebp(), ALUMNO_ID, deps)).rejects.toThrow(
      'Tu sesión expiró. Vuelve a iniciar sesión.'
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('prepararComprobanteParaSubida: deja la imagen en un MIME firmable', () => {
  it('devuelve el WebP comprimido y entrega el archivo original al compresor', async () => {
    const original = new File(['bytes-png'], 'captura.png', { type: 'image/png' });
    const comprimido = new File(['bytes-webp'], 'captura.webp', { type: 'image/webp' });
    const comprimir = vi.fn().mockResolvedValue(comprimido);

    await expect(prepararComprobanteParaSubida(original, comprimir)).resolves.toBe(comprimido);
    expect(comprimir).toHaveBeenCalledWith(original);
  });

  it('acepta el fallback JPEG de los navegadores sin WebP', async () => {
    const original = new File(['bytes-png'], 'captura.png', { type: 'image/png' });
    const comprimido = new File(['bytes-jpeg'], 'captura.jpg', { type: 'image/jpeg' });

    await expect(
      prepararComprobanteParaSubida(original, vi.fn().mockResolvedValue(comprimido))
    ).resolves.toBe(comprimido);
  });

  it('si la conversión devuelve el PNG original, falla con mensaje honesto (nunca se firma un PNG)', async () => {
    const original = new File(['bytes-png'], 'captura.png', { type: 'image/png' });

    await expect(
      prepararComprobanteParaSubida(original, vi.fn().mockResolvedValue(original))
    ).rejects.toThrow(MENSAJE_COMPROBANTE_FORMATO);
  });

  it('no oculta el error del compresor cuando la imagen no se puede decodificar', async () => {
    const comprimir = vi
      .fn()
      .mockRejectedValue(new Error('No se pudo leer la imagen seleccionada. Prueba con otra foto.'));

    await expect(
      prepararComprobanteParaSubida(new File(['x'], 'x.png', { type: 'image/png' }), comprimir)
    ).rejects.toThrow('No se pudo leer la imagen seleccionada. Prueba con otra foto.');
  });
});

describe('validarArchivoComprobante (Ítem 25)', () => {
  it('acepta formatos image/jpeg, image/png e image/webp', () => {
    expect(validarArchivoComprobante({ type: 'image/jpeg', size: 1024 })).toBeNull();
    expect(validarArchivoComprobante({ type: 'image/png', size: 1024 })).toBeNull();
    expect(validarArchivoComprobante({ type: 'image/webp', size: 1024 })).toBeNull();
  });

  it('rechaza application/pdf e image/gif con el mensaje de formato', () => {
    const esperado = 'Formato inválido. Por favor selecciona una imagen JPG, PNG o WebP.';
    expect(validarArchivoComprobante({ type: 'application/pdf', size: 1024 })).toBe(esperado);
    expect(validarArchivoComprobante({ type: 'image/gif', size: 1024 })).toBe(esperado);
  });

  it('acepta un archivo de exactamente 5 MB (5 * 1024 * 1024 bytes)', () => {
    expect(validarArchivoComprobante({ type: 'image/jpeg', size: 5 * 1024 * 1024 })).toBeNull();
  });

  it('rechaza un archivo que excede 5 MB (5 * 1024 * 1024 + 1 bytes)', () => {
    expect(
      validarArchivoComprobante({ type: 'image/jpeg', size: 5 * 1024 * 1024 + 1 })
    ).toBe('El archivo excede el límite máximo de 5 MB.');
  });

  it('rechaza un archivo vacío (size === 0) con el mensaje exacto', () => {
    expect(validarArchivoComprobante({ type: 'image/png', size: 0 })).toBe('El archivo está vacío.');
  });

  it('un PDF de 0 bytes devuelve el mensaje de formato (el tipo se evalúa primero)', () => {
    expect(validarArchivoComprobante({ type: 'application/pdf', size: 0 })).toBe(
      'Formato inválido. Por favor selecciona una imagen JPG, PNG o WebP.'
    );
  });
});
