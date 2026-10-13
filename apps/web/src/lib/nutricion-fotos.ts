/**
 * Módulo 6 · Nutrición: formatos y contratos de fotos de platos (lógica pura).
 *
 * Extraído de `pages/atleta/NutricionPage.tsx` (SL1, fase B) sin cambiar valores ni textos.
 * CANDIDATO (R3.1): `formatearPeso` es compartible con otras vistas que muestran pesos de
 * archivo; se promueve en la fase D, no antes.
 */

import { MAX_FOTOS_CHECKIN_NUTRICIONAL } from './offline-db';
import type { TipoComida } from '@guachafit/shared';

/**
 * Foto de plato elegida en el dispositivo, ya comprimida y con su vista previa local.
 * UI-local (lleva `File` + object URL): correcto que no esté en `@guachafit/shared`.
 */
export interface FotoPlatoSeleccionada {
  id: string;
  tipoComida: TipoComida;
  archivo: File;
  previewUrl: string;
}

/** Formatos aceptados por el contrato de presign (`image/webp` | `image/jpeg`). */
export const MIME_PERMITIDO_PRESIGN = ['image/webp', 'image/jpeg'];

/** Formatos que el selector acepta antes de comprimir (el compresor emite WebP/JPEG). */
export const MIME_ACEPTADO_SELECTOR = ['image/jpeg', 'image/png', 'image/webp'];

/** Tope de fotos por día (reexportado para que la vista no lea `offline-db` por este dato). */
export { MAX_FOTOS_CHECKIN_NUTRICIONAL };

/** Recorta el peso de una foto para UI: '842 KB' | '1.2 MB'. */
export function formatearPeso(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** El resultado del compresor puede viajar al presign (`image/webp` | `image/jpeg`). */
export function esMimePresignValido(mime: string): boolean {
  return MIME_PERMITIDO_PRESIGN.includes(mime);
}

/** El archivo elegido puede entrar al compresor (JPG, PNG o WebP). */
export function esMimeSelectorValido(mime: string): boolean {
  return MIME_ACEPTADO_SELECTOR.includes(mime);
}
