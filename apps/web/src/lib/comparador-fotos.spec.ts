import { describe, it, expect } from 'vitest';
import {
  AnguloFoto,
  EstadoMedicion,
  Modalidad,
  OrigenAntropometria,
  type ComparativaAngularDTO,
  type ControlAntropometricoDetalleDTO,
  type FotoAntropometriaDetalleDTO,
} from '@guachafit/shared';
import {
  ANGULOS_FOTO,
  angulosComparables,
  angulosDeControl,
  construirComparativa,
  etiquetaAngulo,
  formatearDiferencia,
  motivoAnguloNoDisponible,
  normalizarComparativaApi,
  posicionSliderValida,
} from './comparador-fotos';

function foto(controlId: string, angulo: AnguloFoto): FotoAntropometriaDetalleDTO {
  return {
    id: `${controlId}-${angulo}`,
    controlId,
    angulo,
    storageKey: `antropometria/demo/${controlId}/${angulo}.webp`,
    presignedGetUrl: `https://r2.example/${controlId}-${angulo}?firma=temporal`,
    createdAtUtc: '2026-09-01T10:00:00.000Z',
  };
}

function control(parcial: {
  id: string;
  fecha: string;
  peso: string;
  grasa?: string | null;
  angulos?: AnguloFoto[];
}): ControlAntropometricoDetalleDTO {
  return {
    id: parcial.id,
    alumnoId: 'a4444444-4444-4444-8444-444444444444',
    fechaEvaluacion: parcial.fecha,
    pesoKg: parcial.peso,
    porcentajeGrasa: parcial.grasa === undefined ? '20.00' : parcial.grasa,
    perimetros: { cinturaCm: '85.00' },
    modalidad: Modalidad.REMOTO,
    origen: OrigenAntropometria.REMOTO_AUTOREPORTE,
    registradoPor: 'a4444444-4444-4444-8444-444444444444',
    estado: EstadoMedicion.APROBADO,
    fotos: (parcial.angulos ?? []).map((angulo) => foto(parcial.id, angulo)),
    createdAtUtc: `${parcial.fecha}T10:00:00.000Z`,
    updatedAtUtc: `${parcial.fecha}T10:00:00.000Z`,
  };
}

const CONTROL_A = control({
  id: 'ctrl-a',
  fecha: '2026-01-10',
  peso: '86.00',
  grasa: '22.50',
  angulos: [AnguloFoto.FRONTAL, AnguloFoto.LATERAL],
});
const CONTROL_B = control({
  id: 'ctrl-b',
  fecha: '2026-03-05',
  peso: '81.50',
  grasa: '18.50',
  angulos: [AnguloFoto.FRONTAL, AnguloFoto.POSTERIOR],
});

describe('ángulos del comparador (RF-004 §6)', () => {
  it('lista los ángulos con foto de cada control en orden canónico', () => {
    expect(angulosDeControl(CONTROL_A)).toEqual([AnguloFoto.FRONTAL, AnguloFoto.LATERAL]);
    expect(angulosDeControl(null)).toEqual([]);
    expect(ANGULOS_FOTO).toEqual([AnguloFoto.FRONTAL, AnguloFoto.LATERAL, AnguloFoto.POSTERIOR]);
  });

  it('solo ofrece los ángulos presentes en AMBAS fechas', () => {
    expect(angulosComparables(CONTROL_A, CONTROL_B)).toEqual([AnguloFoto.FRONTAL]);
  });

  it('inhabilitar una perspectiva devuelve el aviso textual de §6', () => {
    expect(motivoAnguloNoDisponible(CONTROL_A, CONTROL_B, AnguloFoto.FRONTAL)).toBeNull();
    expect(motivoAnguloNoDisponible(CONTROL_A, CONTROL_B, AnguloFoto.LATERAL)).toBe(
      'Foto no disponible para esta fecha'
    );
    expect(motivoAnguloNoDisponible(CONTROL_A, CONTROL_B, AnguloFoto.POSTERIOR)).toBe(
      'Foto no disponible para esta fecha'
    );
  });

  it('usa etiquetas humanas, nunca el enum crudo', () => {
    expect(etiquetaAngulo(AnguloFoto.FRONTAL)).toBe('Frontal');
    expect(etiquetaAngulo(AnguloFoto.LATERAL)).toBe('Lateral');
    expect(etiquetaAngulo(AnguloFoto.POSTERIOR)).toBe('Posterior');
  });
});

