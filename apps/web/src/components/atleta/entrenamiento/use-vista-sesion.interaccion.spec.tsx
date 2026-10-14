// @vitest-environment jsdom
/**
 * Prompt 118 · carrera entre el clic en "Ver entrenamiento completo" y el efecto
 * que repone la vista de foco (`use-vista-sesion.ts`, efecto sobre `[sesion?.id]`).
 *
 * Hipótesis confirmada: la sesión empieza en `null` y pasa a `X` mediante una
 * actualización NO síncrona (resolución de una promesa). React pinta la vista de
 * foco en el commit y deja los efectos pasivos para una tarea posterior del
 * Scheduler. Si el clic (`setVistaEnCurso('lista')`) llega en ese hueco, el
 * efecto (`setVistaEnCurso('foco')`) queda encolado DESPUÉS y gana `'foco'`:
 * el clic se pierde.
 *
 * Técnica del test en rojo (sin esperas fijas):
 * - La sesión `X` se publica resolviendo una promesa controlada, fuera de
 *   cualquier evento o `act`: el commit y los efectos pasivos quedan en tareas
 *   separadas con el hueco en el medio.
 * - Un `MutationObserver` sobre el contenedor detecta el commit (la marca de la
 *   sesión pasa a `X` con la vista de foco) y hace el clic en su callback. Ese
 *   callback corre como microtarea al final de la tarea del commit, ANTES de la
 *   tarea en la que el Scheduler ejecuta los efectos pasivos: el clic cae
 *   siempre en el hueco, de forma determinista.
 * - `IS_REACT_ACT_ENVIRONMENT` se desactiva en ese test porque `act` vacía los
 *   efectos de forma síncrona y oculta la carrera (en el navegador real no hay
 *   `act`). El aviso de React sobre actualizaciones fuera de `act` es esperado:
 *   es la prueba de que se reproduce el comportamiento del navegador. El fallo
 *   es SOLO por la aserción de la vista (`'foco'` frente a `'lista'`).
 * - El vaciado final (`act` vacío con la bandera restaurada) es determinista y
 *   no una espera fija: deja que todas las actualizaciones pendientes terminen
 *   antes de leer la vista final.
 */
import { useEffect, useState } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EstadoSesion, type SesionEntrenamientoDetalleDTO } from '@guachafit/shared';
import { useVistaSesion } from './use-vista-sesion';

function construirSesion(id: string): SesionEntrenamientoDetalleDTO {
  return {
    id,
    alumnoId: 'alumno-118',
    fechaProgramada: '2026-10-13',
    timezoneCliente: 'America/Montevideo',
    estado: EstadoSesion.EN_PROGRESO,
    porcentajeCumplimiento: '0.00',
    ejercicios: [],
    createdAtUtc: '2026-10-13T00:00:00.000Z',
    updatedAtUtc: '2026-10-13T00:00:00.000Z',
  } as SesionEntrenamientoDetalleDTO;
}

/** Componente mínimo: muestra la vista y un botón que pide la lista completa. */
function SondaMinima({ sesion }: { sesion: SesionEntrenamientoDetalleDTO | null }) {
  const { vistaEnCurso, setVistaEnCurso } = useVistaSesion({ sesion });
  return (
    <div>
      <span data-testid="vista">{vistaEnCurso}</span>
      <span data-testid="sesion">{sesion?.id ?? 'nulo'}</span>
      {vistaEnCurso === 'foco' ? (
        <button onClick={() => setVistaEnCurso('lista')}>Ver entrenamiento completo</button>
      ) : (
        <button onClick={() => setVistaEnCurso('foco')}>Volver al enfoque</button>
      )}
    </div>
  );
}

