/**
 * RF-014 RN-04 (Ola 3 · N2b): panel de la campana de notificaciones.
 *
 * - Anclado bajo el header (no centrado) y con altura máxima calculada para NO tapar el bottom nav
 *   en móvil: la lista hace scroll interno y las acciones quedan siempre a la vista.
 * - Accesible con el patrón del repo (`useDialogoAccesible`): `role="dialog"`, Escape, trampa de
 *   Tab, foco inicial y retorno del foco a la campana al cerrar. El fondo es un capturador de
 *   clic transparente (no un modal con velo): el panel se siente popover, no interrupción.
 * - Estados honestos: carga, vacío ("Estás al día"), error de carga con reintento y error de
 *   acción visible sin perder la lista.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  CheckCheck,
  ChevronRight,
  Loader2,
  X,
} from 'lucide-react';
import { Rol, type NotificacionInAppDTO } from '@guachafit/shared';
import {
  agruparNotificacionesPorDia,
  categoriaVisualNotificacion,
  etiquetaCategoriaNotificacion,
  formatearTiempoNotificacion,
  resolverRutaNotificacion,
  textoNoLeidas,
} from '../../lib/notificaciones-in-app';
import { useDialogoAccesible } from '../../lib/use-dialogo-accesible';
import { CLASES_SALIDA_MODAL, useSalidaModal } from '../../lib/use-salida-modal';
import { ICONO_CATEGORIA, TONO_CATEGORIA } from './estilos-categoria';

export interface PanelNotificacionesProps {
  abierto: boolean;
  onCerrar: () => void;
  rol: Rol | string | null | undefined;
  items: NotificacionInAppDTO[];
  total: number;
  totalNoLeidas: number;
  cargando: boolean;
  error: Error | null;
  errorAccion: string | null;
  marcandoId: string | null;
  marcandoTodas: boolean;
  hayMas: boolean;
  /** Destino del enlace "Configurar" (null = el rol no tiene pantalla de preferencias). */
  rutaConfiguracion: string | null;
  onVerMas: () => void;
  onReintentar: () => void;
  onMarcarTodas: () => void;
  onLimpiarErrorAccion: () => void;
  onAbrirNotificacion: (item: NotificacionInAppDTO) => void;
}

function FilaNotificacion({
  item,
  rol,
  marcando,
  onAbrir,
}: {
  item: NotificacionInAppDTO;
  rol: Rol | string | null | undefined;
  marcando: boolean;
  onAbrir: (item: NotificacionInAppDTO) => void;
}) {
  const categoria = categoriaVisualNotificacion(item.tipoEvento);
  const Icono = ICONO_CATEGORIA[categoria];
  const ruta = resolverRutaNotificacion(item.linkAccion, rol);
  const tiempo = formatearTiempoNotificacion(item.createdAtUtc);

  return (
    <li>
      <button
        type="button"
        onClick={() => onAbrir(item)}
        disabled={marcando}
        aria-busy={marcando}
        className={`w-full min-h-11 text-left px-4 py-3 flex items-start gap-3 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary disabled:opacity-70 ${
          item.leida ? 'hover:bg-secondary/50' : 'bg-primary/[0.06] hover:bg-primary/10'
        }`}
      >
        <span className={`p-2 rounded-xl shrink-0 ${TONO_CATEGORIA[categoria]}`}>
          <Icono className="h-4 w-4" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-start gap-2">
            <span className="text-xs font-bold text-foreground leading-snug">{item.titulo}</span>
            {!item.leida && (
              <>
                <span
                  aria-hidden="true"
                  className="mt-1 h-2 w-2 rounded-full bg-primary shrink-0"
                />
                <span className="sr-only">Sin leer</span>
              </>
            )}
          </span>

          <span className="block text-[11px] text-muted-foreground leading-relaxed mt-0.5 line-clamp-2">
            {item.cuerpo}
          </span>

          <span className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground">
            <span className="font-semibold">{etiquetaCategoriaNotificacion(categoria)}</span>
            <span aria-hidden="true">·</span>
            <span>{tiempo ?? '—'}</span>
          </span>
        </span>

        {marcando ? (
          <Loader2 className="h-4 w-4 text-muted-foreground shrink-0 mt-1 animate-spin" />
        ) : ruta ? (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
        ) : null}
      </button>
    </li>
  );
}

