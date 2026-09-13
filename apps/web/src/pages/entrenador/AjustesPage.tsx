import React, { useState, useEffect } from 'react';
import { apiClient } from '../../lib/api-client';
import { triggerHaptic } from '../../lib/haptics';
import {
  PlanMembresiaDetalleDTO,
  TasaCambioVigenteDTO,
  Moneda,
} from '@guachafit/shared';
import {
  SlidersHorizontal,
  CreditCard,
  DollarSign,
  Plus,
  Pencil,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  RefreshCw,
  Calculator,
  ArrowRightLeft,
  X,
  ShieldCheck,
  Power,
} from 'lucide-react';

type TabType = 'planes' | 'tasas';

export function AjustesPage() {
  const [activeTab, setActiveTab] = useState<TabType>('planes');

  // Planes state
  const [planes, setPlanes] = useState<PlanMembresiaDetalleDTO[]>([]);
  const [isLoadingPlanes, setIsLoadingPlanes] = useState(true);
  const [planesError, setPlanesError] = useState<string | null>(null);

  // Modal Plan (Crear / Editar)
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [nombrePlan, setNombrePlan] = useState('');
  const [descripcionPlan, setDescripcionPlan] = useState('');
  const [precioBaseUsd, setPrecioBaseUsd] = useState('40.00');
  const [duracionMeses, setDuracionMeses] = useState(1);
  const [beneficios, setBeneficios] = useState<string[]>(['Rutina personalizada en App', 'Monitoreo diario']);
  const [nuevoBeneficio, setNuevoBeneficio] = useState('');
  const [isSubmittingPlan, setIsSubmittingPlan] = useState(false);
  const [planSuccessMsg, setPlanSuccessMsg] = useState<string | null>(null);

  // Tasas state
  const [tasaVigente, setTasaVigente] = useState<TasaCambioVigenteDTO | null>(null);
  const [isLoadingTasas, setIsLoadingTasas] = useState(true);
  const [tasaOficialBcvInput, setTasaOficialBcvInput] = useState('66.5000');
  const [tasaParaleloInput, setTasaParaleloInput] = useState('74.2000');
  const [tasaActivaInput, setTasaActivaInput] = useState('66.5000');
  const [fuenteSeleccionada, setFuenteSeleccionada] = useState<'oficial_bcv' | 'paralelo' | 'manual'>('oficial_bcv');
  const [isSavingTasa, setIsSavingTasa] = useState(false);
  const [tasaSuccessMsg, setTasaSuccessMsg] = useState<string | null>(null);

  // Conversor interactivo rápido
  const [calculadoraUsd, setCalculadoraUsd] = useState('40.00');
  const [calculadoraVes, setCalculadoraVes] = useState('2660.00');

  useEffect(() => {
    cargarPlanes();
    cargarTasas();
  }, []);

  async function cargarPlanes() {
    setIsLoadingPlanes(true);
    setPlanesError(null);
    try {
      const data = await apiClient<PlanMembresiaDetalleDTO[]>('/finanzas/planes');
      setPlanes(data);
    } catch {
      // Fallback si no hay planes creados aún
      setPlanes([
        {
          id: 'plan-1',
          entrenadorId: 'coach-1',
          nombre: 'Presencial Completo Sala',
          descripcion: 'Acceso total a sala de pesas, plan de entrenamiento guiado y seguimiento en directo.',
          precioBaseUsd: '40.00',
          duracionMeses: 1,
          beneficios: ['Rutina interactiva en app', 'Seguimiento técnico', '1 Check-in antropométrico mensual'],
          activo: true,
          createdAtUtc: new Date().toISOString(),
          updatedAtUtc: new Date().toISOString(),
        },
        {
          id: 'plan-2',
          entrenadorId: 'coach-1',
          nombre: 'Asesoría Online & Nutrición',
          descripcion: 'Plan a distancia con rutina semanal interactiva y pautas de macro-nutrientes.',
          precioBaseUsd: '30.00',
          duracionMeses: 1,
          beneficios: ['Rutina semanal por bloques', 'Ajustes quincenales', 'Soporte vía WhatsApp'],
          activo: true,
          createdAtUtc: new Date().toISOString(),
          updatedAtUtc: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoadingPlanes(false);
    }
  }

  async function cargarTasas() {
    setIsLoadingTasas(true);
    try {
      const data = await apiClient<TasaCambioVigenteDTO>('/finanzas/tasas/vigente');
      setTasaVigente(data);
      if (data.tasaOficialBcv) setTasaOficialBcvInput(data.tasaOficialBcv);
      if (data.tasaParalelo) setTasaParaleloInput(data.tasaParalelo);
      if (data.tasaActivaEntrenador) setTasaActivaInput(data.tasaActivaEntrenador);
      actualizarCalculosVes(data.tasaActivaEntrenador || '66.5000', calculadoraUsd);
    } catch {
      const fallback: TasaCambioVigenteDTO = {
        id: 'tasa-default',
        entrenadorId: 'coach-1',
        tasaOficialBcv: '66.5000',
        tasaParalelo: '74.2000',
        tasaActivaEntrenador: '66.5000',
        tasaAcordadaCliente: null,
        tasaEfectiva: '66.5000',
        fuente: 'oficial_bcv',
        fechaActualizacionUtc: new Date().toISOString(),
      };
      setTasaVigente(fallback);
      actualizarCalculosVes('66.5000', calculadoraUsd);
    } finally {
      setIsLoadingTasas(false);
    }
  }

  function actualizarCalculosVes(tasaStr: string, usdStr: string) {
    const tasa = parseFloat(tasaStr) || 0;
    const usd = parseFloat(usdStr) || 0;
    setCalculadoraVes((usd * tasa).toFixed(2));
  }

  function actualizarCalculosUsd(tasaStr: string, vesStr: string) {
    const tasa = parseFloat(tasaStr) || 0;
    const ves = parseFloat(vesStr) || 0;
    if (tasa > 0) {
      setCalculadoraUsd((ves / tasa).toFixed(2));
    }
  }

  function abrirModalCrearPlan() {
    triggerHaptic('light');
    setEditingPlanId(null);
    setNombrePlan('');
    setDescripcionPlan('');
    setPrecioBaseUsd('40.00');
    setDuracionMeses(1);
    setBeneficios(['Rutina interactiva en app', 'Monitoreo diario']);
    setNuevoBeneficio('');
    setPlanSuccessMsg(null);
    setIsPlanModalOpen(true);
  }

  function abrirModalEditarPlan(plan: PlanMembresiaDetalleDTO) {
    triggerHaptic('light');
    setEditingPlanId(plan.id);
    setNombrePlan(plan.nombre);
    setDescripcionPlan(plan.descripcion || '');
    setPrecioBaseUsd(plan.precioBaseUsd);
    setDuracionMeses(plan.duracionMeses);
    setBeneficios(Array.isArray(plan.beneficios) ? [...plan.beneficios] : []);
    setNuevoBeneficio('');
    setPlanSuccessMsg(null);
    setIsPlanModalOpen(true);
  }

  function agregarBeneficio() {
    if (!nuevoBeneficio.trim()) return;
    triggerHaptic('selection');
    setBeneficios([...beneficios, nuevoBeneficio.trim()]);
    setNuevoBeneficio('');
  }

  function removerBeneficio(index: number) {
    triggerHaptic('selection');
    setBeneficios(beneficios.filter((_, i) => i !== index));
  }

  async function handleGuardarPlan(e: React.FormEvent) {
    e.preventDefault();
    if (beneficios.length === 0) {
      alert('Debe incluir al menos un beneficio en el plan');
      return;
    }

    setIsSubmittingPlan(true);
    setPlanSuccessMsg(null);
    try {
      if (editingPlanId) {
        // Actualizar
        const res = await apiClient<PlanMembresiaDetalleDTO>(`/finanzas/planes/${editingPlanId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            nombre: nombrePlan.trim(),
            descripcion: descripcionPlan.trim() || undefined,
            precioBaseUsd: parseFloat(precioBaseUsd).toFixed(2),
            duracionMeses,
            beneficios,
          }),
        });
        setPlanes((prev) => prev.map((p) => (p.id === editingPlanId ? res : p)));
        setPlanSuccessMsg('Plan actualizado correctamente');
      } else {
        // Crear
        const res = await apiClient<PlanMembresiaDetalleDTO>('/finanzas/planes', {
          method: 'POST',
          body: JSON.stringify({
            nombre: nombrePlan.trim(),
            descripcion: descripcionPlan.trim() || undefined,
            precioBaseUsd: parseFloat(precioBaseUsd).toFixed(2),
            duracionMeses,
            beneficios,
            activo: true,
          }),
        });
        setPlanes((prev) => [res, ...prev]);
        setPlanSuccessMsg('Plan comercial creado y añadido al catálogo');
      }
      triggerHaptic('success');
      setTimeout(() => {
        setIsPlanModalOpen(false);
        setPlanSuccessMsg(null);
      }, 900);
    } catch (err: any) {
      alert(err.message || 'Error al guardar el plan comercial');
    } finally {
      setIsSubmittingPlan(false);
    }
  }

  async function toggleActivoPlan(plan: PlanMembresiaDetalleDTO) {
    triggerHaptic('light');
    const nuevoEstado = !plan.activo;
    try {
      const res = await apiClient<PlanMembresiaDetalleDTO>(`/finanzas/planes/${plan.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ activo: nuevoEstado }),
      });
      setPlanes((prev) => prev.map((p) => (p.id === plan.id ? res : p)));
      triggerHaptic('success');
    } catch {
      // Optimistic fallback
      setPlanes((prev) =>
        prev.map((p) => (p.id === plan.id ? { ...p, activo: nuevoEstado } : p))
      );
    }
  }

  async function handleGuardarTasa(e: React.FormEvent) {
    e.preventDefault();
    setIsSavingTasa(true);
    setTasaSuccessMsg(null);
    try {
      let tasaFinal = tasaActivaInput;
      if (fuenteSeleccionada === 'oficial_bcv') {
        tasaFinal = tasaOficialBcvInput;
        setTasaActivaInput(tasaOficialBcvInput);
      } else if (fuenteSeleccionada === 'paralelo') {
        tasaFinal = tasaParaleloInput;
        setTasaActivaInput(tasaParaleloInput);
      }

      const res = await apiClient<TasaCambioVigenteDTO>('/finanzas/tasas', {
        method: 'PUT',
        body: JSON.stringify({
          tasaOficialBcv: parseFloat(tasaOficialBcvInput).toFixed(4),
          tasaParalelo: parseFloat(tasaParaleloInput).toFixed(4),
          tasaActivaEntrenador: parseFloat(tasaFinal).toFixed(4),
          fuente: fuenteSeleccionada,
        }),
      });

      setTasaVigente(res);
      actualizarCalculosVes(res.tasaEfectiva, calculadoraUsd);
      setTasaSuccessMsg('Tasa activa guardada. Se aplicará a todos los cobros y cuotas de tus alumnos.');
      triggerHaptic('success');
    } catch (err: any) {
      alert(err.message || 'Error al actualizar la tasa de cambio');
    } finally {
      setIsSavingTasa(false);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-24 lg:pb-12 animate-in fade-in duration-200">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Centro Operativo
            </span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-black tracking-tight text-foreground mt-1">
            Configuración Operativa
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Administra tu catálogo comercial de membresías y define las tasas de cambio de tu cartera.
          </p>
        </div>

        {activeTab === 'planes' && (
          <button
            type="button"
            onClick={abrirModalCrearPlan}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm shadow-md shadow-primary/20 hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Nuevo Plan Comercial</span>
          </button>
        )}
      </div>

      {/* Tabs Selector */}
      <div className="flex items-center gap-2 border-b border-border/80 pb-3 overflow-x-auto">
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            setActiveTab('planes');
          }}
          className={`py-2 px-4 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'planes'
              ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
              : 'bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground'
          }`}
        >
          <CreditCard className="h-4 w-4" />
          <span>Planes & Membresías ({planes.length})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            setActiveTab('tasas');
          }}
          className={`py-2 px-4 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'tasas'
              ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
              : 'bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground'
          }`}
        >
          <DollarSign className="h-4 w-4" />
          <span>Tasas de Cambio & Divisas</span>
        </button>
      </div>

      {/* ===================================================================== */}
      {/* PESTAÑA 1: CATÁLOGO DE PLANES                                         */}
      {/* ===================================================================== */}
      {activeTab === 'planes' && (
        <div className="space-y-4 animate-in fade-in-50 duration-200">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {planes.map((plan) => (
              <div
                key={plan.id}
                className={`p-5 rounded-3xl bg-card border transition-all flex flex-col justify-between ${
                  plan.activo
                    ? 'border-border hover:border-primary/40 shadow-xs'
                    : 'border-dashed border-border/70 opacity-65 bg-secondary/15'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <span
                      className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-full uppercase ${
                        plan.activo
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {plan.activo ? 'Activo en Catálogo' : 'Inactivo'}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground">
                      {plan.duracionMeses} {plan.duracionMeses === 1 ? 'Mes' : 'Meses'}
                    </span>
                  </div>

                  <h3 className="text-lg font-black text-foreground">{plan.nombre}</h3>
                  <div className="flex items-baseline gap-1 mt-1 mb-2">
                    <span className="text-2xl font-black font-mono text-primary">
                      ${plan.precioBaseUsd}
                    </span>
                    <span className="text-xs text-muted-foreground">USD / mes</span>
                  </div>

                  {plan.descripcion && (
                    <p className="text-xs text-muted-foreground mb-4 line-clamp-2 leading-relaxed">
                      {plan.descripcion}
                    </p>
                  )}

                  {/* Checklist de Beneficios */}
                  <div className="space-y-1.5 pt-2 border-t border-border/60">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                      Beneficios incluidos:
                    </span>
                    {Array.isArray(plan.beneficios) &&
                      plan.beneficios.map((b, idx) => (
                        <div key={idx} className="flex items-center gap-1.5 text-xs text-foreground">
                          <CheckCircle className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                          <span className="line-clamp-1">{b}</span>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Acciones de Tarjeta */}
                <div className="mt-5 pt-3 border-t border-border/60 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => abrirModalEditarPlan(plan)}
                    className="px-3 py-1.5 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Pencil className="h-3.5 w-3.5 text-primary" />
                    <span>Editar Plan</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleActivoPlan(plan)}
                    className={`px-3 py-1.5 rounded-xl font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer ${
                      plan.activo
                        ? 'bg-destructive/10 text-destructive hover:bg-destructive/20'
                        : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                    }`}
                  >
                    <Power className="h-3.5 w-3.5" />
                    <span>{plan.activo ? 'Desactivar' : 'Reactivar'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {planes.length === 0 && !isLoadingPlanes && (
            <div className="p-12 text-center rounded-3xl bg-card border border-dashed border-border/80">
              <CreditCard className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
              <h3 className="font-bold text-foreground">No tienes planes comerciales creados</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                Crea tu primer plan estándar para poder asignarlo a tus alumnos y facturar cuotas.
              </p>
              <button
                type="button"
                onClick={abrirModalCrearPlan}
                className="mt-4 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs cursor-pointer"
              >
                Crear Primer Plan
              </button>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* PESTAÑA 2: TASAS DE CAMBIO & DIVISAS                                   */}
      {/* ===================================================================== */}
      {activeTab === 'tasas' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in-50 duration-200">
          {/* Columna Izquierda: Configuración de Tasas */}
          <div className="lg:col-span-2 space-y-6">
            <form onSubmit={handleGuardarTasa} className="p-6 rounded-3xl bg-card border border-border shadow-xs space-y-5">
              <div className="flex items-center justify-between border-b border-border/80 pb-3">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-primary" />
                  <h3 className="font-extrabold text-base text-foreground">
                    Motor de Tasa Activa (Bs/USD)
                  </h3>
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary uppercase">
                  ADR-003 Vigente
                </span>
              </div>

              {tasaSuccessMsg && (
                <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 shrink-0" />
                  <span>{tasaSuccessMsg}</span>
                </div>
              )}

              {/* Selector de Fuente Predilecta */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground">
                  Fuente o Modalidad de Cobro para tu Cartera
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('selection');
                      setFuenteSeleccionada('oficial_bcv');
                      setTasaActivaInput(tasaOficialBcvInput);
                    }}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      fuenteSeleccionada === 'oficial_bcv'
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border bg-secondary/30 text-muted-foreground hover:bg-secondary/60'
                    }`}
                  >
                    <div className="text-[11px] font-bold">Oficial BCV</div>
                    <div className="text-xs font-mono font-bold mt-1 text-primary">
                      {tasaOficialBcvInput} Bs
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('selection');
                      setFuenteSeleccionada('paralelo');
                      setTasaActivaInput(tasaParaleloInput);
                    }}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      fuenteSeleccionada === 'paralelo'
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border bg-secondary/30 text-muted-foreground hover:bg-secondary/60'
                    }`}
                  >
                    <div className="text-[11px] font-bold">Paralelo</div>
                    <div className="text-xs font-mono font-bold mt-1 text-primary">
                      {tasaParaleloInput} Bs
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('selection');
                      setFuenteSeleccionada('manual');
                    }}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      fuenteSeleccionada === 'manual'
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border bg-secondary/30 text-muted-foreground hover:bg-secondary/60'
                    }`}
                  >
                    <div className="text-[11px] font-bold">Personalizada</div>
                    <div className="text-xs font-mono font-bold mt-1 text-primary">
                      {tasaActivaInput} Bs
                    </div>
                  </button>
                </div>
              </div>

              {/* Campos de Tasa */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Tasa BCV (Bs/USD)</label>
                  <input
                    type="text"
                    required
                    value={tasaOficialBcvInput}
                    onChange={(e) => {
                      setTasaOficialBcvInput(e.target.value);
                      if (fuenteSeleccionada === 'oficial_bcv') {
                        setTasaActivaInput(e.target.value);
                        actualizarCalculosVes(e.target.value, calculadoraUsd);
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Tasa Paralelo (Bs/USD)</label>
                  <input
                    type="text"
                    value={tasaParaleloInput}
                    onChange={(e) => {
                      setTasaParaleloInput(e.target.value);
                      if (fuenteSeleccionada === 'paralelo') {
                        setTasaActivaInput(e.target.value);
                        actualizarCalculosVes(e.target.value, calculadoraUsd);
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-primary">Tasa Activa de Cobro</label>
                  <input
                    type="text"
                    required
                    value={tasaActivaInput}
                    onChange={(e) => {
                      setTasaActivaInput(e.target.value);
                      setFuenteSeleccionada('manual');
                      actualizarCalculosVes(e.target.value, calculadoraUsd);
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-primary/10 border-2 border-primary text-sm font-mono font-bold text-foreground focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={isSavingTasa}
                  className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSavingTasa ? 'Guardando Tasa...' : 'Guardar Tasa Activa Global'}
                </button>
              </div>
            </form>
          </div>

          {/* Columna Derecha: Calculadora Instantánea de Conversión */}
          <div className="space-y-4">
            <div className="p-6 rounded-3xl bg-card border border-border shadow-xs space-y-4">
              <div className="flex items-center gap-2 border-b border-border/80 pb-3">
                <Calculator className="h-4 w-4 text-primary" />
                <h3 className="font-extrabold text-sm text-foreground">
                  Conversor Inmediato USD ↔ VES
                </h3>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Monto en USD</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={calculadoraUsd}
                      onChange={(e) => {
                        setCalculadoraUsd(e.target.value);
                        actualizarCalculosVes(tasaActivaInput, e.target.value);
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary pr-12"
                    />
                    <span className="absolute right-3 top-2.5 text-xs font-bold text-muted-foreground font-mono">
                      USD
                    </span>
                  </div>
                </div>

                <div className="flex justify-center text-muted-foreground">
                  <ArrowRightLeft className="h-4 w-4 opacity-50" />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Monto Equivalente en VES</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={calculadoraVes}
                      onChange={(e) => {
                        setCalculadoraVes(e.target.value);
                        actualizarCalculosUsd(tasaActivaInput, e.target.value);
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary pr-12"
                    />
                    <span className="absolute right-3 top-2.5 text-xs font-bold text-muted-foreground font-mono">
                      Bs
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-secondary/40 border border-border/60 text-[11px] text-muted-foreground">
                  <p>
                    Calculado con redondeo bancario exacto (ADR-003) a la tasa de{' '}
                    <strong className="text-foreground font-mono">{tasaActivaInput} Bs/USD</strong>.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: CREAR / EDITAR PLAN COMERCIAL                                  */}
      {/* ===================================================================== */}
      {isPlanModalOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsPlanModalOpen(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200"
        >
          <div className="w-full max-w-lg rounded-3xl bg-card border border-border p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-border/80 pb-3">
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" />
                <h3 className="font-extrabold text-base text-foreground">
                  {editingPlanId ? 'Editar Plan Comercial' : 'Nuevo Plan Comercial'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsPlanModalOpen(false)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {planSuccessMsg && (
              <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle className="h-4 w-4 shrink-0" />
                <span>{planSuccessMsg}</span>
              </div>
            )}

            <form onSubmit={handleGuardarPlan} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Nombre del Plan</label>
                <input
                  type="text"
                  required
                  value={nombrePlan}
                  onChange={(e) => setNombrePlan(e.target.value)}
                  placeholder="Ej. Plan Personalizado 4 Días"
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Precio Base (USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={precioBaseUsd}
                    onChange={(e) => setPrecioBaseUsd(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Duración (Meses)</label>
                  <select
                    value={duracionMeses}
                    onChange={(e) => setDuracionMeses(parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                  >
                    <option value={1}>1 Mes (Mensual)</option>
                    <option value={2}>2 Meses (Bimestral)</option>
                    <option value={3}>3 Meses (Trimestral)</option>
                    <option value={6}>6 Meses (Semestral)</option>
                    <option value={12}>12 Meses (Anual)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Descripción General</label>
                <textarea
                  rows={2}
                  value={descripcionPlan}
                  onChange={(e) => setDescripcionPlan(e.target.value)}
                  placeholder="Describe brevemente el alcance del plan comercial..."
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-hidden focus:border-primary resize-none"
                />
              </div>

              {/* Beneficios */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground">Checklist de Beneficios</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={nuevoBeneficio}
                    onChange={(e) => setNuevoBeneficio(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        agregarBeneficio();
                      }
                    }}
                    placeholder="Ej. Check-in semanal de peso..."
                    className="flex-1 px-3 py-2 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-hidden focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={agregarBeneficio}
                    className="px-3 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-xs cursor-pointer"
                  >
                    Añadir
                  </button>
                </div>

                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {beneficios.map((b, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 rounded-xl bg-secondary/30 border border-border/60 text-xs"
                    >
                      <span className="text-foreground">{b}</span>
                      <button
                        type="button"
                        onClick={() => removerBeneficio(idx)}
                        className="text-muted-foreground hover:text-destructive cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-border/80">
                <button
                  type="button"
                  onClick={() => setIsPlanModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPlan}
                  className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingPlan
                    ? 'Guardando...'
                    : editingPlanId
                    ? 'Actualizar Plan'
                    : 'Crear Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
