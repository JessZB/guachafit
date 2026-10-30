import type { DashboardComandoDTO } from '@guachafit/shared';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, UserX } from 'lucide-react';
import { pluralizar } from '../../../lib/pluralizar';

/** WU20: tope de filas visibles por bandeja de riesgo; el resto se ve en su sección completa. */
const TOPE_FILAS_RIESGO = 5;

export interface ListasAlertaTempranaProps {
  bandejas: DashboardComandoDTO['bandejasRapidas'];
}

/** Listas de alerta temprana (pagos vencidos y sin entrenar). Solo presentación, con datos reales. */
export function ListasAlertaTemprana({ bandejas }: ListasAlertaTempranaProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Mora List */}
      <div className="p-6 rounded-3xl bg-card border border-border/80 shadow-xs space-y-3">
        <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
          <span>Alumnos con Pagos Vencidos</span>
        </h3>

        {bandejas.alumnosEnMora.length === 0 && (
          <p className="text-xs text-muted-foreground py-4 text-center">
            Sin pagos vencidos por ahora 🎉
          </p>
        )}

        <div className="space-y-2">
          {bandejas.alumnosEnMora.slice(0, TOPE_FILAS_RIESGO).map((mora) => (
            <div
              key={mora.alumnoId}
              className="p-3 rounded-2xl bg-secondary/40 border border-border flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="font-bold text-xs text-foreground truncate">{mora.nombre}</p>
                <p className="text-[11px] text-destructive font-semibold">
                  {pluralizar(mora.diasVencido, 'día de atraso', 'días de atraso')}
                </p>
              </div>
              <div className="text-right shrink-0">
                <span className="font-mono font-bold text-sm text-foreground">
                  ${mora.saldoPendienteUsd} USD
                </span>
              </div>
            </div>
          ))}
        </div>

        {bandejas.alumnosEnMora.length > TOPE_FILAS_RIESGO && (
          <Link
            to="/coach/cartera?pestana=mora"
            className="w-full min-h-11 py-2 px-3 rounded-xl bg-secondary/60 hover:bg-secondary text-foreground font-bold text-[11px] flex items-center justify-between transition-colors"
          >
            <span>Ver todos ({bandejas.alumnosEnMora.length})</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>

      {/* Inactivity List */}
      <div className="p-6 rounded-3xl bg-card border border-border/80 shadow-xs space-y-3">
        <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
          <UserX className="h-4 w-4 text-destructive shrink-0" />
          <span>Alumnos sin Entrenar</span>
        </h3>

        {bandejas.alumnosInactivosEntrenamiento.length === 0 && (
          <p className="text-xs text-muted-foreground py-4 text-center">
            Sin alumnos inactivos por ahora 🎉
          </p>
        )}

        <div className="space-y-2">
          {bandejas.alumnosInactivosEntrenamiento.slice(0, TOPE_FILAS_RIESGO).map((inac) => (
            <div
              key={inac.alumnoId}
              className="p-3 rounded-2xl bg-secondary/40 border border-border flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="font-bold text-xs text-foreground truncate">{inac.nombre}</p>
                <p className="text-[11px] text-muted-foreground">Sin registrar series</p>
              </div>
              <div className="text-right shrink-0">
                <span className="font-mono font-bold text-xs text-destructive">
                  {pluralizar(inac.diasSinEntrenar, 'día sin entrenar', 'días sin entrenar')}
                </span>
              </div>
            </div>
          ))}
        </div>

        {bandejas.alumnosInactivosEntrenamiento.length > TOPE_FILAS_RIESGO && (
          <Link
            to="/coach/monitor-adherencia"
            className="w-full min-h-11 py-2 px-3 rounded-xl bg-secondary/60 hover:bg-secondary text-foreground font-bold text-[11px] flex items-center justify-between transition-colors"
          >
            <span>Ver todos ({bandejas.alumnosInactivosEntrenamiento.length})</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </div>
  );
}
