import { describe, expect, it } from 'vitest';
import type { MetasNutricionalesDetalleDTO } from '@guachafit/shared';
import {
  MENSAJE_METAS_RESULTADO_INCIERTO,
  MENSAJE_METAS_SIN_CONEXION,
  MENSAJE_SUBIDA_PDF_FALLIDA,
  decidirAlCerrar,
  decidirAlGuardar,
  estadoEdicionMetas,
  formularioDesdeMetas,
  textosConfirmacionBorrado,
  hayCambiosSinGuardar,
  mensajeErrorGuardarMetas,
  mensajeErrorSubidaPdf,
  pdfsQueSeEliminaran,
  textoANumeroMeta,
  validarFormularioMetas,
  type FormularioMetas,
} from './editor-metas-nutricion';
import { filaRecursoVacia } from './recursos-pdf';
import { ApiError, ErrorDeConexion } from './api-client';

const PROBLEMA_403 = {
  type: 'about:blank',
  title: 'Forbidden',
  status: 403,
  detail: 'Forbidden',
  timestampUtc: '2026-10-05T00:00:00.000Z',
};

const CLAVE_A = 'nutricion-recursos/alumno-1/2026/a.pdf';
const CLAVE_B = 'nutricion-recursos/alumno-1/2026/b.pdf';

function metasGuardadas(parcial: Partial<MetasNutricionalesDetalleDTO> = {}): MetasNutricionalesDetalleDTO {
  return {
    id: 'm-1',
    alumnoId: 'alumno-1',
    caloriasObjetivo: 2200,
    proteinaGramosObjetivo: 160,
    carbohidratosGramosObjetivo: null,
    grasasGramosObjetivo: null,
    aguaLitrosObjetivo: '3.00',
    recursos: [
      { titulo: 'Lista de compras', url: 'https://firmada/a', storageKey: CLAVE_A },
      { titulo: 'Guía externa', url: 'https://ejemplo.com/guia', storageKey: null },
    ],
    createdAtUtc: '2026-09-01T00:00:00.000Z',
    updatedAtUtc: '2026-09-01T00:00:00.000Z',
    ...parcial,
  };
}

function formulario(parcial: Partial<FormularioMetas> = {}): FormularioMetas {
  return {
    calorias: '',
    proteina: '',
    carbohidratos: '',
    grasas: '',
    agua: '',
    recursos: [],
    ...parcial,
  };
}

/** Texto típico de Zod en inglés: nunca debe llegar a la pantalla. */
const PATRON_INGLES_ZOD = /expected|received|invalid|required|number|string|integer|must/i;

describe('textoANumeroMeta', () => {
  it('vacío es "no configurado" (undefined), nunca 0', () => {
    expect(textoANumeroMeta('')).toBeUndefined();
    expect(textoANumeroMeta('   ')).toBeUndefined();
  });

  it('no trunca los decimales en silencio (2200.7 sigue siendo 2200.7)', () => {
    expect(textoANumeroMeta('2200.7')).toBe(2200.7);
    expect(textoANumeroMeta('2200,7')).toBe(2200.7);
  });

  it('un texto no numérico se marca como inválido (NaN)', () => {
    expect(textoANumeroMeta('mucho')).toBeNaN();
  });
});

