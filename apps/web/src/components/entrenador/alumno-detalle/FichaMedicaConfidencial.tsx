/**
 * Tarjeta de salud y limitaciones del alumno (molécula ÚNICA, superficie solo-coach).
 *
 * Presentacional: valor y callback por props (R1). Extraída de
 * `pages/entrenador/AlumnoDetallePage.tsx` (SL-3). El `<textarea>` tiene etiqueta asociada
 * (`useId`), límite de 2000 caracteres y contador visible "N/2000". El límite coincide con el
 * esquema compartido (`fichaSaludPrivada` en `@guachafit/shared`, que no exporta una constante).
 *
 * §6: 11px mínimo, pesos ≤ 700, tokens con variante oscura.
 */
import { useId } from 'react';
import { Lock } from 'lucide-react';

/** Mismo límite que `fichaSaludPrivada` en `packages/shared/src/schemas/alumnos.ts` (max 2000). */
const LIMITE_SALUD_CARACTERES = 2000;

interface FichaMedicaConfidencialProps {
  valor: string;
  onCambiar: (valor: string) => void;
}

export function FichaMedicaConfidencial({ valor, onCambiar }: FichaMedicaConfidencialProps) {
  const idBase = useId();
  const idCampo = `${idBase}-salud`;
  const idAyuda = `${idBase}-salud-ayuda`;

  return (
    <div className="p-6 rounded-3xl bg-card border border-border shadow-xs space-y-3">
      <div className="flex items-center justify-between border-b border-border/80 pb-3">
        <div className="flex items-center gap-2 text-primary">
          <Lock className="h-4 w-4" />
          <h3 className="font-bold text-sm text-foreground">Salud y limitaciones</h3>
        </div>
        <span className="text-xs text-muted-foreground">Se guarda cifrada</span>
      </div>

      <p id={idAyuda} className="text-xs text-muted-foreground leading-relaxed">
        Condiciones, lesiones, cirugías, alergias u observaciones que debas tener presentes al
        entrenar. Solo tú la ves y se guarda cifrada.
      </p>

      <label htmlFor={idCampo} className="sr-only">
        Salud y limitaciones
      </label>
      <textarea
        id={idCampo}
        aria-describedby={idAyuda}
        rows={4}
        maxLength={LIMITE_SALUD_CARACTERES}
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
        placeholder="Ej.: evitar sentadilla profunda por cirugía de rodilla"
        className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary resize-none"
      />
      <p className="text-[11px] font-mono text-muted-foreground text-right">
        {`${valor.length}/${LIMITE_SALUD_CARACTERES}`}
      </p>
    </div>
  );
}
