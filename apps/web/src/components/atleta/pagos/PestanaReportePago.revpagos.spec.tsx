// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PestanaReportePago } from './PestanaReportePago';

afterEach(() => {
  cleanup();
});

describe('components/atleta/pagos/PestanaReportePago · motivo de rechazo en corrección (D15)', () => {
  it('P11: con motivoRechazo muestra la etiqueta y el texto; con null, espacios o ausente no muestra ningún elemento con «Motivo del entrenador»', () => {
    // 1. Con motivoRechazo no vacío
    const { unmount: unmount1 } = render(
      <PestanaReportePago
        onVolver={vi.fn()}
        formError={null}
        formSuccess={null}
        {...({ motivoRechazo: 'Comprobante borroso' } as any)}
      >
        <div>Contenido formulario</div>
      </PestanaReportePago>
    );

    expect(screen.getByText(/Motivo del entrenador:/i)).not.toBeNull();
    expect(document.body.textContent).toContain('Comprobante borroso');
    unmount1();

    // 2. Con null
    const { unmount: unmount2 } = render(
      <PestanaReportePago
        onVolver={vi.fn()}
        formError={null}
        formSuccess={null}
        {...({ motivoRechazo: null } as any)}
      >
        <div>Contenido formulario</div>
      </PestanaReportePago>
    );
    expect(screen.queryByText(/Motivo del entrenador/i)).toBeNull();
    unmount2();

    // 3. Con espacios en blanco
    const { unmount: unmount3 } = render(
      <PestanaReportePago
        onVolver={vi.fn()}
        formError={null}
        formSuccess={null}
        {...({ motivoRechazo: '   ' } as any)}
      >
        <div>Contenido formulario</div>
      </PestanaReportePago>
    );
    expect(screen.queryByText(/Motivo del entrenador/i)).toBeNull();
    unmount3();
  });
});
