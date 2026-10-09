/**
 * RNF-001 · privacidad de fotos: contratos 6-8 (prompt 01, implementación ya en verde).
 *
 * La caché runtime de la API sigue guardando las respuestas GET 24 h (la evolución sin conexión de
 * RF-004 depende de ello), pero la copia NO puede conservar enlaces firmados de la bóveda:
 * `pluginSinUrlsFirmadas` los vacía antes de guardar.
 *
 * Contratos cubiertos:
 * - 6: `pluginSinUrlsFirmadas.cacheWillUpdate` (JSON saneado a cualquier profundidad; no JSON,
 *      opaca o JSON inválido se devuelven tal cual; sin consumir el cuerpo original).
 * - 7: la regla de `construirRuntimeCachingApi` incluye el plugin y conserva NetworkFirst, 4 s,
 *      24 h y `cacheableResponse`.
 * - 8: la función es autocontenida (serializable por Workbox): `new Function('return ' + fuente)()`
 *      la reconstruye y sigue cumpliendo el contrato 6.
 *
 * Entorno `node` (por defecto del workspace): `Response` global de Node y `new Function` están
 * disponibles, así que la prueba de serialización se puede ejecutar de verdad.
 */
import { describe, expect, it } from 'vitest';
import { construirRuntimeCachingApi } from './api-cache-pattern';

/** Vista mínima del plugin que fija el contrato (Workbox lo serializa al service worker). */
interface PluginSinUrlsFirmadas {
  cacheWillUpdate: (args: { response: Response }) => Promise<Response>;
}

/**
 * El plugin se lee por propiedad del módulo (no por import estático) para que su ausencia sea un
 * fallo de la prueba (`undefined`) y no un error de carga de todo el archivo.
 */
async function obtenerPlugin(): Promise<PluginSinUrlsFirmadas | undefined> {
  const modulo = (await import('./api-cache-pattern')) as unknown as Record<string, unknown>;
  return modulo.pluginSinUrlsFirmadas as PluginSinUrlsFirmadas | undefined;
}

const ALUMNO_ID = 'a3333333-3333-4333-8333-333333333333';
const URL_FIRMADA_FRONTAL = 'https://boveda.test/frontal.webp?firma=abc123';
const URL_FIRMADA_FOTO_A = 'https://boveda.test/foto-a.webp?firma=def456';

/** Cuerpo representativo de `GET /antropometria/evolucion/:id` (arrays anidados). */
const CUERPO_EVOLUCION = {
  alumnoId: ALUMNO_ID,
  totalEvaluaciones: 1,
  evaluaciones: [
    {
      id: 'ctrl-1',
      fechaEvaluacion: '2026-10-01',
      pesoKg: '74.50',
      fotos: [
        {
          angulo: 'frontal',
          storageKey: `antropometria/${ALUMNO_ID}/2026/00000000-0000-4000-8000-0000000000f1.webp`,
          presignedGetUrl: URL_FIRMADA_FRONTAL,
        },
        {
          angulo: 'lateral',
          storageKey: `antropometria/${ALUMNO_ID}/2026/00000000-0000-4000-8000-0000000000f2.webp`,
          presignedGetUrl: null,
        },
      ],
    },
  ],
  cambioNetoPesoKg: null,
  cambioNetoGrasaPorcentaje: null,
  rangoSeleccionado: 'todo',
};

/** Cuerpo representativo del comparador: `fotoA.presignedGetUrl` y `fotoB: null`. */
const CUERPO_COMPARADOR = {
  angulo: 'frontal',
  controlA: { id: 'ctrl-a', fechaEvaluacion: '2026-09-01' },
  controlB: { id: 'ctrl-b', fechaEvaluacion: '2026-10-01' },
  fotoA: {
    angulo: 'frontal',
    storageKey: `antropometria/${ALUMNO_ID}/2026/00000000-0000-4000-8000-0000000000a1.webp`,
    presignedGetUrl: URL_FIRMADA_FOTO_A,
  },
  fotoB: null,
  fotoDisponible: false,
  diferenciaPesoKg: '1.20',
  diferenciaGrasaPorcentaje: null,
};

/** Cuerpo con enlaces firmados bajo otros nombres (platos y pagos) y un string sin firma. */
const CUERPO_OTROS_NOMBRES = {
  fotoUrl: 'https://boveda.test/plato.webp?X-Amz-Signature=abc123',
  comprobanteUrl: 'https://boveda.test/recibo.pdf?X-Amz-Signature=def456',
  presignedGetUrl: null,
  descripcion: 'https://ejemplo.test/pagina-sin-firma',
};

