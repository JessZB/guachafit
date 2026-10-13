/**
 * Spec de logica pura de `lib/antropometria-conciliacion.ts` (sub-lote 1 del prompt 80).
 *
 * Fija el contrato extraido verbatim de `AntropometriaPage.handleConciliar`.
 */
import { describe, expect, it } from "vitest";
import {
  construirCuerpoConciliacionAntropometria,
  mensajeExitoConciliacionAntropometria,
  validarMotivoRechazoAntropometria,
} from "./antropometria-conciliacion";

describe("antropometria-conciliacion", () => {
  it("aprobar construye solo la accion, sin motivo", () => {
    expect(construirCuerpoConciliacionAntropometria("aprobar")).toEqual({
      accion: "aprobar",
    });
    expect(
      construirCuerpoConciliacionAntropometria("aprobar", "ignorado"),
    ).toEqual({
      accion: "aprobar",
    });
  });

  it("rechazar recorta el motivo libre", () => {
    expect(
      construirCuerpoConciliacionAntropometria("rechazar", "  Luz mala.  "),
    ).toEqual({
      accion: "rechazar",
      motivoRechazo: "Luz mala.",
    });
  });

  it("rechazar sin motivo deja el motivo vacio (la validacion lo frena antes)", () => {
    expect(construirCuerpoConciliacionAntropometria("rechazar")).toEqual({
      accion: "rechazar",
      motivoRechazo: "",
    });
  });

  it("el motivo vacio o en blanco devuelve el error que vera el coach", () => {
    expect(validarMotivoRechazoAntropometria()).toBe(
      "Escribe el motivo del rechazo: el alumno lo recibirá como retroalimentación.",
    );
    expect(validarMotivoRechazoAntropometria("   ")).toBe(
      "Escribe el motivo del rechazo: el alumno lo recibirá como retroalimentación.",
    );
  });

  it("el motivo con texto es valido", () => {
    expect(validarMotivoRechazoAntropometria("Fotos borrosas.")).toBeNull();
  });

  it("cada accion tiene su mensaje de exito", () => {
    expect(mensajeExitoConciliacionAntropometria("aprobar")).toBe(
      "Evaluación aprobada y consolidada en las curvas del alumno.",
    );
    expect(mensajeExitoConciliacionAntropometria("rechazar")).toBe(
      "Evaluación rechazada: el motivo quedó registrado en el control.",
    );
  });
});
