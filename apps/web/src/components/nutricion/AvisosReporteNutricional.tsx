/**
 * Módulo 3 · Nutrición: confirmaciones del guardado del reporte de hoy.
 *
 * Éxito, pendiente, confirmación en curso e info se anuncian como estado (`role="status"`);
 * solo los errores interrumpen (`role="alert"`).
 */
import React from 'react';

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
        <p role="status" className="text-center text-xs text-success font-semibold">
          ✓ Reporte registrado para hoy ({fechaRegistradaTexto}).
        </p>
      )}

      {reporteEncolado && (
        <p role="status" className="text-center text-xs text-warning font-semibold">
          ⏳ Guardado en tu dispositivo
          {fotosEncoladas > 0
            ? ` con ${fotosEncoladas} foto${fotosEncoladas === 1 ? '' : 's'}`
            : ''}
          . Se enviará automáticamente al recuperar la conexión; el día quedará registrado solo
          cuando quede confirmado.
        </p>
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
