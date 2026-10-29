/**
 * Tabla densa de escritorio/tablet de la cartera (prompt 85, Ola 3).
 *
 * Recorte verbatim de `components/entrenador/TablaCartera.tsx` (bloque
 * `hidden md:block`). ÚNICO (R3). Presentacional: recibe filas y callbacks
 * por props, no usa `useQuery` ni `api-client` (R1).
 */
import type { FilaCarteraDTO, PestanaCarteraDTO } from '@guachafit/shared';
import { etiquetaMetodoPago } from '../../../lib/conciliacion-filtros';
import { formatFechaCalendario, formatFechaHoraLocal } from '../../../lib/date-format';
import { textoUltimaGestion } from '../../../lib/cartera';
import { AccionesFilaCartera } from './AccionesFilaCartera';
import { CeldaAlumnoCartera } from './CeldaAlumnoCartera';
import { SaldoBsCartera } from './SaldoBsCartera';
import { SituacionFilaCartera } from './SituacionFilaCartera';

export function TablaEscritorioCartera({
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
    <div className="hidden md:block overflow-x-auto">
      <table className="w-full text-left text-xs border-collapse">
        <thead>
          <tr className="bg-secondary/40 text-[11px] uppercase tracking-wider text-muted-foreground">
            <th scope="col" className="px-4 py-3 font-bold">Alumno</th>
            <th scope="col" className="px-4 py-3 font-bold">Situación</th>
            {pestana === 'revision' ? (
              <>
                <th scope="col" className="px-4 py-3 font-bold">Pago reportado</th>
                <th scope="col" className="px-4 py-3 font-bold">Referencia</th>
              </>
            ) : pestana === 'al_dia' ? (
              <>
                <th scope="col" className="px-4 py-3 font-bold">Plan</th>
                <th scope="col" className="px-4 py-3 font-bold">Corte del ciclo</th>
                {/* Lote web P2 del módulo 5 (RF-009, ADR-020): próximo vencimiento del plan. */}
                <th scope="col" className="px-4 py-3 font-bold">Próximo vencimiento</th>
              </>
            ) : (
              <>
                <th scope="col" className="px-4 py-3 font-bold">Saldo USD</th>
                <th scope="col" className="px-4 py-3 font-bold">Saldo Bs</th>
                <th scope="col" className="px-4 py-3 font-bold">Última gestión</th>
              </>
            )}
            <th scope="col" className="px-4 py-3 font-bold text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (
            <tr
              key={`${fila.alumnoUsuarioId}-${fila.pagoId ?? fila.cuotaId ?? 'fila'}`}
              className="border-t border-border/50 hover:bg-secondary/20 transition-colors"
            >
              <td className="px-4 py-3 align-top">
                <CeldaAlumnoCartera fila={fila} contexto="tabla" />
              </td>
              <td className="px-4 py-3 align-top">
                <SituacionFilaCartera fila={fila} pestana={pestana} />
              </td>

              {pestana === 'revision' ? (
                <>
                  <td className="px-4 py-3 align-top">
                    <div className="font-mono font-bold text-foreground">
                      {fila.montoReportado} {fila.monedaOriginal}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {etiquetaMetodoPago(fila.metodoPago)}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="font-mono text-foreground">
                      {fila.referenciaBancaria || 'Sin referencia'}
                    </div>
                    {fila.comprobanteUrl ? (
                      <img
                        src={fila.comprobanteUrl}
                        alt={`Comprobante de ${fila.alumnoNombre}`}
                        loading="lazy"
                        className="mt-1 h-10 w-16 rounded-md object-cover border border-border"
                      />
                    ) : (
                      <span className="text-[11px] text-muted-foreground">Sin captura digital</span>
                    )}
                  </td>
                </>
              ) : pestana === 'al_dia' ? (
                <>
                  <td className="px-4 py-3 align-top font-bold text-foreground">
                    {fila.planNombre ?? 'Plan sin nombre'}
                  </td>
                  <td className="px-4 py-3 align-top text-muted-foreground">
                    {formatFechaHoraLocal(fila.fechaCorteUtc) ?? '—'}
                  </td>
                  {/* Lote web P2 del módulo 5 (RF-009, ADR-020). */}
                  <td className="px-4 py-3 align-top text-muted-foreground">
                    {formatFechaCalendario(fila.proximoCorte) ?? 'Sin próximo corte'}
                  </td>
                </>
              ) : (
                <>
                  <td className="px-4 py-3 align-top">
                    <span className="font-mono font-bold text-foreground">
                      ${fila.saldoPendienteUsd} USD
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <SaldoBsCartera fila={fila} />
                  </td>
                  <td className="px-4 py-3 align-top text-[11px] text-muted-foreground">
                    {textoUltimaGestion(fila.ultimaGestionUtc)}
                  </td>
                </>
              )}

              <td className="px-4 py-3 align-top">
                <div className="flex justify-end">
                  <AccionesFilaCartera
                    fila={fila}
                    pestana={pestana}
                    contexto="tabla"
                    onRecordatorio={onRecordatorio}
                    onCobrar={onCobrar}
                    onVerFicha={onVerFicha}
                    onRevisarPago={onRevisarPago}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
