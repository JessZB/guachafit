import { describe, expect, it } from 'vitest';
import {
  construirPayloadCheckinNutricional,
  decidirAccionErrorCheckinNutricional,
  esRechazoVentanaCheckin,
  evaluarVentanaCheckinLocal,
  MENSAJE_ANTES_DE_VENTANA,
  MENSAJE_COLA_SERVIDOR,
  MENSAJE_COLA_SIN_CONEXION,
  MENSAJE_DIA_CERRADO_REPORTE_CON_FOTOS,
  MENSAJE_ERROR_GENERICO,
  MENSAJE_YA_REGISTRADO_HOY,
  obtenerStatusError,
  buscarCheckinNutricionalPendiente,
  clasificarErrorCargaReporteHoy,
  debeMostrarErrorCargaReporte,
  siguienteEstadoReporte,
  valoresFormularioDesdeCheckin,
  ESTADO_REPORTE_INICIAL,
  ETIQUETA_SEMAFORO,
  MENSAJE_ELIGE_SEMAFORO,
  MENSAJE_ERROR_CARGA_REPORTE_HOY,
  MENSAJE_ERROR_SUBIDA_FOTO,
  MENSAJE_FOTOS_MAXIMO_ALCANZADO,
  MENSAJE_FOTOS_RECORTADAS,
  MENSAJE_REPORTE_NO_ENVIADO,
} from './nutricion-checkin';
import { MENSAJE_RANGO_FOTOS_REPORTE, type OutboxMutation } from './offline-db';
import { obtenerTimezoneDispositivo } from './date-format';
import {
  CODIGO_CHECKIN_FUERA_DE_VENTANA,
  SemaforoNutricional,
  TipoComida,
} from '@guachafit/shared';

/** Error con la forma de ApiError del cliente web (status HTTP + message). */
function apiError(status: number, message = 'Error del servidor'): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

describe('decidirAccionErrorCheckinNutricional (RF-002: sin éxito fabricado)', () => {
  it('409 (ya existe el reporte de hoy) refresca el estado real; nunca encola ni muestra éxito', () => {
    const decision = decidirAccionErrorCheckinNutricional(
      apiError(409, 'Violación de unicidad'),
      true
    );
    expect(decision.accion).toBe('refrescar');
    expect(decision.mensaje).toBe(MENSAJE_YA_REGISTRADO_HOY);
  });

  it('400/422 (rechazo de negocio) muestra el mensaje del servidor sin encolar', () => {
    const decision400 = decidirAccionErrorCheckinNutricional(apiError(400, 'Datos inválidos'), true);
    expect(decision400.accion).toBe('mostrar_error');
    expect(decision400.mensaje).toBe('Datos inválidos');

    expect(decidirAccionErrorCheckinNutricional(apiError(422, 'Semáforo inválido'), true).accion).toBe(
      'mostrar_error'
    );
  });

  it('error de red sin status (fetch caído) usa la cola offline reintentable', () => {
    expect(decidirAccionErrorCheckinNutricional(new TypeError('Failed to fetch'), true).accion).toBe(
      'encolar'
    );
  });

  it('5xx (servidor caído) también queda en cola: no es un rechazo concluyente', () => {
    expect(decidirAccionErrorCheckinNutricional(apiError(500, 'Internal'), true).accion).toBe(
      'encolar'
    );
  });

  it('sin conexión observada encola incluso si el error pareciera definitivo', () => {
    const decision = decidirAccionErrorCheckinNutricional(apiError(409), false);
    expect(decision.accion).toBe('encolar');
  });

  it('obtenerStatusError devuelve 0 cuando no hay status numérico', () => {
    expect(obtenerStatusError(new Error('sin status'))).toBe(0);
    expect(obtenerStatusError({ status: 409 })).toBe(409);
  });
});

