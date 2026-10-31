import React from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowUpRight,
  Camera,
  ChevronRight,
  ClipboardList,
  DollarSign,
  LayoutDashboard,
  Sparkles,
  SlidersHorizontal,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../../context/auth-context';
import { useMiPerfil } from '../../lib/use-mi-perfil';
import { usePendientesNavegacion } from '../../lib/use-pendientes-navegacion';
import { insigniasPendientes, type ClaveInsignia } from '../../lib/insignias-pendientes';
import { DESTINOS_ENTRENADOR } from '../../lib/etiquetas-dominio';
import { InsigniaConteo } from '../../components/ui/InsigniaConteo';

/** Datos de una tarjeta del menú; el orden del array es el de la rejilla. */
interface TarjetaMenu {
  ruta: string;
  ceja: string;
  titulo: string;
  descripcion: string;
  pie: string;
  icono: LucideIcon;
  claseIcono: string;
  clasePill: string;
  claseBorde: string;
  claseTitulo: string;
  clasePie: string;
  /** Destino cuya insignia de pendientes muestra la tarjeta. */
  clave?: ClaveInsignia;
}

const TARJETAS_MENU: TarjetaMenu[] = [
  {
    ruta: DESTINOS_ENTRENADOR.controlCobros.ruta,
    ceja: 'Cartera',
    titulo: DESTINOS_ENTRENADOR.controlCobros.etiqueta,
    descripcion: 'Mira quién te debe y cuánto, quién vence pronto y envía recordatorios con un clic.',
    pie: 'Ver cartera',
    icono: Wallet,
    claseIcono: 'bg-warning/15 text-warning',
    clasePill: 'text-warning bg-warning/10',
    claseBorde: 'hover:border-warning/40',
    claseTitulo: 'group-hover:text-warning',
    clasePie: 'text-warning',
    clave: 'controlCobros',
  },
  {
    ruta: DESTINOS_ENTRENADOR.evaluaciones.ruta,
    ceja: 'Revisión del coach',
    titulo: DESTINOS_ENTRENADOR.evaluaciones.etiqueta,
    descripcion: 'Revisa las medidas y fotos de progreso de tus alumnos, con comparación antes/después.',
    pie: 'Ver evaluaciones',
    icono: Camera,
    claseIcono: 'bg-info/15 text-info',
    clasePill: 'text-muted-foreground bg-secondary/80',
    claseBorde: 'hover:border-primary/40',
    claseTitulo: 'group-hover:text-primary',
    clasePie: 'text-primary',
    clave: 'evaluaciones',
  },
  {
    ruta: DESTINOS_ENTRENADOR.seguimiento.ruta,
    ceja: 'Riesgo',
    titulo: DESTINOS_ENTRENADOR.seguimiento.etiqueta,
    descripcion: 'Mira quién está en riesgo esta semana y a quién le toca una rutina nueva.',
    pie: 'Ver seguimiento',
    icono: AlertTriangle,
    claseIcono: 'bg-warning/15 text-warning',
    clasePill: 'text-warning bg-warning/10',
    claseBorde: 'hover:border-warning/40',
    claseTitulo: 'group-hover:text-warning',
    clasePie: 'text-warning',
    clave: 'seguimiento',
  },
  {
    ruta: DESTINOS_ENTRENADOR.alumnos.ruta,
    ceja: 'Fichas',
    titulo: DESTINOS_ENTRENADOR.alumnos.etiqueta,
    descripcion: 'Planes, precios y datos de cada alumno, con altas manuales.',
    pie: 'Ver alumnos',
    icono: Users,
    claseIcono: 'bg-decor/15 text-decor',
    clasePill: 'text-muted-foreground bg-secondary/80',
    claseBorde: 'hover:border-primary/40',
    claseTitulo: 'group-hover:text-primary',
    clasePie: 'text-primary',
  },
  {
    ruta: DESTINOS_ENTRENADOR.panel.ruta,
    ceja: 'Resumen',
    titulo: DESTINOS_ENTRENADOR.panel.etiqueta,
    descripcion: 'Ingresos en bolívares y dólares, tasa del día y alumnos con pagos atrasados.',
    pie: 'Ver resumen',
    icono: LayoutDashboard,
    claseIcono: 'bg-primary/15 text-primary',
    clasePill: 'text-muted-foreground bg-secondary/80',
    claseBorde: 'hover:border-primary/40',
    claseTitulo: 'group-hover:text-primary',
    clasePie: 'text-primary',
  },
  {
    ruta: `${DESTINOS_ENTRENADOR.ajustes.ruta}?tab=planes`,
    ceja: 'Ajustes',
    titulo: 'Planes y Tasa de Cambio',
    descripcion: 'Crea los planes de membresía y define la tasa de cambio Bs/USD.',
    pie: 'Gestionar planes',
    icono: SlidersHorizontal,
    claseIcono: 'bg-decor/15 text-decor',
    clasePill: 'text-muted-foreground bg-secondary/80',
    claseBorde: 'hover:border-primary/40',
    claseTitulo: 'group-hover:text-primary',
    clasePie: 'text-primary',
  },
  {
    ruta: DESTINOS_ENTRENADOR.plantillas.ruta,
    ceja: 'Rutinas',
    titulo: DESTINOS_ENTRENADOR.plantillas.etiqueta,
    descripcion: 'Diseña rutinas reutilizables por nivel objetivo y asígnalas a cualquier alumno con ajuste de cargas en segundos.',
    pie: 'Ver plantillas',
    icono: ClipboardList,
    claseIcono: 'bg-danger/15 text-danger',
    clasePill: 'text-muted-foreground bg-secondary/80',
    claseBorde: 'hover:border-primary/40',
    claseTitulo: 'group-hover:text-primary',
    clasePie: 'text-primary',
  },
];

