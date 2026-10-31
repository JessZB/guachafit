/**
 * Insignia numérica de pendientes (UX-16).
 *
 * El número va en `aria-hidden`; la descripción va en `sr-only`, así el enlace que la contiene
 * anuncia, p. ej., "Pagos por validar 3 por validar". Sin dato o en cero no renderiza nada.
 */
interface InsigniaConteoProps {
  conteo: number | null;
  descripcion: string;
}

export function InsigniaConteo({ conteo, descripcion }: InsigniaConteoProps) {
  if (conteo === null || conteo <= 0) return null;

  return (
    <>
      <span
        aria-hidden="true"
        className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold leading-none whitespace-nowrap shrink-0"
      >
        {conteo > 99 ? '99+' : conteo}
      </span>{' '}
      <span className="sr-only">{descripcion}</span>
    </>
  );
}