describe('evaluarVentanaCheckinLocal (RF-002 RN-02: 18:00–23:59 hora local)', () => {
  it('antes de las 18:00 locales no permite reportar (y lo declara)', () => {
    const antes = evaluarVentanaCheckinLocal(new Date(2026, 8, 21, 17, 59, 59));
    expect(antes.permitido).toBe(false);
    expect(antes.motivo).toBe('ANTES_DE_VENTANA');
    expect(antes.horaLocal).toBe(17);
    expect(antes.fechaLocalHoy).toBe('2026-09-21');
  });

  it('a las 18:00 en punto la ventana abre', () => {
    const borde = evaluarVentanaCheckinLocal(new Date(2026, 8, 21, 18, 0, 0));
    expect(borde.permitido).toBe(true);
    expect(borde.motivo).toBeUndefined();
  });

  it('a las 23:59 sigue abierta; pasada la medianoche es otro día local y vuelve a cerrar', () => {
    expect(evaluarVentanaCheckinLocal(new Date(2026, 8, 21, 23, 59, 0)).permitido).toBe(true);

    const medianoche = evaluarVentanaCheckinLocal(new Date(2026, 8, 22, 0, 0, 0));
    expect(medianoche.permitido).toBe(false);
    expect(medianoche.fechaLocalHoy).toBe('2026-09-22');
  });
});

describe('construirPayloadCheckinNutricional (fecha LOCAL + timezoneCliente)', () => {
  it('envía la fecha local del dispositivo y la zona IANA (nunca una fecha UTC)', () => {
    // 21:30 en Caracas (UTC-4) es 01:30 UTC del día siguiente: `toISOString()` daría otro día.
    const ahora = new Date(2026, 8, 21, 21, 30, 0);
    const payload = construirPayloadCheckinNutricional(
      { semaforo: SemaforoNutricional.CUMPLIDO },
      ahora
    );

    expect(payload.fecha).toBe('2026-09-21');
    expect(payload.timezoneCliente).toBe(obtenerTimezoneDispositivo());
    expect(payload.timezoneCliente?.length).toBeGreaterThan(1);
  });

  it('normaliza la coma decimal del agua y omite los campos vacíos (sin 0 fabricado)', () => {
    const payload = construirPayloadCheckinNutricional(
      {
        semaforo: SemaforoNutricional.PARCIAL,
        fecha: '2026-09-21',
        aguaLitros: '2,50',
        calorias: '2150',
        proteina: '',
        notas: '  buena energía  ',
      },
      new Date(2026, 8, 21, 20, 0, 0)
    );

    expect(payload.aguaLitros).toBe('2.50');
    expect(payload.caloriasReportadas).toBe(2150);
    expect(payload.proteinaGramosReportada).toBeUndefined();
    expect(payload.notasAlumno).toBe('buena energía');
    expect(payload.fotosPlatos).toBeUndefined();
  });

  it('rechaza totales no enteros con mensaje visible (no un 400 opaco)', () => {
    expect(() =>
      construirPayloadCheckinNutricional(
        { semaforo: SemaforoNutricional.CUMPLIDO, fecha: '2026-09-21', calorias: '2100.5' },
        new Date(2026, 8, 21, 20, 0, 0)
      )
    ).toThrow(/Calorías inválidas/);
  });

  it('adjunta hasta 4 fotos de platos con su tipo de comida', () => {
    const payload = construirPayloadCheckinNutricional(
      {
        semaforo: SemaforoNutricional.CUMPLIDO,
        fecha: '2026-09-21',
        fotosPlatos: [
          { tipoComida: TipoComida.ALMUERZO, storageKey: 'comidas/a/2026-09-21/1.webp' },
          { tipoComida: TipoComida.CENA, storageKey: 'comidas/a/2026-09-21/2.webp' },
        ],
      },
      new Date(2026, 8, 21, 20, 0, 0)
    );

    expect(payload.fotosPlatos).toHaveLength(2);
    expect(payload.fotosPlatos?.[0].tipoComida).toBe(TipoComida.ALMUERZO);
  });

  it('rechaza más de 4 fotos con el mensaje del contrato compartido', () => {
    const fotos = Array.from({ length: 5 }, (_, indice) => ({
      tipoComida: TipoComida.SNACK,
      storageKey: `comidas/a/2026-09-21/${indice}.webp`,
    }));

    expect(() =>
      construirPayloadCheckinNutricional(
        { semaforo: SemaforoNutricional.CUMPLIDO, fecha: '2026-09-21', fotosPlatos: fotos },
        new Date(2026, 8, 21, 20, 0, 0)
      )
    ).toThrow(MENSAJE_RANGO_FOTOS_REPORTE);
  });
});

