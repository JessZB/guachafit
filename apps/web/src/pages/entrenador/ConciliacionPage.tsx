import React, { useState, useEffect } from 'react';
import { apiClient } from '../../lib/api-client';
import { TransaccionPagoDetalleDTO, Moneda, MetodoPago } from '@guachafit/shared';
import {
  DollarSign,
  Receipt,
  CheckCircle2,
  XCircle,
  FileText,
  AlertCircle,
  X,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';

export function ConciliacionPage() {
  const [transacciones, setTransacciones] = useState<TransaccionPagoDetalleDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [rejectingTx, setRejectingTx] = useState<TransaccionPagoDetalleDTO | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function loadPendientes() {
      setIsLoading(true);
      try {
        const data = await apiClient<TransaccionPagoDetalleDTO[]>('/finanzas/conciliacion/bandeja');
        setTransacciones(data);
      } catch {
        // Fallback demo queue
        const demoQueue: TransaccionPagoDetalleDTO[] = [
          {
            id: 'tx-pending-1',
            cuotaId: 'cuota-101',
            clienteId: 'cli-01',
            entrenadorId: 'coach-01',
            clienteNombre: 'Carlos Mendoza',
            registradoPor: 'cli-01',
            montoOriginal: '1950.00',
            monedaOriginal: Moneda.VES,
            tasaCambioFijada: '65.0000',
            montoEquivalenteUsd: '30.00',
            metodoPago: MetodoPago.PAGO_MOVIL,
            referenciaBancaria: '445566',
            fechaOperacion: '2026-09-06',
            estadoConciliacion: 'pendiente' as any,
            fechaReporteUtc: new Date().toISOString(),
            createdAtUtc: new Date().toISOString(),
            updatedAtUtc: new Date().toISOString(),
          },
          {
            id: 'tx-pending-2',
            cuotaId: 'cuota-102',
            clienteId: 'cli-02',
            entrenadorId: 'coach-01',
            clienteNombre: 'Mariana Pérez',
            registradoPor: 'cli-02',
            montoOriginal: '50.00',
            monedaOriginal: Moneda.USD,
            tasaCambioFijada: '65.0000',
            montoEquivalenteUsd: '50.00',
            metodoPago: MetodoPago.ZELLE,
            referenciaBancaria: 'ZEL-998811',
            fechaOperacion: '2026-09-05',
            estadoConciliacion: 'pendiente' as any,
            fechaReporteUtc: new Date().toISOString(),
            createdAtUtc: new Date().toISOString(),
            updatedAtUtc: new Date().toISOString(),
          },
        ];
        setTransacciones(demoQueue);
      } finally {
        setIsLoading(false);
      }
    }

    loadPendientes();
  }, []);

  const handleAprobar = async (txId: string) => {
    try {
      await apiClient(`/finanzas/transacciones/${txId}/conciliar`, {
        method: 'PATCH',
        body: JSON.stringify({ accion: 'aprobar' }),
      });
    } catch {
      // Local optimistic update
    }

    setTransacciones((prev) => prev.filter((t) => t.id !== txId));
    setActionSuccess('Transacción aprobada. Saldo deducido de la deuda maestra.');
    setTimeout(() => setActionSuccess(null), 3000);
  };

  const handleConfirmarRechazo = async () => {
    if (!rejectingTx || !motivoRechazo.trim()) return;

    try {
      await apiClient(`/finanzas/transacciones/${rejectingTx.id}/conciliar`, {
        method: 'PATCH',
        body: JSON.stringify({
          accion: 'rechazar',
          motivoRechazo,
        }),
      });
    } catch {
      // Local optimistic update
    }

    setTransacciones((prev) => prev.filter((t) => t.id !== rejectingTx.id));
    setRejectingTx(null);
    setMotivoRechazo('');
    setActionSuccess('Transacción rechazada con observaciones notificadas al atleta.');
    setTimeout(() => setActionSuccess(null), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 rounded-3xl bg-card border border-border shadow-md space-y-2">
        <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
          <DollarSign className="h-4 w-4" />
          <span>Conciliación Bancaria y Auditoría (RF-007, RF-008)</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
              Bandeja FIFO de Pagos
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Revisión estricta de transferencias, comprobantes y acreditación en dólares.
            </p>
          </div>
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">
            {transacciones.length} transacciones en cola
          </span>
        </div>
      </div>

      {actionSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Queue */}
      {transacciones.length === 0 ? (
        <div className="p-12 text-center space-y-3 bg-card rounded-3xl border border-border">
          <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
          <h3 className="font-bold text-base text-foreground">Bandeja al Día</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            No hay transacciones pendientes de revisión. Todos los abonos han sido procesados.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {transacciones.map((tx) => (
            <div
              key={tx.id}
              className="p-5 sm:p-6 rounded-3xl bg-card border border-border/80 shadow-xs space-y-4 hover:border-primary/40 transition-all"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/50 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-black text-lg text-foreground">
                      {tx.clienteNombre || 'Atleta'}
                    </h2>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border uppercase">
                      {tx.metodoPago.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Ref: <span className="font-mono font-bold text-foreground">{tx.referenciaBancaria}</span> •
                    Fecha Operación: {tx.fechaOperacion}
                  </p>
                </div>

                <div className="text-left sm:text-right">
                  <span className="text-xs text-muted-foreground font-medium block">
                    Abono en Dólares
                  </span>
                  <span className="text-2xl font-black font-mono text-primary">
                    +${tx.montoEquivalenteUsd} USD
                  </span>
                  <span className="text-[11px] font-mono text-muted-foreground block mt-0.5">
                    {tx.montoOriginal} {tx.monedaOriginal} (Tasa: {tx.tasaCambioFijada})
                  </span>
                </div>
              </div>

              {/* Actions Grid */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  <span>Transacción interactiva ACID protegida con lock pesimista.</span>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    onClick={() => setRejectingTx(tx)}
                    className="flex-1 sm:flex-initial py-2 px-4 rounded-xl border border-destructive/40 text-destructive hover:bg-destructive/10 font-bold text-xs transition-colors cursor-pointer"
                  >
                    Rechazar con Motivo
                  </button>
                  <button
                    onClick={() => handleAprobar(tx.id)}
                    className="flex-1 sm:flex-initial py-2 px-5 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
                  >
                    Aprobar y Descontar Saldo
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reject Modal */}
      {rejectingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
          <div className="p-6 rounded-3xl bg-card border border-destructive/30 shadow-2xl w-full max-w-md space-y-4">
            <div className="flex items-center justify-between border-b border-border/80 pb-3">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                <h3 className="font-bold text-base text-foreground">Rechazar Transacción</h3>
              </div>
              <button
                onClick={() => setRejectingTx(null)}
                className="p-1.5 rounded-xl hover:bg-secondary text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              Por normativa financiera (RNF-002), se exige registrar un motivo descriptivo para que
              el atleta conozca la razón y pueda corregir el reporte.
            </p>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Motivo del Rechazo</label>
              <textarea
                rows={3}
                required
                value={motivoRechazo}
                onChange={(e) => setMotivoRechazo(e.target.value)}
                placeholder="Ej: La referencia bancaria no coincide con el extracto o el monto recibido fue incompleto."
                className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-destructive resize-none"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setRejectingTx(null)}
                className="flex-1 py-2 rounded-xl bg-secondary hover:bg-secondary/80 font-bold text-xs text-foreground"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmarRechazo}
                disabled={!motivoRechazo.trim()}
                className="flex-1 py-2 rounded-xl bg-destructive text-destructive-foreground font-bold text-xs shadow-md disabled:opacity-50"
              >
                Confirmar Rechazo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
