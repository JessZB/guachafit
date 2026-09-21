/**
 * WU-I (RF-009 §4.B): tabla del tablero de cartera.
 *
 * Componente presentacional puro (sin red ni router): la página le pasa la página de filas y los
 * callbacks de acción. Renderiza una tabla densa en escritorio/tablet (escena principal del
 * coach) y tarjetas apiladas en móvil, con estados vacíos honestos por pestaña.
 */
import React from 'react';
import type { FilaCarteraDTO, PestanaCarteraDTO } from '@guachafit/shared';
import { etiquetaEstadoCuota } from '../../lib/etiquetas-dominio';
import { etiquetaMetodoPago } from '../../lib/conciliacion-filtros';
import { formatFechaHoraLocal } from '../../lib/date-format';
import {
  etiquetaDiasAtraso,
  etiquetaDiasEspera,
  etiquetaDiasRestantes,
  textoSaldoBs,
  textoUltimaGestion,
} from '../../lib/cartera';
import {
  BellRing,
  CheckCircle2,
  Clock3,
  HandCoins,
  Receipt,
  SearchX,
  UserRound,
} from 'lucide-react';

export interface TablaCarteraProps {
  pestana: PestanaCarteraDTO;
  filas: FilaCarteraDTO[];
  /** `true` cuando hay una búsqueda activa: cambia el vacío por "sin resultados". */
  buscando?: boolean;
  onRecordatorio: (fila: FilaCarteraDTO) => void;
  onCobrar: (fila: FilaCarteraDTO) => void;
  onVerFicha: (fila: FilaCarteraDTO) => void;
  onRevisarPago?: (fila: FilaCarteraDTO) => void;
}

const VACIO_POR_PESTANA: Record<
  PestanaCarteraDTO,
  { titulo: string; detalle: string }
> = {
  mora: {
    titulo: 'Sin cuotas vencidas',
    detalle: 'Ningún alumno tiene deuda vencida por ahora.',
  },
  por_vencer: {
    titulo: 'Sin vencimientos próximos',
    detalle: 'Nadie tiene una cuota por vencer en los próximos 5 días.',
  },
  revision: {
    titulo: 'Sin pagos por validar',
    detalle: 'No hay comprobantes esperando revisión en la bandeja.',
  },
  al_dia: {
    titulo: 'Sin cuotas cubiertas en el ciclo',
    detalle: 'Cuando un alumno cubra al 100% su cuota del mes aparecerá aquí.',
  },
};

const CLASES_TONO: Record<string, string> = {
  success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  warning: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  danger: 'bg-destructive/15 text-destructive border-destructive/25',
  info: 'bg-primary/15 text-primary border-primary/25',
  neutral: 'bg-secondary text-muted-foreground border-border',
};

function Badge({ tono, children }: { tono: string; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide ${
        CLASES_TONO[tono] ?? CLASES_TONO.neutral
      }`}
    >
      {children}
    </span>
  );
}

/** Saldo en Bs honesto: "—" cuando el coach no tiene tasa (nunca un monto inventado). */
function SaldoBs({ fila }: { fila: FilaCarteraDTO }) {
  const texto = textoSaldoBs(fila);
  if (texto) {
    return <span className="font-mono font-bold text-foreground">{texto}</span>;
  }
  return (
    <span className="text-muted-foreground" title="Configura tu tasa en Ajustes para proyectar Bs">
      —
    </span>
  );
}

function BotonAccion({
  onClick,
  icono: Icono,
  texto,
  variante = 'secundario',
  deshabilitado = false,
}: {
  onClick: () => void;
  icono: React.ComponentType<{ className?: string }>;
  texto: string;
  variante?: 'primario' | 'secundario';
  deshabilitado?: boolean;
}) {
  const clase =
    variante === 'primario'
      ? 'bg-primary text-primary-foreground hover:brightness-110 shadow-sm shadow-primary/20'
      : 'bg-secondary/70 text-foreground hover:bg-secondary border border-border/70';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${clase}`}
    >
      <Icono className="h-3.5 w-3.5 shrink-0" />
      <span>{texto}</span>
    </button>
  );
}

/** Acciones por fila según la pestaña (RF-009 §4.B). */
function AccionesFila({
  fila,
  pestana,
  onRecordatorio,
  onCobrar,
  onVerFicha,
  onRevisarPago,
}: {
  fila: FilaCarteraDTO;
  pestana: PestanaCarteraDTO;
  onRecordatorio: (fila: FilaCarteraDTO) => void;
  onCobrar: (fila: FilaCarteraDTO) => void;
  onVerFicha: (fila: FilaCarteraDTO) => void;
  onRevisarPago?: (fila: FilaCarteraDTO) => void;
}) {
  if (pestana === 'revision') {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <BotonAccion
          onClick={() => onRevisarPago?.(fila)}
          icono={Receipt}
          texto="Revisar en bandeja"
          variante="primario"
        />
      </div>
    );
  }

  const puedeCobrar =
    (pestana === 'mora' || pestana === 'por_vencer') &&
    Boolean(fila.saldoPendienteUsd && Number(fila.saldoPendienteUsd) > 0);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {(pestana === 'mora' || pestana === 'por_vencer') && (
        <BotonAccion
          onClick={() => onRecordatorio(fila)}
          icono={BellRing}
          texto="Recordatorio"
        />
      )}
      {puedeCobrar && (
        <BotonAccion
          onClick={() => onCobrar(fila)}
          icono={HandCoins}
          texto="Registrar cobro"
          variante="primario"
        />
      )}
      <BotonAccion
        onClick={() => onVerFicha(fila)}
        icono={UserRound}
        texto="Ver ficha"
        deshabilitado={!fila.alumnoPerfilId}
      />
    </div>
  );
}

