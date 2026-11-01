/**
 * Pestaña del historial de pagos de la vista `pagos` (fase B, prompt 54).
 *
 * Extraída desde `pages/atleta/PagosPage.tsx` (L959–1169): barra de navegación,
 * tarjeta con título y contador, filtro por chip (`FiltroEstadoHistorial`),
 * vacíos, filas (`FilaTransaccionPago`), error de página `role="alert"` sin
 * perder lo cargado (WU25b) y paginación server-side (`Paginacion`).
 *
 * R1: componente único de vista (compone Filtro + Fila + `Paginacion`).
 * Presentacional: datos y callbacks por props; sin `useQuery` ni `api-client`.
 *
 * R5: conserva los textos que consultan los specs ("Historial de Pagos y
 * Recibos", "Mostrando 1 de 2 en esta página · 2 registros" vía el Filtro,
 * "No hay transacciones registradas para este periodo.").
 *
 * §6: estados honestos (vacío sin simular, error de página con lo ya cargado
 * visible, `role="alert"`), `font-bold` (700), tokens con variante claro/oscuro.
 */
import { ArrowLeft, Plus, Receipt, AlertTriangle } from 'lucide-react';
import type { TransaccionPagoDetalleDTO } from '@guachafit/shared';
import { Paginacion } from '../../common/Paginacion';
import { pluralizar } from '../../../lib/pluralizar';
import {
  type FiltroEstadoTransaccionPago,
} from '../../../lib/pagos-historial-filtros';
import { FiltroEstadoHistorial } from './FiltroEstadoHistorial';
import { FilaTransaccionPago } from './FilaTransaccionPago';
import { EstadoVacio } from '../../ui/EstadoVacio';

export interface PestanaHistorialPagosProps {
  onVolver: () => void;
  onNuevoAbono: () => void;
  transaccionesTotal: number;
  transaccionesHistorial: TransaccionPagoDetalleDTO[];
  transaccionesFiltradas: TransaccionPagoDetalleDTO[];
  filtro: FiltroEstadoTransaccionPago;
  onFiltrar: (filtro: FiltroEstadoTransaccionPago) => void;
  errorHistorial: string | null;
  pagina: number;
  tamano: number;
  cargando: boolean;
  onCambiarPagina: (pagina: number) => void;
  onCambiarTamano: (tamano: number) => void;
  onVerComprobante: (url: string | null) => void;
  onCorregir: (tx: TransaccionPagoDetalleDTO) => void;
}

export function PestanaHistorialPagos({
  onVolver,
  onNuevoAbono,
  transaccionesTotal,
  transaccionesHistorial,
  transaccionesFiltradas,
  filtro,
  onFiltrar,
  errorHistorial,
  pagina,
  tamano,
  cargando,
  onCambiarPagina,
  onCambiarTamano,
  onVerComprobante,
  onCorregir,
}: PestanaHistorialPagosProps) {
  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      <div className="flex items-center justify-between border-b border-border/80 pb-3">
        <button
          type="button"
          onClick={onVolver}
          className="min-h-11 inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Volver a opciones de pago</span>
        </button>
        <button
          type="button"
          onClick={onNuevoAbono}
          className="min-h-11 inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 text-xs font-bold transition-colors cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Nuevo Abono</span>
        </button>
      </div>

      <div className="p-6 rounded-3xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-base text-foreground flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" aria-hidden="true" />
            <span>Historial de Pagos y Recibos</span>
          </h2>
          <span className="text-xs text-muted-foreground font-mono">
            {pluralizar(transaccionesTotal, 'registro', 'registros')}
          </span>
        </div>

        {transaccionesHistorial.length > 0 && (
          <FiltroEstadoHistorial
            filtro={filtro}
            onCambiar={onFiltrar}
            visibles={transaccionesFiltradas.length}
            enPagina={transaccionesHistorial.length}
            total={transaccionesTotal}
          />
        )}

        {transaccionesHistorial.length === 0 ? (
          errorHistorial ? null : (
            <p className="text-xs text-muted-foreground py-6 text-center">
              No hay transacciones registradas para este periodo.
            </p>
          )
        ) : transaccionesFiltradas.length === 0 ? (
          <EstadoVacio
            titulo="Sin resultados"
            detalle="Ningún pago del historial coincide con el estado seleccionado."
            accion={{
              texto: 'Limpiar filtro',
              onAccion: () => onFiltrar('todos'),
              variante: 'secundaria',
            }}
          />
        ) : (
          <div className="space-y-3">
            {transaccionesFiltradas.map((tx) => (
              <FilaTransaccionPago
                key={tx.id}
                tx={tx}
                onVerComprobante={onVerComprobante}
                onCorregir={onCorregir}
              />
            ))}
          </div>
        )}

        {/* WU25b: fallo de página visible sin perder lo ya cargado */}
        {errorHistorial && (
          <div
            role="alert"
            className="p-3 rounded-2xl bg-destructive/10 border border-destructive/25 text-destructive text-xs font-bold flex items-center gap-2"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{errorHistorial}</span>
          </div>
        )}

        {/* WU25b: paginación numerada con txLimit/txOffset y transaccionesTotal real */}
        {transaccionesTotal > 0 && (
          <div className="pt-1">
            <Paginacion
              pagina={pagina}
              tamano={tamano}
              total={transaccionesTotal}
              onCambiarPagina={onCambiarPagina}
              onCambiarTamano={onCambiarTamano}
              cargando={cargando}
            />
          </div>
        )}
      </div>
    </div>
  );
}
