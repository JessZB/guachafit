import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/auth-context';
import {
  DollarSign,
  Camera,
  Users,
  LayoutDashboard,
  AlertTriangle,
  ChevronRight,
  Sparkles,
  ArrowUpRight,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';

export function CoachMenuPage() {
  const { user } = useAuth();

  const emailName = user?.email ? user.email.split('@')[0] : 'Coach';
  const primerNombre = emailName.charAt(0).toUpperCase() + emailName.slice(1);

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-24 lg:pb-12 animate-in fade-in duration-200">
      {/* Cabecera y Saludo */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              Centro Operativo
            </span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-foreground mt-1">
            Panel de Acciones, Coach {primerNombre}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Selecciona una tarea operativa para resolverla de inmediato sin rodeos.
          </p>
        </div>

        <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-2xl bg-secondary/60 border border-border/80">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <div className="text-right">
            <div className="text-xs font-bold font-mono text-foreground">Sesión Segura</div>
            <div className="text-[10px] text-muted-foreground">Datos Protegidos</div>
          </div>
        </div>
      </div>

      {/* Bento Grid de Acciones Operativas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* TARJETA 1: Validar Pagos (Hero Operativo) */}
        <Link
          to="/coach/conciliacion"
          className="sm:col-span-2 lg:col-span-2 group relative block overflow-hidden p-6 rounded-3xl bg-gradient-to-br from-card/90 via-card/60 to-emerald-500/10 border-2 border-emerald-500/30 hover:border-emerald-500/70 transition-all duration-200 shadow-lg hover:shadow-emerald-500/5 cursor-pointer active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-primary"
        >
          <div className="flex items-start justify-between">
            <div className="p-3 rounded-2xl bg-emerald-500 text-emerald-950 shadow-md shadow-emerald-500/20">
              <DollarSign className="h-7 w-7" />
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              Bandeja FIFO
            </span>
          </div>

          <div className="mt-4">
            <h2 className="text-xl font-bold text-foreground group-hover:text-emerald-400 transition-colors flex items-center gap-2">
              Validar Pagos Entrantes
              <ArrowUpRight className="h-5 w-5 text-emerald-400 opacity-80 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-lg">
              Revisa comprobantes de Pago Móvil, Zelle y transferencias en cola. Concilia en 1 clic y descuenta de la deuda maestra en USD.
            </p>
          </div>

          <div className="mt-5 flex items-center justify-between pt-4 border-t border-border/60">
            <span className="text-xs font-medium text-muted-foreground">
              Comprobantes digitales con zoom SigV4
            </span>
            <span className="text-xs font-bold text-emerald-400 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
              Abrir bandeja <ChevronRight className="h-4 w-4" />
            </span>
          </div>
        </Link>

        {/* TARJETA 2: Revisar Evaluaciones Físicas */}
        <Link
          to="/coach/antropometria"
          className="group block p-5 rounded-2xl bg-card/60 hover:bg-card/90 border border-border/80 hover:border-primary/40 transition-all duration-200 cursor-pointer active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-primary flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-cyan-500/15 text-cyan-400">
                <Camera className="h-6 w-6" />
              </div>
              <span className="text-[11px] font-medium text-muted-foreground bg-secondary/80 px-2 py-0.5 rounded-md">
                Auditoría RBAC
              </span>
            </div>
            <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
              Revisar Evaluaciones
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Audita medidas y fotos de progreso de alumnos remotos con el comparador angular antes/después.
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs font-semibold text-primary">
            <span>Auditar fotos</span>
            <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* TARJETA 3: Alumnos en Alerta */}
        <Link
          to="/coach/alumnos"
          className="group block p-5 rounded-2xl bg-card/60 hover:bg-card/90 border border-border/80 hover:border-amber-500/40 transition-all duration-200 cursor-pointer active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-primary flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-400">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <span className="text-[11px] font-medium text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md">
                Retención
              </span>
            </div>
            <h3 className="text-base font-bold text-foreground group-hover:text-amber-400 transition-colors">
              Alumnos en Alerta
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Detecta atletas con baja adherencia semanal o cuotas en mora para activar recordatorios.
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs font-semibold text-amber-400">
            <span>Ver semáforo</span>
            <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* TARJETA 4: Directorio de Alumnos */}
        <Link
          to="/coach/alumnos"
          className="group block p-5 rounded-2xl bg-card/60 hover:bg-card/90 border border-border/80 hover:border-primary/40 transition-all duration-200 cursor-pointer active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-primary flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-indigo-500/15 text-indigo-400">
                <Users className="h-6 w-6" />
              </div>
              <span className="text-[11px] font-medium text-muted-foreground bg-secondary/80 px-2 py-0.5 rounded-md">
                Expedientes
              </span>
            </div>
            <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
              Directorio de Atletas
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Gestiona el ciclo de vida de clientes, planes asignados, overrides de precios y altas manuales.
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs font-semibold text-primary">
            <span>Ver listado</span>
            <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* TARJETA 5: Comando Central / KPIs */}
        <Link
          to="/coach/dashboard"
          className="group block p-5 rounded-2xl bg-card/60 hover:bg-card/90 border border-border/80 hover:border-primary/40 transition-all duration-200 cursor-pointer active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-primary flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-primary/15 text-primary">
                <LayoutDashboard className="h-6 w-6" />
              </div>
              <span className="text-[11px] font-medium text-muted-foreground bg-secondary/80 px-2 py-0.5 rounded-md">
                Métricas
              </span>
            </div>
            <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
              Comando de Cartera
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Visualiza ingresos consolidados en USD/VES, tasa BCV activa y métricas de morosidad global.
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs font-semibold text-primary">
            <span>Ir al dashboard</span>
            <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* TARJETA 6: Ajustes Operativos (Planes & Tasa) */}
        <Link
          to="/coach/ajustes"
          className="group block p-5 rounded-2xl bg-card/60 hover:bg-card/90 border border-border/80 hover:border-primary/40 transition-all duration-200 cursor-pointer active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-primary flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-purple-500/15 text-purple-400">
                <SlidersHorizontal className="h-6 w-6" />
              </div>
              <span className="text-[11px] font-medium text-muted-foreground bg-secondary/80 px-2 py-0.5 rounded-md">
                Configuración
              </span>
            </div>
            <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
              Planes & Tasa Global
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Administra el catálogo comercial de membresías y define las tasas de cambio de referencia en Bs/USD.
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs font-semibold text-primary">
            <span>Gestionar catálogo</span>
            <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>
      </div>
    </div>
  );
}
