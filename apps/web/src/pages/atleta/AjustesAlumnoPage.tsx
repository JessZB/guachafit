/**
 * RF-018 RN-09: "Ajustes" del alumno (`/app/ajustes`), que reemplaza a "Mis notificaciones".
 *
 * Pestañas: Perfil y Correo y contraseña (comunes a todos los roles), Notificaciones (matriz de
 * RF-015 con sus bloqueos RN-01/RN-02) y Zona horaria (ADR-019: decide el horario del reporte de
 * nutrición). `/app/preferencias` redirige aquí, a la pestaña Notificaciones.
 */
import { Clock } from 'lucide-react';
import { PantallaAjustes } from '../../components/ajustes/PantallaAjustes';
import { MatrizPreferenciasNotificacion } from '../../components/notificaciones/MatrizPreferenciasNotificacion';
import { ZonaHorariaPerfil } from '../../components/common/ZonaHorariaPerfil';
import { useAuth } from '../../context/auth-context';
import { HORARIO_VENTANA_CHECKIN } from '../../lib/nutricion-checkin';

function SeccionZonaHoraria() {
  const { user, isDemoMode, actualizarZonaHoraria } = useAuth();
  return (
    <section
      aria-label="Zona horaria"
      className="p-5 sm:p-6 rounded-3xl bg-card border border-border shadow-xs space-y-3"
    >
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-primary" />
        <span className="text-base font-bold text-foreground">
          Zona horaria
        </span>
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
  );
}

export function AjustesAlumnoPage() {
  return (
    <PantallaAjustes
      descripcion="Tu perfil, tu acceso, los avisos que recibes y tu zona horaria."
      renderPestana={(pestana) => {
        if (pestana === 'notificaciones') {
          return (
            <>
              <p className="text-sm text-muted-foreground">
                Elige qué avisos quieres recibir y por dónde. Los avisos de seguridad siempre te
                llegan por correo.
              </p>
              <MatrizPreferenciasNotificacion />
            </>
          );
        }
        if (pestana === 'zona-horaria') return <SeccionZonaHoraria />;
        return null;
      }}
    />
  );
}
