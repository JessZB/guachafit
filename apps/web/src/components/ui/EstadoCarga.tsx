/**
 * Átomo de carga (fase C, prompt 48).
 *
 * Consolida el spinner de página completa duplicado en al menos 3 vistas
 * (`PagosPage.tsx:527-529`, `ProgresoPage.tsx:393-399`, variante
 * `AlumnoDetallePage.tsx:2130-2132`).
 *
 * - Sin dominio ni datos: no exige `QueryClientProvider` (R9).
 * - §6.6 (estado honesto de carga) + §6.9 (sin texto visible bajo 11px: el texto
 *   solo existe para lectores de pantalla) + §6.12 (sin pesos > 700).
 * - `role="status"`: el loader original no lo tenía (hallazgo H-8 del inventario 41).
 */
export interface EstadoCargaProps {
  /** Texto accesible del estado (no visible). Por defecto "Cargando…". */
  texto?: string;
  /** Alto mínimo del contenedor. Por defecto `min-h-[300px]` (copias de origen). */
  claseContenedor?: string;
}

export function EstadoCarga({ texto = 'Cargando…', claseContenedor }: EstadoCargaProps) {
  return (
    <div
      role="status"
      className={`flex items-center justify-center ${claseContenedor ?? 'min-h-[300px]'}`}
    >
      <div
        aria-hidden="true"
        className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin"
      />
      <span className="sr-only">{texto}</span>
    </div>
  );
}
