/** Campo numérico del editor de metas con etiqueta asociada y área táctil de 44px. */
export function CampoMeta({
  id,
  etiqueta,
  valor,
  onChange,
  placeholder,
  decimal = false,
}: {
  id: string;
  etiqueta: string;
  valor: string;
  onChange: (valor: string) => void;
  placeholder: string;
  decimal?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-semibold text-muted-foreground">{etiqueta}</label>
      <input
        id={id}
        type="text"
        inputMode={decimal ? 'decimal' : 'numeric'}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full min-h-11 px-3 rounded-xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary"
      />
    </div>
  );
}
