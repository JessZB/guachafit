// @vitest-environment happy-dom
/**
 * Lote E10 (RF-017 RN-03) · tests del masivo en 3 pasos con ajustes comunes.
 *
 * Contratos M1–M15 del prompt 44: el masivo pasa a elegir alumnos → revisar y
 * ajustar (opcional) → confirmar, con ajustes comunes a todos, modo por defecto
 * "Añadir" y demo con aviso sin ajustes si no hay detalle.
 *
 * Montaje modelado en `AsignacionMasivaPlantilla.caracterizacion.interaccion.spec.tsx`:
 * `useAuth` mockeado con `isDemoMode` conmutable y `apiClient` mockeado
 * preservando el resto vía `importOriginal`. Sin `QueryClientProvider`.
 * `@testing-library/user-event` no está instalado: se usa `fireEvent`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ModoAsignacionPlantilla } from '@guachafit/shared';

const sesionMock = vi.hoisted(() => ({ isDemoMode: false }));

vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({ isDemoMode: sesionMock.isDemoMode }),
}));

vi.mock('../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api-client')>();
  return {
    ...actual,
    apiClient: Object.assign(vi.fn(), {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    }),
  };
});

import { apiClient } from '../../lib/api-client';
import { ROSTER_DEMO_DIRECTORIO } from '../../lib/directorio-alumnos';
import { AsignacionMasivaPlantilla } from './AsignacionMasivaPlantilla';

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn;

/** Plantilla real de `demo-plantillas.ts` (con detalle de 2 días). */
const PLANTILLA = {
  id: '22222222-2222-4222-8222-222222222201',
  entrenadorId: 'e1',
  nombre: 'Tren Superior Hipertrofia A',
  totalDias: 2,
  totalEjercicios: 8,
  activa: true,
  createdAtUtc: '2026-09-01T10:00:00.000Z',
  updatedAtUtc: '2026-09-20T10:00:00.000Z',
} as const;

/** Plantilla sin detalle en los datos de demo (M14): id ajeno al banco demo. */
const PLANTILLA_SIN_DETALLE = {
  id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  entrenadorId: 'e1',
  nombre: 'Plantilla Demo Sin Detalle',
  totalDias: 1,
  totalEjercicios: 2,
  activa: true,
  createdAtUtc: '2026-09-01T10:00:00.000Z',
  updatedAtUtc: '2026-09-20T10:00:00.000Z',
} as const;

const ALUMNO_A = ROSTER_DEMO_DIRECTORIO[0];
const ALUMNO_B = ROSTER_DEMO_DIRECTORIO[1];

function nombreCompleto(alumno: { nombres: string; apellidos: string }): string {
  return `${alumno.nombres} ${alumno.apellidos}`.trim();
}

const NOMBRE_A = nombreCompleto(ALUMNO_A);
const NOMBRE_B = nombreCompleto(ALUMNO_B);

/** Detalle servido por `GET /plantillas/:id`: 1 día con 2 ejercicios. */
const DETALLE_REAL = {
  id: PLANTILLA.id,
  nombre: PLANTILLA.nombre,
  bloques: [
    {
      diaId: 'd1',
      diaSugerido: 1,
      titulo: 'Día 1 (Lunes): Empuje',
      ejercicios: [
        {
          id: 'e1',
          ejercicioId: 'c1',
          nombre: 'Press Plano con Mancuernas',
          series: 4,
          reps: '10',
          peso: '60',
        },
        {
          id: 'e2',
          ejercicioId: 'c2',
          nombre: 'Jalón al Pecho Agarre Neutro',
          series: 4,
          reps: '12',
          peso: '65',
        },
      ],
    },
  ],
};

const URL_ASIGNAR = `/plantillas/${PLANTILLA.id}/asignar`;

function esPeticionDetalle(url: string, opciones?: { method?: string }): boolean {
  return url === `/plantillas/${PLANTILLA.id}` && (!opciones?.method || opciones.method === 'GET');
}

