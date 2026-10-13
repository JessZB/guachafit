/**
 * Prompt 73 (Ola 2, módulo `cartera`): modal de recordatorio manual (RN-02).
 *
 * Recorte verbatim de `CarteraPage.tsx` (bloque del modal). Presentacional puro: recibe el
 * estado del hook `useRecordatorioCartera` y callbacks. ÚNICO (R3): copy y flujo propios.
 */
import type { RefObject } from 'react';
import { AlertCircle, BellRing, CheckCircle2, Info, X } from 'lucide-react';
import { tonoResultadoRecordatorio } from '../../../lib/cartera';
import { urlWhatsApp } from '../../../lib/cartera-whatsapp';
import { formatFechaHoraLocal } from '../../../lib/date-format';
import type {
  FilaCarteraDTO,
  RecordatorioManualResultadoDTO,
} from '@guachafit/shared';

export interface ModalRecordatorioCarteraProps {
  fila: FilaCarteraDTO;
  resultado: RecordatorioManualResultadoDTO | null;
  error: string | null;
  enviando: boolean;
  copiado: boolean;
  telefonoWhatsApp: string | null;
  dialogRef: RefObject<HTMLDivElement | null>;
  onCerrar: () => void;
  onEnviar: () => void;
  onCopiar: () => void;
}

export function ModalRecordatorioCartera({
  fila,
  resultado,
  error,
  enviando,
  copiado,
  telefonoWhatsApp,
  dialogRef,
  onCerrar,
  onEnviar,
  onCopiar,
}: ModalRecordatorioCarteraProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cartera-recordatorio-titulo"
        tabIndex={-1}
        className="p-6 rounded-3xl bg-card border border-border shadow-2xl w-full max-w-lg space-y-4"
      >
        <div className="flex items-center justify-between border-b border-border/80 pb-3">
          <div className="flex items-center gap-2">
            <BellRing className="h-5 w-5 text-primary" />
            <h3
              id="cartera-recordatorio-titulo"
              className="font-bold text-base text-foreground"
            >
              Enviar recordatorio manual
            </h3>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="p-1.5 rounded-xl hover:bg-secondary text-muted-foreground cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-1">
          <p className="text-sm font-bold text-foreground">{fila.alumnoNombre}</p>
          <p className="text-xs text-muted-foreground">
            Saldo pendiente:{' '}
            <span className="font-mono font-bold text-foreground">
              ${fila.saldoPendienteUsd} USD
            </span>
            {fila.saldoPendienteBs && (
              <span className="font-mono text-muted-foreground">
                {' '}
                · Bs. {fila.saldoPendienteBs}
              </span>
            )}
          </p>
          {fila.ultimaGestionUtc && !resultado && (
            <p className="text-[11px] text-muted-foreground">
              Último recordatorio manual: {formatFechaHoraLocal(fila.ultimaGestionUtc)}
            </p>
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="p-3 rounded-2xl bg-destructive/10 border border-destructive/30 text-destructive text-xs font-bold flex items-center gap-2"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {resultado && (
          <div
            className={`p-3 rounded-2xl border text-xs font-bold flex items-start gap-2 ${
              tonoResultadoRecordatorio(resultado) === 'success'
                ? 'bg-success/15 border-success/30 text-success'
                : tonoResultadoRecordatorio(resultado) === 'warning'
                ? 'bg-warning/15 border-warning/30 text-warning'
                : 'bg-secondary/60 border-border text-muted-foreground'
            }`}
          >
            {tonoResultadoRecordatorio(resultado) === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            ) : (
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
            )}
            <span>{resultado.mensaje}</span>
          </div>
        )}

        {resultado?.mensajeSugerido && (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground" htmlFor="mensaje-recordatorio">
              Mensaje enviado (puedes copiarlo o abrir WhatsApp)
            </label>
            <textarea
              id="mensaje-recordatorio"
              readOnly
              rows={3}
              value={resultado.mensajeSugerido}
              className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs text-foreground resize-none"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onCopiar}
                className="py-2 px-4 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-bold text-xs cursor-pointer"
              >
                {copiado ? 'Copiado ✓' : 'Copiar mensaje'}
              </button>
              {telefonoWhatsApp && (
                <a
                  href={urlWhatsApp(telefonoWhatsApp, resultado.mensajeSugerido)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2 px-4 rounded-xl bg-success/15 border border-success/30 text-success font-bold text-xs hover:bg-success/25 transition-colors"
                >
                  Abrir WhatsApp
                </a>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onCerrar}
            className="flex-1 py-2.5 rounded-xl bg-secondary hover:bg-secondary/80 font-bold text-xs text-foreground cursor-pointer"
          >
            {resultado ? 'Cerrar' : 'Cancelar'}
          </button>
          {!resultado && (
            <button
              type="button"
              onClick={onEnviar}
              disabled={enviando}
              className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
            >
              {enviando ? 'Enviando...' : 'Enviar recordatorio'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
