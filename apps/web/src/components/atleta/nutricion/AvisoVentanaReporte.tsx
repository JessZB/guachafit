/**
 * Módulo 6 · Nutrición: aviso de ventana RN-02 (ÚNICO de vista).
 *
 * Extraído de `pages/atleta/NutricionPage.tsx` (SL2, fase B). Copy y hora propios (RN-02).
 * §6: estado honesto con `role="status"`; se declara ANTES del formulario.
 */
import { Clock } from 'lucide-react';
import { textoHorarioCheckin } from '../../../lib/nutricion-checkin';

export interface AvisoVentanaReporteProps {
  zonaPerfil: string;
}

export function AvisoVentanaReporte({ zonaPerfil }: AvisoVentanaReporteProps) {
  return (
    <div
      role="status"
      className="flex items-start gap-3 p-4 rounded-3xl bg-warning/10 border border-warning/30 text-warning"
    >
      <Clock className="h-5 w-5 shrink-0 mt-0.5" />
      <div className="space-y-1">
        <p className="text-sm font-bold text-foreground">El reporte aún no está abierto</p>
        <p className="text-xs text-muted-foreground">
          {textoHorarioCheckin(zonaPerfil)} Cuando abra, marca tu semáforo y guarda tu día; fuera
          de ese horario el día queda como &quot;No reportado&quot;.
        </p>
      </div>
    </div>
  );
}
