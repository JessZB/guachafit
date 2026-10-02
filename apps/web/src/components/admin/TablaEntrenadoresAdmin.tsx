/**
 * RF-010 (WU Admin): tabla del panel maestro de entrenadores.
 *
 * Componente presentacional puro (sin red ni router): la página le pasa la página de filas, el
 * estado de carga/error y los callbacks de acción. Tabla densa en escritorio y tarjetas apiladas
 * en móvil; estados honestos de carga, vacío y error con reintento.
 */
import React from 'react';
import { EstadoLicencia, type EntrenadorAdminDTO } from '@guachafit/shared';
import { formatFechaLocal } from '../../lib/date-format';
import {
  esAutodeshabilitacion,
  etiquetaCuenta,
  etiquetaLicencia,
  textoBotonEstado,
  textoBotonLicencia,
} from '../../lib/admin-entrenadores';
import {
  AlertTriangle,
  Ban,
  CalendarDays,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  Users,
} from 'lucide-react';

export interface TablaEntrenadoresAdminProps {
  items: EntrenadorAdminDTO[];
  /** `true` mientras la página está en vuelo (la tabla conserva la página anterior). */
  cargando: boolean;
  /** Mensaje de error de carga del listado (`null` = sin error). */
  error: string | null;
  /** `id` del usuario autenticado: deshabilita el botón de auto-deshabilitación. */
  usuarioActualId?: string;
  /** `usuarioId` cuya acción está en vuelo (sus botones se deshabilitan). */
  procesandoUsuarioId: string | null;
  onReintentar: () => void;
  onCambiarEstado: (entrenador: EntrenadorAdminDTO, activo: boolean) => void;
  onCambiarLicencia: (entrenador: EntrenadorAdminDTO, estadoLicencia: EstadoLicencia) => void;
}

const CLASES_TONO: Record<string, string> = {
  success: 'bg-success/15 text-success border-success/25',
  danger: 'bg-destructive/15 text-destructive border-destructive/25',
  neutral: 'bg-secondary text-muted-foreground border-border',
};

function Badge({ tono, children }: { tono: string; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-bold uppercase tracking-wide ${
        CLASES_TONO[tono] ?? CLASES_TONO.neutral
      }`}
    >
      {children}
    </span>
  );
}

function BotonAccion({
  onClick,
  icono: Icono,
  texto,
  variante,
  deshabilitado,
}: {
  onClick: () => void;
  icono: React.ComponentType<{ className?: string }>;
  texto: string;
  variante: 'peligro' | 'exito' | 'neutro';
  deshabilitado: boolean;
}) {
  const clase =
    variante === 'peligro'
      ? 'bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20'
      : variante === 'exito'
        ? 'bg-success/10 text-success border border-success/30 hover:bg-success/20'
        : 'bg-secondary/70 text-foreground border border-border/70 hover:bg-secondary';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      className={`min-h-11 min-w-11 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-primary ${clase}`}
    >
      <Icono className="h-3.5 w-3.5 shrink-0" />
      <span>{texto}</span>
    </button>
  );
}

export function TablaEntrenadoresAdmin({
  items,
  cargando,
  error,
  usuarioActualId,
  procesandoUsuarioId,
  onReintentar,
  onCambiarEstado,
  onCambiarLicencia,
}: TablaEntrenadoresAdminProps) {
  if (error) {
    return (
      <div
        role="alert"
        className="p-4 rounded-xl bg-destructive/10 border border-destructive/30 space-y-3"
      >
        <div className="flex items-start gap-2 text-destructive text-xs font-semibold">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
        <button
          type="button"
          onClick={onReintentar}
          className="min-h-11 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary/70 text-foreground border border-border/70 text-xs font-bold hover:bg-secondary transition-all active:scale-95 cursor-pointer"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Reintentar
        </button>
      </div>
    );
  }

  if (cargando && items.length === 0) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="p-6 rounded-xl bg-card/60 border border-border/70 flex items-center justify-center gap-2 text-xs text-muted-foreground"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando entrenadores…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="p-6 rounded-xl bg-card/60 border border-border/70 text-center space-y-1.5">
        <Users className="h-5 w-5 text-muted-foreground mx-auto" />
        <p className="text-sm font-bold text-foreground">Todavía no hay entrenadores</p>
        <p className="text-xs text-muted-foreground">
          Crea el primero con el formulario de alta y aparecerá en esta lista.
        </p>
      </div>
    );
  }

  return (
    <ul
      aria-label="Entrenadores de la plataforma"
      className={`divide-y divide-border/70 rounded-xl border border-border/70 bg-card/60 overflow-hidden ${
        cargando ? 'opacity-60' : ''
      }`}
    >
      {items.map((entrenador) => {
        const enVuelo = procesandoUsuarioId === entrenador.usuarioId;
        const autoDeshabilitado = esAutodeshabilitacion(entrenador, usuarioActualId);
        const fechaAlta = formatFechaLocal(entrenador.fechaAltaUtc);

        return (
          <li
            key={entrenador.usuarioId}
            className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm text-foreground">
                  {entrenador.nombres} {entrenador.apellidos}
                </span>
                {entrenador.nombreComercial && (
                  <span className="text-xs text-muted-foreground">
                    · {entrenador.nombreComercial}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">{entrenador.email}</p>
              <div className="flex items-center gap-2 flex-wrap pt-0.5">
                <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-background border border-border text-foreground">
                  {entrenador.coachCode}
                </span>
                <Badge tono={entrenador.activo ? 'success' : 'danger'}>
                  {entrenador.activo ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <Ban className="h-3 w-3" />
                  )}
                  {etiquetaCuenta(entrenador.activo)}
                </Badge>
                <Badge
                  tono={
                    entrenador.estadoLicencia === EstadoLicencia.ACTIVA ? 'success' : 'danger'
                  }
                >
                  {entrenador.estadoLicencia === EstadoLicencia.ACTIVA ? (
                    <ShieldCheck className="h-3 w-3" />
                  ) : (
                    <ShieldOff className="h-3 w-3" />
                  )}
                  {etiquetaLicencia(entrenador.estadoLicencia)}
                </Badge>
                {fechaAlta && (
                  <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    Alta: {fechaAlta}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <BotonAccion
                icono={entrenador.activo ? Ban : CheckCircle2}
                texto={textoBotonEstado(entrenador.activo)}
                variante={entrenador.activo ? 'peligro' : 'exito'}
                deshabilitado={enVuelo || autoDeshabilitado}
                onClick={() => onCambiarEstado(entrenador, !entrenador.activo)}
              />
              <BotonAccion
                icono={
                  entrenador.estadoLicencia === EstadoLicencia.ACTIVA ? ShieldOff : ShieldCheck
                }
                texto={textoBotonLicencia(entrenador.estadoLicencia)}
                variante="neutro"
                deshabilitado={enVuelo}
                onClick={() =>
                  onCambiarLicencia(
                    entrenador,
                    entrenador.estadoLicencia === EstadoLicencia.ACTIVA
                      ? EstadoLicencia.SUSPENDIDA_SUPERADMIN
                      : EstadoLicencia.ACTIVA
                  )
                }
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
