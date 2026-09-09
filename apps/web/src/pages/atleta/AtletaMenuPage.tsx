import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/auth-context';
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
} from 'lucide-react';

export function AtletaMenuPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const emailName = user?.email ? user.email.split('@')[0] : 'Atleta';
  const primerNombre = emailName.charAt(0).toUpperCase() + emailName.slice(1);

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-24 lg:pb-12 animate-in fade-in duration-200">
      {/* Saludo y Cabecera de bienvenida */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              Menú de Acciones
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
          <div className="p-1.5 rounded-xl bg-amber-500/15 text-amber-400">
            <Flame className="h-4 w-4 fill-amber-400/20" />
          </div>
          <div className="text-right">
            <div className="text-xs font-bold font-mono text-foreground">Racha Activa</div>
            <div className="text-[10px] text-muted-foreground">¡Sigue así!</div>
          </div>
        </div>
      </div>

      {/* Bento Grid de Acciones */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* TARJETA HERO (Acción Prioritaria): ¡A Entrenar! */}
        <div
          onClick={() => navigate('/app/hoy')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/app/hoy')}
          className="sm:col-span-2 group relative overflow-hidden p-6 rounded-3xl bg-gradient-to-br from-card/90 via-card/60 to-primary/10 border-2 border-primary/40 hover:border-primary/80 transition-all duration-200 shadow-lg hover:shadow-primary/5 cursor-pointer active:scale-[0.99]"
        >
          <div className="absolute top-0 right-0 w-48 h-48 bg-primary/10 rounded-full blur-3xl -z-10 group-hover:bg-primary/20 transition-all" />

          <div className="flex items-start justify-between">
            <div className="p-3 rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
              <Dumbbell className="h-7 w-7" />
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/20 text-primary border border-primary/30">
              <Calendar className="h-3 w-3" />
              Rutina de Hoy
            </span>
          </div>

          <div className="mt-4">
            <h2 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors flex items-center gap-2">
              ¡A entrenar!
              <ArrowUpRight className="h-5 w-5 text-primary opacity-80 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              Abre el checklist de tu sesión del día, registra series, pesos y descansos con cero bloqueos de red.
            </p>
          </div>

          <div className="mt-5 flex items-center justify-between pt-4 border-t border-border/60">
            <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Listo para iniciar
            </span>
            <span className="text-xs font-bold text-primary flex items-center gap-1 group-hover:translate-x-1 transition-transform">
              Empezar ahora <ChevronRight className="h-4 w-4" />
            </span>
          </div>
        </div>

        {/* TARJETA 2: Mi Comida de Hoy (Nutrición) */}
        <div
          onClick={() => navigate('/app/nutricion')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/app/nutricion')}
          className="group p-5 rounded-2xl bg-card/60 hover:bg-card/90 border border-border/80 hover:border-primary/40 transition-all duration-200 cursor-pointer active:scale-[0.98] flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-400">
                <Utensils className="h-6 w-6" />
              </div>
              <span className="text-[11px] font-medium text-muted-foreground bg-secondary/80 px-2 py-0.5 rounded-md">
                1-Tap Rápido
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
        </div>

        {/* TARJETA 3: Mi Progreso Físico (Antropometría y Fotos) */}
        <div
          onClick={() => navigate('/app/progreso')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/app/progreso')}
          className="group p-5 rounded-2xl bg-card/60 hover:bg-card/90 border border-border/80 hover:border-primary/40 transition-all duration-200 cursor-pointer active:scale-[0.98] flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-cyan-500/15 text-cyan-400">
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
        </div>

        {/* TARJETA 4: Pagos y Cuotas (Finanzas con Divulgación Progresiva) */}
        <div
          onClick={() => navigate('/app/pagos')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/app/pagos')}
          className="sm:col-span-2 group p-5 rounded-2xl bg-card/60 hover:bg-card/90 border border-border/80 hover:border-primary/40 transition-all duration-200 cursor-pointer active:scale-[0.98]"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              <div className="p-3 rounded-xl bg-amber-500/15 text-amber-400">
                <CreditCard className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
                    Pagos y cuotas
                  </h3>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 flex items-center gap-1">
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    Al día
                  </span>
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
        </div>
      </div>
    </div>
  );
}
