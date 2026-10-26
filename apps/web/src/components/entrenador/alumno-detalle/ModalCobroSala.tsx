/**
 * Modal de cobro directo inteligente en sala (organismo).
 *
 * CANDIDATO a `common/` finanzas (fase D, matriz 48 fila 9): equivalente en
 * `CarteraPage.tsx:706-860`, mismo endpoint `cobro-directo-inteligente` (R3.1/R3.3). Hoy vive
 * en la carpeta del módulo porque la fase B no edita `common/` (R6). Extraído de
 * `pages/entrenador/AlumnoDetallePage.tsx` (SL-7). El envío vive en el hook de cobro.
 *
 * W-6: conserva los hermanos `label` + control en el mismo contenedor (`Monto Recibido`,
 * `Moneda`, `Fecha de la operación`), `role="dialog"` + `aria-modal` y el
 * `aria-label="Cerrar cobro directo"` que consultan los specs.
 * Cada control y el título se asocian con `useId` (dos modales no repiten `id`). Solo el monto
 * recibido es numérico (`inputMode="decimal"`). El botón de cerrar tiene área táctil `min-h-11`.
 *
 * §6: 11px mínimo, pesos ≤ 700, tokens con variante oscura, error honesto (`role="alert"`).
 */
import { useId } from 'react';
import type React from 'react';
import { Moneda } from '@guachafit/shared';
import { AlertCircle, CheckCircle2, DollarSign, X } from 'lucide-react';
import { fechaCalendarioLocal } from '../../../lib/date-format';
import { textoTasaCobro } from '../../../lib/cobro-sala';
import type { RetornoCobroSala } from './use-cobro-sala';

export interface ModalCobroSalaProps {
  cobro: RetornoCobroSala;
  onAsignarPlan: () => void;
  refDialogo: React.RefObject<HTMLDivElement | null>;
}

export function ModalCobroSala({
  cobro,
  onAsignarPlan,
  refDialogo,
}: ModalCobroSalaProps) {
  const {
    cobroMonto: monto,
    cobroMoneda: moneda,
    cobroFecha: fecha,
    tasaCobro: tasa,
    cobroNotas: notas,
    cobroSinPlan: sinPlan,
    isSubmittingCobro: enviando,
    cobroSuccessMsg: exito,
    cobroErrorMsg: error,
    setCobroMonto: onCambiarMonto,
    setCobroMoneda: onCambiarMoneda,
    cambiarFechaCobro: onCambiarFecha,
    manejarFechaInvalida: onFechaInvalida,
    setCobroNotas: onCambiarNotas,
    registrarCobro: onGuardar,
    setIsCobroModalOpen,
  } = cobro;
  const onCerrar = () => setIsCobroModalOpen(false);
  const idBase = useId();
  const idTitulo = `${idBase}-titulo`;
  const idMonto = `${idBase}-monto`;
  const idMoneda = `${idBase}-moneda`;
  const idFecha = `${idBase}-fecha`;
  const idNotas = `${idBase}-notas`;
  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        ref={refDialogo}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        className="p-6 rounded-3xl bg-card border border-border shadow-2xl w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between border-b border-border/80 pb-3">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-success" />
            <h3 id={idTitulo} className="font-bold text-base text-foreground">
              Cobrar en sala
            </h3>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar cobro directo"
            className="min-h-11 min-w-11 inline-flex items-center justify-center p-1.5 rounded-xl hover:bg-secondary text-muted-foreground cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {exito ? (
          <div className="p-6 text-center space-y-2">
            <CheckCircle2 className="h-10 w-10 text-success mx-auto" />
            <p className="text-xs font-bold text-foreground">{exito}</p>
          </div>
        ) : (
          <>
            {error && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center gap-2"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
                {sinPlan && (
                  <button
                    type="button"
                    onClick={onAsignarPlan}
                    className="ml-auto shrink-0 font-bold underline hover:no-underline cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    Asignar plan
                  </button>
                )}
              </div>
            )}
            <form onSubmit={onGuardar} className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Registra un cobro en <strong>efectivo</strong> recibido en sala. Se aplica a la
              cuota pendiente más antigua (o adelanta la próxima) y queda aprobado al instante.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor={idMonto} className="text-xs font-semibold text-muted-foreground">Monto Recibido</label>
                <input
                  id={idMonto}
                  type="text"
                  inputMode="decimal"
                  required
                  value={monto}
                  onChange={(e) => onCambiarMonto(e.target.value)}
                  placeholder="40.00"
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm font-mono font-bold text-foreground focus:outline-hidden focus:border-primary"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor={idMoneda} className="text-xs font-semibold text-muted-foreground">Moneda</label>
                <select
                  id={idMoneda}
                  value={moneda}
                  onChange={(e) => onCambiarMoneda(e.target.value as Moneda)}
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                >
                  <option value={Moneda.USD}>USD ($)</option>
                  <option value={Moneda.VES}>VES (Bs)</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor={idFecha} className="text-xs font-semibold text-muted-foreground">
                Fecha de la operación
              </label>
              <input
                id={idFecha}
                type="date"
                max={fechaCalendarioLocal()}
                value={fecha}
                onChange={(e) => onCambiarFecha(e.target.value)}
                // El navegador bloquea la fecha futura por `max`: se muestra nuestro mensaje
                // en lugar de su burbuja (los demás campos conservan la validación nativa).
                onInvalid={onFechaInvalida}
                className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
              />
            </div>

            {moneda === Moneda.VES && textoTasaCobro(tasa) && (
              <p className="text-[11px] font-semibold text-foreground">{textoTasaCobro(tasa)}</p>
            )}

            <div className="space-y-1">
              <label htmlFor={idNotas} className="text-xs font-semibold text-muted-foreground">Notas Internas</label>
              <input
                id={idNotas}
                type="text"
                value={notas}
                onChange={(e) => onCambiarNotas(e.target.value)}
                placeholder="ej. Pago completo del mes acordado"
                className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
              />
            </div>

            <button
              type="submit"
              disabled={enviando}
              className="w-full py-3 px-4 rounded-xl bg-success-strong hover:bg-success-strong/90 text-white font-bold text-sm tracking-wide shadow-md shadow-success-strong/20 active:scale-98 transition-all disabled:opacity-50 mt-2 cursor-pointer"
            >
              {enviando ? 'Registrando cobro…' : 'Registrar y Liquidar Cobro'}
            </button>
          </form>
          </>
        )}
      </div>
    </div>
  );
}