describe('construirComparativa (misma aritmética que el servicio)', () => {
  it('con ambas fotos: disponible y deltas B − A', () => {
    const comparativa = construirComparativa(CONTROL_A, CONTROL_B, AnguloFoto.FRONTAL);
    expect(comparativa.fotoDisponible).toBe(true);
    expect(comparativa.diferenciaPesoKg).toBe('-4.50');
    expect(comparativa.diferenciaGrasaPorcentaje).toBe('-4.00');
    expect(comparativa.fotoA?.id).toBe('ctrl-a-frontal');
    expect(comparativa.fotoB?.id).toBe('ctrl-b-frontal');
  });

  it('sin foto en una fecha: no disponible (caso borde)', () => {
    const comparativa = construirComparativa(CONTROL_A, CONTROL_B, AnguloFoto.LATERAL);
    expect(comparativa.fotoDisponible).toBe(false);
    expect(comparativa.fotoB).toBeNull();
  });

  it('sin % de grasa en alguna fecha el delta es null (nunca NaN)', () => {
    const sinGrasa = control({ id: 'ctrl-c', fecha: '2026-03-05', peso: '81.50', grasa: null });
    const comparativa = construirComparativa(CONTROL_A, sinGrasa, AnguloFoto.FRONTAL);
    expect(comparativa.diferenciaGrasaPorcentaje).toBeNull();
  });
});

describe('normalizarComparativaApi (respuesta real del endpoint)', () => {
  it('deriva fotoDisponible cuando la API no lo envía (cachés previas)', () => {
    const respuesta: ComparativaAngularDTO = {
      angulo: AnguloFoto.FRONTAL,
      controlA: CONTROL_A,
      controlB: CONTROL_B,
      fotoA: foto('ctrl-a', AnguloFoto.FRONTAL),
      fotoB: foto('ctrl-b', AnguloFoto.FRONTAL),
      diferenciaPesoKg: '-4.50',
      diferenciaGrasaPorcentaje: '-4.00',
    };
    const normalizada = normalizarComparativaApi(respuesta);
    expect(normalizada.fotoDisponible).toBe(true);
    expect(normalizada.fotoA).not.toBeNull();
  });

  it('respeta fotoDisponible explícito y normaliza ausencias a null', () => {
    const normalizada = normalizarComparativaApi({
      angulo: AnguloFoto.LATERAL,
      controlA: CONTROL_A,
      controlB: CONTROL_B,
      fotoDisponible: false,
    });
    expect(normalizada.fotoDisponible).toBe(false);
    expect(normalizada.fotoA).toBeNull();
    expect(normalizada.fotoB).toBeNull();
    expect(normalizada.diferenciaPesoKg).toBeNull();
  });
});

describe('slider y formato de diferencias', () => {
  it('posicionSliderValida acota 0..100 y cae al centro con valores inválidos', () => {
    expect(posicionSliderValida(-10)).toBe(0);
    expect(posicionSliderValida(120)).toBe(100);
    expect(posicionSliderValida(42.6)).toBe(43);
    expect(posicionSliderValida(Number.NaN)).toBe(50);
  });

  it('formatearDiferencia agrega signo y unidad (o null sin dato)', () => {
    expect(formatearDiferencia('-3.20', 'kg')).toBe('-3.20 kg');
    expect(formatearDiferencia('1.2', 'kg')).toBe('+1.20 kg');
    expect(formatearDiferencia('-2.40', '%')).toBe('-2.40%');
    expect(formatearDiferencia(null, 'kg')).toBeNull();
    expect(formatearDiferencia('no-numero', 'kg')).toBeNull();
  });
});
