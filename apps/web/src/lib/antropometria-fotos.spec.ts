/**
 * RF-003 "fotos del check-in" · lógica web `antropometria-fotos` (contratos 7-9).
 *
 * `apps/web/src/lib/antropometria-fotos.ts` está implementado: cada prueba importa el módulo en
 * dinámico para aislar la resolución por caso. La suite fija el contrato verde de preparación,
 * subida (3 intentos con esperas de 1 s/2 s, presign nueva por intento, plazo y cancelación del
 * PUT) y aviso de faltantes.
 *
 * Contratos cubiertos (prompt 01, secciones C):
 * - 7: `prepararFotoAntropometria` (MIME firmable o `MENSAJE_FOTO_FORMATO`; default = compresor real).
 * - 8: `subirFotoAntropometria` (presign + PUT por intento, reintentos 3 con esperas 1 s/2 s,
 *      propagación de `ApiError`, 4xx sin reintento, 5xx agotado, respuesta incompleta sin reintento,
 *      tiempo agotado del PUT y cancelación por `signal`).
 * - 9: `avisoFotosFaltantes` (texto humano con orden canónico de ángulos).
 *
 * Ampliado (prompt 01 RNF-001 "privacidad de fotos", contratos 1-5): una foto que el compresor
 * devuelve SIN recodificar (el MISMO objeto `archivo`) nunca se sube, aunque sea WebP o JPEG. El
 * mock del compresor devuelve un archivo NUEVO para no chocar con esa regla.
 */
import { describe, expect, it, vi } from 'vitest';
import { AnguloFoto } from '@guachafit/shared';
import { ApiError, ErrorDeConexion, ErrorTiempoAgotado } from './api-client';
import type { DepsSubirFoto } from './antropometria-fotos';

vi.mock('./imagen-comprimida', () => ({
  // El compresor real devuelve un `File` NUEVO cuando recodifica; solo entrega el MISMO objeto en
  // sus rutas de degradación (sin contexto 2D o sin codificador WebP/JPEG).
  comprimirImagenAWebp: vi.fn(
    async (archivo: File) =>
      new File([archivo], 'progreso-comprimido.webp', { type: 'image/webp' })
  ),
}));

const ALUMNO_ID = 'a3333333-3333-4333-8333-333333333333';
const UUID_CLAVE = '00000000-0000-4000-8000-0000000000ab';
const CLAVE_VALIDA = `antropometria/${ALUMNO_ID}/2026/${UUID_CLAVE}.webp`;
const URL_SUBIDA = 'https://boveda.test/put/foto.webp';

const MENSAJE_FOTO_FORMATO_ESPERADO =
  'No se pudo procesar la imagen. Prueba con una foto JPG o WebP.';
const MENSAJE_FOTO_SIN_CONEXION_ESPERADO =
  'No se pudo subir la foto: revisa tu conexión e inténtalo de nuevo.';
const MENSAJE_FOTO_TIEMPO_AGOTADO_ESPERADO =
  'No se pudo subir la foto: la conexión tardó demasiado. Inténtalo de nuevo.';
const MENSAJE_FOTO_SIN_URL_ESPERADO =
  'No se pudo subir la foto: el servidor no devolvió una URL de subida. Inténtalo de nuevo en unos minutos.';
const mensajePutFallidoEsperado = (status: number) =>
  `No se pudo subir la foto (${status}). Revisa tu conexión e inténtalo de nuevo.`;
const mensajeAlmacenamientoEsperado = (status: number) =>
  `No se pudo subir la foto (${status}): el almacenamiento no respondió bien. Inténtalo de nuevo en unos minutos.`;

/** Contratos 1-2 (RNF-001): texto exacto, duplicado local para que la prueba falle con un motivo claro. */
const MENSAJE_FOTO_SIN_RECODIFICAR_ESPERADO =
  'Este navegador no pudo preparar la foto. Prueba con otro navegador actualizado.';

function archivoWebp(): File {
  return new File(['foto'], 'progreso.webp', { type: 'image/webp' });
}

async function moduloFotos() {
  return import('./antropometria-fotos');
}

function presignOk(): { uploadUrl: string; storageKey: string } {
  return { uploadUrl: URL_SUBIDA, storageKey: CLAVE_VALIDA };
}

