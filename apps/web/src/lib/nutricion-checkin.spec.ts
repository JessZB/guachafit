import { describe, expect, it } from 'vitest';
import {
  construirPayloadCheckinNutricional,
  decidirAccionErrorCheckinNutricional,
  evaluarVentanaCheckinLocal,
  MENSAJE_YA_REGISTRADO_HOY,
  obtenerStatusError,
} from './nutricion-checkin';
import { obtenerTimezoneDispositivo } from './date-format';
import { SemaforoNutricional, TipoComida } from '@guachafit/shared';

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
    ).toThrow(/4 fotografías/);
  });
});
