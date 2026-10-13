/**
 * Módulo `bloques-rutina-editor` (Ola 2, prompt 74) · configuración del día activo.
 *
 * Origen: `BloquesRutinaEditor.tsx:241-381` (selectores estructurados, anotación,
 * enfoque y vista previa «Así lo verá tu alumno»). Componente único de la vista
 * (R3: los labels —`Número de día` frente a `Número de Bloque / Día` en
 * `ContenidoRutinaSemanal.tsx:85-103`— difieren, así que la sustitución no es
 * mecánica). Solo props y callbacks (R1): sin `useQuery` ni `api-client` (R9).
 * Conserva `id`, labels y textos que usan los specs (R5).
 *
 * §6: español claro, `pluralizar` en el mínimo, controles 44px (`min-h-11`),
 * piso 11px, tokens con variante claro/oscuro, pesos ≤ 700.
 */
import { Trash2 } from 'lucide-react';
import {
  OPCIONES_DIAS_SEMANA,
  actualizarConfiguracionBloque,
  type BloqueEdicion,
} from '../../../lib/rutina-bloques';
import { triggerHaptic } from '../../../lib/haptics';
import { pluralizar } from '../../../lib/pluralizar';

interface ConfiguracionDiaProps {
  bloques: BloqueEdicion[];
  indiceActivo: number;
  idBase: string;
  minBloques: number;
  onCambiar: (bloques: BloqueEdicion[]) => void;
  onPedirBorrarDia: () => void;
}

export function ConfiguracionDia({
  bloques,
  indiceActivo,
  idBase,
  minBloques,
  onCambiar,
  onPedirBorrarDia,
}: ConfiguracionDiaProps) {
  const diaActivo = bloques[indiceActivo];
  if (!diaActivo) return null;

  return (
    <div className="p-4 rounded-2xl bg-secondary/30 border border-border/60 space-y-3.5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="space-y-1">
          <label
            htmlFor={`${idBase}-dia-numero`}
            className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block"
          >
            Número de día
          </label>
          <select
            id={`${idBase}-dia-numero`}
            value={diaActivo.diaNumero || indiceActivo + 1}
            onChange={(e) => {
              triggerHaptic('selection');
              onCambiar(
                actualizarConfiguracionBloque(bloques, indiceActivo, {
                  diaNumero: parseInt(e.target.value, 10),
                })
              );
            }}
            className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs font-bold text-foreground focus:outline-hidden focus:border-primary transition-colors cursor-pointer"
          >
            {[1, 2, 3, 4, 5, 6, 7].map((num) => (
              <option key={num} value={num}>
                Día {num}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label
            htmlFor={`${idBase}-dia-sugerido`}
            className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block"
          >
            Día de la semana sugerido
          </label>
          <select
            id={`${idBase}-dia-sugerido`}
            value={diaActivo.diaSugerido || 0}
            onChange={(e) => {
              triggerHaptic('selection');
              const val = parseInt(e.target.value, 10);
              onCambiar(
                actualizarConfiguracionBloque(bloques, indiceActivo, {
                  diaSugerido: val === 0 ? null : val,
                })
              );
            }}
            className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs font-bold text-foreground focus:outline-hidden focus:border-primary transition-colors cursor-pointer"
          >
            {OPCIONES_DIAS_SEMANA.map((d) => (
              <option key={d.valor} value={d.valor}>
                {d.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end justify-between sm:justify-start gap-2">
          <div className="flex-1 sm:flex-none">
            {bloques.length > minBloques ? (
              <button
                type="button"
                onClick={onPedirBorrarDia}
                className="min-h-11 px-3 py-2 rounded-xl bg-destructive/10 hover:bg-destructive text-destructive hover:text-destructive-foreground text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Eliminar este día</span>
              </button>
            ) : (
              <span className="text-xs text-muted-foreground italic py-2 block">
                Mínimo {pluralizar(minBloques, 'día', 'días')}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border/50">
        <div className="space-y-1">
          <label
            htmlFor={`${idBase}-anotacion`}
            className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block"
          >
            Nombre corto del día (opcional)
          </label>
          <input
            id={`${idBase}-anotacion`}
            type="text"
            value={diaActivo.anotacion}
            onChange={(e) =>
              onCambiar(
                actualizarConfiguracionBloque(bloques, indiceActivo, {
                  anotacion: e.target.value,
                })
              )
            }
            placeholder="ej. Empuje & Pectoral / Tríceps"
            className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs font-semibold text-foreground focus:outline-hidden focus:border-primary transition-colors"
          />
          <span className="text-[11px] text-muted-foreground block">
            Se añade después del día elegido, por ejemplo «Día 1 (Lunes): Empuje».
          </span>
        </div>

        <div className="space-y-1">
          <label
            htmlFor={`${idBase}-enfoque`}
            className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block"
          >
            Enfoque o indicaciones (opcional)
          </label>
          <input
            id={`${idBase}-enfoque`}
            type="text"
            value={diaActivo.enfoque || ''}
            onChange={(e) =>
              onCambiar(
                actualizarConfiguracionBloque(bloques, indiceActivo, {
                  enfoque: e.target.value,
                })
              )
            }
            placeholder="ej. Hipertrofia e Intensidad RPE 8"
            className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-hidden focus:border-primary transition-colors"
          />
          <span className="text-[11px] text-muted-foreground block">
            Instrucciones de esfuerzo o técnica para el alumno.
          </span>
        </div>
      </div>

      <div className="px-3 py-2 rounded-xl bg-background/80 border border-border/70 flex items-center gap-2 text-xs">
        <span className="text-[11px] font-bold text-primary uppercase tracking-wider shrink-0">
          Así lo verá tu alumno:
        </span>
        <span className="font-bold text-foreground truncate">{diaActivo.titulo}</span>
      </div>
    </div>
  );
}