/** Publica la sesión al resolverse la promesa (actualización NO síncrona). */
function ContenedorAsincrono({ puerta }: { puerta: Promise<SesionEntrenamientoDetalleDTO> }) {
  const [sesion, setSesion] = useState<SesionEntrenamientoDetalleDTO | null>(null);
  useEffect(() => {
    let viva = true;
    puerta.then((s) => {
      if (viva) setSesion(s);
    });
    return () => {
      viva = false;
    };
  }, [puerta]);
  return <SondaMinima sesion={sesion} />;
}

const banderaActOriginal = (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT;

afterEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = banderaActOriginal ?? true;
  sessionStorage.clear();
  cleanup();
  vi.restoreAllMocks();
});

describe('useVistaSesion · carrera del clic frente al efecto que repone el foco', () => {
  it(
    'conserva "lista" si el clic llega antes del efecto que repone el foco',
    { timeout: 20000 },
    async () => {
      (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = false;
      sessionStorage.clear();

      let fijarSesion!: (s: SesionEntrenamientoDetalleDTO) => void;
      const puerta = new Promise<SesionEntrenamientoDetalleDTO>((resolver) => {
        fijarSesion = resolver;
      });

      let raiz: Root | null = null;
      try {
        const contenedor = document.createElement('div');
        document.body.appendChild(contenedor);
        raiz = createRoot(contenedor);
        raiz.render(<ContenedorAsincrono puerta={puerta} />);

        // Asentamiento del montaje (sesión nula) por sondeo, sin esperas fijas.
        await vi.waitFor(
          () => {
            expect(contenedor.querySelector('[data-testid="vista"]')?.textContent).toBe('foco');
            expect(contenedor.querySelector('button')?.textContent).toBe(
              'Ver entrenamiento completo',
            );
          },
          { timeout: 5000, interval: 10 },
        );

        // Clic en el hueco entre el commit de X y los efectos pasivos.
        let clicHecho = false;
        const observador = new MutationObserver(() => {
          if (clicHecho) return;
          const sesionTexto = contenedor.querySelector('[data-testid="sesion"]')?.textContent;
          const boton = contenedor.querySelector('button');
          if (
            sesionTexto === 'sesion-X' &&
            boton?.textContent === 'Ver entrenamiento completo'
          ) {
            clicHecho = true;
            boton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          }
        });
        observador.observe(contenedor, {
          childList: true,
          subtree: true,
          characterData: true,
        });

        fijarSesion(construirSesion('sesion-X'));

        // Por sondeo: la vista final deja de ser la del commit inicial cuando la
        // carrera se resuelve (el efecto tardío ya corrió). Sin esperas fijas.
        await vi.waitFor(
          () => {
            expect(clicHecho).toBe(true);
            expect(
              contenedor.querySelector('[data-testid="sesion"]')?.textContent,
            ).toBe('sesion-X');
          },
          { timeout: 5000, interval: 10 },
        );
        observador.disconnect();

        // Vacía todo lo pendiente de forma determinista y lee la vista final.
        (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
        await act(async () => {});
        const vistaFinal = contenedor.querySelector('[data-testid="vista"]')?.textContent;
        contenedor.remove();

        // El clic cayó en el hueco (si no, el test fallaría aquí y no por la vista).
        expect(clicHecho).toBe(true);
        // La elección del alumno debe sobrevivir al efecto tardío.
        expect(vistaFinal).toBe('lista');
      } finally {
        try {
          raiz?.unmount();
        } catch {
          // ignorado en limpieza
        }
        (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT =
          banderaActOriginal ?? true;
      }
    },
  );

  it('cambiar a otra sesión con la vista en "lista" vuelve a "foco"', async () => {
    const sesionX = construirSesion('sesion-X');
    const sesionY = construirSesion('sesion-Y');

    const { rerender } = render(<SondaMinima sesion={sesionX} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver entrenamiento completo' }));
    expect(screen.getByTestId('vista').textContent).toBe('lista');

    rerender(<SondaMinima sesion={sesionY} />);
    expect(screen.getByTestId('vista').textContent).toBe('foco');
  });
});
