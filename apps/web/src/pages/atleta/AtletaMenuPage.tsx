import React from 'react';
import { Link } from 'react-router-dom';
import {
  Sparkles,
  Utensils,
  Scale,
  CreditCard,
  Settings,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../../context/auth-context';
import { useMiPerfil } from '../../lib/use-mi-perfil';
import { badgeEstadoCuota } from '../../lib/estado-cuota';
import { BloqueoAlumnoPanel } from '../../components/common/BloqueoAlumnoPanel';
import { AvisoDatosOffline } from '../../components/common/AvisoDatosOffline';
import { EstadoError } from '../../components/ui/EstadoError';
import { ChipRacha } from '../../components/atleta/menu/ChipRacha';
import { TarjetaEntrenarHoy } from '../../components/atleta/menu/TarjetaEntrenarHoy';
import { TarjetaAccesoAlumno } from '../../components/atleta/menu/TarjetaAccesoAlumno';
import {
  saludoAlumnoDesdePerfil,
  useResumenMenu,
} from '../../components/atleta/menu/use-resumen-menu';

/**
 * MEN-01 a MEN-06: Página principal del alumno (Accesos rápidos / Menú).
 * Presenta Bento Grid modularizado con saludo real de perfil, estado honesto de rutina y racha.
 */
export function AtletaMenuPage() {
  const { user, isDemoMode } = useAuth();
  const { perfil } = useMiPerfil(user, isDemoMode);
  const {
    semanaProgreso,
    cargandoSemana,
    errorSemana,
    sinConexionSemana,
    rachaNoDisponible,
    resumenFinanciero,
    bloqueo,
    recargarSemana,
  } = useResumenMenu(user, isDemoMode);

  const saludo = saludoAlumnoDesdePerfil(perfil?.alumno?.nombres);
  const badgeCuota = badgeEstadoCuota(resumenFinanciero);

  return (
    <div className="space-y-6 max-w-2xl mx-auto animate-in fade-in duration-200">
      {/* Saludo y Cabecera de bienvenida */}
      <div className="flex items-center justify-between flex-wrap gap-3 min-w-0">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Accesos rápidos
            </span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-foreground mt-1">
            {saludo}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            ¿Qué deseas hacer hoy? Toca una tarjeta para ir al grano.
          </p>
        </div>

        <ChipRacha
          rachaDias={semanaProgreso?.rachaDias ?? 0}
          rachaNoDisponible={rachaNoDisponible}
          cargando={cargandoSemana}
        />
      </div>

      {/* RF-012: estado de bloqueo del ciclo de vida (pausado / suspendido / archivado) */}
      {bloqueo && <BloqueoAlumnoPanel bloqueo={bloqueo} className="max-w-none" />}

      {/* MEN-03: aviso offline y error honesto si falló la carga de la semana */}
      {errorSemana && !bloqueo && (
        <div className="space-y-3">
          {sinConexionSemana && <AvisoDatosOffline variante="sin-datos" />}
          <EstadoError
            titulo="No pudimos cargar tu semana de entrenamiento"
            mensaje="Revisa tu conexión e inténtalo de nuevo."
            onReintentar={recargarSemana}
          />
        </div>
      )}

      {/* Bento Grid de Acciones */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TarjetaEntrenarHoy
          semanaProgreso={semanaProgreso}
          bloqueo={bloqueo}
          cargandoSemana={cargandoSemana}
          errorSemana={errorSemana}
        />

        <TarjetaAccesoAlumno
          to="/app/nutricion"
          icono={Utensils}
          claseColorIcono="bg-success/15 text-success"
          titulo="Mi comida de hoy"
          descripcion="Marca si cumpliste tus metas, anota tus calorías y sube foto de tu comida."
          ceja="Registro rápido"
          textoAccion="Reportar día"
        />

        <TarjetaAccesoAlumno
          to="/app/progreso"
          icono={Scale}
          claseColorIcono="bg-info/15 text-info"
          titulo="Mi progreso físico"
          descripcion="Compara tus fotos de evolución lado a lado y actualiza tus medidas o peso corporal."
          ceja="Antes y después"
          textoAccion="Ver evolución"
        />

        <TarjetaAccesoAlumno
          to="/app/pagos"
          icono={CreditCard}
          claseColorIcono="bg-warning/15 text-warning"
          titulo="Pagos y cuotas"
          descripcion="Reporta un nuevo abono (Pago Móvil / Zelle) o consulta tus recibos y fechas de corte."
          badgeCuota={badgeCuota}
          variante="completa"
        />
      </div>

      {/* RF-018 RN-09: Ajustes del alumno (perfil, acceso, avisos y zona horaria) */}
      <Link
        to="/app/ajustes"
        className="group flex items-center justify-between gap-3 p-4 rounded-2xl bg-card/60 hover:bg-card/90 border border-border/80 hover:border-primary/40 transition-all duration-200 cursor-pointer active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-primary"
      >
        <span className="flex items-center gap-3 min-w-0">
          <span className="p-2.5 rounded-xl bg-secondary text-muted-foreground group-hover:text-primary group-hover:bg-primary/15 transition-colors shrink-0">
            <Settings className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-foreground group-hover:text-primary transition-colors">
              Ajustes
            </span>
            <span className="block text-xs text-muted-foreground mt-0.5">
              Tu perfil, tu acceso, tus avisos y tu zona horaria.
            </span>
          </span>
        </span>
        <ChevronRight
          className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0"
          aria-hidden="true"
        />
      </Link>
    </div>
  );
}
