/** Avisos del editor: el éxito se anuncia con `role="status"` y el error con `role="alert"`. */
export function AvisosEditorMetas({ error, exito }: { error: string | null; exito: string | null }) {
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
