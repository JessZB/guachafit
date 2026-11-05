/**
 * Prompt 73 (Ola 2, módulo `cartera`): modal de cobro directo en efectivo (RN-01).
 *
 * Recorte verbatim de `CarteraPage.tsx` (bloque del modal). Presentacional puro: recibe el
 * estado del hook `useCobroCartera` y callbacks. ÚNICO (R3): flujo propio de la cartera.
 *
 * UX-08: el monto y el saldo llegan ya formateados (`saldoTexto`, `resumen`); los ids de los
 * campos son únicos por instancia (`useId`) para que dos modales no repitan ids.
 */
import { useId, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, HandCoins, X } from 'lucide-react';
import { textoTasaCobro } from '../../../lib/cobro-sala';
import { fechaCalendarioLocal } from '../../../lib/date-format';
import { CLASES_SALIDA_MODAL, useSalidaModal } from '../../../lib/use-salida-modal';
import { Moneda, type ResumenCarteraDTO } from '@guachafit/shared';
import type { EstadoCobro } from './useCobroCartera';
import { CampoAjustes } from '../../ajustes/CampoAjustes';
import { BotonTactil } from '../../ui/BotonTactil';

export interface ModalCobroCarteraProps {
  cobro: EstadoCobro;
  error: string | null;
  exito: string | null;
  enviando: boolean;
  sinPlan: boolean;
  sinTasa: boolean;
  tasaVigente?: ResumenCarteraDTO['tasaVigente'];
  /** Saldo pendiente ya formateado (p. ej. `$50,00 USD`). */
  saldoTexto: string;
  /** Lo que se registrará y su equivalente en USD (D1); `null` si no hay conversión válida. */
  resumen: string | null;
  dialogRef: RefObject<HTMLDivElement | null>;
  onCerrar: () => void;
  onCambiarMonto: (monto: string) => void;
  onCambiarMoneda: (moneda: Moneda) => void;
  onCambiarFecha: (fecha: string) => void;
  onRegistrar: () => void;
}

const CLASES_CONTROL_NATIVO =
  'w-full min-h-11 px-3 rounded-xl bg-background border border-border text-base sm:text-sm text-foreground focus:outline-hidden focus:border-primary';

export function ModalCobroCartera({
  cobro,
  error,
  exito,
  enviando,
  sinPlan,
  sinTasa,
  tasaVigente,
  saldoTexto,
  resumen,
  dialogRef,
  onCerrar,
  onCambiarMonto,
  onCambiarMoneda,
  onCambiarFecha,
  onRegistrar,
}: ModalCobroCarteraProps) {
  const { saliendo, cerrar } = useSalidaModal(onCerrar);
  const idMonto = useId();
  const idMoneda = useId();
  const idFecha = useId();
  const sufijoMoneda = cobro.moneda === Moneda.VES ? 'Bs.' : 'USD';

  return (
    <div
      data-saliendo={saliendo || undefined}
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200 ${CLASES_SALIDA_MODAL}`}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cartera-cobro-titulo"
        tabIndex={-1}
        className="p-6 rounded-3xl bg-card border border-border shadow-2xl w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between border-b border-border/80 pb-3">
          <div className="flex items-center gap-2">
            <HandCoins className="h-5 w-5 text-primary" />
            <h3 id="cartera-cobro-titulo" className="font-bold text-base text-foreground">
              Registrar cobro en efectivo
            </h3>
          </div>
          <button
            type="button"
            onClick={cerrar}
            className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground cursor-pointer"
            aria-label="Cerrar registro de cobro"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-1">
          <p className="text-sm font-bold text-foreground">{cobro.fila.alumnoNombre}</p>
          <p className="text-xs text-muted-foreground">
            Saldo pendiente actual:{' '}
            <span className="font-mono font-bold text-foreground">{saldoTexto}</span>
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="p-3 rounded-2xl bg-destructive/10 border border-destructive/30 text-destructive text-xs font-bold flex items-center gap-2"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
            {sinPlan && cobro.fila.alumnoPerfilId && (
              <Link
                to={`/coach/alumnos/${cobro.fila.alumnoPerfilId}?tab=resumen`}
                className="ml-auto shrink-0 underline hover:no-underline focus-visible:outline-2 focus-visible:outline-primary"
              >
                Asignar plan
              </Link>
            )}
          </div>
        )}

        {exito ? (
          <div
            role="status"
            className="p-3 rounded-2xl bg-success/15 border border-success/30 text-success text-xs font-bold flex items-start gap-2"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{exito}</span>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <CampoAjustes
                id={idMonto}
                etiqueta="Monto"
                valor={cobro.monto}
                onCambiar={onCambiarMonto}
                inputMode="decimal"
                sufijo={sufijoMoneda}
              />
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground" htmlFor={idMoneda}>
                  Moneda
                </label>
                <select
                  id={idMoneda}
                  value={cobro.moneda}
                  onChange={(evento) => onCambiarMoneda(evento.target.value as Moneda)}
                  className={CLASES_CONTROL_NATIVO}
                >
                  <option value="USD">USD (efectivo)</option>
                  <option value="VES" disabled={sinTasa}>
                    Bs. (efectivo){sinTasa ? ' — configura tu tasa' : ''}
                  </option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground" htmlFor={idFecha}>
                Fecha de la operación
              </label>
              <input
                id={idFecha}
                type="date"
                max={fechaCalendarioLocal()}
                value={cobro.fechaOperacion}
                onChange={(evento) => onCambiarFecha(evento.target.value)}
                className={CLASES_CONTROL_NATIVO}
              />
            </div>

            {cobro.moneda === Moneda.VES &&
              textoTasaCobro(cobro.fila.tasaAplicada ?? tasaVigente) && (
                <p className="text-[11px] font-semibold text-foreground">
                  {textoTasaCobro(cobro.fila.tasaAplicada ?? tasaVigente)}
                </p>
              )}

            <p className="text-[11px] text-muted-foreground">
              El cobro queda aprobado al instante y se descuenta del saldo del alumno.
            </p>
          </div>
        )}

        {!exito && resumen && (
          <p role="status" aria-live="polite" className="text-xs font-semibold text-foreground">
            {resumen}
          </p>
        )}

        <div className="flex items-center gap-2 pt-1">
          <BotonTactil variante="secundaria" onClick={cerrar} className="flex-1">
            {exito ? 'Cerrar' : 'Cancelar'}
          </BotonTactil>
          {!exito && (
            <BotonTactil
              variante="primaria"
              onClick={onRegistrar}
              disabled={enviando || !cobro.monto}
              className="flex-1"
            >
              {enviando ? 'Registrando...' : 'Registrar cobro'}
            </BotonTactil>
          )}
        </div>
      </div>
    </div>
  );
}
