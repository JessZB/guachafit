/**
 * Módulo 6 · Nutrición: tira de los últimos 7 días con visor (ÚNICO de vista).
 *
 * Extraído de `pages/atleta/NutricionPage.tsx` (SL2, fase B). Tira compacta de 7 días; el chip
 * de tono se comparte solo en concepto (ver nota de `ToleranciaDelDia` sobre `BadgeEstado`).
 * Corrige el WARNING del inventario (plural manual → `pluralizar()`, salida idéntica).
 * §6: celdas `h-11` táctiles, textos ≥11px, día encolado sin declarar éxito (RF-002 §6).
 */
import { etiquetaEstadoDia, type DiaCalendarioNutricional } from '../../../lib/nutricion-metas';
import { formatFechaLargaCalendario } from '../../../lib/date-format';
import { pluralizar } from '../../../lib/pluralizar';

export interface CalendarioUltimos7DiasProps {
  calendario: DiaCalendarioNutricional[];
  diasNoReportados: number;
  hoyLocal: string;
  pendienteHoy: boolean;
}

export function CalendarioUltimos7Dias({
  calendario,
  diasNoReportados,
  hoyLocal,
  pendienteHoy,
}: CalendarioUltimos7DiasProps) {
  return (
    <section className="p-5 rounded-3xl bg-card border border-border shadow-xs space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-bold text-sm text-foreground">Tus últimos 7 días</h3>
        {diasNoReportados > 0 && (
          <span className="text-xs font-semibold text-muted-foreground">
            {pluralizar(diasNoReportados, 'día sin reporte', 'días sin reporte')}
          </span>
        )}
      </div>
      <ul className="grid grid-cols-7 gap-1.5">
        {[...calendario].reverse().map((dia) => {
          // RF-002 §6: el día con reporte encolado no declara éxito ni "No reportado":
          // queda pendiente de sincronizar hasta que quede confirmado.
          const etiqueta =
            pendienteHoy && dia.fecha === hoyLocal
              ? { texto: 'Pendiente de sincronizar', tono: 'warning' as const }
              : etiquetaEstadoDia(dia.estado);
          return (
            <li key={dia.fecha} className="text-center">
              <span
                title={`${formatFechaLargaCalendario(dia.fecha) ?? dia.fecha}: ${etiqueta.texto}`}
                className={`flex h-11 w-full items-center justify-center rounded-xl border text-xs font-bold ${
                  etiqueta.tono === 'success'
                    ? 'bg-success/15 text-success border-success/30'
                    : etiqueta.tono === 'warning'
                    ? 'bg-warning/15 text-warning border-warning/30'
                    : etiqueta.tono === 'danger'
                    ? 'bg-destructive/15 text-destructive border-destructive/30'
                    : etiqueta.tono === 'info'
                    ? 'bg-info/15 text-info border-info/30'
                    : 'bg-secondary text-muted-foreground border-border'
                }`}
              >
                {dia.fecha.slice(8)}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground truncate">
                {etiqueta.texto}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        Un día sin reporte no afecta tu racha de entrenamiento.
      </p>
    </section>
  );
}
