/**
 * Formulario de reporte de pago de la vista `pagos` (fase B, prompt 54).
 *
 * Extraído tal cual desde `pages/atleta/PagosPage.tsx` (L784–953, sin la subida
 * L882–944 que vive en `SubidaComprobantePago` y llega por el slot
 * `comprobante`): método, moneda + monto, previsualización de conversión,
 * referencia, fecha y submit.
 *
 * R1: componente único de vista. Desde UX-21 cada `label` se asocia con su
 * `input`/`select` mediante `htmlFor`/`id` (`useId`). Presentacional: todo el
 * estado y los handlers llegan por props (vienen de `use-reporte-pago.ts`);
 * sin `useQuery` ni `api-client`.
 *
 * R5 (acoplamientos que los specs exigen conservar):
 * - cada `label` y su `input` siguen siendo hermanos en el mismo contenedor
 *   (los specs localizan los campos por `label.textContent` +
 *   `parentElement.querySelector('input…')`);
 * - `max` = hoy local, validación nativa intacta (`required`, `onInvalid` con
 *   `rangeOverflow` → mensaje propio) y botón "Enviar Comprobante de Pago".
 *
 * §6: `entrada-numerica` (`inputMode="decimal"` en el monto), validación
 * honesta (fecha futura y VES sin tasa bloquean con mensaje claro), `font-bold`
 * (700), tokens con variante claro/oscuro.
 */
import { useId, type FormEvent, type ReactNode } from 'react';
import { MetodoPago, Moneda } from '@guachafit/shared';
import { fechaCalendarioLocal } from '../../../lib/date-format';

export interface FormularioReportePagoProps {
  metodoPago: MetodoPago;
  onMetodoPago: (metodo: MetodoPago) => void;
  moneda: Moneda;
  onMoneda: (moneda: Moneda) => void;
  montoOriginal: string;
  onMonto: (monto: string) => void;
  referenciaBancaria: string;
  onReferencia: (referencia: string) => void;
  fechaOperacion: string;
  onFecha: (valor: string) => void;
  /** El navegador bloquea la fecha futura por `max`: mensaje propio (hallazgo 6). */
  onFechaInvalida: () => void;
  isSubmitting: boolean;
  pagoVesSinTasa: boolean;
  contravalorUsd: string;
  onSubmit: (e: FormEvent) => void;
  /** Slot de la subida del comprobante (`SubidaComprobantePago`). */
  comprobante: ReactNode;
  errorMonto?: string | null;
  errorFecha?: string | null;
}

