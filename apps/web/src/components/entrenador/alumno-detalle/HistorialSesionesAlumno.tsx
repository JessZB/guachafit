/**
 * Historial cronológico de sesiones del alumno (organismo ÚNICO).
 *
 * Presentacional: sesiones, rutina (para titular por bloque), paginación y expansión por
 * props; compone `DetalleSesionEntrenamiento` existente + `Paginacion` (R1). Extraído de
 * `pages/entrenador/AlumnoDetallePage.tsx` (SL-6). Conserva idénticos los textos, el toggle
 * `Ver Series`/`Ocultar Series` con `aria-expanded` + `aria-controls` y la paginación que
 * consultan los specs.
 *
 * §6: 11px mínimo, pesos ≤ 700, tokens con variante oscura, error honesto (`role="alert"`).
 */
import type {
  BloqueDiaRutinaDTO,
  SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';
import { AlertCircle, ChevronDown, Dumbbell, History } from 'lucide-react';
import { triggerHaptic } from '../../../lib/haptics';
import { DetalleSesionEntrenamiento } from '../DetalleSesionEntrenamiento';
import { Paginacion } from '../../common/Paginacion';

export interface SesionesHistorialFuente {
  historialSesiones: SesionEntrenamientoDetalleDTO[];
  historialTotal: number;
  historialError: string | null;
  paginaHistorial: number;
  tamanoHistorial: number;
  isCargandoHistorial: boolean;
  cambiarPaginaHistorial: (pagina: number) => void;
  cambiarTamanoHistorial: (tamano: number) => void;
}

export interface HistorialSesionesAlumnoProps {
  fuente: SesionesHistorialFuente;
  rutina: BloqueDiaRutinaDTO[];
  expandidaId: string | null;
  onAlternarExpandida: (id: string | null) => void;
}

export function HistorialSesionesAlumno({
  fuente,
  rutina: rutinaSemanal,
  expandidaId,
  onAlternarExpandida,
}: HistorialSesionesAlumnoProps) {
  const {
    historialSesiones,
    historialTotal,
    historialError,
    paginaHistorial: pagina,
    tamanoHistorial: tamano,
    isCargandoHistorial: cargando,
    cambiarPaginaHistorial: onCambiarPagina,
    cambiarTamanoHistorial: onCambiarTamano,
  } = fuente;
  return (
    <div
      id="seccion-historial-sesiones"
      className="scroll-mt-24 pt-6 border-t border-border/70 space-y-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          <div>
            <h3 className="text-base font-bold text-foreground">
              Historial de Sesiones ({historialTotal})
            </h3>
            <p className="text-xs text-muted-foreground">
              Abre «Ver Series» para revisar cargas, notas del coach y los tiempos entre
              marcas de cada serie.
            </p>
          </div>
        </div>
      </div>

      {/* N4: fallo de carga visible aunque la página quede vacía (nunca pasa por "sin registros") */}
      {historialError && (
        <div
          role="alert"
          className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs font-bold flex items-center gap-2"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{historialError}</span>
        </div>
      )}

      {historialSesiones.length === 0 && !historialError ? (
        <div className="p-8 rounded-2xl bg-card border border-dashed border-border/70 text-center">
          <Dumbbell className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-40" />
          <p className="text-xs text-muted-foreground">
            El alumno aún no registra entrenamientos completados.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {historialSesiones.map((ses) => {
            const bloqueEncontrado = rutinaSemanal.find((b) => b.diaId === ses.bloqueId);
            const diaSemanaNombre = (() => {
              if (!ses.fechaProgramada) return '';
              try {
                const [y, m, d] = ses.fechaProgramada.split('-').map(Number);
                const fecha = new Date(Date.UTC(y, m - 1, d));
                return new Intl.DateTimeFormat('es-ES', { weekday: 'long', timeZone: 'UTC' }).format(fecha);
              } catch {
                return '';
              }
            })();
            const diaSemanaCapitalizado = diaSemanaNombre
              ? diaSemanaNombre.charAt(0).toUpperCase() + diaSemanaNombre.slice(1)
              : '';
            const expandida = expandidaId === ses.id;

            return (
              <DetalleSesionEntrenamiento
                key={ses.id}
                sesion={ses}
                titulo={
                  bloqueEncontrado
                    ? bloqueEncontrado.titulo
                    : `Entrenamiento: ${ses.fechaProgramada}`
                }
                chipRecuperada={
                  ses.esDiaDescansoOriginal
                    ? `Recuperada en ${diaSemanaCapitalizado || 'Descanso'} (Día de descanso)`
                    : null
                }
                mostrarGrupoMuscular
                mostrarSeries={expandida}
                idSeries={`sesion-series-${ses.id}`}
                accionesCabecera={
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      onAlternarExpandida(expandida ? null : ses.id);
                    }}
                    aria-expanded={expandida}
                    aria-controls={expandida ? `sesion-series-${ses.id}` : undefined}
                    className="px-3 py-1.5 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <span>{expandida ? 'Ocultar Series' : 'Ver Series'}</span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 text-primary transition-transform duration-300 ease-out ${
                        expandida ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                }
              />
            );
          })}
          {/* WU25b: paginación numerada server-side (limit/offset + total del envelope) */}
          {historialTotal > 0 && (
            <div className="pt-1">
              <Paginacion
                pagina={pagina}
                tamano={tamano}
                total={historialTotal}
                onCambiarPagina={onCambiarPagina}
                onCambiarTamano={onCambiarTamano}
                cargando={cargando}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