describe('esRechazoVentanaCheckin (LOTE API-2: código estable con respaldo por texto)', () => {
  it('reconoce el código estable del servidor aunque el texto cambie', () => {
    // Literal a propósito: fija el contrato del cable con el API.
    expect(CODIGO_CHECKIN_FUERA_DE_VENTANA).toBe('CHECKIN_FUERA_DE_VENTANA');
    expect(
      esRechazoVentanaCheckin('La fecha del reporte no coincide con el día local de tu teléfono. Actualiza la pantalla.', 'CHECKIN_FUERA_DE_VENTANA')
    ).toBe(true);
  });

  it('respaldo: un servidor anterior sin código se sigue reconociendo por el texto', () => {
    expect(
      esRechazoVentanaCheckin(
        "El check-in nutricional solo se habilita entre las 18:00 y las 23:59 (hora local del alumno 'America/Caracas')."
      )
    ).toBe(true);
  });

  it('otro 400 sin código ni texto de ventana no es un rechazo de ventana', () => {
    expect(esRechazoVentanaCheckin('Puedes subir hasta 4 fotos de platos por día.', 'OTRO_CODIGO')).toBe(false);
  });
});

describe('vocabulario visible de nutrición (LOTE API-2)', () => {
  it('los mensajes al alumno hablan de "reporte", nunca de "check-in"', () => {
    for (const mensaje of [
      MENSAJE_ANTES_DE_VENTANA,
      MENSAJE_COLA_SERVIDOR,
      MENSAJE_COLA_SIN_CONEXION,
      MENSAJE_DIA_CERRADO_REPORTE_CON_FOTOS,
      MENSAJE_ERROR_GENERICO,
      MENSAJE_YA_REGISTRADO_HOY,
    ]) {
      expect(mensaje).not.toMatch(/check-?in/i);
    }
    expect(MENSAJE_YA_REGISTRADO_HOY).toBe('Ya registraste tu reporte de hoy.');
  });
});

describe('construirPayloadCheckinNutricional: errores de validación en español claro', () => {
  const ahora = new Date(2026, 8, 21, 20, 0, 0);
  const base = { semaforo: SemaforoNutricional.CUMPLIDO, fecha: '2026-09-21' };

  function mensajeDe(accion: () => unknown): string {
    try {
      accion();
    } catch (err) {
      return (err as Error).message;
    }
    throw new Error('Se esperaba un error de validación');
  }

  /** Ningún mensaje puede filtrar el texto por defecto de Zod (en inglés) ni jerga interna. */
  function esperarTextoClaro(mensaje: string): void {
    expect(mensaje).not.toMatch(/number|string|expected|received|invalid|must|enum|array/i);
    expect(mensaje).not.toMatch(/RN-\d/);
  }

  it('calorías fuera de rango se explican por campo', () => {
    const mensaje = mensajeDe(() =>
      construirPayloadCheckinNutricional({ ...base, calorias: '20000' }, ahora)
    );
    expect(mensaje).toBe('Calorías: escribe un número entre 0 y 15000.');
    esperarTextoClaro(mensaje);
  });

  it('proteína fuera de rango se explica por campo', () => {
    const mensaje = mensajeDe(() =>
      construirPayloadCheckinNutricional({ ...base, proteina: '5000' }, ahora)
    );
    expect(mensaje).toBe('Proteína: escribe los gramos con un número entre 0 y 1000.');
    esperarTextoClaro(mensaje);
  });

  it('agua con demasiados decimales se explica sin jerga', () => {
    const mensaje = mensajeDe(() =>
      construirPayloadCheckinNutricional({ ...base, aguaLitros: '2.555' }, ahora)
    );
    expect(mensaje).toBe('Agua: escribe los litros con hasta 2 decimales, por ejemplo 2,5.');
    esperarTextoClaro(mensaje);
  });

  it('notas demasiado largas indican el máximo', () => {
    const mensaje = mensajeDe(() =>
      construirPayloadCheckinNutricional({ ...base, notas: 'a'.repeat(300) }, ahora)
    );
    expect(mensaje).toBe('Notas: usa como máximo 280 caracteres.');
  });

  it('un semáforo inválido pide elegir cómo te fue hoy (nunca el texto de Zod)', () => {
    const mensaje = mensajeDe(() =>
      construirPayloadCheckinNutricional(
        { ...base, semaforo: 'OTRO' as unknown as SemaforoNutricional },
        ahora
      )
    );
    expect(mensaje).toBe('Elige cómo te fue hoy con tu plan.');
    esperarTextoClaro(mensaje);
  });
});

