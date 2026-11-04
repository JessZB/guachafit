/**
 * Módulo `alumnos` (D17, RF-011) · panel de ciclo de vida del enlace de captación.
 *
 * Vive dentro del diálogo "Invitar": contador de registros del enlace vigente, pausa/reanudación
 * de la captación y rotación del enlace con confirmación inline (el código anterior deja de
 * funcionar de inmediato, sin periodo de gracia). El único estado propio es si la confirmación
 * está abierta; los datos y las acciones llegan por props (R1).
 *
 * §6: controles de 44px (`min-h-11`), texto ≥ 12px, peso ≤ 700.
 */

import { useEffect, useRef, useState } from 'react';
import { KeyRound, PauseCircle, PlayCircle } from 'lucide-react';

export interface PanelCaptacionProps {
  captacionActiva: boolean;
  registrosPorEnlace: number;
  rotando: boolean;
  cambiandoCaptacion: boolean;
  errorCaptacion: string | null;
  mensajeCaptacion?: string | null;
  onRotarEnlace: () => void | Promise<void>;
  onAlternarCaptacion: () => void | Promise<void>;
}

/** Texto del contador: 0, 1 o N alumnos registrados con el enlace vigente. */
export function textoRegistrosPorEnlace(registros: number): string {
  if (registros <= 0) return 'Aún nadie se registró con este enlace.';
  if (registros === 1) return '1 alumno se registró con este enlace.';
  return `${registros} alumnos se registraron con este enlace.`;
}

const CLASE_BOTON =
  'min-h-11 py-2 px-3.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-primary';

export function PanelCaptacion({
  captacionActiva,
  registrosPorEnlace,
  rotando,
  cambiandoCaptacion,
  errorCaptacion,
  mensajeCaptacion = null,
  onRotarEnlace,
  onAlternarCaptacion,
}: PanelCaptacionProps) {
  const [confirmando, setConfirmando] = useState(false);
  const refGenerar = useRef<HTMLButtonElement>(null);
  const refCancelar = useRef<HTMLButtonElement>(null);

  // El botón que abre la confirmación desaparece: el foco pasa a «Cancelar» (opción segura)
  // y vuelve a «Generar nuevo enlace» al cerrarla.
  useEffect(() => {
    if (confirmando) refCancelar.current?.focus();
  }, [confirmando]);

  const cancelar = () => {
    setConfirmando(false);
    requestAnimationFrame(() => refGenerar.current?.focus());
  };

  const confirmar = () => {
    setConfirmando(false);
    void onRotarEnlace();
  };

  const ocupado = rotando || cambiandoCaptacion;

  return (
    <div className="space-y-3 border-t border-border/80 pt-4">
      <p className="text-xs text-muted-foreground">{textoRegistrosPorEnlace(registrosPorEnlace)}</p>

      {!captacionActiva && (
        <p className="text-xs font-semibold text-warning rounded-xl bg-warning/10 border border-warning/30 px-3 py-2">
          La captación está pausada: quien abra tu enlace verá que no está disponible.
        </p>
      )}

      {errorCaptacion && (
        <p role="alert" className="text-xs font-semibold text-destructive">
          {errorCaptacion}
        </p>
      )}
      {mensajeCaptacion && (
        <p role="status" className="text-xs font-semibold text-success">
          {mensajeCaptacion}
        </p>
      )}

      {confirmando ? (
        <div
          role="group"
          aria-label="Confirmar nuevo enlace"
          className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3"
        >
          <p className="text-xs font-semibold text-foreground">
            Tu enlace anterior dejará de funcionar de inmediato. ¿Generar uno nuevo?
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={confirmar}
              disabled={ocupado}
              className={`${CLASE_BOTON} bg-destructive text-destructive-foreground border-destructive`}
            >
              Sí, generar nuevo enlace
            </button>
            <button
              ref={refCancelar}
              type="button"
              onClick={cancelar}
              className={`${CLASE_BOTON} bg-card hover:bg-secondary text-foreground border-border`}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            ref={refGenerar}
            type="button"
            onClick={() => setConfirmando(true)}
            disabled={ocupado}
            className={`${CLASE_BOTON} bg-card hover:bg-secondary text-foreground border-border`}
          >
            <KeyRound className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            <span>Generar nuevo enlace</span>
          </button>
          <button
            type="button"
            onClick={() => void onAlternarCaptacion()}
            disabled={ocupado}
            className={`${CLASE_BOTON} bg-card hover:bg-secondary text-foreground border-border`}
          >
            {captacionActiva ? (
              <PauseCircle className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
            ) : (
              <PlayCircle className="h-3.5 w-3.5 text-success" aria-hidden="true" />
            )}
            <span>{captacionActiva ? 'Pausar captación' : 'Reanudar captación'}</span>
          </button>
        </div>
      )}
    </div>
  );
}
