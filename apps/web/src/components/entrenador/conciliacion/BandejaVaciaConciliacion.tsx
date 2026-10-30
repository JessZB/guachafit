/**
 * Empty tray state: every reported payment has been processed.
 *
 * Usa el átomo `EstadoVacio` con título de nivel 2 y una acción hacia la cartera.
 */
import { CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { EstadoVacio } from '../../ui/EstadoVacio';

export function BandejaVaciaConciliacion() {
  const navigate = useNavigate();

  return (
    <EstadoVacio
      titulo="No hay pagos por validar"
      detalle="Cuando un alumno reporte un pago, aparecerá aquí."
      icono={CheckCircle2}
      nivelTitulo={2}
      accion={{ texto: 'Ver quién debe', onAccion: () => navigate('/coach/cartera') }}
    />
  );
}
