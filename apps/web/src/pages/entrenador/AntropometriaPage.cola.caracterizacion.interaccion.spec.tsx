// @vitest-environment jsdom
/**
 * Prompt 80 (Ola 3, modulo `antropometria`) - tests de caracterizacion.
 *
 * Fijan el comportamiento ACTUAL de `AntropometriaPage` (pestana de cola) sobre el
 * codigo vigente (base `0660780`): describen lo que hay, no lo que deberia haber.
 * Si un comportamiento parece un bug, se caracteriza tal cual y se reporta como
 * WARNING en `.opencode-prompts/reportes/antropometria/80-antropometria-validacion.reporte.md`
 * (nunca se corrige aqui).
 *
 * Montaje: la pagina usa `usePaginacionServidor` (TanStack Query, R9) y por eso SI
 * lleva `QueryClientProvider` (cliente por caso, `retry: false`), `MemoryRouter` y
 * `api-client` parcialmente mockeado (callable); `useAuth` mockeado con demo conmutable.
 * Patron copiado de `MonitorAdherenciaPage.caracterizacion.interaccion.spec.tsx`.
 *
 * Selectores solo por rol/label/texto accesible (R5: deben sobrevivir al refactor).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  EstadoMedicion,
  Modalidad,
  OrigenAntropometria,
  type ColaPendientesAntropometricosDTO,
  type ControlAntropometricoDetalleDTO,
} from "@guachafit/shared";

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
    id: "ctrl-1",
    alumnoId: "al-1",
    alumnoNombre: "Ana Medidas",
    fechaEvaluacion: "2026-10-10",
    pesoKg: "68.20",
    alturaCm: "165.00",
    porcentajeGrasa: "21.50",
    perimetros: { cinturaCm: "72.00" },
    modalidad: Modalidad.REMOTO,
    origen: OrigenAntropometria.REMOTO_AUTOREPORTE,
    registradoPor: "al-1",
    estado: EstadoMedicion.PENDIENTE_APROBACION,
    fotos: [],
    createdAtUtc: "2026-10-10T10:00:00.000Z",
    updatedAtUtc: "2026-10-10T10:00:00.000Z",
    ...overrides,
  };
}

const CONTROL_A = () =>
  controlPendiente({
    id: "ctrl-a",
    alumnoId: "al-ana",
    alumnoNombre: "Ana Medidas",
    pesoKg: "68.20",
  });

const CONTROL_B = () =>
  controlPendiente({
    id: "ctrl-b",
    alumnoId: "al-beto",
    alumnoNombre: "Beto Bascula",
    fechaEvaluacion: "2026-10-08",
    pesoKg: "82.40",
    porcentajeGrasa: null,
    perimetros: null,
  });

function respuestaCola(
  items: ControlAntropometricoDetalleDTO[],
): ColaPendientesAntropometricosDTO {
  return { items, total: items.length, limit: 25, offset: 0 };
}

// ---------------------------------------------------------------------------
// Estado mutable del mock + montaje
// ---------------------------------------------------------------------------

let colaActual: ColaPendientesAntropometricosDTO = respuestaCola([
  CONTROL_A(),
  CONTROL_B(),
]);
let errorCola: Error | null = null;
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

/** Espera a que la cola pinte la tarjeta de Ana (carga lista). */
async function esperarCola(): Promise<void> {
  await screen.findByText("Ana Medidas", undefined, { timeout: 4000 });
}

