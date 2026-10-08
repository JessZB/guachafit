import type { ReactNode } from 'react';

/**
 * Campo de texto de Ajustes con etiqueta asociada, área táctil de 44px y error accesible: el
 * input se marca con `aria-invalid` y apunta a su mensaje con `aria-describedby`.
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
  deshabilitado = false,
}: {
  id: string;
  etiqueta: string;
  valor: string;
  onCambiar: (valor: string) => void;
  error?: string;
  type?: 'text' | 'tel' | 'email' | 'password';
  autoComplete?: string;
  inputMode?: 'text' | 'tel' | 'email';
  /** Mientras se guarda: lo escrito no cambia hasta que llega la respuesta. */
  deshabilitado?: boolean;
}) {
  const idError = `${id}-error`;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-semibold text-muted-foreground">
        {etiqueta}
      </label>
      <input
        id={id}
        type={type}
        value={valor}
        autoComplete={autoComplete}
        inputMode={inputMode}
        onChange={(e) => onCambiar(e.target.value)}
        disabled={deshabilitado}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? idError : undefined}
        className={`w-full min-h-11 px-3 rounded-xl bg-background border text-sm text-foreground focus:outline-hidden focus:border-primary ${
          error ? 'border-destructive' : 'border-border'
        } ${deshabilitado ? 'opacity-60' : ''}`}
      />
      {error && (
        <p id={idError} className="text-xs font-semibold text-destructive">
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
