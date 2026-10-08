import { describe, expect, it } from 'vitest';
import { AnguloFoto, CheckinAntropometricoSchema } from '@guachafit/shared';
import type { FotoAntropometriaInputDTO } from '@guachafit/shared';
import * as contratosFotosShared from '@guachafit/shared';
import {
  construirPayloadCheckinAntropometrico,
  fechaLocalHoy,
  obtenerUltimaMedicionReal,
  validarMedidasCheckinAntropometrico,
} from './antropometria-checkin';

const ALUMNO_ID = 'a3333333-3333-4333-8333-333333333333';

// ---------------------------------------------------------------------------
// RF-003 "fotos del check-in" (contratos 1, 2 y 10)
// ---------------------------------------------------------------------------

const UUID_FOTO = '00000000-0000-4000-8000-0000000000ab';
const MENSAJE_FOTOS_ANGULO_REPETIDO_ESPERADO =
  'Adjunta como máximo una foto por ángulo (frontal, lateral y posterior).';
const MENSAJE_FOTO_ANTROPOMETRIA_INVALIDA_ESPERADO =
  'Una de las fotos no es válida. Vuelve a subirla.';

/**
 * El contrato 10 amplía `construirPayloadCheckinAntropometrico` con un 4.º parámetro `fotos`:
 * la firma de producción ya lo declara, así que se llama directamente (sin cast).
 */
/** Foto de contrato con clave distinguible por sufijo (solo importa el ángulo repetido). */
const fotoDe = (angulo: AnguloFoto, sufijo: string): FotoAntropometriaInputDTO => ({
  angulo,
  storageKey: `antropometria/${ALUMNO_ID}/2026/${UUID_FOTO}${sufijo}.webp`,
});

describe('construirPayloadCheckinAntropometrico (RF-003: contrato del check-in real)', () => {
  it('construye el payload mínimo válido con alumnoId y fechaEvaluacion del contrato', () => {
    const payload = construirPayloadCheckinAntropometrico(
      ALUMNO_ID,
      { pesoKg: '74.50' },
      '2026-09-20'
    );

    expect(payload.alumnoId).toBe(ALUMNO_ID);
    expect(payload.fechaEvaluacion).toBe('2026-09-20');
    expect(payload.pesoKg).toBe('74.50');
    expect(payload.porcentajeGrasa).toBeUndefined();
    expect(payload.perimetros).toBeUndefined();
    // Sin fotos no se inventa una subida ni un array vacío.
    expect('fotos' in payload).toBe(false);
  });

  it('normaliza coma decimal, recorta espacios y descarta campos opcionales vacíos', () => {
    const payload = construirPayloadCheckinAntropometrico(
      ALUMNO_ID,
      {
        pesoKg: ' 74,50 ',
        porcentajeGrasa: '14,80',
        cinturaCm: '81,00',
        brazoCm: '',
        pechoCm: '   ',
      },
      '2026-09-20'
    );

    expect(payload.pesoKg).toBe('74.50');
    expect(payload.porcentajeGrasa).toBe('14.80');
    expect(payload.perimetros).toEqual({ cinturaCm: '81.00' });
  });

  it('rechaza con mensaje claro un peso fuera del rango biológico (nunca viaja a la API)', () => {
    expect(() =>
      construirPayloadCheckinAntropometrico(ALUMNO_ID, { pesoKg: '20.00' }, '2026-09-20')
    ).toThrowError(/peso debe estar entre 30.00 kg y 300.00 kg/i);
  });

  it('rechaza un porcentaje de grasa fuera del rango biológico', () => {
    expect(() =>
      construirPayloadCheckinAntropometrico(
        ALUMNO_ID,
        { pesoKg: '70.00', porcentajeGrasa: '90.00' },
        '2026-09-20'
      )
    ).toThrowError(/porcentaje de grasa debe estar entre 2.00% y 70.00%/i);
  });

  it('rechaza un alumnoId que no sea UUID (el service busca por usuarioId)', () => {
    expect(() =>
      construirPayloadCheckinAntropometrico('user-demo-1', { pesoKg: '70.00' }, '2026-09-20')
    ).toThrowError(/No encontramos ese alumno/);
  });

  it('envía el modelo RN-02 completo: brazo relajado/contraído, muslo medio y pliegues', () => {
    const payload = construirPayloadCheckinAntropometrico(
      ALUMNO_ID,
      {
        pesoKg: '74.50',
        cinturaCm: '81.00',
        brazoRelajadoCm: '37.50',
        brazoContraidoCm: '40.10',
        musloMedioCm: '58.20',
        tricepsMm: '12.00',
        subescapularMm: '11.50',
        suprailiacoMm: '9.80',
        abdominalMm: '14.20',
      },
      '2026-09-20'
    );

    expect(payload.perimetros).toEqual({
      cinturaCm: '81.00',
      brazoRelajadoCm: '37.50',
      brazoContraidoCm: '40.10',
      musloMedioCm: '58.20',
    });
    expect(payload.pliegues).toEqual({
      tricepsMm: '12.00',
      subescapularMm: '11.50',
      suprailiacoMm: '9.80',
      abdominalMm: '14.20',
    });
  });

  it('conserva los alias legados brazoCm/musloCm cuando el formulario los usa', () => {
    const payload = construirPayloadCheckinAntropometrico(
      ALUMNO_ID,
      { pesoKg: '74.50', brazoCm: '37.00', musloCm: '58.00' },
      '2026-09-20'
    );

    expect(payload.perimetros).toEqual({ brazoCm: '37.00', musloCm: '58.00' });
    expect(payload.pliegues).toBeUndefined();
  });

  it('rechaza un pliegue fuera del rango biológico con su mensaje humano', () => {
    expect(() =>
      construirPayloadCheckinAntropometrico(
        ALUMNO_ID,
        { pesoKg: '74.50', tricepsMm: '150.00' },
        '2026-09-20'
      )
    ).toThrowError(/pliegue del tríceps debe estar entre 1.00 mm y 100.00 mm/i);
  });

  it('contrato 10: con fotos no vacío el payload las incluye tal cual', () => {
    const fotos: FotoAntropometriaInputDTO[] = [fotoDe(AnguloFoto.LATERAL, '-l')];

    const payload = construirPayloadCheckinAntropometrico(ALUMNO_ID, { pesoKg: '74.50' }, '2026-09-20', fotos);

    expect(payload.fotos).toEqual(fotos);
  });

  it('contrato 10: con [] omite la clave fotos y los llamadores de 3 argumentos siguen igual', () => {
    const conArrayVacio = construirPayloadCheckinAntropometrico(ALUMNO_ID, { pesoKg: '74.50' }, '2026-09-20', []);

    expect('fotos' in conArrayVacio).toBe(false);

    const deTresArgumentos = construirPayloadCheckinAntropometrico(
      ALUMNO_ID,
      { pesoKg: '74.50' },
      '2026-09-20'
    );
    expect('fotos' in deTresArgumentos).toBe(false);
  });
});