beforeEach(() => {
  sesionMock.isDemoMode = false;
  colaActual = respuestaCola([CONTROL_A(), CONTROL_B()]);
  errorCola = null;

  mockApi.mockReset();
  mockApi.mockImplementation((endpoint: string) => {
    if (
      typeof endpoint === "string" &&
      endpoint.startsWith("/antropometria/pendientes?")
    ) {
      if (errorCola) return Promise.reject(errorCola);
      return Promise.resolve(colaActual);
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
// 1. Cabecera, lista y estados
// ---------------------------------------------------------------------------

describe("AntropometriaPage · caracterización: cabecera, cola y estados", () => {
  it("C1 · renderiza el título, el subtítulo y las dos pestañas con el conteo del servidor", async () => {
    montar();
    expect(
      await screen.findByRole("heading", { name: "Evaluaciones Físicas" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Revisa las medidas y fotos de progreso que subieron tus alumnos.",
      ),
    ).toBeTruthy();
    expect(
      await screen.findByRole("tab", { name: "Por revisar: 2 pendientes" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("tab", { name: "Comparar" }),
    ).toBeTruthy();
  });

  it("C2 · pinta una tarjeta por control con alumno, fecha, badge y medidas", async () => {
    montar();
    await esperarCola();
    expect(screen.getByText("Beto Bascula")).toBeTruthy();
    expect(screen.getAllByText("Pendiente Aprobación")).toHaveLength(2);
    expect(screen.getAllByText(/Fecha de Toma:/)).toHaveLength(2);
    expect(screen.getByText("68.20 kg")).toBeTruthy();
    expect(screen.getByText("82.40 kg")).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "Aprobar y Consolidar" }),
    ).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Rechazar" })).toHaveLength(2);
  });

  it("C3 · con la cola vacía muestra el vacío honesto sin buscador", async () => {
    colaActual = respuestaCola([]);
    montar();
    expect(
      await screen.findByRole("heading", {
        name: "Sin evaluaciones pendientes",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Todos los check-ins antropométricos remotos han sido validados.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByLabelText("Buscar evaluación pendiente por alumno"),
    ).toBeNull();
  });

  it("C4 · la búsqueda filtra client-side sobre la página y declara su alcance", async () => {
    montar();
    await esperarCola();
    expect(screen.getByText(/Mostrando 2 de 2 en esta página/)).toBeTruthy();

    fireEvent.change(
      screen.getByLabelText("Buscar evaluación pendiente por alumno"),
      {
        target: { value: "beto" },
      },
    );
    expect(screen.getByText(/Mostrando 1 de 2 en esta página/)).toBeTruthy();
    expect(screen.queryByText("Ana Medidas")).toBeNull();
    expect(screen.getByText("Beto Bascula")).toBeTruthy();
  });

  it('C5 · sin coincidencias muestra "Sin resultados" y limpiar restaura la lista', async () => {
    montar();
    await esperarCola();
    fireEvent.change(
      screen.getByLabelText("Buscar evaluación pendiente por alumno"),
      {
        target: { value: "nadie" },
      },
    );
    expect(
      await screen.findByRole("heading", { name: "Sin resultados" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Ninguna evaluación pendiente coincide con la búsqueda.",
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Limpiar búsqueda" }));
    await esperarCola();
    expect(screen.getByText("Beto Bascula")).toBeTruthy();
  });

  it("C6 · si la carga falla muestra el error con reintento que recarga", async () => {
    errorCola = new Error("Fallo de red");
    montar();
    expect(
      await screen.findByText("Fallo de red", undefined, { timeout: 4000 }),
    ).toBeTruthy();

    errorCola = null;
    const llamadasAntes = mockApi.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await esperarCola();
    expect(mockApi.mock.calls.length).toBeGreaterThan(llamadasAntes);
  });

  it("C7 · la pestaña comparador oculta la cola y muestra el comparador", async () => {
    montar();
    await esperarCola();
    fireEvent.click(
      screen.getByRole("tab", { name: "Comparar" }),
    );
    expect(
      await screen.findByRole("heading", {
        name: "Comparador Antes / Después",
      }),
    ).toBeTruthy();
    expect(screen.queryByText("Ana Medidas")).toBeNull();
  });

  it("C8 · en modo demo pinta la cola sintética local sin llamar a la red", async () => {
    sesionMock.isDemoMode = true;
    montar();
    expect(
      await screen.findByText("Mariana Pérez Gómez", undefined, {
        timeout: 4000,
      }),
    ).toBeTruthy();
    expect(screen.getByText("Luis Fernando Rojas")).toBeTruthy();
    const llamadasCola = mockApi.mock.calls.filter(([endpoint]) =>
      String(endpoint).startsWith("/antropometria/pendientes?"),
    );
    expect(llamadasCola).toHaveLength(0);
  });
});
