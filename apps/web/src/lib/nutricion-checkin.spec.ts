import { describe, expect, it } from 'vitest';
import {
  calcularSegundosDesdeCaptura,
  construirPayloadCheckinNutricional,
  cuerpoCheckinParaEnviar,
  decidirAccionErrorCheckinNutricional,
  esRechazoVentanaCheckin,
  evaluarVentanaCheckinLocal,
  HORARIO_VENTANA_CHECKIN,
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
  MENSAJE_REPORTE_CON_OTROS_DATOS,
  coincideReporteServidorConPendiente,
  textoHorarioCheckin,
  zonaPerfilEfectiva,
} from './nutricion-checkin';
import { MENSAJE_RANGO_FOTOS_REPORTE, type OutboxMutation } from './offline-db';
import { obtenerTimezoneDispositivo } from './date-format';
import {
  CODIGO_CHECKIN_FUERA_DE_PLAZO,
  CODIGO_CHECKIN_FUERA_DE_VENTANA,
  MENSAJE_CHECKIN_DIA_CAMBIADO,
  MENSAJE_CHECKIN_FUERA_DE_PLAZO,
  MENSAJE_CHECKIN_FUERA_DE_VENTANA,
  MENSAJE_CHECKIN_YA_REGISTRADO,
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
      esRechazoVentanaCheckin('Tu teléfono ya cambió de día. Actualiza la pantalla para ver el reporte de hoy.', 'CHECKIN_FUERA_DE_VENTANA')
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

describe('LOTE API-N1: 409 "ya registrado" al sincronizar la cola', () => {
  const payload = {
    fecha: '2026-09-21',
    timezoneCliente: 'America/Caracas',
    semaforo: SemaforoNutricional.PARCIAL,
    aguaLitros: '2.5',
    caloriasReportadas: 1800,
    proteinaGramosReportada: 120,
    notasAlumno: 'Cena fuera',
  };

  function servidor(parcial: Record<string, unknown> = {}) {
    return {
      semaforo: SemaforoNutricional.PARCIAL,
      aguaLitros: '2.50',
      caloriasReportadas: 1800,
      proteinaGramosReportada: 120,
      notasAlumno: 'Cena fuera',
      fotosPlatos: [{}, {}],
      ...parcial,
    } as any;
  }

  it('el mismo reporte (reintento de un envío que sí llegó) coincide, aunque el agua venga como 2.50', () => {
    expect(coincideReporteServidorConPendiente(servidor(), payload, 2)).toBe(true);
  });

  it('opcionales ausentes en el pendiente equivalen a vacíos en el servidor', () => {
    expect(
      coincideReporteServidorConPendiente(
        servidor({
          aguaLitros: null,
          caloriasReportadas: null,
          proteinaGramosReportada: null,
          notasAlumno: null,
          fotosPlatos: [],
        }),
        { fecha: '2026-09-21', semaforo: SemaforoNutricional.PARCIAL },
        0
      )
    ).toBe(true);
  });

  it('cualquier dato distinto (semáforo, notas, calorías, proteína, agua o fotos) no coincide', () => {
    const distintos = [
      servidor({ semaforo: SemaforoNutricional.CUMPLIDO }),
      servidor({ notasAlumno: 'Otra nota' }),
      servidor({ caloriasReportadas: 1900 }),
      servidor({ proteinaGramosReportada: 100 }),
      servidor({ aguaLitros: '3.00' }),
      servidor({ aguaLitros: null }),
      servidor({ fotosPlatos: [{}] }),
    ];
    for (const reporte of distintos) {
      expect(coincideReporteServidorConPendiente(reporte, payload, 2), JSON.stringify(reporte)).toBe(
        false
      );
    }
  });

  it('el mensaje del rechazo es claro y dice que este reporte no se envió', () => {
    expect(MENSAJE_REPORTE_CON_OTROS_DATOS).toBe(
      'Ya tenías un reporte de hoy registrado con otros datos; este no se envió.'
    );
  });

  it('buscar el pendiente detecta el reporte de hoy rechazado por traer otros datos', async () => {
    const resultado = await buscarCheckinNutricionalPendiente('2026-09-21', 'alumno', async () => [
      {
        id: 7,
        endpoint: '/nutricion/checkin-diario',
        method: 'POST',
        payload: { fecha: '2026-09-21' },
        idempotencyKey: 'k',
        description: 'Reporte',
        status: 'rejected',
        motivoRechazo: 'reporte-con-otros-datos',
        createdAt: 1,
        attempts: 1,
      },
    ]);
    expect(resultado).toEqual({ tipo: 'rechazado-otros-datos' });
  });

  it('pantalla: synced → confirmando → registrado', () => {
    const encolado = { estado: 'queued' as const, fotosEncoladas: 1, aviso: null };
    const confirmando = siguienteEstadoReporte(encolado, { tipo: 'cola', resultado: { tipo: 'vacia' } });
    expect(confirmando.estado).toBe('confirmando');
    expect(siguienteEstadoReporte(confirmando, { tipo: 'carga', resultado: 'encontrado' })).toEqual({
      estado: 'saved',
      fotosEncoladas: 0,
      aviso: null,
    });
  });

  it('pantalla: rechazado por otros datos → muestra el reporte del servidor con el aviso de no enviado', () => {
    const encolado = { estado: 'queued' as const, fotosEncoladas: 1, aviso: null };
    const trasRechazo = siguienteEstadoReporte(encolado, {
      tipo: 'cola',
      resultado: { tipo: 'rechazado-otros-datos' },
    });
    expect(trasRechazo).toEqual({
      estado: 'confirmando',
      fotosEncoladas: 0,
      aviso: MENSAJE_REPORTE_CON_OTROS_DATOS,
    });
    expect(siguienteEstadoReporte(trasRechazo, { tipo: 'carga', resultado: 'encontrado' })).toEqual({
      estado: 'saved',
      fotosEncoladas: 0,
      aviso: MENSAJE_REPORTE_CON_OTROS_DATOS,
    });
  });

  it('pantalla recién abierta con un rechazo de hoy ya en la cola → aviso junto al reporte registrado', () => {
    const avisado = { estado: 'idle' as const, fotosEncoladas: 0, aviso: MENSAJE_REPORTE_CON_OTROS_DATOS };
    const rechazo = { tipo: 'cola' as const, resultado: { tipo: 'rechazado-otros-datos' as const } };
    const encontrado = { tipo: 'carga' as const, resultado: 'encontrado' as const };
    const registrado = { estado: 'saved' as const, fotosEncoladas: 0, aviso: MENSAJE_REPORTE_CON_OTROS_DATOS };

    // Orden 1: primero la cola, luego la carga del reporte del servidor.
    const trasCola = siguienteEstadoReporte(ESTADO_REPORTE_INICIAL, rechazo);
    expect(trasCola).toEqual(avisado);
    expect(siguienteEstadoReporte(trasCola, encontrado)).toEqual(registrado);

    // Orden 2: primero la carga (ya registrado), luego la cola.
    const trasCarga = siguienteEstadoReporte(ESTADO_REPORTE_INICIAL, encontrado);
    expect(trasCarga.aviso).toBeNull();
    expect(siguienteEstadoReporte(trasCarga, rechazo)).toEqual(registrado);

    // Releer la misma cola no vuelve a renderizar.
    const conAviso = siguienteEstadoReporte(trasCarga, rechazo);
    expect(siguienteEstadoReporte(conAviso, rechazo)).toBe(conAviso);
  });

  it('el aviso de ya registrado reutiliza el texto compartido', () => {
    expect(MENSAJE_YA_REGISTRADO_HOY).toBe(MENSAJE_CHECKIN_YA_REGISTRADO);
  });
});

describe('LOTE API-N2: hora de captura y plazo del día siguiente', () => {
  // Ronda 1: el teléfono envía cuánto tiempo pasó desde la captura (no la hora de su reloj); el
  // servidor resta esos segundos a su propia hora, así un reloj desajustado no altera nada.
  it('el cuerpo validado no lleva hora de captura del reloj del teléfono', () => {
    const payload = construirPayloadCheckinNutricional(
      { semaforo: SemaforoNutricional.CUMPLIDO },
      new Date('2026-09-22T01:30:00.000Z')
    ) as Record<string, unknown>;
    expect(payload).not.toHaveProperty('capturadoEnUtc');
    expect(payload).not.toHaveProperty('segundosDesdeCaptura');
  });

  it('calcularSegundosDesdeCaptura redondea y nunca es negativo', () => {
    const captura = Date.parse('2026-09-22T01:30:00.000Z');
    expect(calcularSegundosDesdeCaptura(captura, captura + 1_499)).toBe(1);
    expect(calcularSegundosDesdeCaptura(captura, captura + 1_500)).toBe(2);
    expect(calcularSegundosDesdeCaptura(captura, captura + 12 * 3_600_000)).toBe(43_200);
    // El reloj del teléfono retrocedió (cambio manual de hora): se envía 0.
    expect(calcularSegundosDesdeCaptura(captura, captura - 60_000)).toBe(0);
  });

  it('al enviar se agregan los segundos transcurridos desde que se tocó Guardar', () => {
    const payload = construirPayloadCheckinNutricional(
      { semaforo: SemaforoNutricional.CUMPLIDO },
      new Date('2026-09-22T01:30:00.000Z')
    );
    const captura = Date.parse('2026-09-22T01:30:00.000Z');
    const cuerpo = cuerpoCheckinParaEnviar(payload, captura, captura + 90_000);
    expect(cuerpo).toEqual({ ...payload, segundosDesdeCaptura: 90 });
  });

  it('sin instante de captura guardado el cuerpo sale sin el campo (cuenta la hora del servidor)', () => {
    const payload = construirPayloadCheckinNutricional(
      { semaforo: SemaforoNutricional.CUMPLIDO },
      new Date('2026-09-22T01:30:00.000Z')
    );
    expect(cuerpoCheckinParaEnviar(payload, undefined, Date.now())).toEqual(payload);
  });

  it('un pendiente del formato anterior (`capturadoEnUtc`) se convierte a segundos y no reenvía la hora', () => {
    const anterior = {
      fecha: '2026-09-21',
      semaforo: SemaforoNutricional.CUMPLIDO,
      capturadoEnUtc: '2026-09-22T01:30:00.000Z',
    };
    const cuerpo = cuerpoCheckinParaEnviar(anterior, undefined, Date.parse('2026-09-22T02:00:00.000Z'));
    expect(cuerpo).toEqual({
      fecha: '2026-09-21',
      semaforo: SemaforoNutricional.CUMPLIDO,
      segundosDesdeCaptura: 1_800,
    });
  });

  it('un `capturadoEnUtc` ilegible del formato anterior se descarta (cuenta la hora del servidor)', () => {
    const cuerpo = cuerpoCheckinParaEnviar(
      { fecha: '2026-09-21', semaforo: SemaforoNutricional.CUMPLIDO, capturadoEnUtc: 'ayer' },
      undefined,
      Date.now()
    );
    expect(cuerpo).toEqual({ fecha: '2026-09-21', semaforo: SemaforoNutricional.CUMPLIDO });
  });

  it('el nuevo aviso de "día cambiado" se reconoce también por el texto (respaldo sin código)', () => {
    expect(esRechazoVentanaCheckin(MENSAJE_CHECKIN_DIA_CAMBIADO)).toBe(true);
    expect(esRechazoVentanaCheckin(MENSAJE_CHECKIN_FUERA_DE_VENTANA)).toBe(true);
  });

  it('400 CHECKIN_FUERA_DE_PLAZO es un rechazo definitivo visible con el texto acordado (sin cola)', () => {
    const error = Object.assign(new Error('Texto distinto del servidor'), {
      status: 400,
      problem: { statusCode: 400, message: 'Texto distinto del servidor', code: CODIGO_CHECKIN_FUERA_DE_PLAZO },
    });
    const decision = decidirAccionErrorCheckinNutricional(error, true);
    expect(decision).toEqual({ accion: 'mostrar_error', mensaje: MENSAJE_CHECKIN_FUERA_DE_PLAZO });
    expect(MENSAJE_CHECKIN_FUERA_DE_PLAZO).toBe(
      'Este reporte llegó después del mediodía del día siguiente, así que ya no se puede registrar. El día quedó como «No reportado».'
    );
  });

  it('el plazo vencido no se confunde con el rechazo de ventana', () => {
    expect(esRechazoVentanaCheckin(MENSAJE_CHECKIN_FUERA_DE_PLAZO, CODIGO_CHECKIN_FUERA_DE_PLAZO)).toBe(false);
  });
});

describe('LOTE F3: ventana horaria con la zona del perfil (RF-002 RN-02 / ADR-019)', () => {
  it('con America/Caracas la ventana se evalúa con esa zona y respeta 18:00–23:59', () => {
    const antes = evaluarVentanaCheckinLocal(new Date('2026-10-05T21:59:59Z'), 'America/Caracas');
    expect(antes.permitido).toBe(false);
    expect(antes.motivo).toBe('ANTES_DE_VENTANA');
    expect(antes.fechaLocalHoy).toBe('2026-10-05');
    expect(antes.horaLocal).toBe(17);

    const borde = evaluarVentanaCheckinLocal(new Date('2026-10-05T22:00:00Z'), 'America/Caracas');
    expect(borde.permitido).toBe(true);
    expect(borde.motivo).toBeUndefined();
    expect(borde.fechaLocalHoy).toBe('2026-10-05');
    expect(borde.horaLocal).toBe(18);

    const ultima = evaluarVentanaCheckinLocal(new Date('2026-10-06T03:59:00Z'), 'America/Caracas');
    expect(ultima.permitido).toBe(true);
    expect(ultima.fechaLocalHoy).toBe('2026-10-05');
    expect(ultima.horaLocal).toBe(23);
  });

  it('a las 18:00 de Madrid ya se puede reportar aunque el dispositivo vaya en otra hora', () => {
    const madrid = evaluarVentanaCheckinLocal(new Date('2026-10-05T16:00:00Z'), 'Europe/Madrid');
    expect(madrid.permitido).toBe(true);
    expect(madrid.fechaLocalHoy).toBe('2026-10-05');
    expect(madrid.horaLocal).toBe(18);
  });
});

describe('LOTE F3: textoHorarioCheckin (la ventana explicada con la zona del perfil)', () => {
  it('nombra la hora local de la zona del perfil', () => {
    expect(textoHorarioCheckin('America/Caracas')).toBe(
      'Puedes enviar tu reporte de 18:00 a 23:59 (hora de Caracas).'
    );
    expect(textoHorarioCheckin('Europe/Madrid')).toBe(
      'Puedes enviar tu reporte de 18:00 a 23:59 (hora de Madrid).'
    );
  });

  it('sin zona (o null) usa Caracas por defecto', () => {
    expect(textoHorarioCheckin()).toBe(
      'Puedes enviar tu reporte de 18:00 a 23:59 (hora de Caracas).'
    );
    expect(textoHorarioCheckin(null)).toBe(
      'Puedes enviar tu reporte de 18:00 a 23:59 (hora de Caracas).'
    );
  });

  it('no filtra jerga: ni "teléfono", ni "UTC", ni el identificador IANA crudo', () => {
    for (const texto of [
      textoHorarioCheckin('America/Caracas'),
      textoHorarioCheckin('Europe/Madrid'),
      textoHorarioCheckin(null),
    ]) {
      expect(texto).not.toMatch(/teléfono/i);
      expect(texto).not.toMatch(/UTC/);
      expect(texto).not.toMatch(/America\/|Europe\//);
    }
  });
});

describe('LOTE F3: zonaPerfilEfectiva y HORARIO_VENTANA_CHECKIN (una sola zona de respaldo)', () => {
  it('con una zona IANA válida devuelve la del perfil, no la del dispositivo', () => {
    expect(zonaPerfilEfectiva('Europe/Madrid')).toBe('Europe/Madrid');
    expect(zonaPerfilEfectiva('America/Bogota')).toBe('America/Bogota');
  });

  it('sin zona, con null o con una zona inválida cae a America/Caracas, como el servidor', () => {
    expect(zonaPerfilEfectiva(null)).toBe('America/Caracas');
    expect(zonaPerfilEfectiva(undefined)).toBe('America/Caracas');
    expect(zonaPerfilEfectiva('Foo/Bar')).toBe('America/Caracas');
    // Con espacios alrededor tampoco es válida: el respaldo nunca es la del dispositivo.
    expect(zonaPerfilEfectiva(' Europe/Madrid')).toBe('America/Caracas');
  });

  it('la ventana visible acordada es "18:00 a 23:59"', () => {
    expect(HORARIO_VENTANA_CHECKIN).toBe('18:00 a 23:59');
  });

  it('textoHorarioCheckin con una zona inválida nombra Caracas (coincide con la evaluación)', () => {
    expect(textoHorarioCheckin('Foo/Bar')).toBe(
      'Puedes enviar tu reporte de 18:00 a 23:59 (hora de Caracas).'
    );
  });
});
