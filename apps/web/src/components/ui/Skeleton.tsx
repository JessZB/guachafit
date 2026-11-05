/**
 * Primitiva de esqueleto (fase 2 «carga sin saltos»).
 *
 * Bloque decorativo con pulso: sin texto y oculto a lectores de pantalla (`aria-hidden`).
 * El anuncio accesible de la carga lo hace `CargaConEsqueleto`.
 */
export interface SkeletonProps {
  /** Dimensiones y forma del bloque (p. ej. `h-4 w-32`). */
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-lg bg-secondary/60 ${className ?? ''}`}
    />
  );
}
