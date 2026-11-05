// @vitest-environment happy-dom
/**
 * UX-15 · AntropometriaPage: contratos de carga honesta, avisos y accesibilidad (SEG-20, SEG-22, SEG-23).
 *
 * Contratos:
 * - AP1 · Éxito anunciado y cerrable: role="status", texto de éxito y botón "Cerrar aviso".
 * - AP2 · Error de carga con EstadoError: heading nivel 2 "No pudimos cargar las evaluaciones", mensaje del fallo y Reintentar.
 * - AP3 · El error no bloquea el comparador: al pulsar "Comparar" se ve el comparador y no el error de la cola.
 * - AP4 · Paneles: tabpanel con nombre accesible "Por revisar: 2 pendientes" conteniendo a Ana Medidas.
 * - AP5 · Sin conexión: status "Sin conexión · datos guardados" tras desconectar con datos, y status "Sin conexión y sin datos guardados" sin el error genérico.
 * - AP6 · Buscador accesible: placeholder "Buscar en esta página…" y clases min-h-11 text-base sm:text-xs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import {
  EstadoMedicion,
  Modalidad,
  OrigenAntropometria,
  type ColaPendientesAntropometricosDTO,
  type ControlAntropometricoDetalleDTO,
} from "@guachafit/shared";

vi.setConfig({ testTimeout: 20000 });

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
    pesoKg: "82.40",
  });

function respuestaCola(
  items: ControlAntropometricoDetalleDTO[],
): ColaPendientesAntropometricosDTO {
  return { items, total: items.length, limit: 25, offset: 0 };
}

let colaActual: ColaPendientesAntropometricosDTO = respuestaCola([
  CONTROL_A(),
  CONTROL_B(),
]);
let errorCola: Error | null = null;
const clientesConsulta: QueryClient[] = [];

function simularConexion(enLinea: boolean): void {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    get: () => enLinea,
  });
}

function montar(): void {
  const cliente = new QueryClient({
    defaultOptions: { queries: { retry: false, networkMode: "always" } },
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

beforeEach(() => {
  sesionMock.isDemoMode = false;
  colaActual = respuestaCola([CONTROL_A(), CONTROL_B()]);
  errorCola = null;
  simularConexion(true);
  onlineManager.setOnline(true);

  mockApi.mockReset();
  mockApi.mockImplementation((endpoint: string) => {
    if (
      typeof endpoint === "string" &&
      endpoint.startsWith("/antropometria/pendientes?")
    ) {
      if (errorCola) return Promise.reject(errorCola);
      return Promise.resolve(colaActual);
    }
    if (typeof endpoint === "string" && endpoint.includes("/conciliar")) {
      return Promise.resolve({ ok: true });
    }
    return Promise.resolve(null);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  simularConexion(true);
  onlineManager.setOnline(true);
  window.dispatchEvent(new Event("online"));
  for (const cliente of clientesConsulta.splice(0)) cliente.clear();
});

describe("AntropometriaPage · contratos UX-15", () => {
  it("AP1 · Éxito anunciado y cerrable", async () => {
    montar();
    await esperarCola();

    const botonAprobar = screen.getAllByRole("button", {
      name: "Aprobar y Consolidar",
    })[0];
    fireEvent.click(botonAprobar);

    let status: HTMLElement | undefined;
    await waitFor(
      () => {
        const estados = screen.queryAllByRole("status");
        status = estados.find((el) =>
          el.textContent?.includes(
            "Evaluación aprobada y consolidada en las curvas del alumno.",
          ),
        );
        expect(
          status,
          'debe existir un role="status" con el mensaje de éxito',
        ).toBeTruthy();
      },
      { timeout: 4000 },
    );

    const botonCerrar = within(status!).getByRole("button", {
      name: "Cerrar aviso",
    });
    fireEvent.click(botonCerrar);

    await waitFor(() => {
      const estados = screen.queryAllByRole("status");
      const avisoExito = estados.find((el) =>
        el.textContent?.includes(
          "Evaluación aprobada y consolidada en las curvas del alumno.",
        ),
      );
      expect(avisoExito).toBeFalsy();
    });
  });

  it("AP2 · Error de carga con EstadoError", async () => {
    errorCola = new Error("Fallo de red");
    montar();

    const heading = await screen.findByRole("heading", {
      level: 2,
      name: "No pudimos cargar las evaluaciones",
    });
    expect(heading).toBeTruthy();
    expect(screen.getByText("Fallo de red")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeTruthy();
  });

  it("AP3 · El error no bloquea el comparador", async () => {
    errorCola = new Error("Fallo de red");
    montar();

    const tabComparar = await screen.findByRole("tab", { name: "Comparar" });
    fireEvent.click(tabComparar);

    expect(
      await screen.findByRole("heading", {
        name: "Comparador Antes / Después",
      }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", {
        name: "No pudimos cargar las evaluaciones",
      }),
    ).toBeNull();
  });

  it("AP4 · Paneles", async () => {
    montar();
    await esperarCola();

    const panel = screen.getByRole("tabpanel", {
      name: "Por revisar: 2 pendientes",
    });
    expect(panel).toBeTruthy();
    expect(panel.textContent).toContain("Ana Medidas");
  });

  it("AP5 · Sin conexión", async () => {
    // 1. Con datos cargados y luego sin conexión
    montar();
    await esperarCola();

    simularConexion(false);
    onlineManager.setOnline(false);
    window.dispatchEvent(new Event("offline"));

    await waitFor(
      () => {
        const estados = screen.queryAllByRole("status");
        const avisoOffline = estados.find((el) =>
          el.textContent?.includes("Sin conexión · datos guardados"),
        );
        expect(
          avisoOffline,
          'debe existir un role="status" con "Sin conexión · datos guardados"',
        ).toBeTruthy();
      },
      { timeout: 2000 },
    );

    // 2. Sin conexión desde el inicio y sin datos
    cleanup();
    colaActual = respuestaCola([]);
    errorCola = new Error("Sin conexión");
    simularConexion(false);
    onlineManager.setOnline(false);
    window.dispatchEvent(new Event("offline"));

    montar();

    await waitFor(
      () => {
        const estados = screen.queryAllByRole("status");
        const avisoSinDatos = estados.find((el) =>
          el.textContent?.includes("Sin conexión y sin datos guardados"),
        );
        expect(
          avisoSinDatos,
          'debe existir un role="status" con "Sin conexión y sin datos guardados"',
        ).toBeTruthy();
      },
      { timeout: 2000 },
    );

    expect(
      screen.queryByRole("heading", {
        name: "No pudimos cargar las evaluaciones",
      }),
    ).toBeNull();
  });

  it("AP6 · Buscador accesible en la cola", async () => {
    montar();
    await esperarCola();

    const buscador = screen.getByLabelText(
      "Buscar evaluación pendiente por alumno",
    );
    expect(buscador).toBeTruthy();
    expect(buscador.getAttribute("placeholder")).toBe("Buscar en esta página…");
    expect(buscador.className).toContain("min-h-11");
    expect(buscador.className).toContain("text-base");
    expect(buscador.className).toContain("sm:text-xs");
  });
});
