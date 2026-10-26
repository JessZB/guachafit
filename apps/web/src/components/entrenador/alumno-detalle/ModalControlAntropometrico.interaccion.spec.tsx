// @vitest-environment jsdom
/**
 * Ficha del alumno · `ModalControlAntropometrico` (fase roja L3.1–L3.3).
 *
 * Contratos que fija este spec:
 * - L3.1: `getByLabelText` encuentra las seis medidas; dos modales simultáneos no repiten `id`.
 * - L3.2: las seis medidas abren el teclado decimal (`inputMode="decimal"`).
 * - L3.3: el botón de cerrar conserva su `aria-label` y gana `min-h-11 min-w-11`.
 *
 * El modal se monta con un `RetornoCheckinAntropometrico` de prueba y `demo` activo: no sube fotos
 * ni guarda nada.
 */
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ModalControlAntropometrico } from './ModalControlAntropometrico';
import type { RetornoCheckinAntropometrico } from './use-checkin-antropometrico';

const MEDIDAS = [
  'Peso (kg)',
  '% Grasa Corporal',
  'Cintura (cm)',
  'Brazo Relajado (cm)',
  'Pecho (cm)',
  'Muslo Medio (cm)',
] as const;

function checkinAntropometrico(
  overrides: Partial<RetornoCheckinAntropometrico> = {}
): RetornoCheckinAntropometrico {
  return {
    isAntroModalOpen: true,
    setIsAntroModalOpen: vi.fn(),
    antroPeso: '78.50',
    setAntroPeso: vi.fn(),
    antroGrasa: '16.2',
    setAntroGrasa: vi.fn(),
    antroCintura: '82.0',
    setAntroCintura: vi.fn(),
    antroBrazo: '37.5',
    setAntroBrazo: vi.fn(),
    antroPecho: '102.0',
    setAntroPecho: vi.fn(),
    antroMuslo: '58.0',
    setAntroMuslo: vi.fn(),
    isSavingAntro: false,
    fotosAntro: { fotos: [], subiendo: false },
    setFotosAntro: vi.fn(),
    antroErrorMsg: null,
    setAntroErrorMsg: vi.fn(),
    abrirCheckin: vi.fn(),
    guardarCheckin: async () => {},
    ...overrides,
  };
}

function elementoModal(overrides: Partial<RetornoCheckinAntropometrico> = {}) {
  return (
    <ModalControlAntropometrico
      checkin={checkinAntropometrico(overrides)}
      demo
      usuarioId="usuario-1"
      refDialogo={createRef<HTMLDivElement>()}
    />
  );
}

function renderModal(overrides: Partial<RetornoCheckinAntropometrico> = {}) {
  return render(elementoModal(overrides));
}

afterEach(() => {
  cleanup();
});

describe('ModalControlAntropometrico · L3.1 etiquetas asociadas', () => {
  it.each(MEDIDAS)('asocia «%s» a su control', (etiqueta) => {
    renderModal();

    const control = screen.getByLabelText(etiqueta);
    expect(control.tagName).toBe('INPUT');
  });

  it('genera ids únicos cuando hay dos modales montados a la vez', () => {
    render(
      <>
        {elementoModal()}
        {elementoModal()}
      </>
    );

    for (const etiqueta of MEDIDAS) {
      const controles = screen.getAllByLabelText(etiqueta);
      expect(controles).toHaveLength(2);
      const ids = controles.map((control) => control.id);
      expect(ids.every((id) => id.length > 0)).toBe(true);
      expect(new Set(ids).size).toBe(2);
    }
  });
});

describe('ModalControlAntropometrico · L3.2 teclado numérico', () => {
  it.each(MEDIDAS)('«%s» abre el teclado decimal', (etiqueta) => {
    renderModal();

    expect(screen.getByLabelText(etiqueta).getAttribute('inputmode')).toBe('decimal');
  });
});

describe('ModalControlAntropometrico · L3.3 altura táctil', () => {
  it('el botón de cerrar conserva su aria-label y su área táctil mínima', () => {
    renderModal();

    const cerrar = screen.getByRole('button', { name: 'Cerrar control antropométrico' });
    expect(cerrar.classList.contains('min-h-11')).toBe(true);
    expect(cerrar.classList.contains('min-w-11')).toBe(true);
  });
});
