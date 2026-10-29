import type { ReactNode } from 'react';

/** Clases comunes de los controles de Ajustes: área táctil de 44px y texto de 16px en móvil. */
const CLASES_CONTROL =
  'min-h-11 px-3 rounded-xl bg-background border text-base sm:text-sm text-foreground focus:outline-hidden focus:border-primary';

function clasesControl(error: boolean, deshabilitado: boolean, ancho: string): string {
  return `${CLASES_CONTROL} ${ancho} ${error ? 'border-destructive' : 'border-border'} ${deshabilitado ? 'opacity-60' : ''}`;
}

/**
 * Ids de las piezas que describen un control, en orden fijo: descripción, sufijo y error. Solo
 * incluye las que existen; `undefined` si no hay ninguna. Lo comparten CampoAjustes y SelectAjustes.
 */
function idsDescripcion(
  id: string,
  piezas: { descripcion?: string; sufijo?: string; error?: string }
): string | undefined {
  const ids = [
    piezas.descripcion ? `${id}-descripcion` : null,
    piezas.sufijo ? `${id}-sufijo` : null,
    piezas.error ? `${id}-error` : null,
  ].filter((idPieza): idPieza is string => idPieza !== null);
  return ids.length > 0 ? ids.join(' ') : undefined;
}

/**
 * Campo de texto de Ajustes con etiqueta asociada y área táctil de 44px. Un error se marca con
 * `aria-invalid` y `role="alert"`. `aria-describedby` apunta, en este orden, a la descripción, al
 * sufijo y al error cuando existen.
 *
 * - `sufijo` (p. ej. `Bs/USD`) va en flujo junto al input, no superpuesto, y sirve como unidad.
 * - `text-base` en móvil evita el zoom automático de iOS al enfocar; `sm:text-sm` iguala escritorio.
 * - §6.13: los datos numéricos usan `inputMode` con `type="text"`, nunca `type="number"`.
 */
export function CampoAjustes({
  id,
  etiqueta,
  valor,
  onCambiar,
  error,
  type = 'text',
  autoComplete,
  inputMode,
  sufijo,
  descripcion,
  placeholder,
  deshabilitado = false,
}: {
  id: string;
  etiqueta: string;
  valor: string;
  onCambiar: (valor: string) => void;
  error?: string;
  type?: 'text' | 'tel' | 'email' | 'password';
  autoComplete?: string;
  inputMode?: 'text' | 'tel' | 'email' | 'decimal' | 'numeric';
  /** Unidad visible junto al input (p. ej. `Bs/USD`). */
  sufijo?: string;
  /** Texto de ayuda bajo la etiqueta; el input lo describe. */
  descripcion?: string;
  placeholder?: string;
  /** Mientras se guarda: lo escrito no cambia hasta que llega la respuesta. */
  deshabilitado?: boolean;
}) {
  const idError = `${id}-error`;
  const input = (
    <input
      id={id}
      type={type}
      value={valor}
      autoComplete={autoComplete}
      inputMode={inputMode}
      placeholder={placeholder}
      onChange={(e) => onCambiar(e.target.value)}
      disabled={deshabilitado}
      aria-invalid={error ? true : undefined}
      aria-describedby={idsDescripcion(id, { descripcion, sufijo, error })}
      className={clasesControl(Boolean(error), deshabilitado, sufijo ? 'flex-1 min-w-0' : 'w-full')}
    />
  );
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-semibold text-muted-foreground">
        {etiqueta}
      </label>
      {descripcion && (
        <p id={`${id}-descripcion`} className="text-xs text-muted-foreground">
          {descripcion}
        </p>
      )}
      {sufijo ? (
        <div className="flex items-center gap-2">
          {input}
          <span id={`${id}-sufijo`} className="shrink-0 text-sm font-semibold text-muted-foreground">
            {sufijo}
          </span>
        </div>
      ) : (
        input
      )}
      {error && (
        <p id={idError} role="alert" className="text-xs font-semibold text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Selector de Ajustes con etiqueta, descripción y error accesibles. Misma área táctil y reglas de
 * error que CampoAjustes, sin sufijo.
 */
export function SelectAjustes({
  id,
  etiqueta,
  valor,
  onCambiar,
  opciones,
  error,
  descripcion,
  deshabilitado = false,
}: {
  id: string;
  etiqueta: string;
  valor: string;
  onCambiar: (valor: string) => void;
  opciones: readonly { valor: string; etiqueta: string }[];
  error?: string;
  descripcion?: string;
  deshabilitado?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-semibold text-muted-foreground">
        {etiqueta}
      </label>
      {descripcion && (
        <p id={`${id}-descripcion`} className="text-xs text-muted-foreground">
          {descripcion}
        </p>
      )}
      <select
        id={id}
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
        disabled={deshabilitado}
        aria-invalid={error ? true : undefined}
        aria-describedby={idsDescripcion(id, { descripcion, error })}
        className={clasesControl(Boolean(error), deshabilitado, 'w-full')}
      >
        {opciones.map((opcion) => (
          <option key={opcion.valor} value={opcion.valor}>
            {opcion.etiqueta}
          </option>
        ))}
      </select>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs font-semibold text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** Tarjeta de una sección de Ajustes con su título y, si la hay, una descripción breve. */
export function TarjetaAjustes({
  titulo,
  descripcion,
  children,
}: {
  titulo: string;
  descripcion?: string;
  children: ReactNode;
}) {
  return (
    <section className="p-5 sm:p-6 rounded-3xl bg-card border border-border shadow-xs space-y-4">
      <div className="space-y-1">
        <h2 className="text-base font-bold text-foreground">{titulo}</h2>
        {descripcion && <p className="text-sm text-muted-foreground">{descripcion}</p>}
      </div>
      {children}
    </section>
  );
}

/** Avisos de un formulario de Ajustes: error con `role="alert"`, éxito con `role="status"`. */
export function AvisosAjustes({ error, exito }: { error?: string | null; exito?: string | null }) {
  return (
    <>
      {error && (
        <p
          role="alert"
          className="text-xs font-semibold text-destructive bg-destructive/10 border border-destructive/25 rounded-2xl px-3 py-2"
        >
          {error}
        </p>
      )}
      {exito && (
        <p
          role="status"
          className="text-xs font-semibold text-success bg-success/10 border border-success/25 rounded-2xl px-3 py-2"
        >
          {exito}
        </p>
      )}
    </>
  );
}

/**
 * Botón principal de un formulario de Ajustes (44px). Mientras `ocupado`, se deshabilita y se
 * atenúa; el estado no se expresa con variantes `disabled:` de Tailwind para que el botón en
 * reposo no lleve esa palabra en su marcado.
 */
export function BotonAjustes({
  children,
  ocupado = false,
  type = 'submit',
  onClick,
  variante = 'primario',
}: {
  children: ReactNode;
  ocupado?: boolean;
  type?: 'submit' | 'button';
  onClick?: () => void;
  variante?: 'primario' | 'secundario';
}) {
  const estilos =
    variante === 'primario'
      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
      : 'bg-secondary text-foreground hover:bg-secondary/80';
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={ocupado}
      aria-busy={ocupado}
      className={`min-h-11 px-4 rounded-xl text-sm font-bold ${estilos} ${ocupado ? 'opacity-60 cursor-wait' : 'cursor-pointer'}`}
    >
      {children}
    </button>
  );
}