describe('validarMedidasCheckinAntropometrico (RF-003: validación inline por campo)', () => {
  it('devuelve el error bajo el campo que lo causa, no un mensaje global', () => {
    const errores = validarMedidasCheckinAntropometrico(
      ALUMNO_ID,
      { pesoKg: '74.50', cinturaCm: '10.00', brazoRelajadoCm: '90.00' },
      '2026-09-20'
    );

    expect(errores.cinturaCm).toMatch(/cintura debe estar entre 30.00 cm y 250.00 cm/i);
    expect(errores.brazoRelajadoCm).toMatch(/brazo relajado debe estar entre 10.00 cm y 80.00 cm/i);
    expect(errores.pesoKg).toBeUndefined();
  });

  it('sin errores devuelve un mapa vacío (campos vacíos = opcionales)', () => {
    expect(
      validarMedidasCheckinAntropometrico(
        ALUMNO_ID,
        { pesoKg: '74.50', tricepsMm: '', brazoContraidoCm: '  ' },
        '2026-09-20'
      )
    ).toEqual({});
  });

  it('reporta el peso obligatorio cuando el campo está vacío', () => {
    const errores = validarMedidasCheckinAntropometrico(
      ALUMNO_ID,
      { pesoKg: '' },
      '2026-09-20'
    );
    expect(errores.pesoKg).toBeDefined();
  });
});