describe('contrato 7: prepararFotoAntropometria', () => {
  it('devuelve la foto preparada cuando el compresor entrega WebP', async () => {
    const { prepararFotoAntropometria } = await moduloFotos();
    const comprimido = new File(['x'], 'progreso.webp', { type: 'image/webp' });
    const comprimir = vi.fn(async () => comprimido);

    await expect(prepararFotoAntropometria(archivoWebp(), comprimir)).resolves.toBe(comprimido);
  });

  it('acepta JPEG como resultado del compresor', async () => {
    const { prepararFotoAntropometria } = await moduloFotos();
    const comprimido = new File(['x'], 'progreso.jpg', { type: 'image/jpeg' });

    await expect(
      prepararFotoAntropometria(archivoWebp(), vi.fn(async () => comprimido))
    ).resolves.toBe(comprimido);
  });

  it('lanza Error(MENSAJE_FOTO_FORMATO) con PNG y exporta la constante exacta', async () => {
    const modulo = await moduloFotos();
    expect(modulo.MENSAJE_FOTO_FORMATO).toBe(MENSAJE_FOTO_FORMATO_ESPERADO);

    const png = new File(['x'], 'progreso.png', { type: 'image/png' });

    await expect(
      modulo.prepararFotoAntropometria(archivoWebp(), vi.fn(async () => png))
    ).rejects.toThrow(MENSAJE_FOTO_FORMATO_ESPERADO);
  });

  it('sin compresor usa `comprimirImagenAWebp` por defecto', async () => {
    const modulo = await moduloFotos();
    const { comprimirImagenAWebp } = await import('./imagen-comprimida');
    const archivo = archivoWebp();

    await modulo.prepararFotoAntropometria(archivo);

    const llamadas = vi.mocked(comprimirImagenAWebp).mock.calls;
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]?.[0]).toBe(archivo);
  });
});

describe('contratos 1-2 (RNF-001): una foto sin recodificar NUNCA se sube', () => {
  it('contrato 1: exporta MENSAJE_FOTO_SIN_RECODIFICAR con el texto exacto', async () => {
    const modulo = await moduloFotos();

    expect(modulo.MENSAJE_FOTO_SIN_RECODIFICAR).toBe(MENSAJE_FOTO_SIN_RECODIFICAR_ESPERADO);
  });

  it('contrato 2: si el compresor devuelve el MISMO archivo WebP, lanza MENSAJE_FOTO_SIN_RECODIFICAR', async () => {
    const { prepararFotoAntropometria } = await moduloFotos();
    const archivo = archivoWebp();

    await expect(
      prepararFotoAntropometria(archivo, vi.fn(async () => archivo))
    ).rejects.toThrow(MENSAJE_FOTO_SIN_RECODIFICAR_ESPERADO);
  });

  it('contrato 2: si el compresor devuelve el MISMO archivo JPEG, lanza MENSAJE_FOTO_SIN_RECODIFICAR', async () => {
    const { prepararFotoAntropometria } = await moduloFotos();
    const archivo = new File(['foto'], 'progreso.jpg', { type: 'image/jpeg' });

    await expect(
      prepararFotoAntropometria(archivo, vi.fn(async () => archivo))
    ).rejects.toThrow(MENSAJE_FOTO_SIN_RECODIFICAR_ESPERADO);
  });
});

