/**
 * Feedback del alumno (WU5): RPE y notas con jerarquía — las etiquetas `[Título: valor]` del
 * cierre (RPE, molestias, descanso) se muestran como chips y el comentario libre como cuerpo.
 *
 * CANDIDATO a `common/` (fase D): duplicado verificable en
 * `components/entrenador/DetalleSesionEntrenamiento.tsx:170-191` (R3.1). Al consolidar,
 * unificar el copy ("Feedback del Alumno" aquí vs "Feedback del alumno" allí; ningún spec
 * fija ese texto). §6: 11px mínimo, pesos ≤ 700, tokens con variante oscura.
 */
import { MessageSquare } from 'lucide-react';
import { parsearNotasAlumno } from '../../../lib/adherencia';

export function FeedbackAlumno({ notas }: { notas?: string | null }) {
  const { etiquetas, textoLibre } = parsearNotasAlumno(notas);
  if (etiquetas.length === 0 && !textoLibre) return null;

  return (
    <div className="p-3.5 rounded-2xl bg-warning/10 border border-warning/25 space-y-2">
      <span className="text-[11px] font-bold text-warning uppercase tracking-wider flex items-center gap-1.5">
        <MessageSquare className="h-3.5 w-3.5" />
        Feedback del Alumno
      </span>
      {etiquetas.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {etiquetas.map((etiqueta, idx) => (
            <span
              key={`${etiqueta.titulo}-${idx}`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-background/70 border border-warning/25 text-[11px]"
            >
              <span className="font-bold text-warning uppercase tracking-wide text-[11px]">
                {etiqueta.titulo}
              </span>
              {etiqueta.valor && (
                <span className="font-mono font-bold text-foreground">{etiqueta.valor}</span>
              )}
            </span>
          ))}
        </div>
      )}
      {textoLibre && <p className="text-xs text-foreground leading-relaxed">{textoLibre}</p>}
    </div>
  );
}
