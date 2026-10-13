/**
 * RF-015 (Ola 3): accessible switch for one notification channel.
 *
 * Extracted verbatim from `components/notificaciones/MatrizPreferenciasNotificacion.tsx:50-89`.
 * Presentational (R1): typed props plus callback, no data fetching.
 * 44px touch area on mobile (§6.8); weights within the §6.12 cap.
 */
export interface InterruptorNotificacionProps {
  activo: boolean;
  bloqueado: boolean;
  etiqueta: string;
  onCambiar: (valor: boolean) => void;
}

export function InterruptorNotificacion({
  activo,
  bloqueado,
  etiqueta,
  onCambiar,
}: InterruptorNotificacionProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      disabled={bloqueado}
      onClick={() => onCambiar(!activo)}
      className="h-11 min-w-[52px] inline-flex items-center justify-center rounded-xl transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-70"
    >
      {/* El riel es un `span`: sin `inline-flex` sería un elemento en línea y no respetaría su
          alto ni su ancho (el interruptor se veía deformado). Riel de 44×24 con 2px de holgura:
          la perilla de 18px recorre 20px. */}
      <span
        aria-hidden="true"
        className={`inline-flex h-6 w-11 shrink-0 items-center rounded-full border p-0.5 transition-colors ${
          activo ? 'bg-primary border-primary' : 'bg-secondary border-border'
        }`}
      >
        <span
          aria-hidden="true"
          className={`block h-[18px] w-[18px] rounded-full bg-white shadow-xs transition-transform duration-150 ${
            activo ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </span>
    </button>
  );
}