describe('validarFormularioMetas', () => {
  it('acepta enteros y agua decimal y devuelve el payload del contrato', () => {
    const resultado = validarFormularioMetas(
      formulario({ calorias: '2200', proteina: '160', agua: '2,5' })
    );
    expect(resultado).toEqual({
      ok: true,
      datos: { caloriasObjetivo: 2200, proteinaGramosObjetivo: 160, aguaLitrosObjetivo: '2.5' },
    });
  });

  it('rechaza calorías con decimales con un mensaje claro en español (no guarda 2200)', () => {
    const resultado = validarFormularioMetas(formulario({ calorias: '2200.7' }));
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.mensaje).toContain('Calorías');
    expect(resultado.mensaje).toMatch(/sin decimales/);
    expect(resultado.mensaje).not.toMatch(PATRON_INGLES_ZOD);
  });

  it.each([
    ['proteina', 'Proteína'],
    ['carbohidratos', 'Carbohidratos'],
    ['grasas', 'Grasas'],
  ] as const)('traduce el error de %s por campo', (campo, etiqueta) => {
    const resultado = validarFormularioMetas(formulario({ [campo]: 'abc' }));
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.mensaje.startsWith(etiqueta)).toBe(true);
    expect(resultado.mensaje).not.toMatch(PATRON_INGLES_ZOD);
  });

  it('traduce un número fuera de rango', () => {
    const resultado = validarFormularioMetas(formulario({ calorias: '0' }));
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.mensaje).toMatch(/^Calorías: .*entre 1 y 15000/);
  });

  it('traduce el formato del agua', () => {
    const resultado = validarFormularioMetas(formulario({ agua: '2.555' }));
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.mensaje).toMatch(/^Agua: /);
  });

  it('pide al menos una meta cuando todo está vacío', () => {
    const resultado = validarFormularioMetas(formulario());
    expect(resultado).toEqual({
      ok: false,
      mensaje: 'Define al menos una meta o un recurso educativo antes de guardar.',
    });
  });

  it('nombra el recurso por su posición en el editor (las filas vacías no cuentan)', () => {
    const resultado = validarFormularioMetas(
      formulario({
        calorias: '2000',
        recursos: [
          filaRecursoVacia(),
          { ...filaRecursoVacia(), titulo: 'G', url: 'https://ejemplo.com' },
        ],
      })
    );
    expect(resultado).toEqual({
      ok: false,
      mensaje: 'Recurso 2: el título debe tener entre 2 y 120 caracteres.',
    });
  });

  it('la numeración coincide con las filas que se guardan (misma regla que el payload)', () => {
    const resultado = validarFormularioMetas(
      formulario({
        calorias: '2000',
        recursos: [
          { ...filaRecursoVacia(), titulo: '   ' },
          { ...filaRecursoVacia(), titulo: 'Guía', url: 'https://ejemplo.com' },
          { ...filaRecursoVacia(), titulo: 'G', url: 'https://ejemplo.com' },
        ],
      })
    );
    expect(resultado).toEqual({
      ok: false,
      mensaje: 'Recurso 3: el título debe tener entre 2 y 120 caracteres.',
    });
  });

  it('traduce un recurso sin enlace ni PDF y un enlace inválido', () => {
    const sinFuente = validarFormularioMetas(
      formulario({ recursos: [{ ...filaRecursoVacia(), titulo: 'Guía' }] })
    );
    expect(sinFuente).toEqual({
      ok: false,
      mensaje: 'Recurso 1: pega un enlace o sube un PDF.',
    });

    const enlaceMalo = validarFormularioMetas(
      formulario({ recursos: [{ ...filaRecursoVacia(), titulo: 'Guía', url: 'no-es-un-enlace' }] })
    );
    expect(enlaceMalo.ok).toBe(false);
    if (enlaceMalo.ok) return;
    expect(enlaceMalo.mensaje).toMatch(/^Recurso 1: el enlace no es válido/);
  });
});

describe('formularioDesdeMetas y hayCambiosSinGuardar', () => {
  it('sin metas guardadas el formulario arranca vacío', () => {
    expect(formularioDesdeMetas(null)).toEqual(formulario());
  });

  it('precarga los valores y reabre el PDF por su clave, sin la URL firmada', () => {
    const inicial = formularioDesdeMetas(metasGuardadas());
    expect(inicial.calorias).toBe('2200');
    expect(inicial.carbohidratos).toBe('');
    expect(inicial.agua).toBe('3.00');
    expect(inicial.recursos.map((r) => [r.titulo, r.url, r.storageKey])).toEqual([
      ['Lista de compras', '', CLAVE_A],
      ['Guía externa', 'https://ejemplo.com/guia', ''],
    ]);
  });

  it('sin cambios no hay nada que confirmar', () => {
    const inicial = formularioDesdeMetas(metasGuardadas());
    expect(hayCambiosSinGuardar(inicial, formularioDesdeMetas(metasGuardadas()))).toBe(false);
  });

  it('una fila de recurso añadida y vacía no cuenta como cambio', () => {
    const inicial = formularioDesdeMetas(metasGuardadas());
    expect(
      hayCambiosSinGuardar(inicial, { ...inicial, recursos: [...inicial.recursos, filaRecursoVacia()] })
    ).toBe(false);
  });

  it('detecta cambios en un campo, en un recurso o una subida en curso', () => {
    const inicial = formularioDesdeMetas(metasGuardadas());
    expect(hayCambiosSinGuardar(inicial, { ...inicial, calorias: '2300' })).toBe(true);
    expect(hayCambiosSinGuardar(inicial, { ...inicial, recursos: inicial.recursos.slice(1) })).toBe(true);
    expect(
      hayCambiosSinGuardar(inicial, {
        ...inicial,
        recursos: inicial.recursos.map((r, i) => (i === 1 ? { ...r, titulo: 'Otra guía' } : r)),
      })
    ).toBe(true);
    expect(
      hayCambiosSinGuardar(inicial, {
        ...inicial,
        recursos: [...inicial.recursos, { ...filaRecursoVacia(), subiendo: true }],
      })
    ).toBe(true);
  });
});

