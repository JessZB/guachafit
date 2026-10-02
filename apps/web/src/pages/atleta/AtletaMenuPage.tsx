import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/auth-context';
import { apiClient } from '../../lib/api-client';
import { resolverBloqueoAlumno, type BloqueoAlumno } from '../../lib/acceso-alumno';
import { BloqueoAlumnoPanel } from '../../components/common/BloqueoAlumnoPanel';
import { badgeEstadoCuota, type ResumenParaBadge, type TonoCuota } from '../../lib/estado-cuota';
import {
  EstadoCuota,
  ResumenFinancieroAlumnoDTO,
  SemanaEntrenamientoProgresoDTO,
} from '@guachafit/shared';
import { buildDemoSemanaProgreso } from './EntrenamientoPage';
import { formatearProgresoDias, formatearTituloSemana } from '../../lib/entrenamiento-textos';
import {
  Dumbbell,
  Utensils,
  Scale,
  CreditCard,
  ChevronRight,
  Sparkles,
  ArrowUpRight,
  Flame,
  CheckCircle2,
  Calendar,
  Zap,
  AlertTriangle,
  Clock,
  BellRing,
  type LucideIcon,
} from 'lucide-react';

/**
 * WU12b: clases del badge de cuota por tono, alineadas a los "Badges de Estado" de DESIGN.md.
 */
const CLASES_TONO_CUOTA: Record<TonoCuota, string> = {
  success: 'bg-success/15 text-success border-success/25',
  warning: 'bg-warning/15 text-warning border-warning/25',
  danger: 'bg-destructive/15 text-destructive border-destructive/25',
  info: 'bg-primary/15 text-primary border-primary/25',
  neutral: 'bg-secondary text-muted-foreground border-border',
};

/** Icono del badge por tono; neutral no lleva icono (no hay nada que celebrar ni alertar). */
const ICONO_TONO_CUOTA: Record<TonoCuota, LucideIcon | null> = {
  success: CheckCircle2,
  warning: Clock,
  danger: AlertTriangle,
  info: Clock,
  neutral: null,
};

