/**
 * RF-015 (Ola 3 · N2b): "Mis notificaciones" del alumno.
 *
 * Pantalla de preferencias de notificación por categoría y canal (matriz del §A del RF-015), con
 * los canales obligatorios de seguridad bloqueados (RN-01) y la advertencia de canal mínimo en
 * Finanzas (RN-02). Accesible desde la campana ("Configurar") y desde el menú del alumno.
 */
import React from 'react';
import { Bell } from 'lucide-react';
import { MatrizPreferenciasNotificacion } from '../../components/notificaciones/MatrizPreferenciasNotificacion';

export function PreferenciasPage() {
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
    </div>
  );
}