/** Texto de la columna "situación" según la pestaña. */
function SituacionFila({ fila, pestana }: { fila: FilaCarteraDTO; pestana: PestanaCarteraDTO }) {
  if (pestana === 'mora') {
    const etiqueta = etiquetaEstadoCuota(fila.estadoCuota);
    const dias = etiquetaDiasAtraso(fila.diasAtraso);
    return (
      <div className="flex flex-col gap-1">
        <Badge tono={etiqueta.tono}>{etiqueta.texto}</Badge>
        {dias && <span className="text-[11px] font-bold text-destructive">{dias}</span>}
      </div>
    );
  }

  if (pestana === 'por_vencer') {
    const etiqueta = etiquetaEstadoCuota(fila.estadoCuota);
    const dias = etiquetaDiasRestantes(fila.diasRestantes);
    const vence = formatFechaHoraLocal(fila.fechaCorteUtc);
    return (
      <div className="flex flex-col gap-1">
        <Badge tono={etiqueta.tono}>{etiqueta.texto}</Badge>
        {dias && <span className="text-[11px] font-bold text-amber-400">{dias}</span>}
        {vence && <span className="text-[10px] text-muted-foreground">Corte: {vence}</span>}
      </div>
    );
  }

  if (pestana === 'revision') {
    const espera = etiquetaDiasEspera(fila.diasEspera);
    const reportado = formatFechaHoraLocal(fila.fechaReporteUtc);
    return (
      <div className="flex flex-col gap-1">
        <Badge tono="info">Pago en revisión</Badge>
        {espera && (
          <span className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
            <Clock3 className="h-3 w-3" /> {espera}
          </span>
        )}
        {reportado && <span className="text-[10px] text-muted-foreground">Reportado: {reportado}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <Badge tono="success">Al día</Badge>
      <span className="text-[10px] text-muted-foreground">Ciclo {fila.periodo ?? '—'}</span>
    </div>
  );
}

export function TablaCartera({
  pestana,
  filas,
  buscando = false,
  onRecordatorio,
  onCobrar,
  onVerFicha,
  onRevisarPago,
}: TablaCarteraProps) {
  if (filas.length === 0) {
    const vacio = buscando
      ? {
          titulo: 'Sin resultados',
          detalle: 'Ningún alumno coincide con la búsqueda en esta pestaña.',
        }
      : VACIO_POR_PESTANA[pestana];
    const Icono = buscando ? SearchX : CheckCircle2;

    return (
      <div className="p-10 rounded-3xl bg-card border border-dashed border-border text-center space-y-3">
        <Icono
          className={`h-10 w-10 mx-auto ${
            buscando ? 'text-muted-foreground opacity-50' : 'text-emerald-500'
          }`}
        />
        <h3 className="text-sm font-black text-foreground">{vacio.titulo}</h3>
        <p className="text-xs text-muted-foreground max-w-md mx-auto">{vacio.detalle}</p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-card border border-border/80 shadow-xs overflow-hidden">
      {/* Escritorio / tablet: tabla densa con scroll horizontal controlado */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-secondary/40 text-[10px] uppercase tracking-wider text-muted-foreground">
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
                  <div className="font-bold text-foreground">{fila.alumnoNombre}</div>
                  {fila.telefonoWhatsapp && (
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {fila.telefonoWhatsapp}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 align-top">
                  <SituacionFila fila={fila} pestana={pestana} />
                </td>

                {pestana === 'revision' ? (
                  <>
                    <td className="px-4 py-3 align-top">
                      <div className="font-mono font-bold text-foreground">
                        {fila.montoReportado} {fila.monedaOriginal}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
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
                        <span className="text-[10px] text-muted-foreground">Sin captura digital</span>
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
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3 align-top">
                      <span className="font-mono font-black text-foreground">
                        ${fila.saldoPendienteUsd} USD
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <SaldoBs fila={fila} />
                    </td>
                    <td className="px-4 py-3 align-top text-[11px] text-muted-foreground">
                      {textoUltimaGestion(fila.ultimaGestionUtc)}
                    </td>
                  </>
                )}

                <td className="px-4 py-3 align-top">
                  <div className="flex justify-end">
                    <AccionesFila
                      fila={fila}
                      pestana={pestana}
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

      {/* Móvil: tarjetas apiladas con la misma información esencial */}
      <div className="md:hidden divide-y divide-border/50">
        {filas.map((fila) => (
          <div
            key={`${fila.alumnoUsuarioId}-${fila.pagoId ?? fila.cuotaId ?? 'fila'}`}
            className="p-4 space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold text-sm text-foreground truncate">{fila.alumnoNombre}</p>
                {fila.telefonoWhatsapp && (
                  <p className="text-[10px] text-muted-foreground font-mono">
                    {fila.telefonoWhatsapp}
                  </p>
                )}
              </div>
              <SituacionFila fila={fila} pestana={pestana} />
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
                <span className="font-mono font-black text-foreground">
                  ${fila.saldoPendienteUsd} USD
                </span>
                <span className="text-xs">
                  <SaldoBs fila={fila} />
                </span>
              </div>
            )}

            {pestana !== 'al_dia' && pestana !== 'revision' && (
              <p className="text-[11px] text-muted-foreground">
                {textoUltimaGestion(fila.ultimaGestionUtc)}
              </p>
            )}

            <AccionesFila
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
    </div>
  );
}
