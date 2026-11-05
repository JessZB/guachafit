/**
 * Prompt 73 (Ola 2, módulo `cartera`): modal de recordatorio manual (RN-02).
 *
 * Recorte verbatim de `CarteraPage.tsx` (bloque del modal). Presentacional puro: recibe el
 * estado del hook `useRecordatorioCartera` y callbacks. ÚNICO (R3): copy y flujo propios.
 *
 * UX-09b: antes de enviar muestra la vista previa (solo lectura) o el motivo por el que no se
 * puede enviar. Los ids son únicos por instancia (`useId`) para que dos modales no repitan ids.
 */
import { useId } from 'react';
import { AlertCircle, BellRing, CheckCircle2, Info, X } from 'lucide-react';
import { tonoResultadoRecordatorio } from '../../../lib/cartera';
import { urlWhatsApp } from '../../../lib/cartera-whatsapp';
import { formatFechaHoraLocal } from '../../../lib/date-format';
import { useDialogoAccesible } from '../../../lib/use-dialogo-accesible';
import { CLASES_SALIDA_MODAL, useSalidaModal } from '../../../lib/use-salida-modal';
import type {
  FilaCarteraDTO,
  RecordatorioManualResultadoDTO,
  VistaPreviaRecordatorioDTO,
} from '@guachafit/shared';
import { BotonTactil } from '../../ui/BotonTactil';

export interface ModalRecordatorioCarteraProps {
  fila: FilaCarteraDTO;
  resultado: RecordatorioManualResultadoDTO | null;
  error: string | null;
  enviando: boolean;
  copiado: boolean;
  telefonoWhatsApp: string | null;
  vistaPrevia: VistaPreviaRecordatorioDTO | null;
  cargandoVistaPrevia: boolean;
  errorVistaPrevia: string | null;
  onReintentarVistaPrevia: () => void;
  /** Saldo pendiente ya formateado (p. ej. `$50,00 USD · Bs. 3.250,00`). */
  saldoTexto: string;
  onCerrar: () => void;
  onEnviar: () => void;
  onCopiar: () => void;
}

const CLASES_AREA_MENSAJE =
  'w-full px-3 py-2 rounded-xl bg-background border border-border text-xs text-foreground resize-none';

