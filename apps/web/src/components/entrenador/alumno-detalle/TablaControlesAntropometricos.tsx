/**
 * Tabla del historial cronológico de controles antropométricos (organismo ÚNICO candidato).
 *
 * Presentacional: controles, error y paginación por props (R1). Extraída de
 * `pages/entrenador/AlumnoDetallePage.tsx` (SL-5). `ProgresoPage` no replica esta tabla.
 * Conserva tabla desktop + tarjetas móvil con el mismo dato.
 *
 * §6: 11px mínimo, pesos ≤ 700, tokens con variante oscura, error honesto (`role="alert"`).
 */
import { AlertCircle } from 'lucide-react';
import { Paginacion } from '../../common/Paginacion';
import { formatFechaCalendario } from '../../../lib/date-format';
import type { ControlAntroFila } from '../../../lib/alumno-detalle-controles';

export interface TablaControlesFuente {
  controlesAntro: ControlAntroFila[];
  controlesErrorMsg: string | null;
  controlesTotal: number;
  paginaControles: number;
  tamanoControles: number;
  isCargandoControles: boolean;
  cambiarPaginaControles: (usuarioId: string | undefined, pagina: number) => void;
  cambiarTamanoControles: (usuarioId: string | undefined, tamano: number) => void;
}

export interface TablaControlesAntropometricosProps {
  fuente: TablaControlesFuente;
  usuarioId: string | undefined;
}

export function TablaControlesAntropometricos({
  fuente,
  usuarioId,
}: TablaControlesAntropometricosProps) {
  const {
    controlesAntro: controles,
    controlesErrorMsg: errorCarga,
    controlesTotal: total,
    paginaControles: pagina,
    tamanoControles: tamano,
    isCargandoControles: cargando,
    cambiarPaginaControles: cambiarPagina,
    cambiarTamanoControles: cambiarTamano,
  } = fuente;
  const onCambiarPagina = (nuevaPagina: number) => cambiarPagina(usuarioId, nuevaPagina);
  const onCambiarTamano = (nuevoTamano: number) => cambiarTamano(usuarioId, nuevoTamano);
  return (
    <div className="p-6 rounded-3xl bg-card border border-border shadow-xs space-y-4">
      <h4 className="font-bold text-sm text-foreground">Historial Cronológico de Controles</h4>
      {/* N3: fallo de carga honesto; la tabla nunca finge "sin registros" si la consulta falló. */}
      {errorCarga && (
        <div
          role="alert"
          className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs font-bold flex items-center gap-2"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorCarga}</span>
        </div>
      )}
      {/* U2 (Ola 4): en móvil tarjetas apiladas (la tabla de 7 columnas desbordaba a 360px);
          desde md se mantiene la tabla densa con el mismo dato. */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="border-b border-border/80 text-muted-foreground uppercase text-[11px]">
            <tr>
              <th className="py-2.5 px-3">Fecha</th>
              <th className="py-2.5 px-3">Peso (kg)</th>
              <th className="py-2.5 px-3">% Grasa</th>
              <th className="py-2.5 px-3">Cintura</th>
              <th className="py-2.5 px-3">Brazo</th>
              <th className="py-2.5 px-3">Pecho</th>
              <th className="py-2.5 px-3">Muslo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50 font-mono">
            {controles.length === 0 && !errorCarga && (
              <tr>
                <td
                  colSpan={7}
                  className="py-6 px-3 text-center text-muted-foreground font-sans"
                >
                  Sin controles antropométricos registrados para este alumno.
                </td>
              </tr>
            )}
            {controles.map((c) => (
              <tr key={c.id} className="hover:bg-secondary/30 transition-colors">
                <td className="py-3 px-3 font-sans font-bold text-foreground">
                  {formatFechaCalendario(c.fecha) ?? c.fecha}
                </td>
                <td className="py-3 px-3 font-bold">{c.pesoKg} kg</td>
                <td className="py-3 px-3">{c.grasaPorcentaje ? `${c.grasaPorcentaje}%` : '—'}</td>
                <td className="py-3 px-3">{c.cinturaCm ? `${c.cinturaCm} cm` : '—'}</td>
                <td className="py-3 px-3">{c.brazoCm ? `${c.brazoCm} cm` : '—'}</td>
                <td className="py-3 px-3">{c.pechoCm ? `${c.pechoCm} cm` : '—'}</td>
                <td className="py-3 px-3">{c.musloCm ? `${c.musloCm} cm` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Móvil: tarjetas con los mismos datos del historial */}
      <div className="md:hidden divide-y divide-border/50">
        {controles.length === 0 && !errorCarga && (
          <p className="py-6 text-center text-muted-foreground text-xs">
            Sin controles antropométricos registrados para este alumno.
          </p>
        )}
        {controles.map((c) => (
          <div key={c.id} className="py-3 first:pt-0 last:pb-0 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-bold text-foreground">
                {formatFechaCalendario(c.fecha) ?? c.fecha}
              </span>
              <span className="font-mono text-sm font-bold text-foreground">
                {c.pesoKg} kg
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              {[
                { etiqueta: '% Grasa', valor: c.grasaPorcentaje ? `${c.grasaPorcentaje}%` : '—' },
                { etiqueta: 'Cintura', valor: c.cinturaCm ? `${c.cinturaCm} cm` : '—' },
                { etiqueta: 'Brazo', valor: c.brazoCm ? `${c.brazoCm} cm` : '—' },
                { etiqueta: 'Pecho', valor: c.pechoCm ? `${c.pechoCm} cm` : '—' },
                { etiqueta: 'Muslo', valor: c.musloCm ? `${c.musloCm} cm` : '—' },
              ].map(({ etiqueta, valor }) => (
                <div key={etiqueta} className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">{etiqueta}</dt>
                  <dd className="font-mono font-bold text-foreground">{valor}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      {/* WU25b: paginación numerada con controlesLimit/controlesOffset y controlesTotal real */}
      {total > 0 && (
        <div className="pt-1">
          <Paginacion
            pagina={pagina}
            tamano={tamano}
            total={total}
            onCambiarPagina={onCambiarPagina}
            onCambiarTamano={onCambiarTamano}
            cargando={cargando}
          />
        </div>
      )}
    </div>
  );
}
