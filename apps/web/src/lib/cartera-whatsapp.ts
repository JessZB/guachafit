/**
 * Prompt 73 (Ola 2, módulo `cartera`): lógica pura del enlace de WhatsApp del modal de
 * recordatorio (antes inline en `CarteraPage.tsx:348` y `:668-671`).
 *
 * Recorte verbatim: solo dígitos del teléfono (`null` cuando no hay) y URL `wa.me` con el
 * mensaje sugerido codificado. Sin red ni DOM.
 */

/** Solo dígitos del teléfono para `wa.me`; `null` cuando no hay teléfono. */
export function digitosWhatsApp(telefono?: string | null): string | null {
  if (telefono === null || telefono === undefined) return null;
  return telefono.replace(/[^0-9]/g, '');
}

/** Enlace `wa.me` con el mensaje sugerido codificado (se abre en pestaña nueva). */
export function urlWhatsApp(digitos: string, mensajeSugerido: string): string {
  return `https://wa.me/${digitos}?text=${encodeURIComponent(mensajeSugerido)}`;
}