function montar(plantilla: typeof PLANTILLA | typeof PLANTILLA_SIN_DETALLE = PLANTILLA) {
  const onCerrar = vi.fn();
  render(
    <MemoryRouter>
      <AsignacionMasivaPlantilla
        plantilla={{ ...plantilla } as unknown as Parameters<typeof AsignacionMasivaPlantilla>[0]['plantilla']}
        onCerrar={onCerrar}
      />
    </MemoryRouter>
  );
  return { onCerrar };
}

function marcarAlumno(nombre: string): void {
  fireEvent.click(screen.getByRole('checkbox', { name: nombre }));
}

function respuestaAsignacionOk(alumnoIds: string[]) {
  return {
    plantillaId: PLANTILLA.id,
    modo: ModoAsignacionPlantilla.FUSIONAR,
    totalSolicitados: alumnoIds.length,
    exitosos: alumnoIds.length,
    fallidos: 0,
    resultados: alumnoIds.map((alumnoId) => ({
      alumnoId,
      exito: true,
      rutinaNombre: PLANTILLA.nombre,
    })),
  };
}

/** Directorio + detalle servidos; el POST lo resuelve `responderAsignar`. */
function mockFlujoReal(responderAsignar: (opciones?: { body?: string }) => Promise<unknown>) {
  mockApi.mockImplementation((url: string, opciones?: { method?: string; body?: string }) => {
    if ((url as string).startsWith('/alumnos?')) {
      return Promise.resolve({ items: [ALUMNO_A, ALUMNO_B], total: 2 });
    }
    if (esPeticionDetalle(url, opciones)) {
      return Promise.resolve(DETALLE_REAL);
    }
    if (url === URL_ASIGNAR && opciones?.method === 'POST') {
      return responderAsignar(opciones);
    }
    return Promise.reject(new Error(`URL no mockeada: ${url}`));
  });
}

function llamadasAsignar(): Array<[string, { body?: string; idempotencyKey?: string }]> {
  return mockApi.mock.calls.filter(
    ([url, opts]) => url === URL_ASIGNAR && (opts as { method?: string })?.method === 'POST'
  ) as Array<[string, { body?: string; idempotencyKey?: string }]>;
}

function cuerpoDe(llamada: [string, { body?: string }]): Record<string, unknown> {
  return JSON.parse(llamada[1]?.body ?? '{}') as Record<string, unknown>;
}

/** Paso 1 → 2 marcando los alumnos indicados. */
async function irAPaso2(nombres: string[]): Promise<void> {
  for (const nombre of nombres) marcarAlumno(nombre);
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  await screen.findByText('Paso 2 de 3 · Revisar y ajustar');
}

/** Paso 2 → 3. */
async function irAPaso3(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  await screen.findByText('Paso 3 de 3 · Confirmar');
}

beforeEach(() => {
  sesionMock.isDemoMode = false;
  mockApi.mockReset();
});

afterEach(() => {
  cleanup();
});

/* ================================================================== */
/* M1–M4: pasos, navegación y confirmación.                             */
/* ================================================================== */

