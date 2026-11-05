import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CronometroDescanso } from '../atleta/entrenamiento/use-cronometro-descanso';
import { RestTimerFab } from './RestTimerFab';
import { RestTimerPildora } from './RestTimerPildora';
import { RestTimerPanel } from './RestTimerPanel';
import { useCapaSalienteCronometro } from './use-capa-saliente-cronometro';
import { usePlegarAlEnfocarCampo } from './use-plegar-al-enfocar-campo';

export { DURACION_SALIDA_CRONOMETRO_MS } from './use-capa-saliente-cronometro';

interface RestTimerProps {
  cronometro: CronometroDescanso;
  /** Falso mientras hay un modal u otra pantalla encima: oculta el widget SIN cerrar el cronómetro. */
  visible: boolean;
  /** Toque en el botón flotante: abre el cronómetro libre en pausa. */
  onAbrirEnPausa: () => void;
}

const sinAccion = () => {};

/**
 * Widget flotante del cronómetro de descanso (RF-001, ADR-021, ADR-027). Presentacional: el
 * estado, el reloj y la persistencia viven en `useCronometroDescanso`. Un único ancla `fixed`
 * (`data-estado`) con tres estados: botón flotante en reposo, píldora discreta y panel expandido.
 *
 * Se monta en un portal sobre `document.body`: un `transform` en un ancestro (animación de la
 * pantalla) convertiría ese ancestro en el bloque contenedor de lo `fixed` y lo desplazaría.
 */
export function RestTimer({ cronometro, visible, onAbrirEnPausa }: RestTimerProps) {
  const { abierto, serieId, terminado } = cronometro;
  const [expandido, setExpandido] = useState(false);
  // Hay que mover el foco al panel solo cuando se abrió con el botón flotante (no al marcar serie).
  const [enfocarPanel, setEnfocarPanel] = useState(false);
  // El toque en el botón flotante: su efecto (abierto → true) llega en el mismo lote de render.
  const [abiertoPorBoton, setAbiertoPorBoton] = useState(false);
  const [previo, setPrevio] = useState({ abierto, serieId });
  const botonRef = useRef<HTMLButtonElement>(null);
  const anclaRef = useRef<HTMLDivElement>(null);
  const devolverFoco = useRef(false);

  // Cada descanso nuevo (otra serie, abrir o cerrar) arranca como píldora, salvo si lo abrió el
  // botón flotante: ahí el alumno quiere elegir el tiempo, así que se abre el panel. Se ajusta
  // DURANTE el render (como `use-vista-sesion.ts`): un efecto dejaría pasar un render con el
  // estado viejo y colapsaría el panel recién abierto.
  if (previo.abierto !== abierto || previo.serieId !== serieId) {
    setPrevio({ abierto, serieId });
    const porBoton = abierto && !previo.abierto && abiertoPorBoton;
    setExpandido(porBoton);
    setEnfocarPanel(porBoton);
  }
  if (abierto && abiertoPorBoton) setAbiertoPorBoton(false);

  // Salvaguarda: si el toque no consiguió abrir el cronómetro, la intención caduca. Sin esto
  // quedaría en true y la siguiente apertura AUTOMÁTICA (marcar serie) saldría como panel y
  // robaría el foco. Caduca en una microtarea y no en el propio commit: la ruta normal (el
  // anfitrión abre en el mismo lote) ya la consume durante el render, y así el efecto no la
  // borra antes de que llegue un `abierto` que se confirme justo después del toque.
  useEffect(() => {
    if (!abiertoPorBoton || abierto) return;
    let vigente = true;
    void Promise.resolve().then(() => {
      if (vigente) setAbiertoPorBoton(false);
    });
    return () => {
      vigente = false;
    };
  }, [abiertoPorBoton, abierto]);

  const saliente = useCapaSalienteCronometro(cronometro, expandido, visible);

  // Tras cerrar con la X, el foco vuelve al botón flotante (la X desaparece con la capa).
  useEffect(() => {
    if (abierto || !devolverFoco.current) return;
    devolverFoco.current = false;
    botonRef.current?.focus();
  }, [abierto, visible]);

  const cronometroVista: CronometroDescanso = {
    ...cronometro,
    cerrar: () => {
      devolverFoco.current = true;
      cronometro.cerrar();
    },
  };

  const estado = !visible ? null : !abierto ? 'fab' : expandido ? 'panel' : 'pildora';

  // El teclado de un campo externo taparía el panel: se pliega a píldora mientras se escribe.
  usePlegarAlEnfocarCampo(estado === 'panel', anclaRef, () => {
    setExpandido(false);
    setEnfocarPanel(false);
  });

  return createPortal(
    <>
      {/* Siempre montada y fuera de las capas animadas o `inert`: anuncia el fin del descanso aunque
          el widget esté oculto o minimizado. La región existe antes para que el cambio se lea. */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {terminado ? 'Descanso terminado' : ''}
      </div>

      {estado && (
        <div
          ref={anclaRef}
          data-estado={estado}
          className="fixed z-[45] max-w-[calc(100vw-2rem)] right-[calc(1rem_+_env(safe-area-inset-right,0px))] bottom-[calc(5.5rem_+_env(safe-area-inset-bottom,0px))] lg:right-6 lg:bottom-6"
        >
          {estado === 'fab' ? (
            <RestTimerFab
              botonRef={botonRef}
              onAbrir={() => {
                setAbiertoPorBoton(true);
                onAbrirEnPausa();
              }}
            />
          ) : (
            <div
              role="timer"
              aria-label="Cronómetro de descanso"
              className="origin-bottom-right transition-[opacity,scale] duration-250 ease-out starting:scale-90 starting:opacity-0"
            >
              {estado === 'panel' ? (
                <RestTimerPanel
                  cronometro={cronometroVista}
                  enfocarAccionPrincipal={enfocarPanel}
                  onMinimizar={() => {
                    setExpandido(false);
                    setEnfocarPanel(false);
                  }}
                />
              ) : (
                <RestTimerPildora cronometro={cronometroVista} onExpandir={() => setExpandido(true)} />
              )}
            </div>
          )}

          {/* Salida: la última vista, congelada, se apaga sobre el botón flotante. Nada de ella es
              accesible ni interactivo (`aria-hidden` + `inert`); `starting:` hace de punto de partida. */}
          {saliente && (
            <div
              data-saliendo="true"
              aria-hidden="true"
              inert
              className="pointer-events-none absolute bottom-0 right-0 w-max max-w-[calc(100vw-2rem)] origin-bottom-right scale-90 opacity-0 transition-[opacity,scale] duration-150 ease-in starting:scale-100 starting:opacity-100"
            >
              {saliente.expandido ? (
                <RestTimerPanel cronometro={saliente.cronometro} onMinimizar={sinAccion} />
              ) : (
                <RestTimerPildora cronometro={saliente.cronometro} onExpandir={sinAccion} />
              )}
            </div>
          )}
        </div>
      )}
    </>,
    document.body
  );
}
