import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/auth-context';
import { apiClient } from '../../lib/api-client';
import { resolverBloqueoAlumno, type BloqueoAlumno } from '../../lib/acceso-alumno';
import { queueOfflineMutation, offlineDb } from '../../lib/offline-db';
import { BloqueoAlumnoPanel } from '../../components/common/BloqueoAlumnoPanel';
import {
  decidirAccionErrorCheckinNutricional,
} from '../../lib/nutricion-checkin';
import { formatFechaCalendario } from '../../lib/date-format';
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

/**
 * Estado del guardado del reporte nutricional (RF-002).
 * - `saved`: 2xx del servidor (o reporte de hoy ya existente); único estado con "éxito".
 * - `queued`: encolado offline legítimo (sin conexión / error de red o 5xx).
 * - `error`: rechazo de negocio (4xx distinto de 409); sin éxito ni encolado.
 */
type EstadoReporteNutricional = 'idle' | 'saved' | 'queued' | 'error';

export function NutricionPage() {
  const { user, isDemoMode } = useAuth();
  const todayDate = new Date().toISOString().split('T')[0];

  const [semaforo, setSemaforo] = useState<SemaforoNutricional>(SemaforoNutricional.CUMPLIDO);
  // D6: sin valores de fixture precargados en sesión real; el placeholder guía, no el dato.
  const [aguaLitros, setAguaLitros] = useState('');
  const [calorias, setCalorias] = useState('');
  const [proteina, setProteina] = useState('');
  const [notas, setNotas] = useState('');
  const [estadoReporte, setEstadoReporte] = useState<EstadoReporteNutricional>('idle');
  const [avisoReporte, setAvisoReporte] = useState<{
    tono: 'info' | 'error';
    texto: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [existingCheckin, setExistingCheckin] = useState<CheckinNutricionalDetalleDTO | null>(null);
  // RF-012: alumno pausado no puede enviar reportes; la pantalla informativa reemplaza al formulario.
  const [bloqueo, setBloqueo] = useState<BloqueoAlumno | null>(null);

  // Reporte del día confirmado por el servidor: la vista queda en solo lectura porque NO existe
  // endpoint de actualización (un segundo POST con la misma fecha devuelve 409).
  const reporteRegistradoHoy = Boolean(existingCheckin) || estadoReporte === 'saved';
  const reporteEncolado = estadoReporte === 'queued';
  const formularioBloqueado = reporteRegistradoHoy || reporteEncolado;

  const cargarReporteHoy = useCallback(async () => {
    try {
      if (!navigator.onLine) return;
      const data = await apiClient<CheckinNutricionalDetalleDTO | null>('/nutricion/checkin/hoy');
      if (data) {
        setExistingCheckin(data);
        setSemaforo(data.semaforo);
        if (data.aguaLitros) setAguaLitros(data.aguaLitros);
        if (data.caloriasReportadas) setCalorias(data.caloriasReportadas.toString());
        if (data.proteinaGramosReportada) setProteina(data.proteinaGramosReportada.toString());
        if (data.notasAlumno) setNotas(data.notasAlumno);
        setEstadoReporte('saved');
      }
    } catch {
      // Sin reporte para hoy todavía (204) o sin conexión: no hay estado que reflejar.
    }
  }, []);

  useEffect(() => {
    void cargarReporteHoy();
  }, [cargarReporteHoy]);

  const handleSaveCheckin = async () => {
    // Defensivo: el botón ya está deshabilitado en estos estados.
    if (formularioBloqueado) return;

    setIsLoading(true);
    setAvisoReporte(null);

    // MODO DEMO EXPLÍCITO (isDemoMode): éxito local simulado con la bandera demo visible, sin
    // llamar a la API real (el token demo es simbólico). En sesión real solo vale un 2xx.
    if (isDemoMode) {
      setEstadoReporte('saved');
      setIsLoading(false);
      return;
    }

    const payload = {
      fecha: todayDate,
      semaforo,
      // D6: si el alumno no reporta agua, el campo se omite (nunca un 0.00 fabricado).
      aguaLitros: aguaLitros || undefined,
      caloriasReportadas: calorias ? Number(calorias) : undefined,
      proteinaGramosReportada: proteina ? Number(proteina) : undefined,
      notasAlumno: notas || undefined,
      fotosPlatos: [],
    };

    const encolar = async () => {
      await queueOfflineMutation(
        '/nutricion/checkin-diario',
        'POST',
        payload,
        'Check-in nutricional diario'
      );
      setEstadoReporte('queued');
    };

    if (!navigator.onLine) {
      try {
        await encolar();
      } catch {
        setEstadoReporte('error');
        setAvisoReporte({
          tono: 'error',
          texto: 'No se pudo guardar el reporte en el dispositivo. Inténtalo de nuevo.',
        });
      } finally {
        setIsLoading(false);
      }
      return;
    }

    try {
      // 2xx es el ÚNICO resultado que cuenta como éxito (RF-002: sin éxito fabricado).
      await apiClient('/nutricion/checkin-diario', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      await cargarReporteHoy();
      setEstadoReporte('saved');
    } catch (err) {
      // RF-012: el bloqueo de ciclo de vida tiene su propia pantalla (no es un error de datos).
      const bloqueoDetectado = resolverBloqueoAlumno(err);
      if (bloqueoDetectado) {
        setBloqueo(bloqueoDetectado);
        return;
      }
      const decision = decidirAccionErrorCheckinNutricional(err, true);
      if (decision.accion === 'encolar') {
        // Fallo de red/5xx: la cola offline reintenta; nunca se declara "registrado".
        try {
          await encolar();
        } catch {
          setEstadoReporte('error');
          setAvisoReporte({
            tono: 'error',
            texto: 'No se pudo guardar el reporte en el dispositivo. Inténtalo de nuevo.',
          });
        }
      } else if (decision.accion === 'refrescar') {
        // 409: el reporte de hoy ya existía; se refleja el estado real del servidor.
        await cargarReporteHoy();
        setAvisoReporte({ tono: 'info', texto: decision.mensaje });
      } else {
        setEstadoReporte('error');
        setAvisoReporte({ tono: 'error', texto: decision.mensaje });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // RF-012: pantalla de bloqueo cuando el ciclo de vida impide enviar el reporte (pausado).
  if (bloqueo && !isDemoMode) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <BloqueoAlumnoPanel bloqueo={bloqueo} onReintentar={() => setBloqueo(null)} />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="p-6 rounded-3xl bg-card border border-border shadow-md space-y-2">
        <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
          <Utensils className="h-4 w-4" />
          <span>Reporte Diario Ágil</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
          Mi Comida de Hoy
        </h1>
        <p className="text-xs text-muted-foreground">
          Marca cómo te fue hoy en menos de 10 segundos.
        </p>
      </div>

      {/* 1-Tap Traffic Light Buttons */}
      <div className="space-y-3">
        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
          Nivel de Apego al Plan Hoy
        </label>
        {reporteRegistradoHoy && (
          <p className="px-1 text-[11px] text-muted-foreground">
            Tu reporte de hoy ya quedó registrado. Solo lectura; podrás registrar el próximo mañana.
          </p>
        )}
        <div className="grid grid-cols-3 gap-3">
          {/* Cumplido */}
          <button
            type="button"
            disabled={formularioBloqueado}
            onClick={() => setSemaforo(SemaforoNutricional.CUMPLIDO)}
            className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${
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
            disabled={formularioBloqueado}
            onClick={() => setSemaforo(SemaforoNutricional.PARCIAL)}
            className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${
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
            disabled={formularioBloqueado}
            onClick={() => setSemaforo(SemaforoNutricional.NO_CUMPLIDO)}
            className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${
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
              disabled={formularioBloqueado}
              value={aguaLitros}
              onChange={(e) => setAguaLitros(e.target.value)}
              placeholder="2.50"
              className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary disabled:opacity-60"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Calorías (kcal)</label>
            <input
              type="number"
              disabled={formularioBloqueado}
              value={calorias}
              onChange={(e) => setCalorias(e.target.value)}
              placeholder="2200"
              className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary disabled:opacity-60"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Proteína (g)</label>
            <input
              type="number"
              disabled={formularioBloqueado}
              value={proteina}
              onChange={(e) => setProteina(e.target.value)}
              placeholder="160"
              className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary disabled:opacity-60"
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
            disabled={formularioBloqueado}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Ej: Mucha energía hoy, cena fuera de casa pero cuidé proteína."
            className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary resize-none disabled:opacity-60"
          />
        </div>

        {/* Submit Button */}
        <button
          onClick={handleSaveCheckin}
          disabled={isLoading || formularioBloqueado}
          className="w-full py-3 px-4 rounded-xl bg-primary text-primary-foreground font-black text-sm tracking-wide shadow-md shadow-primary/20 hover:brightness-110 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {reporteRegistradoHoy ? (
            <Check className="h-4 w-4" />
          ) : (
            <Flame className="h-4 w-4" />
          )}
          <span>
            {reporteRegistradoHoy
              ? 'Reporte de hoy ya registrado'
              : reporteEncolado
              ? 'Guardado sin conexión · pendiente de envío'
              : 'Guardar Check-in Nutricional'}
          </span>
        </button>

        {reporteRegistradoHoy && (
          <p className="text-center text-xs text-emerald-400 font-semibold">
            ✓ Reporte registrado para hoy ({formatFechaCalendario(todayDate) ?? todayDate}).
          </p>
        )}

        {reporteEncolado && (
          <p className="text-center text-xs text-amber-400 font-semibold">
            ⏳ Guardado en tu dispositivo. Se enviará automáticamente al recuperar la conexión.
          </p>
        )}

        {avisoReporte && (
          <p
            role={avisoReporte.tono === 'error' ? 'alert' : undefined}
            className={`text-center text-xs font-semibold ${
              avisoReporte.tono === 'error' ? 'text-destructive' : 'text-amber-400'
            }`}
          >
            {avisoReporte.texto}
          </p>
        )}
      </div>
    </div>
  );
}