describe('pdfsQueSeEliminaran', () => {
  it('lista los PDFs guardados que ya no están en lo que se va a guardar', () => {
    const previos = metasGuardadas({
      recursos: [
        { titulo: 'Lista de compras', url: null, storageKey: CLAVE_A },
        { titulo: 'Menú', url: null, storageKey: CLAVE_B },
        { titulo: 'Guía externa', url: 'https://ejemplo.com/guia', storageKey: null },
      ],
    }).recursos;

    expect(pdfsQueSeEliminaran(previos, [{ titulo: 'Menú', storageKey: CLAVE_B }])).toEqual([
      { titulo: 'Lista de compras', storageKey: CLAVE_A },
    ]);
  });

  it('quitar un enlace externo o no tocar los PDFs no elimina ningún archivo', () => {
    const previos = metasGuardadas().recursos;
    expect(pdfsQueSeEliminaran(previos, [{ titulo: 'Lista de compras', storageKey: CLAVE_A }])).toEqual([]);
    expect(pdfsQueSeEliminaran([], undefined)).toEqual([]);
  });
});

describe('mensajes de error al guardar y al subir', () => {
  it('solo un ErrorDeConexion se presenta como "sin conexión" (y ahí sí se sabe que no se guardó)', () => {
    const mensaje = mensajeErrorGuardarMetas(new ErrorDeConexion());
    expect(mensaje).toBe(MENSAJE_METAS_SIN_CONEXION);
    expect(mensaje).toMatch(/conexión/);
    expect(mensaje).toMatch(/no se guardaron/);
  });

  it('un TypeError cualquiera no se confunde con falta de conexión', () => {
    expect(mensajeErrorGuardarMetas(new TypeError('x is not a function'))).toBe(
      MENSAJE_METAS_RESULTADO_INCIERTO
    );
  });

  it('sin respuesta definitiva (5xx, timeout, cancelación) no afirma que no se guardó', () => {
    expect(MENSAJE_METAS_RESULTADO_INCIERTO).toBe(
      'No pudimos confirmar si se guardaron tus cambios. Recarga las metas antes de volver a intentarlo.'
    );
    const problema503 = { ...PROBLEMA_403, status: 503, title: 'Service Unavailable' };
    expect(mensajeErrorGuardarMetas(new ApiError(503, problema503, 'Algo falló.'))).toBe(
      MENSAJE_METAS_RESULTADO_INCIERTO
    );
    expect(mensajeErrorGuardarMetas(new DOMException('timeout', 'TimeoutError'))).toBe(
      MENSAJE_METAS_RESULTADO_INCIERTO
    );
    expect(mensajeErrorGuardarMetas(new Error('Internal server error'))).toBe(
      MENSAJE_METAS_RESULTADO_INCIERTO
    );
  });

  it('un rechazo 4xx muestra su mensaje traducido y aclara que no se guardó', () => {
    expect(
      mensajeErrorGuardarMetas(new ApiError(403, PROBLEMA_403, 'No tienes permiso para ver esta sección.'))
    ).toBe('No tienes permiso para ver esta sección. Tus cambios no se guardaron.');
    const tecnico = mensajeErrorGuardarMetas(new ApiError(400, PROBLEMA_403, 'zod: expected int'));
    expect(tecnico).toMatch(/no se guardaron/);
    expect(tecnico).not.toMatch(/zod|expected/i);
  });

  it('la subida fallida usa un texto claro, sin códigos', () => {
    expect(MENSAJE_SUBIDA_PDF_FALLIDA).toBe(
      'No pudimos subir el archivo. Revisa tu conexión e inténtalo de nuevo.'
    );
    expect(mensajeErrorSubidaPdf(new TypeError('Failed to fetch'))).toBe(MENSAJE_SUBIDA_PDF_FALLIDA);
    expect(mensajeErrorSubidaPdf(new Error('Upload failed 503'))).toBe(MENSAJE_SUBIDA_PDF_FALLIDA);
    expect(mensajeErrorSubidaPdf(new ApiError(403, PROBLEMA_403, 'No tienes permiso para ver esta sección.'))).toBe(
      'No tienes permiso para ver esta sección.'
    );
  });
});

