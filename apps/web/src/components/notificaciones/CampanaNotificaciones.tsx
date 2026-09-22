/**
 * RF-014 RN-04 (Ola 3 · N2b): campana del header con badge de no leídas y panel de bandeja.
 *
 * El botón conserva el área táctil del resto de acciones del header (44px en móvil) y expone un
 * `aria-label` dinámico con el conteo exacto. Al pulsar se abre `PanelNotificaciones`; un clic en
 * una notificación la marca leída y navega a su `linkAccion` resuelto (o solo la marca si el enlace
 * no aplica al rol).
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import type { NotificacionInAppDTO } from '@guachafit/shared';
import { useAuth } from '../../context/auth-context';
import {
  etiquetaBotonCampana,
  insigniaNoLeidas,
  resolverRutaNotificacion,
  rutaConfiguracionNotificaciones,
} from '../../lib/notificaciones-in-app';
import { useNotificacionesInApp } from '../../lib/use-notificaciones-in-app';
import { PanelNotificaciones } from './PanelNotificaciones';

export function CampanaNotificaciones() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [abierto, setAbierto] = useState(false);
  const bandeja = useNotificacionesInApp({ abierto });

  const insignia = insigniaNoLeidas(bandeja.totalNoLeidas);

  const abrirNotificacion = (item: NotificacionInAppDTO) => {
    // Marcar leída SIEMPRE (el clic es la señal de lectura); navegar solo si hay destino real.
    void bandeja.marcarLeida(item.id);
    const ruta = resolverRutaNotificacion(item.linkAccion, user?.rol);
    if (ruta) {
      setAbierto(false);
      navigate(ruta);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto((previo) => !previo)}
        aria-label={etiquetaBotonCampana(bandeja.totalNoLeidas)}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        title="Notificaciones"
        className={`relative h-11 w-11 sm:h-9 sm:w-9 inline-flex items-center justify-center rounded-xl transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-primary ${
          abierto
            ? 'bg-secondary text-foreground'
            : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
        }`}
      >
        <Bell className="h-4 w-4" />
        {insignia && (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-primary text-primary-foreground text-[11px] font-black leading-5 text-center"
          >
            {insignia}
          </span>
        )}
      </button>

      <PanelNotificaciones
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        rol={user?.rol}
        items={bandeja.items}
        total={bandeja.total}
        totalNoLeidas={bandeja.totalNoLeidas}
        cargando={bandeja.cargando}
        error={bandeja.error}
        errorAccion={bandeja.errorAccion}
        marcandoId={bandeja.marcandoId}
        marcandoTodas={bandeja.marcandoTodas}
        hayMas={bandeja.hayMas}
        rutaConfiguracion={rutaConfiguracionNotificaciones(user?.rol)}
        onVerMas={bandeja.verMas}
        onReintentar={bandeja.recargar}
        onMarcarTodas={() => void bandeja.marcarTodasLeidas()}
        onLimpiarErrorAccion={bandeja.limpiarErrorAccion}
        onAbrirNotificacion={abrirNotificacion}
      />
    </>
  );
}
