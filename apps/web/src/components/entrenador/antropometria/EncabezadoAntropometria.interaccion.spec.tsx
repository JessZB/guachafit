// @vitest-environment jsdom
/**
 * UX-15 · EncabezadoAntropometria: contratos táctiles y accesibles (SEG-20).
 *
 * Contratos:
 * - EA1 · Pestañas accesibles: tablist con nombre "Secciones de evaluaciones",
 *   tabs con nombres exactos "Por revisar: 2 pendientes" y "Comparar",
 *   aria-selected correcto y min-h-11.
 * - EA2 · Teclado: flechas de navegación APG (ArrowRight) y clic activan callback.
 * - EA3 · Singular y conteo visible: totalPendientes={1} produce "Por revisar: 1 pendiente"
 *   con el número visible como texto.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EncabezadoAntropometria } from "./EncabezadoAntropometria";

afterEach(() => {
  cleanup();
});

describe("EncabezadoAntropometria · interacción y accesibilidad (UX-15)", () => {
  it("EA1 · Pestañas accesibles", () => {
    render(
      <EncabezadoAntropometria
        pestanaActiva="pendientes"
        totalPendientes={2}
        onCambiarPestana={vi.fn()}
      />,
    );

    const tablist = screen.getByRole("tablist", {
      name: "Secciones de evaluaciones",
    });
    expect(tablist).toBeTruthy();

    const tabPendientes = screen.getByRole("tab", {
      name: "Por revisar: 2 pendientes",
    });
    const tabComparar = screen.getByRole("tab", { name: "Comparar" });

    expect(tabPendientes).toBeTruthy();
    expect(tabComparar).toBeTruthy();

    expect(tabPendientes.getAttribute("aria-selected")).toBe("true");
    expect(tabComparar.getAttribute("aria-selected")).toBe("false");

    expect(tabPendientes.className).toContain("min-h-11");
    expect(tabComparar.className).toContain("min-h-11");
  });

  it("EA2 · Teclado", () => {
    const onCambiarPestana = vi.fn();
    render(
      <EncabezadoAntropometria
        pestanaActiva="pendientes"
        totalPendientes={2}
        onCambiarPestana={onCambiarPestana}
      />,
    );

    const tabActivo = screen.getByRole("tab", {
      name: "Por revisar: 2 pendientes",
    });
    fireEvent.keyDown(tabActivo, { key: "ArrowRight" });
    expect(onCambiarPestana).toHaveBeenCalledWith("comparador");

    const tabComparar = screen.getByRole("tab", { name: "Comparar" });
    fireEvent.click(tabComparar);
    expect(onCambiarPestana).toHaveBeenCalledWith("comparador");
  });

  it("EA3 · Singular y conteo visible", () => {
    render(
      <EncabezadoAntropometria
        pestanaActiva="pendientes"
        totalPendientes={1}
        onCambiarPestana={vi.fn()}
      />,
    );

    const tab = screen.getByRole("tab", {
      name: "Por revisar: 1 pendiente",
    });
    expect(tab).toBeTruthy();
    expect(tab.textContent).toContain("1");
  });
});