export function FormularioReportePago({
  metodoPago,
  onMetodoPago,
  moneda,
  onMoneda,
  montoOriginal,
  onMonto,
  referenciaBancaria,
  onReferencia,
  fechaOperacion,
  onFecha,
  onFechaInvalida,
  isSubmitting,
  pagoVesSinTasa,
  contravalorUsd,
  onSubmit,
  comprobante,
  errorMonto,
  errorFecha,
}: FormularioReportePagoProps) {
  const idMetodo = useId();
  const idMoneda = useId();
  const idMonto = useId();
  const idReferencia = useId();
  const idFecha = useId();
  const idErrorMonto = useId();
  const idErrorFecha = useId();

  // Sin contravalor válido (tasa fallida, monto vacío o no numérico) no se muestra "$0.00 USD".
  const valorUsdNumerico = Number(contravalorUsd);
  const contravalorVisible =
    contravalorUsd !== '—' && Number.isFinite(valorUsdNumerico) && valorUsdNumerico > 0;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <fieldset disabled={isSubmitting} className="space-y-4 min-w-0 border-0 p-0 m-0">
        <div className="space-y-1.5">
          <label htmlFor={idMetodo} className="text-xs font-semibold text-muted-foreground">
            Método de Pago
          </label>
          <select
            id={idMetodo}
            value={metodoPago}
            onChange={(e) => onMetodoPago(e.target.value as MetodoPago)}
            className="w-full min-h-11 px-3.5 py-2.5 rounded-2xl bg-background border border-border text-base sm:text-sm text-foreground focus:outline-hidden focus:border-primary"
          >
            <option value={MetodoPago.PAGO_MOVIL}>Pago Móvil (VES)</option>
            <option value={MetodoPago.TRANSFERENCIA_BANCARIA}>Transferencia Bancaria (VES)</option>
            <option value={MetodoPago.EFECTIVO_USD}>Efectivo USD</option>
            <option value={MetodoPago.EFECTIVO_VES}>Efectivo VES</option>
            <option value={MetodoPago.ZELLE}>Zelle (USD)</option>
            <option value={MetodoPago.BINANCE_USDT}>Binance USDT</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor={idMoneda} className="text-xs font-semibold text-muted-foreground">
              Moneda
            </label>
            <select
              id={idMoneda}
              value={moneda}
              onChange={(e) => onMoneda(e.target.value as Moneda)}
              className="w-full min-h-11 px-3.5 py-2.5 rounded-2xl bg-background border border-border text-base sm:text-sm text-foreground focus:outline-hidden focus:border-primary"
            >
              <option value={Moneda.VES}>VES (Bolívares)</option>
              <option value={Moneda.USD}>USD (Dólares)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor={idMonto} className="text-xs font-semibold text-muted-foreground">
              Monto Pagado
            </label>
            <input
              id={idMonto}
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={montoOriginal}
              onChange={(e) => onMonto(e.target.value)}
              aria-invalid={errorMonto ? 'true' : undefined}
              aria-describedby={errorMonto ? idErrorMonto : undefined}
              className="w-full min-h-11 px-3.5 py-2.5 rounded-2xl bg-background border border-border text-base sm:text-sm font-mono text-foreground focus:outline-hidden focus:border-primary"
            />
            {errorMonto && (
              <p id={idErrorMonto} role="alert" className="text-xs font-semibold text-destructive">
                {errorMonto}
              </p>
            )}
          </div>
        </div>

        {/* Previsualización de conversión */}
        <div
          className={`p-3.5 rounded-2xl border flex items-center justify-between ${
            pagoVesSinTasa
              ? 'bg-warning/10 border-warning/30'
              : 'bg-primary/10 border-primary/20'
          }`}
        >
          <span className="text-xs text-muted-foreground">
            {pagoVesSinTasa
              ? 'Sin tasa configurada: tu entrenador debe definirla para reportar pagos en bolívares.'
              : 'Monto en USD acreditado a tu cuota:'}
          </span>
          {!pagoVesSinTasa && (
            <span className="font-mono font-bold text-sm text-primary">
              {contravalorVisible ? `$${contravalorUsd} USD` : '—'}
            </span>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor={idReferencia} className="text-xs font-semibold text-muted-foreground">
            Referencia Bancaria (Últimos 4-6 dígitos)
          </label>
          <input
            id={idReferencia}
            type="text"
            value={referenciaBancaria}
            onChange={(e) => onReferencia(e.target.value)}
            placeholder="Ej: 987654"
            className="w-full min-h-11 px-3.5 py-2.5 rounded-2xl bg-background border border-border text-base sm:text-sm font-mono text-foreground focus:outline-hidden focus:border-primary"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor={idFecha} className="text-xs font-semibold text-muted-foreground">
            Fecha de Operación
          </label>
          <input
            id={idFecha}
            type="date"
            required
            max={fechaCalendarioLocal()}
            value={fechaOperacion}
            onChange={(e) => onFecha(e.target.value)}
            aria-invalid={errorFecha ? 'true' : undefined}
            aria-describedby={errorFecha ? idErrorFecha : undefined}
            // El navegador bloquea la fecha futura por `max`: se muestra nuestro mensaje
            // en lugar de su burbuja (los demás campos conservan la validación nativa).
            onInvalid={(e) => {
              if (!e.currentTarget.validity.rangeOverflow) return;
              e.preventDefault();
              onFechaInvalida();
            }}
            className="w-full min-h-11 px-3.5 py-2.5 rounded-2xl bg-background border border-border text-base sm:text-sm text-foreground focus:outline-hidden focus:border-primary"
          />
          {errorFecha && (
            <p id={idErrorFecha} role="alert" className="text-xs font-semibold text-destructive">
              {errorFecha}
            </p>
          )}
        </div>

        {/* Subida de Comprobante */}
        {comprobante}

        <button
          type="submit"
          disabled={isSubmitting || pagoVesSinTasa}
          className="w-full min-h-11 py-3.5 px-4 rounded-2xl bg-primary text-primary-foreground font-bold text-base sm:text-sm tracking-wide shadow-md shadow-primary/20 hover:brightness-110 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
        >
          {isSubmitting ? 'Enviando al entrenador...' : 'Enviar Comprobante de Pago'}
        </button>
      </fieldset>
    </form>
  );
}