function respuestaJson(cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: 200,
    statusText: 'OK',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

describe('contrato 6: pluginSinUrlsFirmadas vacía los enlaces firmados de la copia', () => {
  it('con el JSON de evolución: presignedGetUrl string vale "" a cualquier profundidad y el resto queda igual', async () => {
    const plugin = await obtenerPlugin();
    expect(plugin, 'api-cache-pattern debe exportar pluginSinUrlsFirmadas').toBeDefined();
    expect(plugin?.cacheWillUpdate, 'cacheWillUpdate debe ser función').toBeTypeOf('function');

    const response = respuestaJson(CUERPO_EVOLUCION);
    const resultado = await plugin!.cacheWillUpdate({ response });

    // Response nueva con el mismo status, statusText y headers.
    expect(resultado).not.toBe(response);
    expect(resultado.status).toBe(200);
    expect(resultado.statusText).toBe('OK');
    expect(resultado.headers.get('content-type')).toBe('application/json; charset=utf-8');

    const cuerpo = await resultado.json();
    expect(cuerpo.evaluaciones[0].fotos[0].presignedGetUrl).toBe('');
    // El resto del cuerpo queda igual, incluido `storageKey` y un valor no string.
    expect(cuerpo.evaluaciones[0].fotos[0].storageKey).toBe(
      CUERPO_EVOLUCION.evaluaciones[0].fotos[0].storageKey
    );
    expect(cuerpo.evaluaciones[0].fotos[1].presignedGetUrl).toBeNull();
    expect(cuerpo.evaluaciones[0].pesoKg).toBe('74.50');
    expect(cuerpo.alumnoId).toBe(ALUMNO_ID);
  });

  it('con el JSON del comparador: vacía fotoA.presignedGetUrl y conserva fotoB: null', async () => {
    const plugin = await obtenerPlugin();
    expect(plugin, 'api-cache-pattern debe exportar pluginSinUrlsFirmadas').toBeDefined();
    expect(plugin?.cacheWillUpdate, 'cacheWillUpdate debe ser función').toBeTypeOf('function');

    const response = respuestaJson(CUERPO_COMPARADOR);
    const resultado = await plugin!.cacheWillUpdate({ response });

    const cuerpo = await resultado.json();
    expect(cuerpo.fotoA.presignedGetUrl).toBe('');
    expect(cuerpo.fotoA.storageKey).toBe(CUERPO_COMPARADOR.fotoA.storageKey);
    expect(cuerpo.fotoB).toBeNull();
    expect(cuerpo.diferenciaPesoKg).toBe('1.20');
  });

  it('vacía fotoUrl y comprobanteUrl con X-Amz-Signature= aunque no se llamen presignedGetUrl', async () => {
    const plugin = await obtenerPlugin();
    expect(plugin, 'api-cache-pattern debe exportar pluginSinUrlsFirmadas').toBeDefined();

    const response = respuestaJson(CUERPO_OTROS_NOMBRES);
    const resultado = await plugin!.cacheWillUpdate({ response });

    const cuerpo = await resultado.json();
    expect(cuerpo.fotoUrl).toBe('');
    expect(cuerpo.comprobanteUrl).toBe('');
    // `null` sigue siendo `null` (no se convierte en cadena vacía).
    expect(cuerpo.presignedGetUrl).toBeNull();
    // Un string sin firma en otro campo queda igual.
    expect(cuerpo.descripcion).toBe('https://ejemplo.test/pagina-sin-firma');
  });

  it('sanea el JSON con content-type charset y no conserva el content-length del original', async () => {
    const plugin = await obtenerPlugin();
    expect(plugin, 'api-cache-pattern debe exportar pluginSinUrlsFirmadas').toBeDefined();

    const texto = JSON.stringify(CUERPO_EVOLUCION);
    const response = new Response(texto, {
      status: 200,
      statusText: 'OK',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': String(texto.length),
      },
    });
    expect(response.headers.get('content-length')).toBe(String(texto.length));

    const resultado = await plugin!.cacheWillUpdate({ response });

    expect(resultado.headers.get('content-length')).toBeNull();
    expect(resultado.headers.get('content-type')).toBe('application/json; charset=utf-8');
    const cuerpo = await resultado.json();
    expect(cuerpo.evaluaciones[0].fotos[0].presignedGetUrl).toBe('');
  });

  it('una respuesta que no es JSON se devuelve tal cual (el mismo objeto Response)', async () => {
    const plugin = await obtenerPlugin();
    expect(plugin, 'api-cache-pattern debe exportar pluginSinUrlsFirmadas').toBeDefined();
    expect(plugin?.cacheWillUpdate, 'cacheWillUpdate debe ser función').toBeTypeOf('function');

    const response = new Response('<html>panel</html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });

    await expect(plugin!.cacheWillUpdate({ response })).resolves.toBe(response);
  });

  it('una respuesta opaca (status 0) se devuelve tal cual (el mismo objeto Response)', async () => {
    const plugin = await obtenerPlugin();
    expect(plugin, 'api-cache-pattern debe exportar pluginSinUrlsFirmadas').toBeDefined();
    expect(plugin?.cacheWillUpdate, 'cacheWillUpdate debe ser función').toBeTypeOf('function');

    const response = Response.error();
    expect(response.status).toBe(0);

    await expect(plugin!.cacheWillUpdate({ response })).resolves.toBe(response);
  });

  it('un JSON inválido con content-type JSON se devuelve tal cual (el mismo objeto Response)', async () => {
    const plugin = await obtenerPlugin();
    expect(plugin, 'api-cache-pattern debe exportar pluginSinUrlsFirmadas').toBeDefined();
    expect(plugin?.cacheWillUpdate, 'cacheWillUpdate debe ser función').toBeTypeOf('function');

    const response = new Response('{"roto":', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

    await expect(plugin!.cacheWillUpdate({ response })).resolves.toBe(response);
  });

  it('no consume el cuerpo de la response original (trabaja sobre clone())', async () => {
    const plugin = await obtenerPlugin();
    expect(plugin, 'api-cache-pattern debe exportar pluginSinUrlsFirmadas').toBeDefined();
    expect(plugin?.cacheWillUpdate, 'cacheWillUpdate debe ser función').toBeTypeOf('function');

    const response = respuestaJson(CUERPO_EVOLUCION);
    await plugin!.cacheWillUpdate({ response });

    expect(response.bodyUsed).toBe(false);
    const original = await response.json();
    expect(original.evaluaciones[0].fotos[0].presignedGetUrl).toBe(URL_FIRMADA_FRONTAL);
  });
});

describe('contrato 7: la regla de caché incluye el plugin sin romper la estrategia', () => {
  it('plugins contiene pluginSinUrlsFirmadas y se conservan NetworkFirst, 4 s, 24 h y cacheableResponse', async () => {
    const plugin = await obtenerPlugin();
    expect(plugin, 'api-cache-pattern debe exportar pluginSinUrlsFirmadas').toBeDefined();

    const [reglaCruda] = construirRuntimeCachingApi('http://localhost:4001/api/v1');
    const regla = reglaCruda as unknown as {
      handler: string;
      method: string;
      options: {
        networkTimeoutSeconds: number;
        expiration: { maxEntries: number; maxAgeSeconds: number };
        cacheableResponse: { statuses: number[] };
        plugins?: unknown[];
      };
    };

    expect(regla.handler).toBe('NetworkFirst');
    expect(regla.method).toBe('GET');
    expect(regla.options.networkTimeoutSeconds).toBe(4);
    expect(regla.options.expiration).toEqual({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 });
    expect(regla.options.cacheableResponse).toEqual({ statuses: [0, 200] });
    expect(regla.options.plugins).toContain(plugin);
  });
});

describe('contrato 8: cacheWillUpdate es autocontenida (serializable por Workbox)', () => {
  it('new Function reconstruye la función y la copia sigue vaciando los enlaces firmados', async () => {
    const plugin = await obtenerPlugin();
    expect(plugin, 'api-cache-pattern debe exportar pluginSinUrlsFirmadas').toBeDefined();
    expect(plugin?.cacheWillUpdate, 'cacheWillUpdate debe ser función').toBeTypeOf('function');

    const fuente = plugin!.cacheWillUpdate.toString();
    const recreada = new Function(`return ${fuente}`)() as (args: {
      response: Response;
    }) => Promise<Response>;

    const response = respuestaJson(CUERPO_EVOLUCION);
    const resultado = await recreada({ response });
    const cuerpo = await resultado.json();
    expect(cuerpo.evaluaciones[0].fotos[0].presignedGetUrl).toBe('');
  });
});