describe('valoresFormularioDesdeCheckin (rehidratación sin ocultar ceros)', () => {
  it('conserva los valores 0 reportados', () => {
    const valores = valoresFormularioDesdeCheckin({
      semaforo: SemaforoNutricional.NO_CUMPLIDO,
      aguaLitros: '0',
      caloriasReportadas: 0,
      proteinaGramosReportada: 0,
      notasAlumno: null,
    });
    expect(valores).toEqual({
      semaforo: SemaforoNutricional.NO_CUMPLIDO,
      aguaLitros: '0',
      calorias: '0',
      proteina: '0',
      notas: '',
    });
  });

  it('los campos sin dato quedan vacíos (sin 0 fabricado)', () => {
    const valores = valoresFormularioDesdeCheckin({
      semaforo: SemaforoNutricional.PARCIAL,
      aguaLitros: null,
      caloriasReportadas: null,
      proteinaGramosReportada: null,
      notasAlumno: 'cena fuera',
    });
    expect(valores).toEqual({
      semaforo: SemaforoNutricional.PARCIAL,
      aguaLitros: '',
      calorias: '',
      proteina: '',
      notas: 'cena fuera',
    });
  });
});

describe('clasificarErrorCargaReporteHoy', () => {
  it('404 significa "todavía no hay reporte hoy": no es un error', () => {
    expect(clasificarErrorCargaReporteHoy(apiError(404, 'No encontrado'), true)).toBeNull();
    expect(clasificarErrorCargaReporteHoy(apiError(204, ''), true)).toBeNull();
  });

  it('cualquier otro fallo da un mensaje claro y recuerda si fue sin conexión', () => {
    expect(clasificarErrorCargaReporteHoy(apiError(500, 'Internal Server Error'), true)).toEqual({
      mensaje: MENSAJE_ERROR_CARGA_REPORTE_HOY,
      sinConexion: false,
    });
    expect(clasificarErrorCargaReporteHoy(new TypeError('Failed to fetch'), false)).toEqual({
      mensaje: MENSAJE_ERROR_CARGA_REPORTE_HOY,
      sinConexion: true,
    });
    expect(MENSAJE_ERROR_CARGA_REPORTE_HOY).toBe(
      'No pudimos cargar tu reporte de hoy. Revisa tu conexión e inténtalo de nuevo.'
    );
  });
});

describe('debeMostrarErrorCargaReporte', () => {
  const errorConConexion = { mensaje: MENSAJE_ERROR_CARGA_REPORTE_HOY, sinConexion: false };
  const errorSinConexion = { mensaje: MENSAJE_ERROR_CARGA_REPORTE_HOY, sinConexion: true };

  it('nunca junto a un reporte registrado', () => {
    expect(debeMostrarErrorCargaReporte('saved', errorConConexion)).toBe(false);
  });

  it('con conexión se muestra; sin conexión lo explica el aviso de datos sin conexión', () => {
    expect(debeMostrarErrorCargaReporte('idle', errorConConexion)).toBe(true);
    expect(debeMostrarErrorCargaReporte('idle', errorSinConexion)).toBe(false);
    expect(debeMostrarErrorCargaReporte('idle', null)).toBe(false);
  });

  it('mientras se confirma un envío se muestra siempre (también sin conexión) para poder reintentar', () => {
    expect(debeMostrarErrorCargaReporte('confirmando', errorSinConexion)).toBe(true);
  });
});