describe('obtenerUltimaMedicionReal (RF-003/D6: prefill honesto del check-in)', () => {
  it('devuelve la última evaluación (la serie llega en orden ascendente) con sus perímetros', () => {
    const medidas = obtenerUltimaMedicionReal({
      evaluaciones: [
        {
          pesoKg: '77.70',
          porcentajeGrasa: '17.20',
          perimetros: { cinturaCm: '85.00', brazoCm: '36.00' },
        },
        {
          pesoKg: '74.50',
          porcentajeGrasa: '14.80',
          perimetros: { cinturaCm: '81.00', brazoCm: '37.50' },
        },
      ],
    } as any);

    expect(medidas).toEqual({
      pesoKg: '74.50',
      porcentajeGrasa: '14.80',
      cinturaCm: '81.00',
      brazoCm: '37.50',
      brazoRelajadoCm: '37.50',
      brazoContraidoCm: '',
      musloMedioCm: '',
      tricepsMm: '',
      subescapularMm: '',
      suprailiacoMm: '',
      abdominalMm: '',
    });
  });

  it('precarga el modelo RN-02 y prefiere el campo nuevo sobre el alias legado', () => {
    const medidas = obtenerUltimaMedicionReal({
      evaluaciones: [
        {
          pesoKg: '74.50',
          perimetros: {
            brazoCm: '36.00',
            brazoRelajadoCm: '37.50',
            brazoContraidoCm: '40.10',
            musloMedioCm: '58.20',
          },
          pliegues: { tricepsMm: '12.00', abdominalMm: '14.20' },
        },
      ],
    } as any);

    expect(medidas?.brazoRelajadoCm).toBe('37.50');
    expect(medidas?.brazoCm).toBe('37.50');
    expect(medidas?.brazoContraidoCm).toBe('40.10');
    expect(medidas?.musloMedioCm).toBe('58.20');
    expect(medidas?.tricepsMm).toBe('12.00');
    expect(medidas?.abdominalMm).toBe('14.20');
    expect(medidas?.subescapularMm).toBe('');
  });

  it('devuelve null sin evaluaciones: el formulario queda vacío, sin fixtures', () => {
    expect(obtenerUltimaMedicionReal(null)).toBeNull();
    expect(obtenerUltimaMedicionReal({ evaluaciones: [] } as any)).toBeNull();
  });

  it('tolera campos opcionales ausentes sin inventar valores', () => {
    const medidas = obtenerUltimaMedicionReal({ evaluaciones: [{ pesoKg: '70.00' }] } as any);
    expect(medidas).toEqual({
      pesoKg: '70.00',
      porcentajeGrasa: '',
      cinturaCm: '',
      brazoCm: '',
      brazoRelajadoCm: '',
      brazoContraidoCm: '',
      musloMedioCm: '',
      tricepsMm: '',
      subescapularMm: '',
      suprailiacoMm: '',
      abdominalMm: '',
    });
  });
});

describe('fechaLocalHoy', () => {
  it('devuelve la fecha local en YYYY-MM-DD sin desfase UTC (America/Caracas por la noche)', () => {
    // 20/09/2026 a las 22:30 local: en UTC ya sería el día 21.
    expect(fechaLocalHoy(new Date(2026, 8, 20, 22, 30, 0))).toBe('2026-09-20');
  });

  it('rellena mes y día con cero a la izquierda', () => {
    expect(fechaLocalHoy(new Date(2026, 0, 5, 8, 0, 0))).toBe('2026-01-05');
  });
});

describe('RF-003 fotos: contrato compartido (contratos 1 y 2)', () => {
  const base = { alumnoId: ALUMNO_ID, fechaEvaluacion: '2026-09-20', pesoKg: '74.50' };

  it('contrato 1: rechaza dos fotos del mismo ángulo con MENSAJE_FOTOS_ANGULO_REPETIDO', () => {
    const resultado = CheckinAntropometricoSchema.safeParse({
      ...base,
      fotos: [fotoDe(AnguloFoto.FRONTAL, '-a'), fotoDe(AnguloFoto.FRONTAL, '-b')],
    });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues.map((issue) => issue.message)).toContain(
        MENSAJE_FOTOS_ANGULO_REPETIDO_ESPERADO
      );
    }
  });

  it('contrato 1: acepta 0, 1, 2 y 3 fotos de ángulos distintos', () => {
    expect(CheckinAntropometricoSchema.safeParse({ ...base, fotos: [] }).success).toBe(true);
    expect(
      CheckinAntropometricoSchema.safeParse({ ...base, fotos: [fotoDe(AnguloFoto.FRONTAL, '-1')] })
        .success
    ).toBe(true);
    expect(
      CheckinAntropometricoSchema.safeParse({
        ...base,
        fotos: [fotoDe(AnguloFoto.FRONTAL, '-1'), fotoDe(AnguloFoto.LATERAL, '-2')],
      }).success
    ).toBe(true);
    expect(
      CheckinAntropometricoSchema.safeParse({
        ...base,
        fotos: [
          fotoDe(AnguloFoto.FRONTAL, '-1'),
          fotoDe(AnguloFoto.LATERAL, '-2'),
          fotoDe(AnguloFoto.POSTERIOR, '-3'),
        ],
      }).success
    ).toBe(true);
  });

  it('contrato 1: acepta omitir fotos', () => {
    expect(CheckinAntropometricoSchema.safeParse(base).success).toBe(true);
  });

  it('contrato 2: exporta las constantes con el texto exacto', () => {
    const exportadas = contratosFotosShared as unknown as Record<string, unknown>;

    expect(exportadas.MENSAJE_FOTO_ANTROPOMETRIA_INVALIDA).toBe(
      MENSAJE_FOTO_ANTROPOMETRIA_INVALIDA_ESPERADO
    );
    expect(exportadas.MENSAJE_FOTOS_ANGULO_REPETIDO).toBe(MENSAJE_FOTOS_ANGULO_REPETIDO_ESPERADO);
  });
});
