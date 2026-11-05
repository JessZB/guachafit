// @vitest-environment happy-dom
/**
 * Prompt 80 (Ola 3, modulo `antropometria`) - tests de caracterizacion.
 *
 * Fijan el comportamiento ACTUAL de la conciliacion de `AntropometriaPage` sobre el
 * codigo vigente (base `0660780`): aprobar, rechazar con motivo libre, errores honestos
 * (D5: la tarjeta no desaparece si el servidor no confirma) y modo demo local.
 *
 * Montaje identico al spec de cola (`QueryClientProvider` por caso, `MemoryRouter`,
 * `api-client` callable mockeado, `useAuth` con demo conmutable). R9: el mecanismo
 * de datos (TanStack Query via `usePaginacionServidor`) se conserva.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  EstadoMedicion,
  Modalidad,
  OrigenAntropometria,
  type ColaPendientesAntropometricosDTO,
  type ControlAntropometricoDetalleDTO,
} from "@guachafit/shared";

const MOTIVO = "Las fotos salieron borrosas; repite la toma con mejor luz.";

const sesionMock = vi.hoisted(() => ({ isDemoMode: false }));

vi.mock("../../context/auth-context", () => ({
  useAuth: () => ({
    user: {
      id: "e1111111-1111-4111-8111-111111111111",
      email: "coach@example.com",
      rol: "entrenador",
    },
    isDemoMode: sesionMock.isDemoMode,
  }),
}));

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return {
    ...actual,
    apiClient: Object.assign(vi.fn(), {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
      put: vi.fn(),
    }),
  };
});

import { apiClient } from "../../lib/api-client";
import { AntropometriaPage } from "./AntropometriaPage";

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function controlPendiente(
  overrides: Partial<ControlAntropometricoDetalleDTO> = {},
): ControlAntropometricoDetalleDTO {
  return {
    id: "ctrl-a",
    alumnoId: "al-ana",
    alumnoNombre: "Ana Medidas",
    fechaEvaluacion: "2026-10-10",
    pesoKg: "68.20",
    alturaCm: "165.00",
    porcentajeGrasa: "21.50",
    perimetros: { cinturaCm: "72.00" },
    modalidad: Modalidad.REMOTO,
    origen: OrigenAntropometria.REMOTO_AUTOREPORTE,
    registradoPor: "al-ana",
    estado: EstadoMedicion.PENDIENTE_APROBACION,
    fotos: [],
    createdAtUtc: "2026-10-10T10:00:00.000Z",
    updatedAtUtc: "2026-10-10T10:00:00.000Z",
    ...overrides,
  };
}

function respuestaCola(
  items: ControlAntropometricoDetalleDTO[],
): ColaPendientesAntropometricosDTO {
  return { items, total: items.length, limit: 25, offset: 0 };
}

// ---------------------------------------------------------------------------
// Estado mutable del mock + montaje
// ---------------------------------------------------------------------------

let errorConciliar: Error | null = null;
const clientesConsulta: QueryClient[] = [];

function montar(): void {
  const cliente = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clientesConsulta.push(cliente);
  render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter initialEntries={["/entrenador/antropometria"]}>
        <AntropometriaPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function esperarCola(): Promise<void> {
  await screen.findByText("Ana Medidas", undefined, { timeout: 4000 });
}

function cuerpoUltimoPatch(): unknown {
  const llamada = mockApi.mock.calls.find(([endpoint]) =>
    String(endpoint).includes("/conciliar"),
  );
  if (!llamada) throw new Error("No se llamó a PATCH .../conciliar");
  return JSON.parse(String(llamada[1]?.body));
}

function endpointUltimoPatch(): string {
  const llamada = mockApi.mock.calls.find(([endpoint]) =>
    String(endpoint).includes("/conciliar"),
  );
  if (!llamada) throw new Error("No se llamó a PATCH .../conciliar");
  return String(llamada[0]);
}

beforeEach(() => {
  sesionMock.isDemoMode = false;
  errorConciliar = null;

  mockApi.mockReset();
  mockApi.mockImplementation((endpoint: string) => {
    if (
      typeof endpoint === "string" &&
      endpoint.startsWith("/antropometria/pendientes?")
    ) {
      return Promise.resolve(respuestaCola([controlPendiente()]));
    }
    if (typeof endpoint === "string" && endpoint.includes("/conciliar")) {
      if (errorConciliar) return Promise.reject(errorConciliar);
      return Promise.resolve({ ok: true });
    }
    return Promise.resolve(null);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  for (const cliente of clientesConsulta.splice(0)) cliente.clear();
});

// ---------------------------------------------------------------------------
// 2. Conciliacion
// ---------------------------------------------------------------------------

describe("AntropometriaPage · caracterización: conciliación", () => {
  it("R1 · aprobar envía `{ accion: aprobar }` y muestra el éxito de consolidación", async () => {
    montar();
    await esperarCola();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Aprobar y Consolidar" })[0],
    );
    expect(
      await screen.findByText(
        "Evaluación aprobada y consolidada en las curvas del alumno.",
        undefined,
        {
          timeout: 4000,
        },
      ),
    ).toBeTruthy();
    expect(endpointUltimoPatch()).toBe("/antropometria/ctrl-a/conciliar");
    expect(cuerpoUltimoPatch()).toEqual({ accion: "aprobar" });
  });

  it("R2 · rechazar exige motivo: el confirmar nace deshabilitado y el PATCH lleva el motivo recortado", async () => {
    montar();
    await esperarCola();
    fireEvent.click(screen.getAllByRole("button", { name: "Rechazar" })[0]);
    expect(
      await screen.findByRole("dialog", undefined, { timeout: 4000 }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Rechazar evaluación" }),
    ).toBeTruthy();

    const confirmar = screen.getByRole("button", { name: "Confirmar rechazo" });
    expect(confirmar.getAttribute("disabled")).not.toBeNull();

    fireEvent.change(screen.getByLabelText("Motivo del rechazo"), {
      target: { value: MOTIVO },
    });
    expect(
      screen
        .getByRole("button", { name: "Confirmar rechazo" })
        .getAttribute("disabled"),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Confirmar rechazo" }));
    expect(
      await screen.findByText(
        "Evaluación rechazada: el motivo quedó registrado en el control.",
        undefined,
        {
          timeout: 4000,
        },
      ),
    ).toBeTruthy();
    expect(endpointUltimoPatch()).toBe("/antropometria/ctrl-a/conciliar");
    expect(cuerpoUltimoPatch()).toEqual({
      accion: "rechazar",
      motivoRechazo: MOTIVO,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), {
      timeout: 4000,
    });
  });

  it("R3 · si el rechazo falla, el motivo de error queda en el diálogo y este sigue abierto", async () => {
    errorConciliar = new Error("El servidor no responde");
    montar();
    await esperarCola();
    fireEvent.click(screen.getAllByRole("button", { name: "Rechazar" })[0]);
    await screen.findByRole("dialog", undefined, { timeout: 4000 });
    fireEvent.change(screen.getByLabelText("Motivo del rechazo"), {
      target: { value: MOTIVO },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar rechazo" }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("El servidor no responde")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.queryByText(/motivo quedó registrado/)).toBeNull();
  });

  it("R4 · si la aprobación falla, el error honesto aparece y la tarjeta sigue pendiente", async () => {
    errorConciliar = new Error("Sin conexión");
    montar();
    await esperarCola();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Aprobar y Consolidar" })[0],
    );

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Sin conexión")).toBeTruthy();
    expect(screen.getByText("Ana Medidas")).toBeTruthy();
    expect(screen.queryByText(/consolidada en las curvas/)).toBeNull();
  });

  it("R5 · en modo demo aprobar resuelve en local sin red y muestra el éxito", async () => {
    sesionMock.isDemoMode = true;
    montar();
    expect(
      await screen.findByText("Mariana Pérez Gómez", undefined, {
        timeout: 4000,
      }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Aprobar y Consolidar" })[0],
    );

    expect(
      await screen.findByText(
        "Evaluación aprobada y consolidada en las curvas del alumno.",
        undefined,
        {
          timeout: 4000,
        },
      ),
    ).toBeTruthy();
    await waitFor(
      () => expect(screen.queryByText("Mariana Pérez Gómez")).toBeNull(),
      {
        timeout: 4000,
      },
    );
    expect(screen.getByText("Luis Fernando Rojas")).toBeTruthy();
    const llamadasConciliar = mockApi.mock.calls.filter(([endpoint]) =>
      String(endpoint).includes("/conciliar"),
    );
    expect(llamadasConciliar).toHaveLength(0);
  });
});
