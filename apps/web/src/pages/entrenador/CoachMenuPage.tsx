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
  ClipboardList,
  Wallet,
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
              Menú del Entrenador
            </span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-foreground mt-1">
            Hola, Coach {primerNombre}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Elige una tarea para resolverla de inmediato.
          </p>
        </div>

        <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-2xl bg-secondary/60 border border-border/80">
          <ShieldCheck className="h-4 w-4 text-success" />
          <div className="text-right">
            <div className="text-xs font-bold font-mono text-foreground">Sesión Segura</div>
            <div className="text-[11px] text-muted-foreground">Datos Protegidos</div>
          </div>
        </div>
      </div>

      {/* Bento Grid de Acciones Operativas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* TARJETA 1: Validar Pagos (Hero Operativo) */}
        <Link
          to="/coach/conciliacion"
          className="sm:col-span-2 lg:col-span-2 group relative block overflow-hidden p-6 rounded-3xl bg-gradient-to-br from-card/90 via-card/60 to-success/10 border-2 border-success/30 hover:border-success/70 transition-all duration-200 shadow-lg hover:shadow-success/5 cursor-pointer active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-primary"
        >
          <div className="flex items-start justify-between">
            <div className="p-3 rounded-2xl bg-success text-success-foreground shadow-md shadow-success/20">
              <DollarSign className="h-7 w-7" />
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-success/20 text-success border border-success/30">
              Por orden de llegada
            </span>
          </div>

          <div className="mt-4">
            <h2 className="text-xl font-bold text-foreground group-hover:text-success transition-colors flex items-center gap-2">
              Validar Pagos Entrantes
              <ArrowUpRight className="h-5 w-5 text-success opacity-80 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-lg">
              Revisa los comprobantes de Pago Móvil, Zelle y transferencias. Confirma el pago y descuéntalo del saldo en USD.
            </p>
          </div>

          <div className="mt-5 flex items-center justify-between pt-4 border-t border-border/60">
            <span className="text-xs font-medium text-muted-foreground">
              Comprobantes con foto ampliable
            </span>
            <span className="text-xs font-bold text-success flex items-center gap-1 group-hover:translate-x-1 transition-transform">
              Revisar pagos <ChevronRight className="h-4 w-4" />
            </span>
          </div>
        </Link>

        {/* TARJETA 2: Control de Cobros (RF-009) */}
        <Link
          to="/coach/cartera"
          className="group block p-5 rounded-2xl bg-card/60 hover:bg-card/90 border border-border/80 hover:border-warning/40 transition-all duration-200 cursor-pointer active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-primary flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-warning/15 text-warning">
                <Wallet className="h-6 w-6" />
              </div>
              <span className="text-[11px] font-medium text-warning bg-warning/10 px-2 py-0.5 rounded-md">
                Cartera
              </span>
            </div>
            <h3 className="text-base font-bold text-foreground group-hover:text-warning transition-colors">
              Control de Cobros
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Mira quién te debe y cuánto, quién vence pronto y envía recordatorios con un clic.
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs font-semibold text-warning">
            <span>Ver cartera</span>
            <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* TARJETA 3: Revisar Evaluaciones Físicas */}
        <Link
          to="/coach/antropometria"
          className="group block p-5 rounded-2xl bg-card/60 hover:bg-card/90 border border-border/80 hover:border-primary/40 transition-all duration-200 cursor-pointer active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-primary flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-info/15 text-info">
                <Camera className="h-6 w-6" />
              </div>
              <span className="text-[11px] font-medium text-muted-foreground bg-secondary/80 px-2 py-0.5 rounded-md">
                Revisión del coach
              </span>
            </div>
            <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
              Revisar Evaluaciones
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Revisa las medidas y fotos de progreso de tus alumnos, con comparación antes/después.
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs font-semibold text-primary">
            <span>Ver evaluaciones</span>
            <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* TARJETA 4: Alumnos en Alerta */}
        <Link
          to="/coach/monitor-adherencia"
          className="group block p-5 rounded-2xl bg-card/60 hover:bg-card/90 border border-border/80 hover:border-warning/40 transition-all duration-200 cursor-pointer active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-primary flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-warning/15 text-warning">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <span className="text-[11px] font-medium text-warning bg-warning/10 px-2 py-0.5 rounded-md">
                Riesgo
              </span>
            </div>
            <h3 className="text-base font-bold text-foreground group-hover:text-warning transition-colors">
              Alumnos en Alerta
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Mira quién está en riesgo esta semana y a quién le toca una rutina nueva.
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs font-semibold text-warning">
            <span>Ver alumnos</span>
            <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* TARJETA 5: Mis Alumnos */}
        <Link
          to="/coach/alumnos"
          className="group block p-5 rounded-2xl bg-card/60 hover:bg-card/90 border border-border/80 hover:border-primary/40 transition-all duration-200 cursor-pointer active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-primary flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-decor/15 text-decor">
                <Users className="h-6 w-6" />
              </div>
              <span className="text-[11px] font-medium text-muted-foreground bg-secondary/80 px-2 py-0.5 rounded-md">
                Fichas
              </span>
            </div>
            <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
              Mis Alumnos
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Planes, precios y datos de cada alumno, con altas manuales.
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs font-semibold text-primary">
            <span>Ver alumnos</span>
            <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* TARJETA 6: Panel administrativo (resumen y métricas) */}
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
                Resumen
              </span>
            </div>
            <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
              Panel administrativo
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Ingresos en bolívares y dólares, tasa del día y alumnos con pagos atrasados.
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs font-semibold text-primary">
            <span>Ver resumen</span>
            <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* TARJETA 7: Planes y Tasa de Cambio */}
        <Link
          to="/coach/ajustes?tab=planes"
          className="group block p-5 rounded-2xl bg-card/60 hover:bg-card/90 border border-border/80 hover:border-primary/40 transition-all duration-200 cursor-pointer active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-primary flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-decor/15 text-decor">
                <SlidersHorizontal className="h-6 w-6" />
              </div>
              <span className="text-[11px] font-medium text-muted-foreground bg-secondary/80 px-2 py-0.5 rounded-md">
                Ajustes
              </span>
            </div>
            <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
              Planes y Tasa de Cambio
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Crea los planes de membresía y define la tasa de cambio Bs/USD.
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs font-semibold text-primary">
            <span>Gestionar planes</span>
            <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* TARJETA 8: Banco de Plantillas (RF-017) */}
        <Link
          to="/coach/plantillas"
          className="group block p-5 rounded-2xl bg-card/60 hover:bg-card/90 border border-border/80 hover:border-primary/40 transition-all duration-200 cursor-pointer active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-primary flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-danger/15 text-danger">
                <ClipboardList className="h-6 w-6" />
              </div>
              <span className="text-[11px] font-medium text-muted-foreground bg-secondary/80 px-2 py-0.5 rounded-md">
                Rutinas
              </span>
            </div>
            <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
              Plantillas de ejercicios
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Diseña rutinas reutilizables por nivel objetivo y asígnalas a cualquier alumno con ajuste de cargas en segundos.
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs font-semibold text-primary">
            <span>Ver plantillas</span>
            <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>
      </div>
    </div>
  );
}
