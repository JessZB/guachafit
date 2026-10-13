/**
 * Prompt 73 (Ola 2, módulo `cartera`): modal de cobro directo en efectivo (RN-01).
 *
 * Recorte verbatim de `CarteraPage.tsx` (bloque del modal). Presentacional puro: recibe el
 * estado del hook `useCobroCartera` y callbacks. ÚNICO (R3): flujo propio de la cartera.
 */
import type { RefObject } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, HandCoins, X } from 'lucide-react';
import { textoTasaCobro } from '../../../lib/cobro-sala';
import { fechaCalendarioLocal } from '../../../lib/date-format';
import { Moneda, type ResumenCarteraDTO } from '@guachafit/shared';
import type { EstadoCobro } from './useCobroCartera';

export interface ModalCobroCarteraProps {
  cobro: EstadoCobro;
  error: string | null;
  exito: string | null;
  enviando: boolean;
  sinPlan: boolean;
  sinTasa: boolean;
  tasaVigente?: ResumenCarteraDTO['tasaVigente'];
  dialogRef: RefObject<HTMLDivElement | null>;
  onCerrar: () => void;
  onCambiarMonto: (monto: string) => void;
  onCambiarMoneda: (moneda: Moneda) => void;
  onCambiarFecha: (fecha: string) => void;
  onRegistrar: () => void;
}

export function ModalCobroCartera({
  cobro,
  error,
  exito,
  enviando,
  sinPlan,
  sinTasa,
  tasaVigente,
  dialogRef,
  onCerrar,
  onCambiarMonto,
  onCambiarMoneda,
  onCambiarFecha,
  onRegistrar,
}: ModalCobroCarteraProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cartera-cobro-titulo"
        tabIndex={-1}
        className="p-6 rounded-3xl bg-card border border-border shadow-2xl w-full max-w-md space-y-4"
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
            onClick={onCerrar}
            className="p-1.5 rounded-xl hover:bg-secondary text-muted-foreground cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-1">
          <p className="text-sm font-bold text-foreground">{cobro.fila.alumnoNombre}</p>
          <p className="text-xs text-muted-foreground">
            Saldo pendiente actual:{' '}
            <span className="font-mono font-bold text-foreground">
              ${cobro.fila.saldoPendienteUsd} USD
            </span>
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
          <div className="p-3 rounded-2xl bg-success/15 border border-success/30 text-success text-xs font-bold flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{exito}</span>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground" htmlFor="cobro-monto">
                  Monto
                </label>
                <input
                  id="cobro-monto"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={cobro.monto}
                  onChange={(evento) => onCambiarMonto(evento.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground" htmlFor="cobro-moneda">
                  Moneda
                </label>
                <select
                  id="cobro-moneda"
                  value={cobro.moneda}
                  onChange={(evento) => onCambiarMoneda(evento.target.value as Moneda)}
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                >
                  <option value="USD">USD (efectivo)</option>
                  <option value="VES" disabled={sinTasa}>
                    Bs. (efectivo){sinTasa ? ' — configura tu tasa' : ''}
                  </option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground" htmlFor="cobro-fecha">
                Fecha de la operación
              </label>
              <input
                id="cobro-fecha"
                type="date"
                max={fechaCalendarioLocal()}
                value={cobro.fechaOperacion}
                onChange={(evento) => onCambiarFecha(evento.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
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

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onCerrar}
            className="flex-1 py-2.5 rounded-xl bg-secondary hover:bg-secondary/80 font-bold text-xs text-foreground cursor-pointer"
          >
            {exito ? 'Cerrar' : 'Cancelar'}
          </button>
          {!exito && (
            <button
              type="button"
              onClick={onRegistrar}
              disabled={enviando || !cobro.monto}
              className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
            >
              {enviando ? 'Registrando...' : 'Registrar cobro'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
