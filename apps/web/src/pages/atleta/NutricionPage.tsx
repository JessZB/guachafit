import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/auth-context';
import { apiClient } from '../../lib/api-client';
import { queueOfflineMutation, offlineDb } from '../../lib/offline-db';
import { SemaforoNutricional, CheckinNutricionalDetalleDTO } from '@guachafit/shared';
import {
  Utensils,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Droplets,
  Camera,
  Check,
  Flame,
} from 'lucide-react';

export function NutricionPage() {
  const { user } = useAuth();
  const todayDate = new Date().toISOString().split('T')[0];

  const [semaforo, setSemaforo] = useState<SemaforoNutricional>(SemaforoNutricional.CUMPLIDO);
  const [aguaLitros, setAguaLitros] = useState('2.50');
  const [calorias, setCalorias] = useState('');
  const [proteina, setProteina] = useState('');
  const [notas, setNotas] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [existingCheckin, setExistingCheckin] = useState<CheckinNutricionalDetalleDTO | null>(null);

  useEffect(() => {
    async function loadTodayCheckin() {
      try {
        if (navigator.onLine) {
          const data = await apiClient<CheckinNutricionalDetalleDTO>('/nutricion/checkin/hoy');
          if (data) {
            setExistingCheckin(data);
            setSemaforo(data.semaforo);
            if (data.aguaLitros) setAguaLitros(data.aguaLitros);
            if (data.caloriasReportadas) setCalorias(data.caloriasReportadas.toString());
            if (data.proteinaGramosReportada) setProteina(data.proteinaGramosReportada.toString());
            if (data.notasAlumno) setNotas(data.notasAlumno);
            setIsSaved(true);
          }
        }
      } catch (err) {
        // Not found yet for today or offline
      }
    }
    loadTodayCheckin();
  }, []);

  const handleSaveCheckin = async () => {
    setIsLoading(true);
    const payload = {
      fecha: todayDate,
      semaforo,
      aguaLitros: aguaLitros || '0.00',
      caloriasReportadas: calorias ? Number(calorias) : undefined,
      proteinaGramosReportada: proteina ? Number(proteina) : undefined,
      notasAlumno: notas || undefined,
      fotosPlatos: [],
    };

    try {
      if (navigator.onLine) {
        await apiClient('/nutricion/checkin-diario', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      } else {
        await queueOfflineMutation(
          '/nutricion/checkin-diario',
          'POST',
          payload,
          'Check-in nutricional diario'
        );
      }
      setIsSaved(true);
    } catch (err) {
      await queueOfflineMutation(
        '/nutricion/checkin-diario',
        'POST',
        payload,
        'Check-in nutricional diario'
      );
      setIsSaved(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="p-6 rounded-3xl bg-card border border-border shadow-md space-y-2">
        <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
          <Utensils className="h-4 w-4" />
          <span>Reporte Diario Ágil</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
          Check-in Nutricional 1-Tap
        </h1>
        <p className="text-xs text-muted-foreground">
          Registra tu adherencia en menos de 10 segundos antes de dormir.
        </p>
      </div>

      {/* 1-Tap Traffic Light Buttons */}
      <div className="space-y-3">
        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
          Nivel de Apego al Plan Hoy
        </label>
        <div className="grid grid-cols-3 gap-3">
          {/* Cumplido */}
          <button
            type="button"
            onClick={() => setSemaforo(SemaforoNutricional.CUMPLIDO)}
            className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all cursor-pointer ${
              semaforo === SemaforoNutricional.CUMPLIDO
                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 shadow-lg shadow-emerald-500/20 scale-102'
                : 'bg-card border-border hover:border-emerald-500/40 text-muted-foreground'
            }`}
          >
            <CheckCircle2 className="h-8 w-8 mb-1 text-emerald-500" />
            <span className="font-extrabold text-sm text-foreground">Cumplido</span>
            <span className="text-[10px] text-muted-foreground mt-0.5">100% en macros</span>
          </button>

          {/* Parcial */}
          <button
            type="button"
            onClick={() => setSemaforo(SemaforoNutricional.PARCIAL)}
            className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all cursor-pointer ${
              semaforo === SemaforoNutricional.PARCIAL
                ? 'bg-amber-500/20 border-amber-500 text-amber-400 shadow-lg shadow-amber-500/20 scale-102'
                : 'bg-card border-border hover:border-amber-500/40 text-muted-foreground'
            }`}
          >
            <AlertCircle className="h-8 w-8 mb-1 text-amber-500" />
            <span className="font-extrabold text-sm text-foreground">Parcial</span>
            <span className="text-[10px] text-muted-foreground mt-0.5">Desvío menor</span>
          </button>

          {/* No Cumplido */}
          <button
            type="button"
            onClick={() => setSemaforo(SemaforoNutricional.NO_CUMPLIDO)}
            className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all cursor-pointer ${
              semaforo === SemaforoNutricional.NO_CUMPLIDO
                ? 'bg-destructive/20 border-destructive text-destructive shadow-lg shadow-destructive/20 scale-102'
                : 'bg-card border-border hover:border-destructive/40 text-muted-foreground'
            }`}
          >
            <XCircle className="h-8 w-8 mb-1 text-destructive" />
            <span className="font-extrabold text-sm text-foreground">No Cumplido</span>
            <span className="text-[10px] text-muted-foreground mt-0.5">Fuera de plan</span>
          </button>
        </div>
      </div>

      {/* Optional Details (Water, Calories, Notes) */}
      <div className="p-5 sm:p-6 rounded-3xl bg-card border border-border shadow-xs space-y-4">
        <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
          <Droplets className="h-4 w-4 text-primary" />
          <span>Hidratación y Macros Rápidos (Opcional)</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Agua (Litros)</label>
            <input
              type="text"
              value={aguaLitros}
              onChange={(e) => setAguaLitros(e.target.value)}
              placeholder="2.50"
              className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Calorías (kcal)</label>
            <input
              type="number"
              value={calorias}
              onChange={(e) => setCalorias(e.target.value)}
              placeholder="2200"
              className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Proteína (g)</label>
            <input
              type="number"
              value={proteina}
              onChange={(e) => setProteina(e.target.value)}
              placeholder="160"
              className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary"
            />
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <label className="text-xs font-semibold text-muted-foreground">Notas breves</label>
            <span className="text-[10px] text-muted-foreground">{notas.length}/280</span>
          </div>
          <textarea
            rows={2}
            maxLength={280}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Ej: Mucha energía hoy, cena fuera de casa pero cuidé proteína."
            className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary resize-none"
          />
        </div>

        {/* Submit Button */}
        <button
          onClick={handleSaveCheckin}
          disabled={isLoading}
          className="w-full py-3 px-4 rounded-xl bg-primary text-primary-foreground font-black text-sm tracking-wide shadow-md shadow-primary/20 hover:brightness-110 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {isSaved ? <Check className="h-4 w-4" /> : <Flame className="h-4 w-4" />}
          <span>{isSaved ? 'Actualizar Reporte Diario' : 'Guardar Check-in Nutricional'}</span>
        </button>

        {isSaved && (
          <p className="text-center text-xs text-emerald-400 font-semibold">
            ✓ Reporte registrado para hoy ({todayDate}).
          </p>
        )}
      </div>
    </div>
  );
}
