// @vitest-environment happy-dom
/**
 * Lote E4 (RF-001) · contrato C2: vista previa de solo lectura antes de iniciar.
 *
 * Fase roja: el componente `./VistaPreviaSesion` aún no existe. El spec fija el contrato:
 * encabezado "Tu plan de hoy" + resumen, una lista con un ítem por ejercicio (nombre y
 * prescripción compacta), CERO inputs, botón "Iniciar entrenamiento" (con estado `iniciando`)
 * y ninguna etiqueta tipográfica de 10/11 px.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import {
  EstadoSesion,
  type EjercicioSesionDetalleDTO,
  type SerieRegistroDetalleDTO,
  type SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';
import { VistaPreviaSesion } from './VistaPreviaSesion';

function serie(parcial: Partial<SerieRegistroDetalleDTO> = {}): SerieRegistroDetalleDTO {
  return {
    id: 's-1',
    ejercicioSesionId: 'es-1',
    numeroSerie: 1,
    repsObjetivo: 10,
    repsLogradas: null,
    pesoKg: null,
    pesoPrescritoKg: null,
    rpe: null,
    descansoSegundos: 90,
    completada: false,
    ...parcial,
  };
}

function ejercicio(
  id: string,
  nombre: string,
  series: SerieRegistroDetalleDTO[],
  orden: number
): EjercicioSesionDetalleDTO {
  return {
    id,
    sesionId: 'sesion-1',
    ejercicioId: `ej-${id}`,
    orden,
    ejercicio: {
      id: `ej-${id}`,
      nombre,
      grupoMuscular: 'General',
      activo: true,
      createdAtUtc: '2026-10-01T00:00:00.000Z',
    },
    series,
  };
}

/** 2 ejercicios / 3 series: resumen "2 ejercicios · 3 series". */
const SESION: SesionEntrenamientoDetalleDTO = {
  id: 'sesion-1',
  alumnoId: 'alumno-1',
  fechaProgramada: '2026-10-11',
  timezoneCliente: 'America/Caracas',
  estado: EstadoSesion.PLANIFICADA,
  porcentajeCumplimiento: '0.00',
  ejercicios: [
    ejercicio(
      'es-1',
      'Press de banca',
      [
        serie({ id: 'es-1-s1', ejercicioSesionId: 'es-1', numeroSerie: 1, pesoPrescritoKg: '60.00' }),
        serie({ id: 'es-1-s2', ejercicioSesionId: 'es-1', numeroSerie: 2, pesoPrescritoKg: '60.00' }),
      ],
      1
    ),
    ejercicio(
      'es-2',
      'Remo con barra',
      [serie({ id: 'es-2-s1', ejercicioSesionId: 'es-2', numeroSerie: 1, repsObjetivo: 12 })],
      2
    ),
  ],
  createdAtUtc: '2026-10-01T00:00:00.000Z',
  updatedAtUtc: '2026-10-01T00:00:00.000Z',
};

/** Igual que SESION, pero el primer ejercicio tiene video de técnica en el catálogo. */
const SESION_CON_VIDEO: SesionEntrenamientoDetalleDTO = {
  ...SESION,
  ejercicios: [
    {
      ...SESION.ejercicios[0],
      ejercicio: {
        ...SESION.ejercicios[0].ejercicio!,
        videoUrl: 'https://videos.example.com/press-de-banca.mp4',
      },
    },
    SESION.ejercicios[1],
  ],
};

afterEach(() => {
  cleanup();
});

describe('VistaPreviaSesion · vista previa de solo lectura (C2)', () => {
  it('muestra el encabezado "Tu plan de hoy" y el resumen de la sesión', () => {
    render(<VistaPreviaSesion sesion={SESION} unidadPeso="kg" onIniciar={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Tu plan de hoy' })).toBeTruthy();
    expect(screen.getByText('2 ejercicios · 3 series')).toBeTruthy();
  });

  it('muestra una lista con un ítem por ejercicio: su nombre y su prescripción compacta', () => {
    render(
      <VistaPreviaSesion
        sesion={SESION}
        unidadPeso="kg"
        rpeSugeridoPorEjercicio={{ 'es-1': '8.0' }}
        onIniciar={vi.fn()}
      />
    );

    const lista = screen.getByRole('list');
    const items = within(lista).getAllByRole('listitem');

    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('Press de banca');
    expect(items[0].textContent).toContain('2 × 10 · 60 kg');
    expect(items[0].textContent).toContain('Esfuerzo 8');
    expect(items[1].textContent).toContain('Remo con barra');
    expect(items[1].textContent).toContain('1 × 12');
  });

  it('no renderiza ningún input: ni textbox ni spinbutton', () => {
    render(<VistaPreviaSesion sesion={SESION} unidadPeso="kg" onIniciar={vi.fn()} />);

    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0);
  });

  it('el botón "Iniciar entrenamiento" llama a onIniciar una vez', () => {
    const onIniciar = vi.fn();
    render(<VistaPreviaSesion sesion={SESION} unidadPeso="kg" onIniciar={onIniciar} />);

    fireEvent.click(screen.getByRole('button', { name: 'Iniciar entrenamiento' }));

    expect(onIniciar).toHaveBeenCalledTimes(1);
  });

  it('con iniciando=true el botón queda deshabilitado, con aria-busy y texto "Iniciando…"', () => {
    render(<VistaPreviaSesion sesion={SESION} unidadPeso="kg" onIniciar={vi.fn()} iniciando />);

    const boton = screen.getByRole('button', { name: /Iniciando/ }) as HTMLButtonElement;

    expect(boton.disabled).toBe(true);
    expect(boton.getAttribute('aria-busy')).toBe('true');
    expect(boton.textContent).toContain('Iniciando…');
  });

  it('ningún elemento del árbol usa text-[11px] ni text-[10px]', () => {
    const { container } = render(<VistaPreviaSesion sesion={SESION} unidadPeso="kg" onIniciar={vi.fn()} />);

    const elementos = [container, ...Array.from(container.querySelectorAll('*'))];
    for (const elemento of elementos) {
      const clase = typeof elemento.className === 'string' ? elemento.className : '';
      expect(clase).not.toContain('text-[11px]');
      expect(clase).not.toContain('text-[10px]');
    }
  });

  it('con error="No se pudo iniciar" hay un role="alert" con ese texto', () => {
    render(
      <VistaPreviaSesion
        sesion={SESION}
        unidadPeso="kg"
        onIniciar={vi.fn()}
        error="No se pudo iniciar"
      />
    );

    const alerta = screen.getByRole('alert');
    expect(alerta.textContent).toContain('No se pudo iniciar');
  });

  it('con onVerTecnica y videoUrl, "Ver técnica de {nombre}" llama a onVerTecnica con ese ejercicio', () => {
    const onVerTecnica = vi.fn();
    render(
      <VistaPreviaSesion
        sesion={SESION_CON_VIDEO}
        unidadPeso="kg"
        onIniciar={vi.fn()}
        onVerTecnica={onVerTecnica}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ver técnica de Press de banca' }));

    expect(onVerTecnica).toHaveBeenCalledTimes(1);
    expect(onVerTecnica).toHaveBeenCalledWith(SESION_CON_VIDEO.ejercicios[0]);
  });

  it('sin videoUrl no aparece el botón "Ver técnica"', () => {
    render(
      <VistaPreviaSesion sesion={SESION} unidadPeso="kg" onIniciar={vi.fn()} onVerTecnica={vi.fn()} />
    );

    expect(screen.queryByRole('button', { name: /^Ver técnica/ })).toBeNull();
  });
});