describe('siguienteEstadoReporte (máquina de estados del reporte de hoy)', () => {
  const inicial = ESTADO_REPORTE_INICIAL;
  const encolado = { estado: 'queued' as const, fotosEncoladas: 2, aviso: null };
  const confirmando = { estado: 'confirmando' as const, fotosEncoladas: 2, aviso: null };

  it('un pendiente en la cola bloquea como "pendiente" con sus fotos', () => {
    expect(
      siguienteEstadoReporte(inicial, { tipo: 'cola', resultado: { tipo: 'pendiente', fotos: 2 } })
    ).toEqual(encolado);
  });

  it('un reporte ya registrado no retrocede a pendiente', () => {
    const registrado = { estado: 'saved' as const, fotosEncoladas: 0, aviso: null };
    expect(
      siguienteEstadoReporte(registrado, { tipo: 'cola', resultado: { tipo: 'pendiente', fotos: 1 } })
    ).toBe(registrado);
  });

  it('si leer la cola falla, el pendiente se mantiene (no es "cola vacía")', () => {
    expect(siguienteEstadoReporte(encolado, { tipo: 'cola', resultado: { tipo: 'error' } })).toBe(
      encolado
    );
  });

  it('cuando el pendiente sale de la cola, sigue bloqueado confirmando hasta cargar el reporte', () => {
    expect(siguienteEstadoReporte(encolado, { tipo: 'cola', resultado: { tipo: 'vacia' } })).toEqual(
      confirmando
    );
    expect(siguienteEstadoReporte(inicial, { tipo: 'cola', resultado: { tipo: 'vacia' } })).toBe(
      inicial
    );
  });

  it('confirmando + reporte encontrado → registrado', () => {
    expect(siguienteEstadoReporte(confirmando, { tipo: 'carga', resultado: 'encontrado' })).toEqual({
      estado: 'saved',
      fotosEncoladas: 0,
      aviso: null,
    });
  });

  it('confirmando + sin reporte → se desbloquea con un aviso informativo', () => {
    expect(siguienteEstadoReporte(confirmando, { tipo: 'carga', resultado: 'sin-reporte' })).toEqual({
      estado: 'idle',
      fotosEncoladas: 0,
      aviso: MENSAJE_REPORTE_NO_ENVIADO,
    });
    expect(MENSAJE_REPORTE_NO_ENVIADO).toBe(
      'Tu reporte no se pudo enviar. Revisa tus cambios por enviar e inténtalo de nuevo.'
    );
  });

  it('confirmando + fallo de carga → sigue bloqueado (la pantalla ofrece reintentar)', () => {
    expect(siguienteEstadoReporte(confirmando, { tipo: 'carga', resultado: 'error' })).toBe(
      confirmando
    );
  });

  it('sin reporte al abrir la pantalla con un pendiente en la cola no lo desbloquea', () => {
    expect(siguienteEstadoReporte(encolado, { tipo: 'carga', resultado: 'sin-reporte' })).toBe(
      encolado
    );
  });

  it('carrera: encolar y que la cola ya esté vacía termina confirmando, no "pendiente" colgado', () => {
    const trasEncolar = siguienteEstadoReporte(inicial, { tipo: 'encolado', fotos: 0 });
    expect(trasEncolar.estado).toBe('queued');
    const trasSincronizar = siguienteEstadoReporte(trasEncolar, {
      tipo: 'cola',
      resultado: { tipo: 'vacia' },
    });
    expect(trasSincronizar.estado).toBe('confirmando');
  });

  it('guardado y rechazo del envío directo', () => {
    expect(siguienteEstadoReporte(inicial, { tipo: 'guardado' }).estado).toBe('saved');
    expect(siguienteEstadoReporte(inicial, { tipo: 'rechazado' }).estado).toBe('error');
  });
});