export function CoachMenuPage() {
  const { user, isDemoMode } = useAuth();
  const { perfil } = useMiPerfil(user, isDemoMode);
  const insignias = insigniasPendientes(usePendientesNavegacion());

  // Primera palabra de los nombres del perfil; sin perfil, saludo genérico (nunca el correo).
  const primerNombre = (perfil?.entrenador?.nombres ?? '').trim().split(/\s+/)[0] ?? '';
  const saludo = primerNombre ? `Hola, ${primerNombre}` : 'Hola';

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in duration-200">
      {/* Cabecera y saludo */}
      <div>
        <span className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Menú del Entrenador
        </span>
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-foreground mt-1">
          {saludo}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Elige una tarea para resolverla de inmediato.
        </p>
      </div>

      {/* Bento Grid de Acciones Operativas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Hero operativo: pagos por validar */}
        <Link
          to={DESTINOS_ENTRENADOR.pagosPorValidar.ruta}
          className="sm:col-span-2 lg:col-span-2 group relative block overflow-hidden p-6 rounded-3xl bg-gradient-to-br from-card/90 via-card/60 to-success/10 border-2 border-success/30 hover:border-success/70 transition-all duration-200 shadow-lg hover:shadow-success/5 cursor-pointer active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
        >
          <div className="flex items-start justify-between">
            <div className="p-3 rounded-2xl bg-success text-success-foreground shadow-md shadow-success/20">
              <DollarSign className="h-7 w-7" aria-hidden="true" />
            </div>
          </div>

          <div className="mt-4">
            <h2 className="text-xl font-bold text-foreground group-hover:text-success transition-colors flex items-center gap-2">
              {DESTINOS_ENTRENADOR.pagosPorValidar.etiqueta}
              <ArrowUpRight aria-hidden="true" className="h-5 w-5 text-success opacity-80 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-lg">
              Revisa los comprobantes de Pago Móvil, Zelle y transferencias. Confirma el pago y descuéntalo del saldo en USD.
            </p>
          </div>

          <div className="mt-5 flex items-center justify-between pt-4 border-t border-border/60">
            <span className="text-xs font-medium text-muted-foreground">
              Comprobantes con foto ampliable
            </span>
            <span className="flex items-center gap-2 text-xs font-bold text-success group-hover:translate-x-1 transition-transform">
              <InsigniaConteo
                conteo={insignias.pagosPorValidar.conteo}
                descripcion={insignias.pagosPorValidar.descripcion}
              />
              <span className="flex items-center gap-1">
                Revisar pagos <ChevronRight aria-hidden="true" className="h-4 w-4" />
              </span>
            </span>
          </div>
        </Link>

        {TARJETAS_MENU.map((tarjeta) => {
          const Icono = tarjeta.icono;
          const insignia = tarjeta.clave ? insignias[tarjeta.clave] : undefined;
          return (
            <Link
              key={tarjeta.ruta}
              to={tarjeta.ruta}
              className={`group block p-5 rounded-2xl bg-card/60 hover:bg-card/90 border border-border/80 ${tarjeta.claseBorde} transition-all duration-200 cursor-pointer active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 flex flex-col justify-between`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className={`p-2.5 rounded-xl ${tarjeta.claseIcono}`}>
                    <Icono className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${tarjeta.clasePill}`}>
                    {tarjeta.ceja}
                  </span>
                </div>
                <h3 className={`text-base font-bold text-foreground transition-colors ${tarjeta.claseTitulo}`}>
                  {tarjeta.titulo}
                </h3>
                <p className="text-xs text-muted-foreground mt-1">{tarjeta.descripcion}</p>
              </div>

              <div className={`mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs font-semibold ${tarjeta.clasePie}`}>
                <span>{tarjeta.pie}</span>
                <span className="flex items-center gap-2">
                  <InsigniaConteo conteo={insignia?.conteo ?? null} descripcion={insignia?.descripcion ?? ''} />
                  <ChevronRight aria-hidden="true" className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
