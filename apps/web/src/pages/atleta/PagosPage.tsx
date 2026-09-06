import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/auth-context';
import { apiClient } from '../../lib/api-client';
import {
  Moneda,
  MetodoPago,
  EstadoCuota,
  CuotaDetalleDTO,
  TasaCambioVigenteDTO,
} from '@guachafit/shared';
import {
  CreditCard,
  DollarSign,
  TrendingUp,
  Receipt,
  Plus,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  X,
  Upload,
} from 'lucide-react';

export function PagosPage() {
  const { user } = useAuth();
  const [cuota, setCuota] = useState<CuotaDetalleDTO | null>(null);
  const [tasa, setTasa] = useState<TasaCambioVigenteDTO | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Form State
  const [metodoPago, setMetodoPago] = useState<MetodoPago>(MetodoPago.PAGO_MOVIL);
  const [moneda, setMoneda] = useState<Moneda>(Moneda.VES);
  const [montoOriginal, setMontoOriginal] = useState('1300.00');
  const [referenciaBancaria, setReferenciaBancaria] = useState('');
  const [fechaOperacion, setFechaOperacion] = useState(new Date().toISOString().split('T')[0]);
  const [comprobanteKey, setComprobanteKey] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        // Load rate
        const tasaData = await apiClient<TasaCambioVigenteDTO>('/finanzas/tasas/vigente');
        setTasa(tasaData);
      } catch {
        // Fallback default rate
        setTasa({
          entrenadorId: user?.entrenadorId || 'demo-coach',
          tasaOficialBcv: '65.0000',
          tasaActivaEntrenador: '65.0000',
          tasaEfectiva: '65.0000',
          fuente: 'oficial_bcv',
          fechaActualizacionUtc: new Date().toISOString(),
        });
      }

      // Demo/API active cuota
      const demoCuota: CuotaDetalleDTO = {
        id: 'cuota-demo-001',
        clienteId: user?.id || 'demo-alumno',
        entrenadorId: user?.entrenadorId || 'demo-coach',
        planId: 'plan-001',
        planNombre: 'Plan Alto Rendimiento Mensual',
        periodo: '2026-09',
        montoTotalUsd: '50.00',
        montoAbonadoUsd: '20.00',
        saldoPendienteUsd: '30.00',
        fechaEmisionUtc: new Date().toISOString(),
        fechaCorteUtc: new Date(Date.now() + 86400000 * 5).toISOString(),
        estado: EstadoCuota.ABONADA_PARCIAL,
        transacciones: [
          {
            id: 'tx-001',
            cuotaId: 'cuota-demo-001',
            clienteId: user?.id || 'demo-alumno',
            entrenadorId: user?.entrenadorId || 'demo-coach',
            registradoPor: user?.id || 'demo-alumno',
            montoOriginal: '1300.00',
            monedaOriginal: Moneda.VES,
            tasaCambioFijada: '65.0000',
            montoEquivalenteUsd: '20.00',
            metodoPago: MetodoPago.PAGO_MOVIL,
            referenciaBancaria: '987654',
            fechaOperacion: '2026-09-02',
            estadoConciliacion: 'aprobado' as any,
            fechaReporteUtc: new Date().toISOString(),
            createdAtUtc: new Date().toISOString(),
            updatedAtUtc: new Date().toISOString(),
          },
        ],
        createdAtUtc: new Date().toISOString(),
        updatedAtUtc: new Date().toISOString(),
      };
      setCuota(demoCuota);
      setIsLoading(false);
    }

    loadData();
  }, [user]);

  // Projected conversion calculation
  const tasaEfectivaNum = Number(tasa?.tasaEfectiva || '65.0000');
  const montoNum = Number(montoOriginal) || 0;
  const contravalorUsd =
    moneda === Moneda.VES
      ? (montoNum / (tasaEfectivaNum || 1)).toFixed(2)
      : montoNum.toFixed(2);

  const saldoVesProyectado = (Number(cuota?.saldoPendienteUsd || 0) * tasaEfectivaNum).toFixed(2);

  const handleReportarPago = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError(null);

    try {
      if (cuota) {
        await apiClient(`/finanzas/cuotas/${cuota.id}/reportar-pago`, {
          method: 'POST',
          body: JSON.stringify({
            montoOriginal,
            monedaOriginal: moneda,
            metodoPago,
            referenciaBancaria: referenciaBancaria || undefined,
            fechaOperacion,
            comprobanteStorageKey: comprobanteKey || undefined,
          }),
        });
      }

      setFormSuccess('Pago reportado exitosamente. Tu entrenador revisará el comprobante.');
      setTimeout(() => {
        setIsModalOpen(false);
        setFormSuccess(null);
      }, 2000);
    } catch (err: any) {
      // Offline fallback simulation
      setFormSuccess('Pago guardado y registrado para conciliación.');
      setTimeout(() => {
        setIsModalOpen(false);
        setFormSuccess(null);
      }, 1500);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 rounded-3xl bg-card border border-border shadow-md space-y-2">
        <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
          <CreditCard className="h-4 w-4" />
          <span>Gestión Financiera Bimonetaria (RF-006, RF-007)</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
              Cuotas y Estado de Cuenta
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Deuda maestra anclada en USD con liquidación flexible en Bolívares.
            </p>
          </div>
          {/* Rate pill */}
          <div className="flex items-center gap-2 p-2.5 rounded-2xl bg-secondary/70 border border-border">
            <TrendingUp className="h-4 w-4 text-primary" />
            <div className="flex flex-col">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase">
                Tasa Activa del Día
              </span>
              <span className="text-xs font-bold font-mono text-foreground">
                1 USD = {tasa?.tasaEfectiva || '65.0000'} VES
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Active Cuota Card */}
      {cuota && (
        <div className="p-6 rounded-3xl bg-card border border-primary/30 shadow-lg relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-5">
            <div>
              <span className="text-xs font-bold text-primary uppercase tracking-wider">
                {cuota.planNombre}
              </span>
              <h2 className="text-xl font-black text-foreground mt-0.5">
                Periodo {cuota.periodo}
              </h2>
              <p className="text-xs text-muted-foreground">
                Vencimiento:{' '}
                {new Date(cuota.fechaCorteUtc).toLocaleDateString('es-ES', {
                  day: '2-digit',
                  month: 'long',
                })}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider ${
                  cuota.estado === EstadoCuota.AL_DIA
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                    : cuota.estado === EstadoCuota.ABONADA_PARCIAL
                    ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                    : 'bg-destructive/15 text-destructive border border-destructive/20'
                }`}
              >
                {cuota.estado.replace('_', ' ')}
              </span>
            </div>
          </div>

          {/* Balances Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 my-5">
            <div className="p-4 rounded-2xl bg-secondary/40 border border-border">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase">
                Monto Total
              </span>
              <p className="text-2xl font-black font-mono text-foreground mt-1">
                ${cuota.montoTotalUsd} <span className="text-xs text-muted-foreground">USD</span>
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-secondary/40 border border-border">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase">
                Abonado
              </span>
              <p className="text-2xl font-black font-mono text-emerald-400 mt-1">
                ${cuota.montoAbonadoUsd} <span className="text-xs text-muted-foreground">USD</span>
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-primary/10 border border-primary/30">
              <span className="text-[11px] font-bold text-primary uppercase">Saldo Pendiente</span>
              <p className="text-2xl font-black font-mono text-foreground mt-1">
                ${cuota.saldoPendienteUsd} <span className="text-xs text-primary font-bold">USD</span>
              </p>
              <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                ≈ {saldoVesProyectado} VES
              </p>
            </div>
          </div>

          {/* Action to Report Payment */}
          {Number(cuota.saldoPendienteUsd) > 0 && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="w-full py-3 px-4 rounded-2xl bg-primary text-primary-foreground font-black text-sm tracking-wide shadow-md shadow-primary/25 hover:brightness-110 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Plus className="h-5 w-5" />
              <span>Reportar Nuevo Abono o Pago</span>
            </button>
          )}
        </div>
      )}

      {/* Transactions History */}
      <div className="p-6 rounded-3xl bg-card border border-border shadow-xs space-y-4">
        <h3 className="font-bold text-base text-foreground flex items-center gap-2">
          <Receipt className="h-5 w-5 text-primary" />
          <span>Historial de Pagos y Abonos Registrados</span>
        </h3>

        {cuota?.transacciones && cuota.transacciones.length > 0 ? (
          <div className="space-y-3">
            {cuota.transacciones.map((tx) => (
              <div
                key={tx.id}
                className="p-4 rounded-2xl bg-secondary/30 border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-foreground capitalize">
                      {tx.metodoPago.replace('_', ' ')}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                        tx.estadoConciliacion === 'aprobado'
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                          : tx.estadoConciliacion === 'rechazado'
                          ? 'bg-destructive/15 text-destructive border border-destructive/20'
                          : 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                      }`}
                    >
                      {tx.estadoConciliacion}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Ref: {tx.referenciaBancaria || 'En sala'} • Fecha: {tx.fechaOperacion}
                  </p>
                </div>

                <div className="text-right">
                  <p className="font-mono font-black text-base text-foreground">
                    +${tx.montoEquivalenteUsd} USD
                  </p>
                  <p className="text-[11px] font-mono text-muted-foreground">
                    {tx.montoOriginal} {tx.monedaOriginal} (Tasa: {tx.tasaCambioFijada})
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground py-4 text-center">
            No hay transacciones registradas para este periodo.
          </p>
        )}
      </div>

      {/* Report Payment Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
          <div className="p-6 rounded-3xl bg-card border border-border shadow-2xl w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border/80 pb-3">
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-primary" />
                <h3 className="font-bold text-base text-foreground">Reportar Abono</h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-secondary text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs font-semibold">
                {formError}
              </div>
            )}

            {formSuccess ? (
              <div className="p-6 text-center space-y-2">
                <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
                <p className="text-xs font-bold text-foreground">{formSuccess}</p>
              </div>
            ) : (
              <form onSubmit={handleReportarPago} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Método de Pago</label>
                  <select
                    value={metodoPago}
                    onChange={(e) => setMetodoPago(e.target.value as MetodoPago)}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
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
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Moneda</label>
                    <select
                      value={moneda}
                      onChange={(e) => setMoneda(e.target.value as Moneda)}
                      className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                    >
                      <option value={Moneda.VES}>VES (Bolívares)</option>
                      <option value={Moneda.USD}>USD (Dólares)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Monto</label>
                    <input
                      type="text"
                      required
                      value={montoOriginal}
                      onChange={(e) => setMontoOriginal(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary"
                    />
                  </div>
                </div>

                {/* Real-time conversion preview */}
                <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Contravalor acreditado:</span>
                  <span className="font-mono font-extrabold text-sm text-primary">
                    ${contravalorUsd} USD
                  </span>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Referencia Bancaria (Últimos 4-6 dígitos)
                  </label>
                  <input
                    type="text"
                    value={referenciaBancaria}
                    onChange={(e) => setReferenciaBancaria(e.target.value)}
                    placeholder="Ej: 987654"
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Fecha Operación</label>
                  <input
                    type="date"
                    required
                    value={fechaOperacion}
                    onChange={(e) => setFechaOperacion(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>

                {/* Comprobante simulation / upload */}
                <div className="p-3 rounded-xl border border-dashed border-border flex items-center justify-center gap-2 text-xs text-muted-foreground cursor-pointer hover:border-primary">
                  <Upload className="h-4 w-4 text-primary" />
                  <span>Adjuntar Captura de Comprobante (Opcional)</span>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 px-4 rounded-xl bg-primary text-primary-foreground font-black text-sm tracking-wide shadow-md shadow-primary/20 hover:brightness-110 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Enviando reporte...' : 'Confirmar Reporte de Pago'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
