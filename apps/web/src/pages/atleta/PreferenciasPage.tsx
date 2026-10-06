/**
 * RF-015 (Ola 3 · N2b): "Mis notificaciones" del alumno.
 *
 * Pantalla de preferencias de notificación por categoría y canal (matriz del §A del RF-015), con
 * los canales obligatorios de seguridad bloqueados (RN-01) y la advertencia de canal mínimo en
 * Finanzas (RN-02). Accesible desde la campana ("Configurar") y desde el menú del alumno.
 *
 * ADR-019: también aloja la zona horaria del perfil, que decide el horario del reporte de nutrición.
 */
import React from 'react';
import { Bell, Clock } from 'lucide-react';
import { MatrizPreferenciasNotificacion } from '../../components/notificaciones/MatrizPreferenciasNotificacion';
import { ZonaHorariaPerfil } from '../../components/common/ZonaHorariaPerfil';
import { useAuth } from '../../context/auth-context';
import { HORARIO_VENTANA_CHECKIN } from '../../lib/nutricion-checkin';

export function PreferenciasPage() {
  const { user, isDemoMode, actualizarZonaHoraria } = useAuth();

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-24 lg:pb-12 animate-in fade-in duration-200">
      <div className="flex items-start gap-3">
        <span className="p-2.5 rounded-2xl bg-primary/15 text-primary shrink-0">
          <Bell className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl lg:text-3xl font-black tracking-tight text-foreground">
            Mis notificaciones
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Elige qué avisos quieres recibir y por dónde. Los avisos de seguridad siempre te llegan
            por correo.
          </p>
        </div>
      </div>

      <MatrizPreferenciasNotificacion />

      <section
        aria-labelledby="titulo-zona-horaria"
        className="p-5 sm:p-6 rounded-3xl bg-card border border-border shadow-xs space-y-3"
      >
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <h2 id="titulo-zona-horaria" className="text-base font-bold text-foreground">
            Tu zona horaria
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Con ella contamos el horario de tu reporte de nutrición (de {HORARIO_VENTANA_CHECKIN}).
          Cámbiala si vives o viajas a otro país; tu entrenador también la verá.
        </p>
        {/* Sin la zona real de la sesión no se ofrece guardar: mostrar la zona por defecto como si
            fuera la suya podría sobrescribir su perfil. */}
        {user && (user.zonaHoraria || isDemoMode) ? (
          <ZonaHorariaPerfil
            id="zona-horaria-perfil"
            zonaActual={user.zonaHoraria}
            endpoint="/alumnos/me/zona-horaria"
            modoDemo={isDemoMode}
            onGuardada={(zona) => actualizarZonaHoraria(zona, user.id)}
          />
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            Cargando tu zona horaria…
          </p>
        )}
      </section>
    </div>
  );
}
