// @vitest-environment jsdom
/**
 * UX-28: Tests RED para PRO-04 (aviso y bloqueo sin conexión en el check-in antropométrico, D9).
 *
 * Contratos:
 * - Sin conexión a internet (y fuera del modo demo), se muestra AvisoDatosOffline informando la falta de red.
 * - Sin conexión, el botón de envío queda deshabilitado y se muestra un mensaje explicativo.
 * - Con conexión a internet, el botón de envío no está bloqueado por red.
 * - En modo demo (isDemoMode: true), el check-in no se bloquea por falta de red (simulado en local).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { FormularioCheckinAntropometrico } from './FormularioCheckinAntropometrico';

vi.mock('../../antropometria/SelectorFotosCheckin', () => ({
  SelectorFotosCheckin: () => <div data-testid="selector-fotos" />,
}));

vi.mock('./AvisoVentanaCheckin', () => ({
  AvisoVentanaCheckin: () => <div data-testid="aviso-ventana" />,
}));

vi.mock('./CampoMedidaCheckin', () => ({
  CampoMedidaCheckin: ({ etiqueta, id }: any) => (
    <div>
      <label htmlFor={id}>{etiqueta}</label>
      <input id={id} />
    </div>
  ),
}));

vi.mock('./SeccionPlieguesCheckin', () => ({
  SeccionPlieguesCheckin: () => <div data-testid="seccion-pliegues" />,
}));

vi.mock('./PanelExitoCheckin', () => ({
  PanelExitoCheckin: () => <div data-testid="panel-exito" />,
}));

const mockMedidas = {
  pesoKg: '75.00',
  porcentajeGrasa: '',
  cinturaCm: '',
  brazoRelajadoCm: '',
  brazoContraidoCm: '',
  musloMedioCm: '',
  tricepsMm: '',
  subescapularMm: '',
  suprailiacoMm: '',
  abdominalMm: '',
};

const estadoVentanaPermitido = {
  aplica: false,
  permiteRegistrar: true,
  motivoBloqueo: null,
};

describe('FormularioCheckinAntropometrico — UX-28 (PRO-04: check-in sin conexión)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('sin conexión a internet, muestra AvisoDatosOffline en el formulario', () => {
    render(
      <FormularioCheckinAntropometrico
        medidas={mockMedidas}
        onCambiarMedida={vi.fn()}
        erroresMedidas={{}}
        intentoEnvio={false}
        estadoVentana={estadoVentanaPermitido as any}
        fotosSubiendo={false}
        isSubmitting={false}
        submitError={null}
        submitSuccess={false}
        isDemoMode={false}
        alumnoId="a1"
        claveFotos={1}
        onCambioFotos={vi.fn()}
        fotosDeshabilitadas={false}
        onSubmit={vi.fn()}
        isOnline={false}
      />
    );

    // Debe mostrar AvisoDatosOffline o aviso de estado sin conexión
    const avisoOffline = screen.getByText(/Sin conexión/i);
    expect(avisoOffline).not.toBeNull();
  });

  it('sin conexión a internet, deshabilita el botón de envío y explica el motivo', () => {
    render(
      <FormularioCheckinAntropometrico
        medidas={mockMedidas}
        onCambiarMedida={vi.fn()}
        erroresMedidas={{}}
        intentoEnvio={false}
        estadoVentana={estadoVentanaPermitido as any}
        fotosSubiendo={false}
        isSubmitting={false}
        submitError={null}
        submitSuccess={false}
        isDemoMode={false}
        alumnoId="a1"
        claveFotos={1}
        onCambioFotos={vi.fn()}
        fotosDeshabilitadas={false}
        onSubmit={vi.fn()}
        isOnline={false}
      />
    );

    const boton = screen.getByRole('button', { name: /Enviar a mi entrenador/i }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);

    const textoMotivo = screen.getByText(/Conéctate a internet para enviar tu evaluación/i);
    expect(textoMotivo).not.toBeNull();
  });

  it('con conexión a internet, el botón de envío no está bloqueado por red', () => {
    render(
      <FormularioCheckinAntropometrico
        medidas={mockMedidas}
        onCambiarMedida={vi.fn()}
        erroresMedidas={{}}
        intentoEnvio={false}
        estadoVentana={estadoVentanaPermitido as any}
        fotosSubiendo={false}
        isSubmitting={false}
        submitError={null}
        submitSuccess={false}
        isDemoMode={false}
        alumnoId="a1"
        claveFotos={1}
        onCambioFotos={vi.fn()}
        fotosDeshabilitadas={false}
        onSubmit={vi.fn()}
        isOnline={true}
      />
    );

    const boton = screen.getByRole('button', { name: /Enviar a mi entrenador/i }) as HTMLButtonElement;
    expect(boton.disabled).toBe(false);
    expect(screen.queryByText(/Sin conexión/i)).toBeNull();
  });

  it('en modo demo (isDemoMode: true), no bloquea el botón por falta de conexión', () => {
    render(
      <FormularioCheckinAntropometrico
        medidas={mockMedidas}
        onCambiarMedida={vi.fn()}
        erroresMedidas={{}}
        intentoEnvio={false}
        estadoVentana={estadoVentanaPermitido as any}
        fotosSubiendo={false}
        isSubmitting={false}
        submitError={null}
        submitSuccess={false}
        isDemoMode={true}
        alumnoId="demo-alumno"
        claveFotos={1}
        onCambioFotos={vi.fn()}
        fotosDeshabilitadas={false}
        onSubmit={vi.fn()}
        isOnline={false}
      />
    );

    const boton = screen.getByRole('button', { name: /Enviar a mi entrenador/i }) as HTMLButtonElement;
    expect(boton.disabled).toBe(false);
  });
});