export function PanelNotificaciones({
  abierto,
  onCerrar,
  rol,
  items,
  total,
  totalNoLeidas,
  cargando,
  error,
  errorAccion,
  marcandoId,
  marcandoTodas,
  hayMas,
  rutaConfiguracion,
  onVerMas,
  onReintentar,
  onMarcarTodas,
  onLimpiarErrorAccion,
  onAbrirNotificacion,
}: PanelNotificacionesProps) {
  // Escape, trampa de Tab, foco inicial y restore al cerrar (mismo patrón de SyncQueuePanel).
  const { saliendo, cerrar } = useSalidaModal(onCerrar);
  const refDialogo = useDialogoAccesible({ abierto, onCerrar: cerrar });

  if (!abierto) return null;

  const grupos = agruparNotificacionesPorDia(items);
  const mostrarSpinnerInicial = cargando && items.length === 0;
  const mostrarVacio = !cargando && !error && items.length === 0;

  return (
    <div
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) cerrar();
      }}
      data-saliendo={saliendo || undefined}
      className={`fixed inset-0 z-[70] ${CLASES_SALIDA_MODAL}`}
    >
      <div
        ref={refDialogo}
        role="dialog"
        aria-modal="true"
        aria-labelledby="panel-notificaciones-titulo"
        tabIndex={-1}
        className="absolute left-3 right-3 sm:left-auto sm:right-6 sm:w-[26rem] top-[calc(env(safe-area-inset-top,0px)+4.25rem)] max-h-[calc(100dvh_-_11rem)] sm:max-h-[32rem] flex flex-col rounded-3xl border border-border/80 bg-popover shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Encabezado */}
        <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3 border-b border-border/70 shrink-0">
          <div className="min-w-0">
            <h2 id="panel-notificaciones-titulo" className="text-sm font-bold text-foreground">
              Notificaciones
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {error ? 'No se pudo actualizar' : textoNoLeidas(totalNoLeidas)}
              {!error && total > 0 ? ` · ${total} en total` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={cerrar}
            aria-label="Cerrar notificaciones"
            className="h-11 w-11 sm:h-9 sm:w-9 -m-2 inline-flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Error de acción (marcar leída/todas): visible y descartable, sin tumbar la lista */}
        {errorAccion && (
          <div
            role="alert"
            className="mx-4 mt-3 p-3 rounded-2xl bg-destructive/10 border border-destructive/30 text-destructive text-[11px] font-semibold flex items-start gap-2 shrink-0"
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span className="flex-1">{errorAccion}</span>
            <button
              type="button"
              onClick={onLimpiarErrorAccion}
              aria-label="Descartar aviso de error"
              className="text-destructive/80 hover:text-destructive cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Lista con scroll interno */}
        <div className="flex-1 overflow-y-auto overscroll-contain" aria-busy={cargando}>
          {mostrarSpinnerInicial && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 text-primary animate-spin" />
              <span className="sr-only">Cargando notificaciones</span>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="m-4 p-4 rounded-2xl bg-destructive/10 border border-destructive/30 text-destructive text-xs font-semibold space-y-2"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>No se pudieron cargar tus notificaciones. Revisa tu conexión.</span>
              </div>
              <button
                type="button"
                onClick={onReintentar}
                className="h-11 sm:h-9 px-3 rounded-xl bg-destructive text-white font-bold text-[11px] active:scale-95 transition-all cursor-pointer"
              >
                Reintentar
              </button>
            </div>
          )}

          {mostrarVacio && (
            <div className="py-10 px-4 text-center space-y-2">
              <CheckCircle2 className="h-8 w-8 text-success mx-auto" />
              <p className="text-sm font-bold text-foreground">Estás al día</p>
              <p className="text-[11px] text-muted-foreground">
                Aquí verás los avisos de tus pagos, entrenamientos y tu cuenta.
              </p>
            </div>
          )}

          {!error &&
            grupos.map((grupo) => (
              <div key={grupo.clave}>
                <p className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {grupo.titulo}
                </p>
                <ul>
                  {grupo.items.map((item) => (
                    <FilaNotificacion
                      key={item.id}
                      item={item}
                      rol={rol}
                      marcando={marcandoId === item.id}
                      onAbrir={onAbrirNotificacion}
                    />
                  ))}
                </ul>
              </div>
            ))}
        </div>

        {/* Acciones */}
        <div className="border-t border-border/70 p-3 flex flex-col gap-2 shrink-0 bg-popover">
          {(totalNoLeidas > 0 || hayMas) && (
            <div className="flex items-center gap-2">
              {totalNoLeidas > 0 && (
                <button
                  type="button"
                  onClick={onMarcarTodas}
                  disabled={marcandoTodas}
                  className="flex-1 h-11 sm:h-9 px-3 rounded-xl bg-secondary border border-border text-foreground font-bold text-[11px] hover:bg-secondary/70 active:scale-95 transition-all cursor-pointer disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                >
                  {marcandoTodas ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCheck className="h-3.5 w-3.5" />
                  )}
                  <span>Marcar todas como leídas</span>
                </button>
              )}

              {hayMas && (
                <button
                  type="button"
                  onClick={onVerMas}
                  disabled={cargando}
                  className="flex-1 h-11 sm:h-9 px-3 rounded-xl bg-secondary border border-border text-foreground font-bold text-[11px] hover:bg-secondary/70 active:scale-95 transition-all cursor-pointer disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                >
                  {cargando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Ver más</span>
                </button>
              )}
            </div>
          )}

          {rutaConfiguracion && (
            <Link
              to={rutaConfiguracion}
              onClick={onCerrar}
              className="h-11 sm:h-9 px-3 rounded-xl text-primary font-bold text-[11px] hover:bg-primary/10 transition-colors inline-flex items-center justify-center gap-1.5 focus-visible:outline-2 focus-visible:outline-primary"
            >
              Configurar mis notificaciones
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
