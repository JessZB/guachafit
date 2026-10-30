/**
 * Tarjetas apiladas de móvil de la cartera (prompt 85, Ola 3).
 *
 * Recorte verbatim de `components/entrenador/TablaCartera.tsx` (bloque
 * `md:hidden` con la misma información esencial). ÚNICO (R3).
 * Presentacional: recibe filas y callbacks por props, no usa `useQuery` ni
 * `api-client` (R1). Cada tarjeta es un `article` nombrado por el alumno y los
 * montos usan `useFormatoNumero()` (§6.17).
 */
import { useId } from 'react';
import { Moneda, type FilaCarteraDTO, type PestanaCarteraDTO } from '@guachafit/shared';
import { etiquetaMetodoPago } from '../../../lib/conciliacion-filtros';
import { formatFechaCalendario, formatFechaHoraLocal } from '../../../lib/date-format';
import { textoUltimaGestion } from '../../../lib/cartera';
import { useFormatoNumero } from '../../../lib/use-formato-numero';
import { AccionesFilaCartera } from './AccionesFilaCartera';
import { CeldaAlumnoCartera } from './CeldaAlumnoCartera';
import { MiniaturaComprobante } from './MiniaturaComprobante';
import { SaldoBsCartera } from './SaldoBsCartera';
import { SituacionFilaCartera } from './SituacionFilaCartera';

interface AccionesTarjetaMovil {
  onRecordatorio: (fila: FilaCarteraDTO) => void;
  onCobrar: (fila: FilaCarteraDTO) => void;
  onVerFicha: (fila: FilaCarteraDTO) => void;
  onRevisarPago?: (fila: FilaCarteraDTO) => void;
}

export function TarjetasMovilCartera({
  pestana,
  filas,
  ...acciones
}: {
  pestana: PestanaCarteraDTO;
  filas: FilaCarteraDTO[];
} & AccionesTarjetaMovil) {
  return (
    <div className="md:hidden divide-y divide-border/50">
      {filas.map((fila) => (
        <TarjetaMovilCartera
          key={`${fila.alumnoUsuarioId}-${fila.pagoId ?? fila.cuotaId ?? 'fila'}`}
          fila={fila}
          pestana={pestana}
          {...acciones}
        />
      ))}
    </div>
  );
}

function TarjetaMovilCartera({
  fila,
  pestana,
  onRecordatorio,
  onCobrar,
  onVerFicha,
  onRevisarPago,
}: {
  fila: FilaCarteraDTO;
  pestana: PestanaCarteraDTO;
} & AccionesTarjetaMovil) {
  const idNombre = useId();
  const { formatMonto } = useFormatoNumero();

  return (
    <article aria-labelledby={idNombre} className="p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <CeldaAlumnoCartera fila={fila} contexto="tarjeta" idNombre={idNombre} />
        <SituacionFilaCartera fila={fila} pestana={pestana} />
      </div>

      {pestana === 'revision' ? (
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono font-bold text-foreground">
              {formatMonto(fila.montoReportado, fila.monedaOriginal === Moneda.VES ? 'VES' : 'USD', {
                conCodigo: true,
              })}
            </span>
            <span className="min-w-0 break-words text-muted-foreground">
              {etiquetaMetodoPago(fila.metodoPago)} · {fila.referenciaBancaria || 'Sin referencia'}
            </span>
          </div>
          <MiniaturaComprobante
            key={fila.comprobanteUrl ?? 'sin-comprobante'}
            url={fila.comprobanteUrl}
            alumnoNombre={fila.alumnoNombre}
          />
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
            {formatMonto(fila.saldoPendienteUsd, 'USD', { conCodigo: true })}
          </span>
          <span className="text-xs">
            <SaldoBsCartera fila={fila} />
          </span>
        </div>
      )}

      {pestana === 'al_dia' && (
        // Lote web P2 del módulo 5 (RF-009, ADR-020): próximo vencimiento del plan.
        <p className="text-xs text-muted-foreground">
          Próximo vencimiento:{' '}
          <span className="font-bold text-foreground">
            {formatFechaCalendario(fila.proximoCorte) ?? 'Sin próximo corte'}
          </span>
        </p>
      )}

      {pestana !== 'al_dia' && pestana !== 'revision' && (
        <p className="text-[11px] text-muted-foreground">
          {textoUltimaGestion(fila.ultimaGestionUtc)}
        </p>
      )}

      <AccionesFilaCartera
        fila={fila}
        pestana={pestana}
        contexto="tarjeta"
        onRecordatorio={onRecordatorio}
        onCobrar={onCobrar}
        onVerFicha={onVerFicha}
        onRevisarPago={onRevisarPago}
      />
    </article>
  );
}