export function AtletaMenuPage() {
  const { user, isDemoMode } = useAuth();
  const [semanaProgreso, setSemanaProgreso] = useState<SemanaEntrenamientoProgresoDTO | null>(null);
  const [rachaNoDisponible, setRachaNoDisponible] = useState(false);
  // WU12b: resumen financiero que alimenta el badge de "Pagos y cuotas".
  // `null` = sin dato (cargando o error de red) → el badge se omite, nunca un verde falso.
  const [resumenFinanciero, setResumenFinanciero] = useState<ResumenParaBadge | null>(null);
  // RF-012: estado de bloqueo del ciclo de vida (pausado / suspendido / archivado) como banner.
  const [bloqueo, setBloqueo] = useState<BloqueoAlumno | null>(null);

  useEffect(() => {
    // MODO DEMO EXPLÍCITO: datos de ejemplo, jamás como si fueran reales.
    if (isDemoMode) {
      setSemanaProgreso(buildDemoSemanaProgreso());
      setRachaNoDisponible(false);
      // Badge demo coherente con la cuota demo de PagosPage (abono parcial, saldo $30).
      setResumenFinanciero({
        cuotaMesActual: {
          id: 'cuota-demo-001',
          periodo: '2026-09',
          montoTotalUsd: '50.00',
          montoPagadoUsd: '20.00',
          saldoPendienteUsd: '30.00',
          estado: EstadoCuota.ABONADA_PARCIAL,
          fechaVencimiento: new Date(Date.now() + 86400000 * 5).toISOString(),
        },
        saldoPendienteTotalUsd: '30.00',
      });
      return;
    }

    // Sesión real: sin dato financiero aún (cargando o error) ⇒ sin badge.
    setResumenFinanciero(null);

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Caracas';
    apiClient<SemanaEntrenamientoProgresoDTO>(
      `/alumnos/me/rutina/semana-actual?timezone=${encodeURIComponent(tz)}`
    )
      .then((data) => {
        setSemanaProgreso(data ?? null);
        setRachaNoDisponible(false);
        setBloqueo(null);
      })
      .catch((err) => {
        // RF-012: un bloqueo de ciclo de vida se muestra como estado; el resto sigue siendo
        // "no disponible" (sin datos inventados).
        const bloqueoDetectado = resolverBloqueoAlumno(err);
        setBloqueo(bloqueoDetectado);
        setSemanaProgreso(null);
        setRachaNoDisponible(true);
      });

    // WU12b: cuota real del alumno en paralelo; si finanzas falla, el menú sigue vivo (catch tolerante).
    if (user?.id) {
      apiClient<ResumenFinancieroAlumnoDTO>(`/finanzas/clientes/${user.id}/historial`)
        .then((resumen) => setResumenFinanciero(resumen ?? null))
        .catch(() => setResumenFinanciero(null));
    }
  }, [isDemoMode, user?.id]);

  const emailName = user?.email ? user.email.split('@')[0] : 'Alumno';
  const primerNombre = emailName.charAt(0).toUpperCase() + emailName.slice(1);

  // RN-02: racha efectiva real del alumno (0 = sin fuego grande, sin textos de ánimo falsos)
  const rachaDias = semanaProgreso?.rachaDias ?? 0;
  const tieneRacha = !rachaNoDisponible && rachaDias > 0;
  const rachaLabel = rachaNoDisponible
    ? '—'
    : `${rachaDias} ${rachaDias === 1 ? 'día' : 'días'}`;
  const rachaSublabel = rachaNoDisponible
    ? 'Racha no disponible'
    : tieneRacha
    ? 'Racha activa'
    : 'Sin racha · completa tu plan';

  // WU12b: badge honesto del estado real de la cuota del mes (null ⇒ sin badge).
  const badgeCuota = badgeEstadoCuota(resumenFinanciero);
  const IconoBadgeCuota = badgeCuota ? ICONO_TONO_CUOTA[badgeCuota.tono] : null;

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-24 lg:pb-12 animate-in fade-in duration-200">
      {/* Saludo y Cabecera de bienvenida */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              Accesos Rápidos
            </span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-foreground mt-1">
            Hola, {primerNombre} 👋
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            ¿Qué deseas hacer hoy? Toca una tarjeta para ir al grano.
          </p>
        </div>

        {/* Chip de Racha / Estado */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-secondary/60 border border-border/80">
          <div
            className={`p-1.5 rounded-xl ${
              tieneRacha ? 'bg-warning/15 text-warning' : 'bg-secondary text-muted-foreground'
            }`}
          >
            <Flame className={`h-4 w-4 ${tieneRacha ? 'fill-warning/30' : ''}`} />
          </div>
          <div className="text-right">
            <div className="text-xs font-bold font-mono text-foreground">{rachaLabel}</div>
            <div className="text-[11px] text-muted-foreground">{rachaSublabel}</div>
          </div>
        </div>
      </div>

      {/* RF-012: estado de bloqueo del ciclo de vida (pausado / suspendido / archivado) */}
      {bloqueo && <BloqueoAlumnoPanel bloqueo={bloqueo} className="max-w-none" />}

      {/* Bento Grid de Acciones */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* TARJETA HERO (Acción Prioritaria): ¡A Entrenar! */}
        <Link
          to="/app/hoy"
          className="sm:col-span-2 group relative block overflow-hidden p-6 rounded-3xl bg-gradient-to-br from-card/90 via-card/60 to-primary/10 border-2 border-primary/40 hover:border-primary/80 transition-all duration-200 shadow-lg hover:shadow-primary/5 cursor-pointer active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-primary"
        >
          <div className="absolute top-0 right-0 w-48 h-48 bg-primary/10 rounded-full blur-3xl -z-10 group-hover:bg-primary/20 transition-all" />

          <div className="flex items-start justify-between">
            <div className="p-3 rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
              <Dumbbell className="h-7 w-7" />
            </div>
            {semanaProgreso && semanaProgreso.totalBloques > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-primary/20 text-primary border border-primary/30">
                <Zap className="h-3 w-3" />
                <span>
                  {formatearProgresoDias(semanaProgreso.bloquesCompletados, semanaProgreso.totalBloques)}
                </span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/20 text-primary border border-primary/30">
                <Calendar className="h-3 w-3" />
                Rutina de Hoy
              </span>
            )}
          </div>

          <div className="mt-4">
            <h2 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors flex items-center gap-2">
              ¡A entrenar!
              <ArrowUpRight className="h-5 w-5 text-primary opacity-80 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              Abre tu entrenamiento de hoy y anota series, pesos y descansos sin interrupciones.
            </p>
          </div>

          {semanaProgreso && semanaProgreso.totalBloques > 0 && (
            <div className="mt-4 pt-3 border-t border-border/50">
              <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground mb-1.5">
                <span className="font-semibold text-foreground">
                  {formatearTituloSemana(semanaProgreso.inicioSemana, semanaProgreso.finSemana)}
                </span>
                <span className="font-bold text-primary">
                  {semanaProgreso.bloquesCompletados === semanaProgreso.totalBloques
                    ? '¡100% Completado! 🎉'
                    : formatearProgresoDias(semanaProgreso.bloquesCompletados, semanaProgreso.totalBloques)}
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, Math.max(0, parseFloat(semanaProgreso.porcentajeCumplimiento)))}%`,
                  }}
                />
              </div>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between pt-3 border-t border-border/60">
            <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
              <span
                className={`h-2 w-2 rounded-full ${
                  bloqueo ? 'bg-warning' : 'bg-success animate-pulse'
                }`}
              />
              {bloqueo
                ? 'Planificación bloqueada'
                : semanaProgreso?.esDiaDescansoHoy
                ? 'Día de descanso (recuperación activa)'
                : 'Listo para iniciar'}
            </span>
            <span className="text-xs font-bold text-primary flex items-center gap-1 group-hover:translate-x-1 transition-transform">
              Empezar ahora <ChevronRight className="h-4 w-4" />
            </span>
          </div>
        </Link>

        {/* TARJETA 2: Mi Comida de Hoy (Nutrición) */}
        <Link
          to="/app/nutricion"
          className="group block p-5 rounded-2xl bg-card/60 hover:bg-card/90 border border-border/80 hover:border-primary/40 transition-all duration-200 cursor-pointer active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-primary flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-success/15 text-success">
                <Utensils className="h-6 w-6" />
              </div>
              <span className="text-[11px] font-medium text-muted-foreground bg-secondary/80 px-2 py-0.5 rounded-md">
                Registro rápido
              </span>
            </div>
            <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
              Mi comida de hoy
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Marca si cumpliste tus metas, anota tus calorías y sube foto de tu comida.
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs font-semibold text-primary">
            <span>Reportar día</span>
            <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* TARJETA 3: Mi Progreso Físico (Antropometría y Fotos) */}
        <Link
          to="/app/progreso"
          className="group block p-5 rounded-2xl bg-card/60 hover:bg-card/90 border border-border/80 hover:border-primary/40 transition-all duration-200 cursor-pointer active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-primary flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-info/15 text-info">
                <Scale className="h-6 w-6" />
              </div>
              <span className="text-[11px] font-medium text-muted-foreground bg-secondary/80 px-2 py-0.5 rounded-md">
                Antes y Después
              </span>
            </div>
            <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
              Mi progreso físico
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Compara tus fotos de evolución lado a lado y actualiza tus medidas o peso corporal.
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs font-semibold text-primary">
            <span>Ver evolución</span>
            <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* TARJETA 4: Pagos y Cuotas (Finanzas con Divulgación Progresiva) */}
        <Link
          to="/app/pagos"
          className="sm:col-span-2 group block p-5 rounded-2xl bg-card/60 hover:bg-card/90 border border-border/80 hover:border-primary/40 transition-all duration-200 cursor-pointer active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-primary"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              <div className="p-3 rounded-xl bg-warning/15 text-warning">
                <CreditCard className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
                    Pagos y cuotas
                  </h3>
                  {badgeCuota && (
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1 ${CLASES_TONO_CUOTA[badgeCuota.tono]}`}
                    >
                      {IconoBadgeCuota && <IconoBadgeCuota className="h-2.5 w-2.5" />}
                      {badgeCuota.texto}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Reporta un nuevo abono (Pago Móvil / Zelle) o consulta tus recibos y fechas de corte.
                </p>
              </div>
            </div>
            <div className="p-2 rounded-xl bg-secondary/80 text-foreground group-hover:text-primary group-hover:bg-primary/15 transition-colors">
              <ChevronRight className="h-5 w-5 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>
        </Link>
      </div>

      {/* N2b (RF-015): acceso a las preferencias de notificación del alumno */}
      <Link
        to="/app/preferencias"
        className="group flex items-center justify-between gap-3 p-4 rounded-2xl bg-card/60 hover:bg-card/90 border border-border/80 hover:border-primary/40 transition-all duration-200 cursor-pointer active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-primary"
      >
        <span className="flex items-center gap-3 min-w-0">
          <span className="p-2.5 rounded-xl bg-secondary text-muted-foreground group-hover:text-primary group-hover:bg-primary/15 transition-colors shrink-0">
            <BellRing className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-foreground group-hover:text-primary transition-colors">
              Mis notificaciones
            </span>
            <span className="block text-xs text-muted-foreground mt-0.5">
              Elige qué avisos quieres recibir y por dónde.
            </span>
          </span>
        </span>
        <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
      </Link>
    </div>
  );
}