export function ModalRecordatorioCartera({
  fila,
  resultado,
  error,
  enviando,
  copiado,
  telefonoWhatsApp,
  vistaPrevia,
  cargandoVistaPrevia,
  errorVistaPrevia,
  onReintentarVistaPrevia,
  saldoTexto,
  onCerrar,
  onEnviar,
  onCopiar,
}: ModalRecordatorioCarteraProps) {
  const { saliendo, cerrar } = useSalidaModal(onCerrar);
  const refDialogo = useDialogoAccesible({ abierto: true, onCerrar: cerrar });
  const idTitulo = useId();
  const idMensajeVistaPrevia = useId();
  const idMensajeEnviado = useId();
  const idAyudaWhatsApp = useId();

  const tono = resultado ? tonoResultadoRecordatorio(resultado) : null;
  const puedeEnviar = vistaPrevia?.puedeEnviar === true && !enviando && !cargandoVistaPrevia;

  return (
    <div
      data-saliendo={saliendo || undefined}
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) cerrar();
      }}
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200 ${CLASES_SALIDA_MODAL}`}
    >
      <div
        ref={refDialogo}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        className="p-6 rounded-3xl bg-card border border-border shadow-2xl w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between border-b border-border/80 pb-3">
          <div className="flex items-center gap-2">
            <BellRing className="h-5 w-5 text-primary" aria-hidden="true" />
            <h3 id={idTitulo} className="font-bold text-base text-foreground">
              Enviar recordatorio manual
            </h3>
          </div>
          <button
            type="button"
            onClick={cerrar}
            className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground cursor-pointer"
            aria-label="Cerrar recordatorio"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-1">
          <p className="text-sm font-bold text-foreground">{fila.alumnoNombre}</p>
          <p className="text-xs text-muted-foreground">
            Saldo pendiente:{' '}
            <span className="font-mono font-bold text-foreground">{saldoTexto}</span>
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
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {/* Vista previa previa al envío: carga, error con reintento, motivo o texto que se enviará */}
        {!resultado && (
          <div className="space-y-2">
            {cargandoVistaPrevia && (
              <p role="status" className="text-xs text-muted-foreground">
                Preparando el mensaje…
              </p>
            )}

            {errorVistaPrevia && (
              <div
                role="alert"
                className="p-3 rounded-2xl bg-destructive/10 border border-destructive/30 text-destructive text-xs font-bold flex flex-wrap items-center gap-2"
              >
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="flex-1">{errorVistaPrevia}</span>
                <BotonTactil variante="secundaria" onClick={onReintentarVistaPrevia}>
                  Reintentar
                </BotonTactil>
              </div>
            )}

            {vistaPrevia && !vistaPrevia.puedeEnviar && (
              <div
                role="status"
                className="p-3 rounded-2xl bg-warning/15 border border-warning/30 text-warning text-xs font-bold flex items-start gap-2"
              >
                <Info className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{vistaPrevia.mensaje}</span>
              </div>
            )}

            {vistaPrevia?.puedeEnviar && vistaPrevia.cuerpo && (
              <div className="space-y-1">
                <label
                  className="text-xs font-semibold text-foreground"
                  htmlFor={idMensajeVistaPrevia}
                >
                  Mensaje que se enviará
                </label>
                <textarea
                  id={idMensajeVistaPrevia}
                  readOnly
                  rows={3}
                  value={vistaPrevia.cuerpo}
                  className={CLASES_AREA_MENSAJE}
                />
              </div>
            )}
          </div>
        )}

        {resultado && (
          <div
            role="status"
            className={`p-3 rounded-2xl border text-xs font-bold flex items-start gap-2 ${
              tono === 'success'
                ? 'bg-success/15 border-success/30 text-success'
                : tono === 'warning'
                ? 'bg-warning/15 border-warning/30 text-warning'
                : 'bg-secondary/60 border-border text-muted-foreground'
            }`}
          >
            {tono === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
            ) : (
              <Info className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
            )}
            <span>{resultado.mensaje}</span>
          </div>
        )}

        {resultado?.mensajeSugerido && (
          <div className="space-y-2">
            <label
              className="text-xs font-semibold text-foreground"
              htmlFor={idMensajeEnviado}
            >
              Mensaje enviado (puedes copiarlo o abrir WhatsApp)
            </label>
            <textarea
              id={idMensajeEnviado}
              readOnly
              rows={3}
              value={resultado.mensajeSugerido}
              className={CLASES_AREA_MENSAJE}
            />
            {/* Único aviso con aria-live: anuncia el copiado sin repetir el mensaje en pantalla */}
            <p aria-live="polite" className="sr-only">
              {copiado ? 'Mensaje copiado' : ''}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <BotonTactil variante="secundaria" onClick={onCopiar}>
                {copiado ? 'Copiado ✓' : 'Copiar mensaje'}
              </BotonTactil>
              {telefonoWhatsApp && (
                <a
                  href={urlWhatsApp(telefonoWhatsApp, resultado.mensajeSugerido)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-describedby={idAyudaWhatsApp}
                  className="min-h-11 inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-success/15 border border-success/30 text-success font-bold text-xs hover:bg-success/25 transition-colors"
                >
                  Abrir WhatsApp
                </a>
              )}
            </div>
            {telefonoWhatsApp && (
              <p id={idAyudaWhatsApp} className="text-[11px] text-muted-foreground">
                Se abre en WhatsApp, fuera de la app.
              </p>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <BotonTactil variante="secundaria" onClick={cerrar} className="flex-1">
            {resultado ? 'Cerrar' : 'Cancelar'}
          </BotonTactil>
          {!resultado && (
            <BotonTactil
              variante="primaria"
              onClick={onEnviar}
              disabled={!puedeEnviar}
              className="flex-1"
            >
              {enviando ? 'Enviando...' : 'Enviar recordatorio'}
            </BotonTactil>
          )}
        </div>
      </div>
    </div>
  );
}