describe('contrato 8: subirFotoAntropometria', () => {
  it('pide una presign nueva con el contrato exacto, hace el PUT y devuelve la storageKey', async () => {
    const { subirFotoAntropometria } = await moduloFotos();
    const archivo = archivoWebp();
    const apiClient = vi.fn(
      async (_endpoint: string, _opciones: Parameters<DepsSubirFoto['apiClient']>[1]) =>
        presignOk()
    );
    const fetchFn = vi.fn(async () => ({ ok: true, status: 200 }));
    const esperar = vi.fn(async () => {});

    const clave = await subirFotoAntropometria(archivo, ALUMNO_ID, AnguloFoto.LATERAL, {
      apiClient,
      fetchFn,
      esperar,
    });

    expect(clave).toBe(CLAVE_VALIDA);
    expect(apiClient).toHaveBeenCalledTimes(1);
    expect(apiClient).toHaveBeenCalledWith('/antropometria/presigned-upload-url', {
      method: 'POST',
      body: expect.any(String),
      tiempoLimiteMs: 15000,
    });
    const [, opcionesPresign] = apiClient.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(opcionesPresign.body)).toEqual({
      modulo: 'antropometria',
      alumnoId: ALUMNO_ID,
      angulo: AnguloFoto.LATERAL,
      mimeType: 'image/webp',
    });
    expect(fetchFn).toHaveBeenCalledWith(URL_SUBIDA, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/webp' },
      body: archivo,
      signal: expect.any(AbortSignal),
    });
    expect(esperar).not.toHaveBeenCalled();
  });

  it('no reintenta un PUT 4xx: lanza `mensajeFotoPutFallido(status)` tal cual', async () => {
    const { subirFotoAntropometria } = await moduloFotos();
    const apiClient = vi.fn(async () => presignOk());
    const fetchFn = vi.fn(async () => ({ ok: false, status: 403 }));
    const esperar = vi.fn(async () => {});

    await expect(
      subirFotoAntropometria(archivoWebp(), ALUMNO_ID, AnguloFoto.FRONTAL, {
        apiClient,
        fetchFn,
        esperar,
      })
    ).rejects.toThrow(mensajePutFallidoEsperado(403));

    expect(apiClient).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(esperar).not.toHaveBeenCalled();
  });

  it('propaga tal cual un `ApiError` de la presign, sin reintentar', async () => {
    const { subirFotoAntropometria } = await moduloFotos();
    const apiError = new ApiError(422, {
      type: 'about:blank',
      title: 'Unprocessable Entity',
      status: 422,
      detail: 'mime no firmable',
      timestampUtc: new Date().toISOString(),
    });
    const apiClient = vi.fn(async () => {
      throw apiError;
    });
    const fetchFn = vi.fn(async () => ({ ok: true, status: 200 }));
    const esperar = vi.fn(async () => {});

    await expect(
      subirFotoAntropometria(archivoWebp(), ALUMNO_ID, AnguloFoto.FRONTAL, {
        apiClient,
        fetchFn,
        esperar,
      })
    ).rejects.toBe(apiError);

    expect(apiClient).toHaveBeenCalledTimes(1);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(esperar).not.toHaveBeenCalled();
  });

  it('reintenta un TypeError de la presign hasta 3 intentos (esperas 1000 y 2000 ms) y lanza MENSAJE_FOTO_SIN_CONEXION', async () => {
    const { subirFotoAntropometria } = await moduloFotos();
    const apiClient = vi.fn(async () => {
      throw new TypeError('sin red');
    });
    const fetchFn = vi.fn(async () => ({ ok: true, status: 200 }));
    const esperar = vi.fn(async () => {});

    await expect(
      subirFotoAntropometria(archivoWebp(), ALUMNO_ID, AnguloFoto.FRONTAL, {
        apiClient,
        fetchFn,
        esperar,
      })
    ).rejects.toThrow(MENSAJE_FOTO_SIN_CONEXION_ESPERADO);

    expect(apiClient).toHaveBeenCalledTimes(3);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(esperar.mock.calls).toEqual([[1000], [2000]]);
  });

  it('reintenta ErrorTiempoAgotado de la presign y agota en MENSAJE_FOTO_TIEMPO_AGOTADO', async () => {
    const { subirFotoAntropometria } = await moduloFotos();
    const apiClient = vi.fn(async () => {
      throw new ErrorTiempoAgotado();
    });
    const fetchFn = vi.fn(async () => ({ ok: true, status: 200 }));
    const esperar = vi.fn(async () => {});

    await expect(
      subirFotoAntropometria(archivoWebp(), ALUMNO_ID, AnguloFoto.FRONTAL, {
        apiClient,
        fetchFn,
        esperar,
      })
    ).rejects.toThrow(MENSAJE_FOTO_TIEMPO_AGOTADO_ESPERADO);

    expect(apiClient).toHaveBeenCalledTimes(3);
    expect(esperar.mock.calls).toEqual([[1000], [2000]]);
  });

  it('reintenta un TypeError del PUT y agota en MENSAJE_FOTO_SIN_CONEXION', async () => {
    const { subirFotoAntropometria } = await moduloFotos();
    const apiClient = vi.fn(async () => presignOk());
    const fetchFn = vi.fn(async () => {
      throw new TypeError('conexión cortada');
    });
    const esperar = vi.fn(async () => {});

    await expect(
      subirFotoAntropometria(archivoWebp(), ALUMNO_ID, AnguloFoto.POSTERIOR, {
        apiClient,
        fetchFn,
        esperar,
      })
    ).rejects.toThrow(MENSAJE_FOTO_SIN_CONEXION_ESPERADO);

    expect(apiClient).toHaveBeenCalledTimes(3);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(esperar.mock.calls).toEqual([[1000], [2000]]);
  });

  it('un PUT 5xx agotado lanza `mensajeFotoAlmacenamiento` del último intento', async () => {
    const { subirFotoAntropometria } = await moduloFotos();
    const apiClient = vi.fn(async () => presignOk());
    const fetchFn = vi.fn(async () => ({ ok: false, status: 500 }));
    const esperar = vi.fn(async () => {});

    await expect(
      subirFotoAntropometria(archivoWebp(), ALUMNO_ID, AnguloFoto.POSTERIOR, {
        apiClient,
        fetchFn,
        esperar,
      })
    ).rejects.toThrow(mensajeAlmacenamientoEsperado(500));

    expect(apiClient).toHaveBeenCalledTimes(3);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(esperar.mock.calls).toEqual([[1000], [2000]]);
  });

  it('reintenta ErrorDeConexion y tiene éxito en el segundo intento (presign nueva por intento)', async () => {
    const { subirFotoAntropometria } = await moduloFotos();
    const apiClient = vi
      .fn()
      .mockRejectedValueOnce(new ErrorDeConexion())
      .mockResolvedValueOnce(presignOk());
    const fetchFn = vi.fn(async () => ({ ok: true, status: 200 }));
    const esperar = vi.fn(async () => {});

    const clave = await subirFotoAntropometria(archivoWebp(), ALUMNO_ID, AnguloFoto.FRONTAL, {
      apiClient,
      fetchFn,
      esperar,
    });

    expect(clave).toBe(CLAVE_VALIDA);
    expect(apiClient).toHaveBeenCalledTimes(2);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(esperar.mock.calls).toEqual([[1000]]);
  });

  it('un PUT 503 se reintenta y el éxito posterior devuelve la clave', async () => {
    const { subirFotoAntropometria } = await moduloFotos();
    const apiClient = vi.fn(async () => presignOk());
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    const esperar = vi.fn(async () => {});

    const clave = await subirFotoAntropometria(archivoWebp(), ALUMNO_ID, AnguloFoto.LATERAL, {
      apiClient,
      fetchFn,
      esperar,
    });

    expect(clave).toBe(CLAVE_VALIDA);
    expect(apiClient).toHaveBeenCalledTimes(2);
    expect(esperar.mock.calls).toEqual([[1000]]);
  });

  it('una presign sin uploadUrl lanza MENSAJE_FOTO_SIN_URL sin reintentar', async () => {
    const { subirFotoAntropometria } = await moduloFotos();
    const apiClient = vi.fn(async () => ({ storageKey: CLAVE_VALIDA }));
    const fetchFn = vi.fn(async () => ({ ok: true, status: 200 }));
    const esperar = vi.fn(async () => {});

    await expect(
      subirFotoAntropometria(archivoWebp(), ALUMNO_ID, AnguloFoto.FRONTAL, {
        apiClient,
        fetchFn,
        esperar,
      })
    ).rejects.toThrow(MENSAJE_FOTO_SIN_URL_ESPERADO);

    expect(apiClient).toHaveBeenCalledTimes(1);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(esperar).not.toHaveBeenCalled();
  });

  it('una presign sin storageKey lanza MENSAJE_FOTO_SIN_URL sin reintentar', async () => {
    const { subirFotoAntropometria } = await moduloFotos();
    const apiClient = vi.fn(async () => ({ uploadUrl: URL_SUBIDA }));
    const fetchFn = vi.fn(async () => ({ ok: true, status: 200 }));
    const esperar = vi.fn(async () => {});

    await expect(
      subirFotoAntropometria(archivoWebp(), ALUMNO_ID, AnguloFoto.FRONTAL, {
        apiClient,
        fetchFn,
        esperar,
      })
    ).rejects.toThrow(MENSAJE_FOTO_SIN_URL_ESPERADO);

    expect(apiClient).toHaveBeenCalledTimes(1);
    expect(esperar).not.toHaveBeenCalled();
  });

  it('un PUT que nunca responde se aborta a los 30 s, se reintenta y agota en MENSAJE_FOTO_TIEMPO_AGOTADO', async () => {
    const { subirFotoAntropometria } = await moduloFotos();
    vi.useFakeTimers();
    try {
      const apiClient = vi.fn(async () => presignOk());
      const senales: AbortSignal[] = [];
      // Simula una conexión colgada: el `fetch` real solo rechaza cuando su señal se aborta.
      const fetchFn = vi.fn((_url: string, init: RequestInit) => {
        if (init.signal) senales.push(init.signal);
        return new Promise<never>((_resolver, rechazar) => {
          init.signal?.addEventListener('abort', () =>
            rechazar(new DOMException('La subida tardó demasiado.', 'AbortError'))
          );
        });
      });
      const esperar = vi.fn(async () => {});

      const capturada = subirFotoAntropometria(archivoWebp(), ALUMNO_ID, AnguloFoto.FRONTAL, {
        apiClient,
        fetchFn,
        esperar,
      }).catch((error: unknown) => error);

      // Deja asentar el arranque (presign resuelta y primer temporizador de 30 s programado).
      await vi.advanceTimersByTimeAsync(0);
      for (let intento = 0; intento < 3; intento += 1) {
        await vi.advanceTimersByTimeAsync(30000);
      }

      const error = await capturada;
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(MENSAJE_FOTO_TIEMPO_AGOTADO_ESPERADO);
      expect(apiClient).toHaveBeenCalledTimes(3);
      expect(fetchFn).toHaveBeenCalledTimes(3);
      expect(senales).toHaveLength(3);
      expect(senales.every((senal) => senal.aborted)).toBe(true);
      expect(esperar.mock.calls).toEqual([[1000], [2000]]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('con la señal externa abortada durante el PUT rechaza con AbortError y no reintenta', async () => {
    const { subirFotoAntropometria } = await moduloFotos();
    const apiClient = vi.fn(async () => presignOk());
    const controlador = new AbortController();
    const fetchFn = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<never>((_resolver, rechazar) => {
          init.signal?.addEventListener('abort', () =>
            rechazar(new DOMException('Subida cancelada.', 'AbortError'))
          );
        })
    );
    const esperar = vi.fn(async () => {});

    const promesa = subirFotoAntropometria(archivoWebp(), ALUMNO_ID, AnguloFoto.FRONTAL, {
      apiClient,
      fetchFn,
      esperar,
      signal: controlador.signal,
    });

    await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));
    controlador.abort();

    await expect(promesa).rejects.toMatchObject({ name: 'AbortError' });
    expect(apiClient).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(esperar).not.toHaveBeenCalled();
  });

  it('exporta los textos exactos del contrato (constantes y helpers de status)', async () => {
    const modulo = await moduloFotos();

    expect(modulo.MENSAJE_FOTO_SIN_CONEXION).toBe(MENSAJE_FOTO_SIN_CONEXION_ESPERADO);
    expect(modulo.MENSAJE_FOTO_TIEMPO_AGOTADO).toBe(MENSAJE_FOTO_TIEMPO_AGOTADO_ESPERADO);
    expect(modulo.MENSAJE_FOTO_SIN_URL).toBe(MENSAJE_FOTO_SIN_URL_ESPERADO);
    expect(modulo.mensajeFotoPutFallido(500)).toBe(mensajePutFallidoEsperado(500));
    expect(modulo.mensajeFotoPutFallido(403)).toBe(mensajePutFallidoEsperado(403));
    expect(modulo.mensajeFotoAlmacenamiento(500)).toBe(mensajeAlmacenamientoEsperado(500));
    expect(modulo.mensajeFotoAlmacenamiento(503)).toBe(mensajeAlmacenamientoEsperado(503));
  });
});

