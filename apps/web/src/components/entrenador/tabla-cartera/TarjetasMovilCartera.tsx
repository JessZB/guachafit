/**
 * Tarjetas apiladas de móvil de la cartera (prompt 85, Ola 3).
 *
 * Recorte verbatim de `components/entrenador/TablaCartera.tsx` (bloque
 * `md:hidden` con la misma información esencial). ÚNICO (R3).
 * Presentacional: recibe filas y callbacks por props, no usa `useQuery` ni
 * `api-client` (R1).
 */
import type { FilaCarteraDTO, PestanaCarteraDTO } from '@guachafit/shared';
import { etiquetaMetodoPago } from '../../../lib/conciliacion-filtros';
import { formatFechaHoraLocal } from '../../../lib/date-format';
import { textoUltimaGestion } from '../../../lib/cartera';
import { AccionesFilaCartera } from './AccionesFilaCartera';
import { CeldaAlumnoCartera } from './CeldaAlumnoCartera';
import { SaldoBsCartera } from './SaldoBsCartera';
import { SituacionFilaCartera } from './SituacionFilaCartera';

export function TarjetasMovilCartera({
  pestana,
  filas,
  onRecordatorio,
  onCobrar,
  onVerFicha,
  onRevisarPago,
}: {
  pestana: PestanaCarteraDTO;
  filas: FilaCarteraDTO[];
  onRecordatorio: (fila: FilaCarteraDTO) => void;
  onCobrar: (fila: FilaCarteraDTO) => void;
  onVerFicha: (fila: FilaCarteraDTO) => void;
  onRevisarPago?: (fila: FilaCarteraDTO) => void;
}) {
  return (
    <div className="md:hidden divide-y divide-border/50">
      {filas.map((fila) => (
        <div
          key={`${fila.alumnoUsuarioId}-${fila.pagoId ?? fila.cuotaId ?? 'fila'}`}
          className="p-4 space-y-3"
        >
          <div className="flex items-start justify-between gap-3">
            <CeldaAlumnoCartera fila={fila} contexto="tarjeta" />
            <SituacionFilaCartera fila={fila} pestana={pestana} />
          </div>

          {pestana === 'revision' ? (
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-mono font-bold text-foreground">
                {fila.montoReportado} {fila.monedaOriginal}
              </span>
              <span className="text-muted-foreground">
                {etiquetaMetodoPago(fila.metodoPago)} · {fila.referenciaBancaria || 'Sin referencia'}
              </span>
            </div>
          ) : pestana === 'al_dia' ? (
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-bold text-foreground">{fila.planNombre ?? 'Plan sin nombre'}</span>
              <span className="text-muted-foreground">
                Corte: {formatFechaHoraLocal(fila.fechaCorteUtc) ?? '—'}
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono font-bold text-foreground">
                ${fila.saldoPendienteUsd} USD
              </span>
              <span className="text-xs">
                <SaldoBsCartera fila={fila} />
              </span>
            </div>
          )}

          {pestana !== 'al_dia' && pestana !== 'revision' && (
            <p className="text-[11px] text-muted-foreground">
              {textoUltimaGestion(fila.ultimaGestionUtc)}
            </p>
          )}

          <AccionesFilaCartera
            fila={fila}
            pestana={pestana}
            onRecordatorio={onRecordatorio}
            onCobrar={onCobrar}
            onVerFicha={onVerFicha}
            onRevisarPago={onRevisarPago}
          />
        </div>
      ))}
    </div>
  );
}
