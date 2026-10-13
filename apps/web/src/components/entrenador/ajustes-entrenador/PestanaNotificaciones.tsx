/**
 * RF-015 §B · Ajustes del entrenador: pestaña de preferencias de notificación.
 *
 * Extraído de `pages/entrenador/AjustesPage.tsx:906-926`.
 * Presentacional: solo envuelve la card y la matriz existente. El mock del spec por
 * ruta de módulo sigue interceptando esta importación (mismo archivo destino).
 */
import { MatrizPreferenciasNotificacion } from '../../notificaciones/MatrizPreferenciasNotificacion';

export function PestanaNotificaciones() {
  return (
    <div className="space-y-4 animate-in fade-in-50 duration-200">
      <div className="p-5 rounded-3xl bg-card border border-border/80 space-y-1">
        <h2 className="font-bold text-base text-foreground">
          Avisos que recibes como entrenador
        </h2>
        <p className="text-xs text-muted-foreground">
          Elige por dónde quieres recibir cada tipo de aviso. Los avisos de seguridad siempre
          llegan por correo y no pueden desactivarse.
        </p>
      </div>

      <MatrizPreferenciasNotificacion />
    </div>
  );
}
