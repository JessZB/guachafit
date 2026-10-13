/**
 * M8 plantillas (fase B, prompt 58) · tarjeta de una plantilla del banco.
 *
 * Origen: `PlantillasPage.tsx:679-813` (el `map` y el grid se quedan en el
 * contenedor). Componente único (R3: propio del banco) + candidatos internos
 * (badge de estado y chips, fila 34 de la consolidación 48 → D). Solo props y
 * callbacks (R1): sin `useQuery` ni `api-client`. Conserva badges, textos y
 * confirmación inline que usan los specs (R5). El badge de nivel viaja en
 * `BadgeNivelPlantilla`; la pluralización manual se normaliza con `pluralizar`
 * sin cambiar el texto visible (W1 del inventario 47, R4).
 *
 * §6: español claro, fechas con `formatFechaLocal`, controles 44px
 * (`min-h-11`), 11px mínimo, tokens con variante claro/oscuro, peso ≤ 700.
 */
import { Loader2, Pencil, RotateCcw, Trash2, Users } from 'lucide-react';
import type { PlantillaRutinaResumenDTO } from '@guachafit/shared';
import { formatFechaLocal } from '../../../lib/date-format';
import { pluralizar } from '../../../lib/pluralizar';
import { BadgeNivelPlantilla } from './BadgeNivelPlantilla';

export interface TarjetaPlantillaProps {
  plantilla: PlantillaRutinaResumenDTO;
  confirmandoDesactivar: boolean;
  accionEnCurso: boolean;
  cargandoDetalle: boolean;
  puedeAsignar: boolean;
  tituloAsignarBloqueado?: string;
  onAsignar: () => void;
  onEditar: () => void;
  onPedirDesactivar: () => void;
  onConfirmarDesactivar: () => void;
  onCancelarDesactivar: () => void;
  onReactivar: () => void;
}

export function TarjetaPlantilla({
  plantilla,
  confirmandoDesactivar,
  accionEnCurso,
  cargandoDetalle,
  puedeAsignar,
  tituloAsignarBloqueado,
  onAsignar,
  onEditar,
  onPedirDesactivar,
  onConfirmarDesactivar,
  onCancelarDesactivar,
  onReactivar,
}: TarjetaPlantillaProps) {
  return (
    <div
      className={`p-5 rounded-3xl bg-card border border-border/80 shadow-xs space-y-3.5 flex flex-col justify-between transition-all hover:border-primary/40 ${
        plantilla.activa ? '' : 'opacity-75'
      }`}
    >
      <div className="space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold text-sm text-foreground leading-snug break-words">
            {plantilla.nombre}
          </h3>
          <span
            className={`shrink-0 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide border ${
              plantilla.activa
                ? 'bg-success/15 text-success border-success/30'
                : 'bg-secondary text-muted-foreground border-border'
            }`}
          >
            {plantilla.activa ? 'Activa' : 'Desactivada'}
          </span>
        </div>

        <BadgeNivelPlantilla nivel={plantilla.nivelObjetivo} />

        <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
          <span className="px-2 py-0.5 rounded-md bg-secondary border border-border/60 font-bold text-foreground">
            {pluralizar(plantilla.totalDias, 'día', 'días')}
          </span>
          <span className="px-2 py-0.5 rounded-md bg-secondary border border-border/60 font-bold text-foreground">
            {pluralizar(plantilla.totalEjercicios, 'ejercicio', 'ejercicios')}
          </span>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Actualizada el {formatFechaLocal(plantilla.updatedAtUtc) || '—'}
        </p>
      </div>

      {confirmandoDesactivar ? (
        <div className="p-3 rounded-2xl bg-destructive/10 border border-destructive/30 space-y-2">
          <p className="text-xs text-foreground leading-snug">
            ¿Desactivar <span className="font-bold">{plantilla.nombre}</span>? No se borra: podrás
            reactivarla. Las rutinas ya asignadas no cambian.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={accionEnCurso}
              onClick={onConfirmarDesactivar}
              className="min-h-11 px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground font-bold text-xs disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
            >
              {accionEnCurso ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
              <span>Sí, desactivar</span>
            </button>
            <button
              type="button"
              onClick={onCancelarDesactivar}
              className="min-h-11 px-3 py-1.5 rounded-lg bg-secondary text-foreground font-bold text-xs cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-border/60">
          {/* A6: asignación masiva desde la tarjeta (solo plantillas activas) */}
          {plantilla.activa && (
            <button
              type="button"
              onClick={onAsignar}
              disabled={!puedeAsignar}
              title={tituloAsignarBloqueado}
              className="w-full min-h-11 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-primary/15 hover:bg-primary text-primary hover:text-primary-foreground font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Asignar a alumnos</span>
            </button>
          )}
          <button
            type="button"
            onClick={onEditar}
            disabled={cargandoDetalle}
            className="flex-1 min-h-11 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-secondary/80 hover:bg-secondary text-foreground font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            {cargandoDetalle ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Pencil className="h-3.5 w-3.5" />
            )}
            <span>Editar</span>
          </button>

          {plantilla.activa ? (
            <button
              type="button"
              onClick={onPedirDesactivar}
              className="flex-1 min-h-11 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-destructive/10 hover:bg-destructive/20 text-destructive font-bold text-xs transition-colors cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Desactivar</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={accionEnCurso}
              onClick={onReactivar}
              className="flex-1 min-h-11 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-primary/15 hover:bg-primary text-primary hover:text-primary-foreground font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {accionEnCurso ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              <span>Reactivar</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