describe('AsignacionMasivaPlantilla pasos (E10) · M1–M4', () => {
  it('M1 · al abrir: título "Paso 1 de 3 · Elegir alumnos"; "Siguiente" deshabilitado con 0; "Cancelar" llama a onCerrar', async () => {
    sesionMock.isDemoMode = true;
    const { onCerrar } = montar();

    expect(await screen.findByText('Paso 1 de 3 · Elegir alumnos')).toBeTruthy();
    expect(await screen.findByText(NOMBRE_A)).toBeTruthy();
    expect(screen.getByText(/0 de 50 seleccionados/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Siguiente' }) as HTMLButtonElement).disabled).toBe(
      true
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(onCerrar).toHaveBeenCalledTimes(1));
  });

  it('M2 · con ≥1 alumno, "Siguiente" lleva al paso 2 con los días y ejercicios de la plantilla', async () => {
    mockFlujoReal(async () => respuestaAsignacionOk([ALUMNO_A.id]));
    montar();
    await screen.findByText(NOMBRE_A);

    marcarAlumno(NOMBRE_A);
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));

    expect(await screen.findByText('Paso 2 de 3 · Revisar y ajustar')).toBeTruthy();
    expect(screen.getByText('Press Plano con Mancuernas')).toBeTruthy();
    expect(screen.getByText('Jalón al Pecho Agarre Neutro')).toBeTruthy();
  });

  it('M3 · "Atrás" vuelve al paso 1 conservando selección y contador; al avanzar, los ajustes se conservan', async () => {
    sesionMock.isDemoMode = true;
    montar();
    await screen.findByText(NOMBRE_A);

    await irAPaso2([NOMBRE_A]);

    fireEvent.click(screen.getByRole('button', { name: 'Ajustar Press Plano con Mancuernas' }));
    fireEvent.change(screen.getByLabelText('Peso (kg)'), { target: { value: '70' } });
    expect(screen.getByText('Ajustado')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Atrás' }));
    expect(await screen.findByText('Paso 1 de 3 · Elegir alumnos')).toBeTruthy();
    expect(screen.getByText(/1 de 50 seleccionados/)).toBeTruthy();

    await irAPaso2([]);
    expect(screen.getByText('Ajustado')).toBeTruthy();
  });

  it('M4 · paso 3 con radios ("Añadir" por defecto) y la frase de L3; "Atrás" conserva los ajustes', async () => {
    sesionMock.isDemoMode = true;
    montar();
    await screen.findByText(NOMBRE_A);

    await irAPaso2([NOMBRE_A, NOMBRE_B]);

    fireEvent.click(screen.getByRole('button', { name: 'Ajustar Press Plano con Mancuernas' }));
    fireEvent.change(screen.getByLabelText('Peso (kg)'), { target: { value: '70' } });
    await irAPaso3();

    expect(await screen.findByText('Paso 3 de 3 · Confirmar')).toBeTruthy();
    expect(
      (screen.getByRole('radio', { name: /Añadir a la rutina actual/ }) as HTMLInputElement).checked
    ).toBe(true);
    expect(
      (screen.getByRole('radio', { name: /Reemplazar la rutina actual/ }) as HTMLInputElement)
        .checked
    ).toBe(false);
    expect(
      screen.getByText(
        'Se asignará «Tren Superior Hipertrofia A» a 2 alumnos con 1 ajuste. Se añade a su rutina actual.'
      )
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Atrás' }));
    expect(await screen.findByText('Paso 2 de 3 · Revisar y ajustar')).toBeTruthy();
    expect(screen.getByText('Ajustado')).toBeTruthy();
  });
});

/* ================================================================== */
/* M5–M8: cuerpo del POST, validación y confirmación de reemplazo.      */
/* ================================================================== */

describe('AsignacionMasivaPlantilla pasos (E10) · M5–M8', () => {
  it('M5 · con un ajuste de peso 70 y dos alumnos, el POST lleva alumnoIds, modo y ajustes comunes', async () => {
    mockFlujoReal(async () => respuestaAsignacionOk([ALUMNO_A.id, ALUMNO_B.id]));
    montar();
    await screen.findByText(NOMBRE_A);

    await irAPaso2([NOMBRE_A, NOMBRE_B]);

    fireEvent.click(screen.getByRole('button', { name: 'Ajustar Press Plano con Mancuernas' }));
    fireEvent.change(screen.getByLabelText('Peso (kg)'), { target: { value: '70' } });
    await irAPaso3();

    fireEvent.click(screen.getByRole('button', { name: 'Asignar a 2 alumnos' }));
    expect(await screen.findByText('Plantilla asignada a 2 de 2 alumnos.')).toBeTruthy();

    // Un solo arreglo de ajustes para todos los alumnos.
    const envios = llamadasAsignar();
    expect(envios).toHaveLength(1);
    const cuerpo = cuerpoDe(envios[0]);
    expect(cuerpo.alumnoIds).toEqual([ALUMNO_A.id, ALUMNO_B.id]);
    expect(cuerpo.modo).toBe(ModoAsignacionPlantilla.FUSIONAR);
    expect(cuerpo.ajustes).toEqual([
      { diaId: 'd1', nombre: 'Press Plano con Mancuernas', pesoPrescritoKg: '70' },
    ]);
  });

  it('M5b · con dos ajustes, borrar el primero y volver a escribirlo deja el mismo cuerpo canónico', async () => {
    mockFlujoReal(async () => respuestaAsignacionOk([ALUMNO_A.id]));
    montar();
    await screen.findByText(NOMBRE_A);

    await irAPaso2([NOMBRE_A]);

    fireEvent.click(screen.getByRole('button', { name: 'Ajustar Press Plano con Mancuernas' }));
    fireEvent.change(screen.getByLabelText('Peso (kg)'), { target: { value: '70' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajustar Jalón al Pecho Agarre Neutro' }));
    fireEvent.change(screen.getAllByLabelText('Peso (kg)')[1], { target: { value: '50' } });

    // Se borra el primero y se vuelve a escribir: su orden de inserción cambia.
    fireEvent.click(screen.getAllByRole('button', { name: 'Restablecer' })[0]);
    fireEvent.change(screen.getAllByLabelText('Peso (kg)')[0], { target: { value: '70' } });
    await irAPaso3();

    fireEvent.click(screen.getByRole('button', { name: 'Asignar a 1 alumno' }));
    expect(await screen.findByText('Plantilla asignada a 1 de 1 alumno.')).toBeTruthy();

    const envios = llamadasAsignar();
    expect(envios).toHaveLength(1);
    expect(cuerpoDe(envios[0]).ajustes).toEqual([
      { diaId: 'd1', nombre: 'Jalón al Pecho Agarre Neutro', pesoPrescritoKg: '50' },
      { diaId: 'd1', nombre: 'Press Plano con Mancuernas', pesoPrescritoKg: '70' },
    ]);
  });

  it('M6 · sin ajustes, el cuerpo tiene exactamente alumnoIds y modo (sin la clave ajustes)', async () => {
    mockFlujoReal(async () => respuestaAsignacionOk([ALUMNO_A.id]));
    montar();
    await screen.findByText(NOMBRE_A);

    await irAPaso2([NOMBRE_A]);
    await irAPaso3();

    fireEvent.click(screen.getByRole('button', { name: 'Asignar a 1 alumno' }));
    expect(await screen.findByText('Plantilla asignada a 1 de 1 alumno.')).toBeTruthy();

    const envios = llamadasAsignar();
    expect(envios).toHaveLength(1);
    expect(Object.keys(cuerpoDe(envios[0])).sort()).toEqual(['alumnoIds', 'modo']);
  });

  it('M7 · reps inválidas ("10-8") + "Asignar a N alumnos" vuelve al paso 2 con role="alert" y no envía el POST', async () => {
    mockFlujoReal(async () => respuestaAsignacionOk([ALUMNO_A.id]));
    montar();
    await screen.findByText(NOMBRE_A);

    await irAPaso2([NOMBRE_A]);

    fireEvent.click(screen.getByRole('button', { name: 'Ajustar Press Plano con Mancuernas' }));
    fireEvent.change(screen.getByLabelText('Repeticiones'), { target: { value: '10-8' } });
    await irAPaso3();

    fireEvent.click(screen.getByRole('button', { name: 'Asignar a 1 alumno' }));

    expect(await screen.findByText('Paso 2 de 3 · Revisar y ajustar')).toBeTruthy();
    const alertas = screen.getAllByRole('alert');
    expect(
      alertas.some((alerta) => alerta.textContent?.includes('Revisa estos ajustes antes de asignar:'))
    ).toBe(true);
    expect(llamadasAsignar()).toHaveLength(0);
  });

  it('M8 · "Reemplazar" abre el diálogo; "Cancelar" se queda en el paso 3 sin POST; "Sí, reemplazar" envía', async () => {
    sesionMock.isDemoMode = true;
    montar();
    await screen.findByText(NOMBRE_A);

    await irAPaso2([NOMBRE_A]);
    await irAPaso3();

    fireEvent.click(screen.getByRole('radio', { name: /Reemplazar la rutina actual/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Asignar a 1 alumno' }));

    expect(await screen.findByRole('button', { name: 'Sí, reemplazar' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByText('Paso 3 de 3 · Confirmar')).toBeTruthy();
    expect(screen.queryByText(/Plantilla asignada a/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Asignar a 1 alumno' }));
    expect(await screen.findByRole('button', { name: 'Sí, reemplazar' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sí, reemplazar' }));
    expect(await screen.findByText('Plantilla asignada a 1 de 1 alumno.')).toBeTruthy();
  });
});

/* ================================================================== */
/* M9–M12: reintento con idempotencia, resultados y error de detalle.   */
/* ================================================================== */

describe('AsignacionMasivaPlantilla pasos (E10) · M9–M12', () => {
  it('M9 · tras un fallo ambiguo, reintentar en "Añadir" pide confirmación; sin cambios, el 2.º POST reutiliza la misma idempotencyKey', async () => {
    let intentosPost = 0;
    mockFlujoReal(async () => {
      intentosPost += 1;
      if (intentosPost === 1) return Promise.reject(new TypeError('Fallo de red simulado'));
      return respuestaAsignacionOk([ALUMNO_A.id]);
    });
    montar();
    await screen.findByText(NOMBRE_A);

    await irAPaso2([NOMBRE_A]);
    await irAPaso3();

    fireEvent.click(screen.getByRole('button', { name: 'Asignar a 1 alumno' }));
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('No pudimos confirmar la asignación.');

    fireEvent.click(screen.getByRole('button', { name: 'Asignar a 1 alumno' }));
    expect(await screen.findByText('¿Volver a intentar la asignación?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sí, volver a intentar' }));
    expect(await screen.findByText('Plantilla asignada a 1 de 1 alumno.')).toBeTruthy();

    const envios = llamadasAsignar();
    expect(envios).toHaveLength(2);
    expect(envios[1][1]?.idempotencyKey).toBe(envios[0][1]?.idempotencyKey);
  });

  it('M10 · tras un fallo ambiguo el intento queda congelado: "Atrás" y radios deshabilitados, aviso de la opción A y el reintento reutiliza la misma idempotencyKey', async () => {
    let intentosPost = 0;
    mockFlujoReal(async (opciones) => {
      intentosPost += 1;
      if (intentosPost === 1) return Promise.reject(new TypeError('Fallo de red simulado'));
      return respuestaAsignacionOk([ALUMNO_A.id]);
    });
    montar();
    await screen.findByText(NOMBRE_A);

    await irAPaso2([NOMBRE_A]);

    fireEvent.click(screen.getByRole('button', { name: 'Ajustar Press Plano con Mancuernas' }));
    fireEvent.change(screen.getByLabelText('Peso (kg)'), { target: { value: '70' } });
    await irAPaso3();

    fireEvent.click(screen.getByRole('button', { name: 'Asignar a 1 alumno' }));
    expect(await screen.findByRole('alert')).toBeTruthy();

    // Opción A: el intento queda congelado hasta confirmarse o cerrar el diálogo.
    expect((screen.getByRole('button', { name: 'Atrás' }) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect(
      (screen.getByRole('radio', { name: /Añadir a la rutina actual/ }) as HTMLInputElement)
        .disabled
    ).toBe(true);
    expect(
      (screen.getByRole('radio', { name: /Reemplazar la rutina actual/ }) as HTMLInputElement)
        .disabled
    ).toBe(true);
    expect(
      screen.getByText(
        'Para cambiar alumnos, ajustes o modo, cierra y comprueba primero si la asignación se aplicó.'
      )
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Asignar a 1 alumno' }));
    expect(await screen.findByText('¿Volver a intentar la asignación?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sí, volver a intentar' }));
    expect(await screen.findByText('Plantilla asignada a 1 de 1 alumno.')).toBeTruthy();

    const envios = llamadasAsignar();
    expect(envios).toHaveLength(2);
    expect(envios[1][1]?.idempotencyKey).toBe(envios[0][1]?.idempotencyKey);
  });

  it('M10b · tras un error 4xx claro el intento no se congela: "Atrás" y radios habilitados, sin texto de la opción A', async () => {
    const { ApiError } = await import('../../lib/api-client');
    mockFlujoReal(async () => {
      return Promise.reject(
        new ApiError(
          400,
          {
            type: 'https://api.guachafit.com/errors/rechazo',
            title: 'Rechazo',
            status: 400,
            detail: 'Rechazo claro simulado',
            timestampUtc: new Date().toISOString(),
          },
          'Rechazo claro simulado'
        )
      );
    });
    montar();
    await screen.findByText(NOMBRE_A);

    await irAPaso2([NOMBRE_A]);
    await irAPaso3();

    fireEvent.click(screen.getByRole('button', { name: 'Asignar a 1 alumno' }));
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('Rechazo claro simulado');

    expect((screen.getByRole('button', { name: 'Atrás' }) as HTMLButtonElement).disabled).toBe(
      false
    );
    expect(
      (screen.getByRole('radio', { name: /Añadir a la rutina actual/ }) as HTMLInputElement)
        .disabled
    ).toBe(false);
    expect(
      (screen.getByRole('radio', { name: /Reemplazar la rutina actual/ }) as HTMLInputElement)
        .disabled
    ).toBe(false);
    expect(
      screen.queryByText(
        'Para cambiar alumnos, ajustes o modo, cierra y comprueba primero si la asignación se aplicó.'
      )
    ).toBeNull();
    expect(llamadasAsignar()).toHaveLength(1);
  });

  it('M11 · resultados: "Plantilla asignada a X de N alumnos.", una fila por alumno, "Listo" cierra y ya no se ve el buscador', async () => {
    mockFlujoReal(async () => respuestaAsignacionOk([ALUMNO_A.id, ALUMNO_B.id]));
    const { onCerrar } = montar();
    await screen.findByText(NOMBRE_A);

    await irAPaso2([NOMBRE_A, NOMBRE_B]);
    await irAPaso3();

    fireEvent.click(screen.getByRole('button', { name: 'Asignar a 2 alumnos' }));

    expect(await screen.findByText('Plantilla asignada a 2 de 2 alumnos.')).toBeTruthy();
    expect(screen.getByText(NOMBRE_A)).toBeTruthy();
    expect(screen.getByText(NOMBRE_B)).toBeTruthy();
    expect(screen.getAllByText(`Rutina asignada: «${PLANTILLA.nombre}»`)).toHaveLength(2);
    expect(screen.queryByPlaceholderText('Buscar por nombre...')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Listo' }));
    await waitFor(() => expect(onCerrar).toHaveBeenCalledTimes(1));
  });

  it('M12 · si falla la carga del detalle, el alert aparece solo en el paso 2 con "Reintentar"; "Siguiente" se deshabilita y "Reintentar" lo recupera', async () => {
    let intentosDetalle = 0;
    mockApi.mockImplementation((url: string, opciones?: { method?: string; body?: string }) => {
      if ((url as string).startsWith('/alumnos?')) {
        return Promise.resolve({ items: [ALUMNO_A], total: 1 });
      }
      if (esPeticionDetalle(url, opciones)) {
        intentosDetalle += 1;
        if (intentosDetalle === 1) return Promise.reject(new Error('Fallo de detalle simulado'));
        return Promise.resolve(DETALLE_REAL);
      }
      if (url === URL_ASIGNAR && opciones?.method === 'POST') {
        return Promise.resolve(respuestaAsignacionOk([ALUMNO_A.id]));
      }
      return Promise.reject(new Error(`URL no mockeada: ${url}`));
    });
    montar();
    await screen.findByText(NOMBRE_A);

    marcarAlumno(NOMBRE_A);
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));

    expect(await screen.findByText('Paso 2 de 3 · Revisar y ajustar')).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Siguiente' }) as HTMLButtonElement).disabled).toBe(
      true
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Press Plano con Mancuernas')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Siguiente' }) as HTMLButtonElement).disabled).toBe(
      false
    );
  });

  it('M12b · si el detalle supera el plazo (ErrorTiempoAgotado), el paso 2 muestra el error genérico con "Reintentar" y la llamada lleva tiempoLimiteMs 15000', async () => {
    const { ErrorTiempoAgotado } = await import('../../lib/api-client');
    mockApi.mockImplementation((url: string, opciones?: { method?: string; body?: string }) => {
      if ((url as string).startsWith('/alumnos?')) {
        return Promise.resolve({ items: [ALUMNO_A], total: 1 });
      }
      if (esPeticionDetalle(url, opciones)) {
        return Promise.reject(new ErrorTiempoAgotado());
      }
      if (url === URL_ASIGNAR && opciones?.method === 'POST') {
        return Promise.resolve(respuestaAsignacionOk([ALUMNO_A.id]));
      }
      return Promise.reject(new Error(`URL no mockeada: ${url}`));
    });
    montar();
    await screen.findByText(NOMBRE_A);

    marcarAlumno(NOMBRE_A);
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));

    expect(await screen.findByText('Paso 2 de 3 · Revisar y ajustar')).toBeTruthy();
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('No se pudo cargar el detalle de la plantilla.');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();

    const llamadaDetalle = mockApi.mock.calls.find(([url]) => esPeticionDetalle(url as string));
    expect(llamadaDetalle).toBeTruthy();
    expect((llamadaDetalle as [string, { tiempoLimiteMs?: number }])[1]?.tiempoLimiteMs).toBe(
      15000
    );
  });
});

/* ================================================================== */
/* M13–M15: demo con/sin detalle y bloqueo de cierre asignando.         */
/* ================================================================== */

describe('AsignacionMasivaPlantilla pasos (E10) · M13–M15', () => {
  it('M13 · demo: el detalle sale de los datos de demo, no se llama al API y todos los alumnos salen con éxito', async () => {
    sesionMock.isDemoMode = true;
    montar();
    await screen.findByText(NOMBRE_A);

    await irAPaso2([NOMBRE_A, NOMBRE_B]);

    expect(await screen.findByText('Paso 2 de 3 · Revisar y ajustar')).toBeTruthy();
    expect(screen.getByText('Press Plano con Mancuernas')).toBeTruthy();
    await irAPaso3();

    fireEvent.click(screen.getByRole('button', { name: 'Asignar a 2 alumnos' }));
    expect(await screen.findByText('Plantilla asignada a 2 de 2 alumnos.')).toBeTruthy();
    expect(screen.getAllByText(`Rutina asignada: «${PLANTILLA.nombre}»`)).toHaveLength(2);
    expect(mockApi).not.toHaveBeenCalled();
  });

  it('M14 · demo sin detalle: el paso 2 muestra un aviso y "Siguiente" permite seguir sin ajustes', async () => {
    sesionMock.isDemoMode = true;
    montar(PLANTILLA_SIN_DETALLE);
    await screen.findByText(NOMBRE_A);

    await irAPaso2([NOMBRE_A]);

    expect(await screen.findByText('Paso 2 de 3 · Revisar y ajustar')).toBeTruthy();
    expect(
      screen.getByText('La vista previa no está disponible para esta plantilla en el modo demo.')
    ).toBeTruthy();

    await irAPaso3();
    expect(screen.getByText('Paso 3 de 3 · Confirmar')).toBeTruthy();
    expect(mockApi).not.toHaveBeenCalled();
  });

  it('M15 · mientras se asigna ("Asignando…"), no se puede cerrar con la X', async () => {
    const diferido: { resolver: ((valor: unknown) => void) | null } = { resolver: null };
    mockFlujoReal(
      () =>
        new Promise<unknown>((resolver) => {
          diferido.resolver = resolver;
        })
    );
    montar();
    await screen.findByText(NOMBRE_A);

    await irAPaso2([NOMBRE_A]);
    await irAPaso3();

    fireEvent.click(screen.getByRole('button', { name: 'Asignar a 1 alumno' }));
    expect(await screen.findByText('Asignando…')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Cerrar asignación a alumnos' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);

    diferido.resolver?.(respuestaAsignacionOk([ALUMNO_A.id]));
    expect(await screen.findByText('Plantilla asignada a 1 de 1 alumno.')).toBeTruthy();
  });
});

/* ================================================================== */
/* Foco del flujo masivo (seguimiento E10 · prompt 51, hallazgo W2).    */
/* Fija el orden de foco: el título al cambiar de paso y el resumen de  */
/* errores por encima del título. Usa document.activeElement como el    */
/* spec del flujo individual.                                           */
/* ================================================================== */

describe('AsignacionMasivaPlantilla pasos · foco (51 · F1–F5)', () => {
  it('F1 · al abrir, el foco no salta al título del paso 1; queda en el primer focusable del diálogo', async () => {
    sesionMock.isDemoMode = true;
    montar();
    await screen.findByText(NOMBRE_A);

    const titulo = screen.getByText('Paso 1 de 3 · Elegir alumnos');
    const cerrar = screen.getByRole('button', { name: 'Cerrar asignación a alumnos' });
    // useDialogoAccesible enfoca el primer focusable (el cierre X); el título lleva tabIndex={-1}.
    expect(document.activeElement).toBe(cerrar);
    expect(document.activeElement).not.toBe(titulo);
  });

  it('F2 · al pasar del paso 1 al 2, el foco va al título "Paso 2 de 3 · Revisar y ajustar"', async () => {
    mockFlujoReal(async () => respuestaAsignacionOk([ALUMNO_A.id]));
    montar();
    await screen.findByText(NOMBRE_A);

    await irAPaso2([NOMBRE_A]);

    const titulo = await screen.findByText('Paso 2 de 3 · Revisar y ajustar');
    expect(document.activeElement).toBe(titulo);
  });

  it('F3 · al pasar al paso 3 el foco va a su título; con "Atrás" vuelve al título del paso anterior', async () => {
    mockFlujoReal(async () => respuestaAsignacionOk([ALUMNO_A.id]));
    montar();
    await screen.findByText(NOMBRE_A);

    await irAPaso2([NOMBRE_A]);
    await irAPaso3();

    expect(await screen.findByText('Paso 3 de 3 · Confirmar')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByText('Paso 3 de 3 · Confirmar'));

    fireEvent.click(screen.getByRole('button', { name: 'Atrás' }));
    expect(await screen.findByText('Paso 2 de 3 · Revisar y ajustar')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByText('Paso 2 de 3 · Revisar y ajustar'));

    fireEvent.click(screen.getByRole('button', { name: 'Atrás' }));
    expect(await screen.findByText('Paso 1 de 3 · Elegir alumnos')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByText('Paso 1 de 3 · Elegir alumnos'));
  });

  it('F4 · con reps "10-8" y "Asignar a N alumnos", el foco va al resumen de errores, no al título del paso 2', async () => {
    mockFlujoReal(async () => respuestaAsignacionOk([ALUMNO_A.id]));
    montar();
    await screen.findByText(NOMBRE_A);

    await irAPaso2([NOMBRE_A]);
    fireEvent.click(screen.getByRole('button', { name: 'Ajustar Press Plano con Mancuernas' }));
    fireEvent.change(screen.getByLabelText('Repeticiones'), { target: { value: '10-8' } });
    await irAPaso3();

    fireEvent.click(screen.getByRole('button', { name: 'Asignar a 1 alumno' }));
    expect(await screen.findByText('Paso 2 de 3 · Revisar y ajustar')).toBeTruthy();

    const resumen = await screen.findByRole('alert');
    expect(resumen.textContent).toContain('Revisa estos ajustes antes de asignar:');
    // El efecto del resumen se declara tras el del título, así que gana el resumen.
    await waitFor(() => {
      expect(document.activeElement).toBe(resumen);
    });
    expect(document.activeElement).not.toBe(screen.getByText('Paso 2 de 3 · Revisar y ajustar'));
  });

  it('F5 · desde el resumen de errores, activar el error lleva el foco al campo con error', async () => {
    mockFlujoReal(async () => respuestaAsignacionOk([ALUMNO_A.id]));
    montar();
    await screen.findByText(NOMBRE_A);

    await irAPaso2([NOMBRE_A]);
    fireEvent.click(screen.getByRole('button', { name: 'Ajustar Press Plano con Mancuernas' }));
    fireEvent.change(screen.getByLabelText('Repeticiones'), { target: { value: '10-8' } });
    await irAPaso3();

    fireEvent.click(screen.getByRole('button', { name: 'Asignar a 1 alumno' }));
    await screen.findByText('Paso 2 de 3 · Revisar y ajustar');
    await screen.findByRole('alert');

    fireEvent.click(screen.getByRole('button', { name: /Repeticiones no válidas/ }));
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByLabelText('Repeticiones'));
    });
  });
});
