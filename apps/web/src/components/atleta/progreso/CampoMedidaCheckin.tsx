/**
 * Campo de medida del check-in: label + input + error inline (SL3, fase B).
 *
 * De `ProgresoPage.tsx:726-853` (un campo; el mapa de clases
 * `CLASES_INPUT_MEDIDA` de `:71-73` vive aquí). `id`, labels, `inputMode` y
 * `aria-invalid` idénticos (exigidos por los specs: `Peso (kg)`). El filtro
 * al teclear del peso vive en el hook; aquí solo se reporta `onCambiar`.
 * Presentacional: props tipadas, sin datos (R1). §6: `inputMode="decimal"`,
 * error `role="alert"` de 11px.
 */
interface CampoMedidaCheckinProps {
  id: string;
  etiqueta: string;
  valor: string;
  onCambiar: (valor: string) => void;
  conError: boolean;
  error?: string | null;
}

/** Clases base de los inputs de medida (foco y tipografía mono de datos, DESIGN.md). */
export const CLASES_INPUT_MEDIDA =
  'w-full min-h-11 px-3.5 py-2.5 rounded-2xl bg-background border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary';

export function CampoMedidaCheckin({
  id,
  etiqueta,
  valor,
  onCambiar,
  conError,
  error,
}: CampoMedidaCheckinProps) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-muted-foreground" htmlFor={id}>
        {etiqueta}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
        aria-invalid={conError}
        className={`${CLASES_INPUT_MEDIDA} ${
          conError ? 'border-destructive' : 'border-border'
        }`}
      />
      {error && (
        <p role="alert" className="text-[11px] font-semibold text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
