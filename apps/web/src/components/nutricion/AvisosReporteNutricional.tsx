/**
 * Módulo 3 · Nutrición: confirmaciones del guardado del reporte de hoy.
 *
 * Éxito, pendiente, confirmación en curso e info se anuncian como estado (`role="status"`);
 * solo los errores interrumpen (`role="alert"`).
 */
import React from 'react';
import { Check, Clock } from 'lucide-react';
import { pluralizar } from '../../lib/pluralizar';

/** Aviso del guardado: `info` (p. ej. ya existía el reporte) o `error` (rechazo, validación). */
export interface AvisoReporte {
  tono: 'info' | 'error';
  texto: string;
}

export interface AvisosReporteNutricionalProps {
  reporteRegistradoHoy: boolean;
  /** Fecha del reporte registrado, ya formateada para leer. */
  fechaRegistradaTexto: string;
  reporteEncolado: boolean;
  /** El pendiente salió de la cola y se está comprobando si quedó registrado. */
  confirmando: boolean;
  fotosEncoladas: number;
  aviso: AvisoReporte | null;
}

export function AvisosReporteNutricional({
  reporteRegistradoHoy,
  fechaRegistradaTexto,
  reporteEncolado,
  confirmando,
  fotosEncoladas,
  aviso,
}: AvisosReporteNutricionalProps) {
  return (
    <>
      {reporteRegistradoHoy && (
        <div className="flex items-center justify-center gap-1.5 text-success">
          <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <p role="status" className="text-center text-xs text-success font-semibold">
            Reporte registrado para hoy ({fechaRegistradaTexto}).
          </p>
        </div>
      )}

      {reporteEncolado && (
        <div className="flex items-center justify-center gap-1.5 text-warning">
          <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <p role="status" className="text-center text-xs text-warning font-semibold">
            Guardado en tu dispositivo
            {fotosEncoladas > 0 ? ` con ${pluralizar(fotosEncoladas, 'foto', 'fotos')}` : ''}. Se
            enviará automáticamente al recuperar la conexión; el día quedará registrado solo cuando
            quede confirmado.
          </p>
        </div>
      )}

      {confirmando && (
        <p role="status" className="text-center text-xs text-muted-foreground font-semibold">
          Comprobando si tu reporte quedó registrado…
        </p>
      )}

      {aviso && (
        <p
          role={aviso.tono === 'error' ? 'alert' : 'status'}
          className={`text-center text-xs font-semibold ${
            aviso.tono === 'error' ? 'text-destructive' : 'text-warning'
          }`}
        >
          {aviso.texto}
        </p>
      )}
    </>
  );
}