describe('estadoEdicionMetas (no se edita sin conocer lo ya guardado)', () => {
  it('mientras cargan, o antes de la primera carga, el editor queda bloqueado', () => {
    expect(estadoEdicionMetas({ cargando: true, error: null, cargadas: false })).toEqual({
      habilitado: false,
      motivo: 'Espera a que carguen las metas.',
    });
    expect(estadoEdicionMetas({ cargando: false, error: null, cargadas: false })).toEqual({
      habilitado: false,
      motivo: 'Espera a que carguen las metas.',
    });
  });

  it('si la carga falló, pide reintentar antes de editar (aunque hubiera una carga previa)', () => {
    const esperado = {
      habilitado: false,
      motivo: 'No pudimos cargar las metas. Reintenta antes de editarlas.',
    };
    expect(estadoEdicionMetas({ cargando: false, error: 'falló', cargadas: false })).toEqual(esperado);
    expect(estadoEdicionMetas({ cargando: false, error: 'falló', cargadas: true })).toEqual(esperado);
  });

  it('con las metas cargadas (incluido "sin metas") se puede editar', () => {
    expect(estadoEdicionMetas({ cargando: false, error: null, cargadas: true })).toEqual({
      habilitado: true,
    });
  });
});

describe('decidirAlGuardar', () => {
  it('con una subida en curso espera, aunque haya PDFs por borrar', () => {
    expect(decidirAlGuardar({ haySubidaEnCurso: true, pdfsAEliminar: 2, modoDemo: false })).toBe(
      'esperar-subida'
    );
  });

  it('si se van a borrar PDFs guardados pide confirmación', () => {
    expect(decidirAlGuardar({ haySubidaEnCurso: false, pdfsAEliminar: 1, modoDemo: false })).toBe(
      'confirmar-borrado'
    );
  });

  it('sin PDFs por borrar, o en modo demostración (no se borra nada real), envía directo', () => {
    expect(decidirAlGuardar({ haySubidaEnCurso: false, pdfsAEliminar: 0, modoDemo: false })).toBe('enviar');
    expect(decidirAlGuardar({ haySubidaEnCurso: false, pdfsAEliminar: 3, modoDemo: true })).toBe('enviar');
  });
});

describe('decidirAlCerrar', () => {
  it('con cambios sin guardar pide confirmar el descarte; sin cambios cierra', () => {
    const inicial = formularioDesdeMetas(metasGuardadas());
    expect(decidirAlCerrar(inicial, inicial)).toBe('cerrar');
    expect(decidirAlCerrar(inicial, { ...inicial, grasas: '70' })).toBe('confirmar-descarte');
  });
});

describe('textosConfirmacionBorrado', () => {
  it('concuerda en singular y en plural', () => {
    expect(textosConfirmacionBorrado(1)).toEqual({
      titulo: '¿Borrar este PDF para siempre?',
      detalle:
        'Al guardar, este archivo se borrará de forma permanente del espacio privado del alumno. No podrás recuperarlo; tendrías que volver a subirlo.',
    });
    expect(textosConfirmacionBorrado(2)).toEqual({
      titulo: '¿Borrar estos 2 PDFs para siempre?',
      detalle:
        'Al guardar, estos archivos se borrarán de forma permanente del espacio privado del alumno. No podrás recuperarlos; tendrías que volver a subirlos.',
    });
  });
});
