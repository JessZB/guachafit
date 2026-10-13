/**
 * Filtro por estado del historial de pagos (fase B, prompt 54).
 *
 * Extraído desde `pages/atleta/PagosPage.tsx` (chips L992–1018 + constantes
 * L90–99): chips por estado de conciliación + contador "Mostrando X de Y en
 * esta página · N registros" (WU20/WU25b).
 *
 * R1: REUTILIZABLE (R3.1: duplicación verificable `PagosPage:998–1009` ↔
 * `ConciliacionPage:355–382`, clases idénticas). Los chips usan el átomo
 * consolidado `ui/ChipFiltro` (fase C): divergencias deliberadas heredades del
 * átomo — `aria-pressed` siempre y `min-h-11` (§6.8) en lugar del `py-1.5`
 * (~32px) de la copia. Los specs consultan por rol y nombre, no por alto.
 * El contador conserva el formato exacto (espacios + `pluralizar`) que exige R5.
 *
 * §6: filtro honesto ("en esta página" declara el alcance real del chip con
 * paginación server-side), `text-[11px]` (piso exacto), `font-bold` (700).
 */
import { EstadoConciliacion } from '@guachafit/shared';
import { ChipFiltro } from '../../ui/ChipFiltro';
import { pluralizar } from '../../../lib/pluralizar';
import {
  etiquetaEstadoTransaccion,
  type FiltroEstadoTransaccionPago,
} from '../../../lib/pagos-historial-filtros';

/** WU20: chips del historial (mismos estados que ya renderiza el badge de cada fila). */
export const OPCIONES_ESTADO_HISTORIAL: Array<{
  valor: FiltroEstadoTransaccionPago;
  label: string;
}> = [
  { valor: 'todos', label: 'Todos' },
  { valor: EstadoConciliacion.PENDIENTE, label: etiquetaEstadoTransaccion(EstadoConciliacion.PENDIENTE) },
  { valor: EstadoConciliacion.APROBADO, label: etiquetaEstadoTransaccion(EstadoConciliacion.APROBADO) },
  { valor: EstadoConciliacion.RECHAZADO, label: etiquetaEstadoTransaccion(EstadoConciliacion.RECHAZADO) },
  { valor: EstadoConciliacion.REVERTIDO, label: etiquetaEstadoTransaccion(EstadoConciliacion.REVERTIDO) },
];

export interface FiltroEstadoHistorialProps {
  filtro: FiltroEstadoTransaccionPago;
  onCambiar: (filtro: FiltroEstadoTransaccionPago) => void;
  /** Filas visibles tras aplicar el chip (página cargada). */
  visibles: number;
  /** Filas de la página cargada (sin filtrar). */
  enPagina: number;
  /** COUNT real del servidor (`transaccionesTotal`). */
  total: number;
}

export function FiltroEstadoHistorial({
  filtro,
  onCambiar,
  visibles,
  enPagina,
  total,
}: FiltroEstadoHistorialProps) {
  return (
    <div className="p-3 rounded-2xl bg-secondary/20 border border-border/70 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {OPCIONES_ESTADO_HISTORIAL.map((opcion) => (
          <ChipFiltro
            key={opcion.valor}
            activo={filtro === opcion.valor}
            onClick={() => onCambiar(opcion.valor)}
          >
            {opcion.label}
          </ChipFiltro>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground font-mono">
        Mostrando {visibles} de {enPagina} en esta página · {pluralizar(total, 'registro', 'registros')}
      </p>
    </div>
  );
}
