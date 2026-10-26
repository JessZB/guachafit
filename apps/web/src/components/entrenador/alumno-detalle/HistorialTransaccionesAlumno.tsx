/**
 * Historial de transacciones y comprobantes del alumno (organismo ÚNICO).
 *
 * Presentacional: recibe el resumen, errores y callbacks de paginación/reversión (R1).
 * Extraído de `pages/entrenador/AlumnoDetallePage.tsx` (SL-4). Contiene el listado con
 * `Paginacion` compartida y las filas `FilaTransaccion` (candidata a `common/`).
 *
 * §6: 11px mínimo, pesos ≤ 700, tokens con variante oscura, estados honestos
 * (`role="alert"` en el error de carga, `role="status"` en el éxito de reversión).
 */
import type { ResumenFinancieroAlumnoDTO } from '@guachafit/shared';
import { AlertCircle } from 'lucide-react';
import { Paginacion } from '../../common/Paginacion';
import { pluralizar } from '../../../lib/pluralizar';
import { FilaTransaccion } from './FilaTransaccion';
import type { PagoPorRevertir } from './use-reversion-pago';

export interface HistorialTransaccionesAlumnoProps {
  finanzas: ResumenFinancieroAlumnoDTO | null;
  errorCarga: string | null;
  mensajeReversion: string | null;
  /** En demo no se puede revertir (sin endpoint real). */
  demo: boolean;
  pagina: number;
  tamano: number;
  cargando: boolean;
  onCambiarPagina: (pagina: number) => void;
  onCambiarTamano: (tamano: number) => void;
  onSolicitarReversion: (pago: PagoPorRevertir) => void;
}

export function HistorialTransaccionesAlumno({
  finanzas,
  errorCarga,
  mensajeReversion,
  demo,
  pagina,
  tamano,
  cargando,
  onCambiarPagina,
  onCambiarTamano,
  onSolicitarReversion,
}: HistorialTransaccionesAlumnoProps) {
  return (
    <div className="p-6 rounded-3xl bg-card border border-border shadow-xs space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/80 pb-3">
        <h4 className="font-bold text-sm text-foreground">Historial de Transacciones & Abonos</h4>
        <span className="text-xs text-muted-foreground font-mono">
          {finanzas
            ? pluralizar(finanzas.transaccionesTotal, 'operación', 'operaciones')
            : '—'}
        </span>
      </div>

      {errorCarga && (
        <div
          role="alert"
          className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs font-bold flex items-center gap-2"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorCarga}</span>
        </div>
      )}

      {mensajeReversion && (
        <p role="status" className="text-xs font-semibold text-success">
          {mensajeReversion}
        </p>
      )}
      {finanzas && finanzas.transacciones.length > 0 ? (
        <div className="space-y-2.5">
          {finanzas.transacciones.map((tx) => (
            <FilaTransaccion
              key={tx.id}
              tx={tx}
              demo={demo}
              onSolicitarReversion={onSolicitarReversion}
            />
          ))}
        </div>
      ) : errorCarga ? null : (
        <p className="text-xs text-muted-foreground py-6 text-center">
          No se han registrado pagos o abonos para este alumno.
        </p>
      )}

      {/* WU25b: paginación numerada con txLimit/txOffset y transaccionesTotal real */}
      {finanzas && finanzas.transaccionesTotal > 0 && (
        <div className="pt-1">
          <Paginacion
            pagina={pagina}
            tamano={tamano}
            total={finanzas.transaccionesTotal}
            onCambiarPagina={onCambiarPagina}
            onCambiarTamano={onCambiarTamano}
            cargando={cargando}
          />
        </div>
      )}
    </div>
  );
}
