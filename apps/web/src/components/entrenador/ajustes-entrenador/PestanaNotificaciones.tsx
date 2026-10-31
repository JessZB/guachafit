/**
 * RF-015 §B · Ajustes del entrenador: pestaña de preferencias de notificación (UX-17, CFG-05).
 *
 * La matriz compartida ya pinta su propia tarjeta y no tiene cabecera, así que no se envuelve en
 * `TarjetaAjustes` (evitaría una tarjeta doble): solo añade una línea de descripción encima.
 * El mock del spec por ruta de módulo sigue interceptando esta importación (mismo archivo destino).
 */
import { MatrizPreferenciasNotificacion } from '../../notificaciones/MatrizPreferenciasNotificacion';

export function PestanaNotificaciones() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Elige por dónde recibir cada aviso. Los de seguridad siempre llegan por correo.
      </p>
      <MatrizPreferenciasNotificacion />
    </div>
  );
}
