import React, { useCallback, useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import {
  descarteVigente,
  esIOSSafari,
  esModoStandalone,
  leerDescarteDeInstalacion,
  registrarDescarteDeInstalacion,
  type EventoInstalacionDiferida,
} from '../../lib/pwa-instalacion';
import { useDialogoAccesible } from '../../lib/use-dialogo-accesible';
import { CLASES_SALIDA_MODAL, useSalidaModal } from '../../lib/use-salida-modal';

interface NavigatorStandalone extends Navigator {
  standalone?: boolean;
}

/** Acceso defensivo: con cookies/almacenamiento bloqueados, `window.localStorage` lanza. */
function obtenerAlmacenamientoLocal(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

interface InstructivoInstalacionProps {
  onClose: () => void;
  onNoVolverAMostrar: () => void;
}

/** Instructivo breve para instalar en iOS/iPadOS, donde no existe `beforeinstallprompt`. */
function InstructivoInstalacion({ onClose, onNoVolverAMostrar }: InstructivoInstalacionProps) {
  // U3b: Escape, trampa de Tab y restore del foco. El foco inicial lo conserva `autoFocus`
  // sobre "Entendido" (acción principal), por eso el hook no lo reasigna.
  const { saliendo, cerrar } = useSalidaModal(onClose);
  const refDialogo = useDialogoAccesible({ onCerrar: cerrar, enfocarAlAbrir: false });

  return (
    <div
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) cerrar();
      }}
      data-saliendo={saliendo || undefined}
      className={`fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200 ${CLASES_SALIDA_MODAL}`}
    >
      <div
        ref={refDialogo}
        role="dialog"
        aria-modal="true"
        aria-labelledby="instalar-app-title"
        tabIndex={-1}
        className="p-5 rounded-3xl bg-card border border-border/80 shadow-2xl w-full max-w-sm space-y-4"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border/80 pb-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-2 rounded-xl bg-primary/15 text-primary shrink-0">
              <Share className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3
                id="instalar-app-title"
                className="font-bold text-base text-foreground leading-tight"
              >
                Instalar GUACHAFIT
              </h3>
              <p className="text-[11px] text-muted-foreground">Safari en iPhone o iPad</p>
            </div>
          </div>
          <button
            type="button"
            onClick={cerrar}
            aria-label="Cerrar instructivo de instalación"
            className="p-1.5 rounded-xl hover:bg-secondary text-muted-foreground transition-colors cursor-pointer shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ol className="space-y-3 text-sm text-foreground">
          <li className="flex gap-3">
            <span className="font-mono text-xs font-bold text-primary mt-0.5" aria-hidden="true">
              1
            </span>
            <span>
              Toca el botón <strong>Compartir</strong> en la barra de Safari.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-mono text-xs font-bold text-primary mt-0.5" aria-hidden="true">
              2
            </span>
            <span>
              Elige <strong>Añadir a pantalla de inicio</strong>.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-mono text-xs font-bold text-primary mt-0.5" aria-hidden="true">
              3
            </span>
            <span>
              Confirma con <strong>Añadir</strong>: la app quedará instalada como una más.
            </span>
          </li>
        </ol>

        <div className="pt-1 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onNoVolverAMostrar}
            className="text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            No volver a mostrar
          </button>
          <button
            type="button"
            autoFocus
            onClick={cerrar}
            className="py-2 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-sm shadow-primary/25 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * U1 (Ola 4): invitación discreta a instalar la PWA (A2HS).
 * - Android/Chromium: usa el `beforeinstallprompt` diferido.
 * - iOS/iPadOS Safari: abre un instructivo de 3 pasos.
 * Se oculta si la app ya corre instalada, si el usuario descartó la invitación
 * (30 días) o si el navegador no ofrece ninguna vía de instalación.
 * UX-04: `onDisponibilidad` informa al padre si la invitación está visible.
 */
interface InstalarAppPromptProps {
  onDisponibilidad?: (disponible: boolean) => void;
}

export function InstalarAppPrompt({ onDisponibilidad }: InstalarAppPromptProps = {}) {
  const [eventoDiferido, setEventoDiferido] = useState<EventoInstalacionDiferida | null>(null);
  // Inicialización síncrona: evita que el primer render muestre la marca genérica antes de detectar iOS.
  const [esIOS] = useState(
    () => typeof navigator !== 'undefined' && esIOSSafari(navigator.userAgent, navigator.maxTouchPoints ?? 0)
  );
  const [yaInstalada, setYaInstalada] = useState(false);
  const [descartado, setDescartado] = useState(false);
  const [instructivoAbierto, setInstructivoAbierto] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(display-mode: standalone)');
    const actualizarModo = () =>
      setYaInstalada(
        esModoStandalone(media.matches, (navigator as NavigatorStandalone).standalone)
      );
    actualizarModo();

    const manejarBeforeInstallPrompt = (evento: Event) => {
      evento.preventDefault();
      setEventoDiferido(evento as EventoInstalacionDiferida);
    };
    const manejarAppInstalled = () => {
      setEventoDiferido(null);
      setYaInstalada(true);
    };

    media.addEventListener?.('change', actualizarModo);
    window.addEventListener('beforeinstallprompt', manejarBeforeInstallPrompt);
    window.addEventListener('appinstalled', manejarAppInstalled);
    setDescartado(
      descarteVigente(leerDescarteDeInstalacion(obtenerAlmacenamientoLocal()), Date.now())
    );

    return () => {
      media.removeEventListener?.('change', actualizarModo);
      window.removeEventListener('beforeinstallprompt', manejarBeforeInstallPrompt);
      window.removeEventListener('appinstalled', manejarAppInstalled);
    };
  }, []);

  const marcarDescarte = useCallback(() => {
    registrarDescarteDeInstalacion(obtenerAlmacenamientoLocal(), Date.now());
    setDescartado(true);
  }, []);

  const solicitarInstalacion = useCallback(async () => {
    if (!eventoDiferido) return;
    try {
      await eventoDiferido.prompt();
      const eleccion = await eventoDiferido.userChoice;
      if (eleccion.outcome === 'accepted') {
        setEventoDiferido(null);
      } else {
        marcarDescarte();
      }
    } catch {
      marcarDescarte();
    }
  }, [eventoDiferido, marcarDescarte]);

  const disponible = !(yaInstalada || descartado || (!eventoDiferido && !esIOS));

  useEffect(() => {
    onDisponibilidad?.(disponible);
  }, [disponible, onDisponibilidad]);

  if (!disponible) return null;

  return (
    <>
      <button
        type="button"
        onClick={() =>
          eventoDiferido ? void solicitarInstalacion() : setInstructivoAbierto(true)
        }
        aria-label="Instalar la aplicación GUACHAFIT en este dispositivo"
        title="Instalar app"
        className="flex items-center gap-1.5 min-h-11 min-w-11 justify-center px-3 rounded-full text-xs font-semibold cursor-pointer border bg-primary/15 text-primary border-primary/30 hover:bg-primary/25 active:scale-95 transition-all"
      >
        {esIOS ? (
          <Share className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        <span className="hidden md:inline">Instalar app</span>
      </button>

      {instructivoAbierto && (
        <InstructivoInstalacion
          onClose={() => setInstructivoAbierto(false)}
          onNoVolverAMostrar={() => {
            setInstructivoAbierto(false);
            marcarDescarte();
          }}
        />
      )}
    </>
  );
}
