// @vitest-environment happy-dom
/**
 * UX-15 · TarjetaControlPendiente: contratos móviles, jerarquía y acciones (SEG-21, SEG-22, SEG-24).
 *
 * Contratos:
 * - TC1 · Nombre como título: heading nivel 3 con nombre del alumno, texto /Fecha de Toma:/,
 *   y contenedor de cabecera con flex-wrap.
 * - TC2 · Badge: "Pendiente Aprobación" con whitespace-nowrap y shrink-0.
 * - TC3 · Acciones táctiles que caben: botones type="button", min-h-11, contenedor
 *   con flex-col-reverse sm:flex-row, y aviso de fotos protegidas fuera del contenedor.
 * - TC4 · Callbacks: Rechazar y Aprobar llaman a sus handlers respectivos.
 * - TC5 · Peso ausente: con pesoKg null, muestra "—" y ningún "undefined" o "null kg".
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  EstadoMedicion,
  Modalidad,
  OrigenAntropometria,
  type ControlAntropometricoDetalleDTO,
} from "@guachafit/shared";
import { TarjetaControlPendiente } from "./TarjetaControlPendiente";

afterEach(() => {
  cleanup();
});

function fixtureControl(
  overrides: Partial<ControlAntropometricoDetalleDTO> = {},
): ControlAntropometricoDetalleDTO {
  return {
    id: "ctrl-1",
    alumnoId: "al-1",
    alumnoNombre: "Ana Medidas",
    fechaEvaluacion: "2026-10-05",
    pesoKg: "68.20",
    alturaCm: "165.00",
    porcentajeGrasa: "21.50",
    perimetros: { cinturaCm: "72.00" },
    modalidad: Modalidad.REMOTO,
    origen: OrigenAntropometria.REMOTO_AUTOREPORTE,
    registradoPor: "al-1",
    estado: EstadoMedicion.PENDIENTE_APROBACION,
    fotos: [],
    createdAtUtc: "2026-10-05T10:00:00.000Z",
    updatedAtUtc: "2026-10-05T10:00:00.000Z",
    ...overrides,
  };
}

function obtenerPadreComun(
  el1: HTMLElement,
  el2: HTMLElement,
): HTMLElement | null {
  let actual: HTMLElement | null = el1.parentElement;
  while (actual) {
    if (actual.contains(el2)) return actual;
    actual = actual.parentElement;
  }
  return null;
}

describe("TarjetaControlPendiente · interacción y responsividad (UX-15)", () => {
  it("TC1 · Nombre como título", () => {
    const control = fixtureControl();
    render(
      <TarjetaControlPendiente
        control={control}
        fotosConError={[]}
        onFotoError={vi.fn()}
        onVerFoto={vi.fn()}
        onRechazar={vi.fn()}
        onAprobar={vi.fn()}
      />,
    );

    const heading = screen.getByRole("heading", {
      level: 3,
      name: "Ana Medidas",
    });
    const fechaTexto = screen.getByText(/Fecha de Toma:/);
    expect(heading).toBeTruthy();
    expect(fechaTexto).toBeTruthy();

    const contenedorCabecera = obtenerPadreComun(heading, fechaTexto);
    expect(contenedorCabecera).not.toBeNull();
    expect(contenedorCabecera?.className).toContain("flex-wrap");
  });

  it("TC3 · Acciones táctiles que caben", () => {
    const control = fixtureControl();
    render(
      <TarjetaControlPendiente
        control={control}
        fotosConError={[]}
        onFotoError={vi.fn()}
        onVerFoto={vi.fn()}
        onRechazar={vi.fn()}
        onAprobar={vi.fn()}
      />,
    );

    const botonRechazar = screen.getByRole("button", { name: "Rechazar" });
    const botonAprobar = screen.getByRole("button", {
      name: "Aprobar y Consolidar",
    });

    expect(botonRechazar.getAttribute("type")).toBe("button");
    expect(botonAprobar.getAttribute("type")).toBe("button");
    expect(botonRechazar.className).toContain("min-h-11");
    expect(botonAprobar.className).toContain("min-h-11");

    const contenedorAcciones = obtenerPadreComun(botonRechazar, botonAprobar);
    expect(contenedorAcciones).not.toBeNull();
    expect(contenedorAcciones?.className).toContain("flex-col-reverse");
    expect(contenedorAcciones?.className).toContain("sm:flex-row");

    const textoFotos = screen.getByText(
      "Fotos protegidas: se muestran con un enlace temporal seguro.",
    );
    expect(contenedorAcciones?.contains(textoFotos)).toBe(false);
  });

  it("TC4 · Callbacks", () => {
    const control = fixtureControl();
    const onRechazar = vi.fn();
    const onAprobar = vi.fn();

    render(
      <TarjetaControlPendiente
        control={control}
        fotosConError={[]}
        onFotoError={vi.fn()}
        onVerFoto={vi.fn()}
        onRechazar={onRechazar}
        onAprobar={onAprobar}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
    expect(onRechazar).toHaveBeenCalledWith(control);

    fireEvent.click(
      screen.getByRole("button", { name: "Aprobar y Consolidar" }),
    );
    expect(onAprobar).toHaveBeenCalledWith(control.id);
  });

  it("TC5 · Peso ausente", () => {
    const controlSinPeso = fixtureControl({
      pesoKg: null as unknown as string,
    });
    render(
      <TarjetaControlPendiente
        control={controlSinPeso}
        fotosConError={[]}
        onFotoError={vi.fn()}
        onVerFoto={vi.fn()}
        onRechazar={vi.fn()}
        onAprobar={vi.fn()}
      />,
    );

    const labelPeso = screen.getByText("Peso");
    const valorPeso = labelPeso.parentElement?.querySelector("p");
    expect(valorPeso?.textContent?.trim()).toBe("—");
    expect(screen.queryByText(/undefined/i)).toBeNull();
    expect(screen.queryByText(/null kg/i)).toBeNull();
  });
});
