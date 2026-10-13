/**
 * Módulo `bloques-rutina-editor` (Ola 2, prompt 74) · filtrado del picker del catálogo.
 *
 * Lógica pura extraída verbatim de `BloquesRutinaEditor.tsx:96-107` (R1): el `useMemo`
 * de `catalogoFiltrado` y el flag `hayFiltro`. Sin dominio nuevo ni datos: recibe props
 * y devuelve listas filtradas. Los tipos de dominio vienen de `@guachafit/shared` (R4).
 */
import type { EjercicioCatalogoDetalleDTO } from '@guachafit/shared';

/**
 * Filtra el catálogo por grupo muscular (contiene, insensible a mayúsculas; `Todos`
 * no filtra) y por texto libre en el nombre (contiene, insensible a mayúsculas;
 * en blanco no filtra). Deben cumplirse ambas condiciones.
 */
export function filtrarCatalogoEditor(
  catalogo: EjercicioCatalogoDetalleDTO[],
  grupo: string,
  filtro: string
): EjercicioCatalogoDetalleDTO[] {
  return catalogo.filter((ej) => {
    const matchGrupo =
      grupo === 'Todos' || ej.grupoMuscular.toLowerCase().includes(grupo.toLowerCase());
    const matchText =
      !filtro.trim() || ej.nombre.toLowerCase().includes(filtro.toLowerCase());
    return matchGrupo && matchText;
  });
}

/** Hay algún filtro activo (grupo distinto de `Todos` o texto no vacío). */
export function hayFiltroEditor(grupo: string, filtro: string): boolean {
  return grupo !== 'Todos' || filtro.trim() !== '';
}
