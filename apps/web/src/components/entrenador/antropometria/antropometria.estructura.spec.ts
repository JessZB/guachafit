/**
 * UX-15 · Antropometría: contratos de estructura y componentes compartidos (SEG-20, SEG-21, SEG-22, SEG-23).
 *
 * Contratos:
 * - AE0 · Cordura: AntropometriaPage.tsx, ColaPendientesAntropometria.tsx y TarjetaControlPendiente.tsx
 *   no están vacíos y contienen su export function.
 * - AE1 · AntropometriaPage.tsx no contiene setTimeout.
 * - AE2 · ColaPendientesAntropometria.tsx contiene EstadoVacio y no contiene p-12.
 * - AE3 · TarjetaControlPendiente.tsx contiene BotonTactil y BadgeEstado.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup } from "@testing-library/react";

import codigoAntropometriaPage from "../../../pages/entrenador/AntropometriaPage.tsx?raw";
import codigoColaPendientes from "./ColaPendientesAntropometria.tsx?raw";
import codigoTarjetaControl from "./TarjetaControlPendiente.tsx?raw";

afterEach(() => {
  cleanup();
});

describe("Antropometría · contratos de estructura (UX-15)", () => {
  it("AE0 · Cordura", () => {
    expect(codigoAntropometriaPage.trim().length).toBeGreaterThan(0);
    expect(codigoAntropometriaPage).toContain(
      "export function AntropometriaPage",
    );

    expect(codigoColaPendientes.trim().length).toBeGreaterThan(0);
    expect(codigoColaPendientes).toContain(
      "export function ColaPendientesAntropometria",
    );

    expect(codigoTarjetaControl.trim().length).toBeGreaterThan(0);
    expect(codigoTarjetaControl).toContain(
      "export function TarjetaControlPendiente",
    );
  });

  it("AE1 · AntropometriaPage no contiene setTimeout", () => {
    expect(codigoAntropometriaPage).not.toContain("setTimeout");
  });

  it("AE2 · ColaPendientesAntropometria contiene EstadoVacio y no contiene p-12", () => {
    expect(codigoColaPendientes).toContain("EstadoVacio");
    expect(codigoColaPendientes).not.toContain("p-12");
  });

  it("AE3 · TarjetaControlPendiente contiene BotonTactil y BadgeEstado", () => {
    expect(codigoTarjetaControl).toContain("BotonTactil");
    expect(codigoTarjetaControl).toContain("BadgeEstado");
  });
});
