import type { DashboardComandoDTO } from '@guachafit/shared';
import { AlertTriangle, UserX } from 'lucide-react';
import { pluralizar } from '../../../lib/pluralizar';
import { ListaRiesgoDashboard, type FilaRiesgoDashboard } from './ListaRiesgoDashboard';

export interface ListasAlertaTempranaProps {
  bandejas: DashboardComandoDTO['bandejasRapidas'];
}

/** Listas de alerta temprana (pagos vencidos y sin entrenar). Solo presentación, con datos reales. */
export function ListasAlertaTemprana({ bandejas }: ListasAlertaTempranaProps) {
  const filasMora: FilaRiesgoDashboard[] = bandejas.alumnosEnMora.map((mora) => ({
    id: mora.alumnoId,
    nombre: mora.nombre,
    detalle: pluralizar(mora.diasVencido, 'día de atraso', 'días de atraso'),
    valor: `$${mora.saldoPendienteUsd} USD`,
  }));

  const filasInactivos: FilaRiesgoDashboard[] = bandejas.alumnosInactivosEntrenamiento.map(
    (inac) => ({
      id: inac.alumnoId,
      nombre: inac.nombre,
      detalle: 'Sin registrar series',
      valor: pluralizar(inac.diasSinEntrenar, 'día sin entrenar', 'días sin entrenar'),
    })
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <ListaRiesgoDashboard
        titulo="Alumnos con Pagos Vencidos"
        icono={AlertTriangle}
        tono="warning"
        filas={filasMora}
        textoVacio="Sin pagos vencidos por ahora 🎉"
        rutaVerTodos="/coach/cartera?pestana=mora"
      />
      <ListaRiesgoDashboard
        titulo="Alumnos sin Entrenar"
        icono={UserX}
        tono="destructive"
        filas={filasInactivos}
        textoVacio="Sin alumnos inactivos por ahora 🎉"
        rutaVerTodos="/coach/monitor-adherencia"
      />
    </div>
  );
}
