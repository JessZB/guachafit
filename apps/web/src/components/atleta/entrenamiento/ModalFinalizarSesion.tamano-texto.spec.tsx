// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { SesionEntrenamientoDetalleDTO } from '@guachafit/shared';
import { ModalFinalizarSesion } from './ModalFinalizarSesion';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ModalFinalizarSesion · tamaño de texto accesible y prevención de zoom iOS (contrato G)', () => {
  it('textarea de notas del entrenador usa text-base (16px) y no text-xs para evitar zoom en iOS', () => {
    const sesionMinima = {
      id: 'sesion-test',
      alumnoId: 'alumno-1',
      bloqueId: 'bloque-1',
      fechaProgramada: '2026-11-04',
      ejercicios: [],
    } as unknown as SesionEntrenamientoDetalleDTO;

    render(
      <ModalFinalizarSesion
        sesion={sesionMinima}
        rpeSesion={null}
        onRpeChange={vi.fn()}
        molestia=""
        onMolestiaChange={vi.fn()}
        notasCoachInput=""
        onNotasChange={vi.fn()}
        isFinishing={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    const textarea = screen.getByPlaceholderText(/Tuve que usar mancuernas/i);
    expect(textarea.className).toContain('text-base');
    expect(textarea.className).not.toContain('text-xs');
  });

  it('etiquetas de descanso planificado y diferencia usan text-xs y ya no usan text-[11px]', () => {
    const sesionConDescansos = {
      id: 'sesion-test',
      alumnoId: 'alumno-1',
      bloqueId: 'bloque-1',
      fechaProgramada: '2026-11-04',
      ejercicios: [
        {
          id: 'ej-1',
          sesionId: 'sesion-test',
          orden: 1,
          descansoPrescritoSegundos: 90,
          series: [
            {
              id: 's-1',
              ejercicioSesionId: 'ej-1',
              numeroSerie: 1,
              completada: true,
              descansoSegundos: 120,
            },
          ],
        },
      ],
    } as unknown as SesionEntrenamientoDetalleDTO;

    render(
      <ModalFinalizarSesion
        sesion={sesionConDescansos}
        rpeSesion={null}
        onRpeChange={vi.fn()}
        molestia=""
        onMolestiaChange={vi.fn()}
        notasCoachInput=""
        onNotasChange={vi.fn()}
        isFinishing={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    const etiquetaPlanificado = screen.getByText(/^Planificado:/i);
    expect(etiquetaPlanificado.className).toContain('text-xs');
    expect(etiquetaPlanificado.className).not.toContain('text-[11px]');

    const etiquetaDiferencia = screen.getByText(/\+30\s?s extra/i);
    expect(etiquetaDiferencia.className).toContain('text-xs');
    expect(etiquetaDiferencia.className).not.toContain('text-[11px]');
  });
});