describe('contrato 9: avisoFotosFaltantes', () => {
  const COLETILLA = ' Las fotos son opcionales: puedes enviar el check-in sin ellas.';

  it('con [] devuelve null', async () => {
    const { avisoFotosFaltantes } = await moduloFotos();
    expect(avisoFotosFaltantes([])).toBeNull();
  });

  it('nombra solo el ángulo faltante', async () => {
    const { avisoFotosFaltantes } = await moduloFotos();
    expect(avisoFotosFaltantes([AnguloFoto.POSTERIOR])).toBe(`Sin foto: posterior.${COLETILLA}`);
  });

  it('une dos ángulos con "y" en el orden canónico frontal, lateral y posterior', async () => {
    const { avisoFotosFaltantes } = await moduloFotos();
    expect(avisoFotosFaltantes([AnguloFoto.LATERAL, AnguloFoto.POSTERIOR])).toBe(
      `Sin foto: lateral y posterior.${COLETILLA}`
    );
    expect(avisoFotosFaltantes([AnguloFoto.POSTERIOR, AnguloFoto.FRONTAL])).toBe(
      `Sin foto: frontal y posterior.${COLETILLA}`
    );
  });

  it('lista los tres ángulos separados por comas y "y" antes del último', async () => {
    const { avisoFotosFaltantes } = await moduloFotos();
    expect(
      avisoFotosFaltantes([AnguloFoto.POSTERIOR, AnguloFoto.LATERAL, AnguloFoto.FRONTAL])
    ).toBe(`Sin foto: frontal, lateral y posterior.${COLETILLA}`);
  });
});
