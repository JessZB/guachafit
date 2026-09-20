/**
 * WU20: normalización de texto compartida por los filtros de listas del cliente.
 *
 * Única implementación para que todas las búsquedas (monitor, plantillas, conciliación,
 * antropometría, pagos) coincidan con el mismo criterio: minúsculas, sin acentos,
 * sin espacios sobrantes.
 */
export function normalizarTextoBusqueda(texto: string | null | undefined): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita tildes/diéresis (é → e, ü → u)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}