describe('buscarCheckinNutricionalPendiente (el pendiente sobrevive a la recarga)', () => {
  const ALUMNO = 'alumno-actual';

  function mutacion(parcial: Partial<OutboxMutation>): OutboxMutation {
    return {
      id: 1,
      endpoint: '/nutricion/checkin-diario',
      method: 'POST',
      payload: { fecha: '2026-09-21', semaforo: SemaforoNutricional.CUMPLIDO },
      idempotencyKey: 'k',
      description: 'Reporte nutricional del día',
      status: 'pending',
      createdAt: 1,
      attempts: 0,
      ...parcial,
    };
  }

  it('encuentra el reporte de hoy sin fotos que espera en la cola', async () => {
    const resultado = await buscarCheckinNutricionalPendiente('2026-09-21', ALUMNO, async () => [
      mutacion({}),
    ]);
    expect(resultado).toEqual({ tipo: 'pendiente', fotos: 0 });
  });

  it('cuenta las fotos del reporte que sigue en el dispositivo (también si falló y reintentará)', async () => {
    const fotos = [1, 2, 3].map(() => ({
      tipoComida: TipoComida.CENA,
      nombre: 'f.webp',
      contentType: 'image/webp',
      blob: new Blob(['x']),
      storageKey: null,
    }));
    const resultado = await buscarCheckinNutricionalPendiente('2026-09-21', ALUMNO, async () => [
      mutacion({ status: 'failed', tipo: 'nutricion-checkin-fotos', alumnoId: ALUMNO, fotos }),
    ]);
    expect(resultado).toEqual({ tipo: 'pendiente', fotos: 3 });
  });

  it('ignora reportes de otro día, ya enviados, rechazados, de otro alumno u otros endpoints', async () => {
    const resultado = await buscarCheckinNutricionalPendiente('2026-09-21', ALUMNO, async () => [
      mutacion({ payload: { fecha: '2026-09-20' } }),
      mutacion({ status: 'synced' }),
      mutacion({ status: 'rejected' }),
      mutacion({ alumnoId: 'otro-alumno' }),
      mutacion({ endpoint: '/entrenamiento/series' }),
    ]);
    expect(resultado).toEqual({ tipo: 'vacia' });
  });

  it('si la base local no responde, lo dice (no lo confunde con una cola vacía)', async () => {
    const resultado = await buscarCheckinNutricionalPendiente('2026-09-21', ALUMNO, async () => {
      throw new Error('IndexedDB no disponible');
    });
    expect(resultado).toEqual({ tipo: 'error' });
  });
});

describe('textos del reporte (una sola redacción, sin códigos internos)', () => {
  it('usan español claro sin RN-xx ni códigos HTTP', () => {
    expect(MENSAJE_FOTOS_MAXIMO_ALCANZADO).toBe(
      'Ya agregaste 4 fotos, el máximo del día. Quita una para cambiarla.'
    );
    expect(MENSAJE_FOTOS_RECORTADAS).toBe(
      'Puedes subir hasta 4 fotos por día; agregamos las primeras.'
    );
    expect(MENSAJE_ERROR_SUBIDA_FOTO).toBe(
      'No pudimos subir la foto. Revisa tu conexión e inténtalo de nuevo.'
    );
  });

  it('la pregunta del semáforo y su error comparten redacción', () => {
    expect(ETIQUETA_SEMAFORO).toBe('¿Cómo te fue hoy con tu plan?');
    expect(MENSAJE_ELIGE_SEMAFORO).toBe('Elige cómo te fue hoy con tu plan.');
  });

  it('el rango de fotos es el mismo texto en el formulario y en la cola', () => {
    expect(MENSAJE_RANGO_FOTOS_REPORTE).toBe('Un reporte puede llevar de 1 a 4 fotos.');
  });
});
