/**
 * Fila de transacción del historial de pagos (fase B, prompt 54).
 *
 * Extraída tal cual desde `pages/atleta/PagosPage.tsx` (L1044–1139): método +
 * badge de estado, referencia y fecha, montos, motivo de reversión (RF-007),
 * motivo de rechazo con "Corregir y Reenviar" y botón "Ver Comprobante Subido".
 *
 * R1: REUTILIZABLE (R3.3: transacción en ≥2 vistas + R3.1: `PagosPage:1044–1139`
 * ↔ `AlumnoDetallePage:3208–3260` ↔ `ConciliacionPage:432–464`; la composición
 * difiere por rol, así que vive aquí y la fase D decide la promoción).
 * Presentacional: props tipadas con el DTO de `@guachafit/shared` (R4) y
 * callbacks; sin `useQuery` ni `api-client`. El badge usa el átomo consolidado
 * `ui/BadgeEstado` con el `.tono` de la etiqueta (SUGGESTION-3 del inventario).
 *
 * R5 (acoplamientos que los specs exigen conservar):
 * - la raíz sigue siendo el ancestro `.rounded-2xl` MÁS CERCANO del párrafo
 *   `Ref:` (ningún intermedio lleva `rounded-2xl`);
 * - el chip "Revertido" conserva `bg-secondary` sin `bg-warning` (tono `neutral`);
 * - textos exactos vía `etiquetaEstadoTransaccion` y `motivoReversion`.
 *
 * §6: `text-[11px]` (piso exacto), `font-bold` (700), tokens con variante
 * claro/oscuro, motivo de rechazo visible (UX transparente).
 */
import { EstadoConciliacion, type TransaccionPagoDetalleDTO } from '@guachafit/shared';
import { AlertTriangle, Eye } from 'lucide-react';
import { BadgeEstado } from '../../ui/BadgeEstado';
import { etiquetaMetodoPago } from '../../../lib/conciliacion-filtros';
import { formatFechaCalendario } from '../../../lib/date-format';
import {
  etiquetaEstadoTransaccion,
  normalizarEstadoTransaccion,
  tonoEstadoTransaccion,
} from '../../../lib/pagos-historial-filtros';

export interface FilaTransaccionPagoProps {
  tx: TransaccionPagoDetalleDTO;
  /** Abre el visor con la URL del comprobante (`null` = placeholder honesto). */
  onVerComprobante: (url: string | null) => void;
  /** Un rechazo vuelve al formulario para corregir y reenviar. */
  onCorregir: (tx: TransaccionPagoDetalleDTO) => void;
}

export function FilaTransaccionPago({ tx, onVerComprobante, onCorregir }: FilaTransaccionPagoProps) {
  const estado = normalizarEstadoTransaccion(tx.estadoConciliacion);
  return (
    <div
      className="p-4 rounded-2xl bg-secondary/30 border border-border/80 flex flex-col gap-2.5"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-sm text-foreground capitalize">
              {etiquetaMetodoPago(tx.metodoPago)}
            </span>
            <BadgeEstado tono={tonoEstadoTransaccion(tx.estadoConciliacion)}>
              {etiquetaEstadoTransaccion(tx.estadoConciliacion)}
            </BadgeEstado>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Ref: {tx.referenciaBancaria || 'Sin referencia'} • Fecha:{' '}
            {formatFechaCalendario(tx.fechaOperacion) ?? tx.fechaOperacion}
          </p>
        </div>

        <div className="text-left sm:text-right">
          <p className="font-mono font-bold text-base text-foreground">
            +${tx.montoEquivalenteUsd} USD
          </p>
          <p className="text-[11px] font-mono text-muted-foreground">
            {tx.montoOriginal} {tx.monedaOriginal} (Tasa: {tx.tasaCambioFijada})
          </p>
        </div>
      </div>

      {/* RF-007: pago revertido por el entrenador, con su motivo */}
      {estado === EstadoConciliacion.REVERTIDO && (
        <p className="p-3 rounded-xl bg-secondary/40 border border-border text-xs text-foreground mt-1">
          {tx.motivoReversion
            ? `Motivo: ${tx.motivoReversion}`
            : 'Tu entrenador revirtió este pago.'}
        </p>
      )}

      {/* UX CRÍTICA: VISIBILIDAD DEL MOTIVO DE RECHAZO */}
      {estado === EstadoConciliacion.RECHAZADO && (
        <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/25 text-xs text-destructive flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-1">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <span className="font-bold">Motivo del Coach: </span>
              <span>
                {tx.motivoRechazo ||
                  'La referencia no coincide con el estado de cuenta bancario.'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onCorregir(tx)}
            className="self-end sm:self-auto min-h-11 inline-flex items-center justify-center px-3 py-1 rounded-lg bg-destructive text-destructive-foreground font-bold text-[11px] hover:brightness-110 cursor-pointer transition-all shrink-0"
          >
            Corregir y Reenviar
          </button>
        </div>
      )}

      {/* Botón Ver Comprobante */}
      {(tx.comprobanteUrl || tx.comprobanteStorageKey) && (
        <div className="pt-2 border-t border-border/50 flex justify-end">
          <button
            type="button"
            onClick={() => onVerComprobante(tx.comprobanteUrl ?? null)}
            className="min-h-11 inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold transition-colors cursor-pointer"
          >
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Ver Comprobante Subido</span>
          </button>
        </div>
      )}
    </div>
  );
}
