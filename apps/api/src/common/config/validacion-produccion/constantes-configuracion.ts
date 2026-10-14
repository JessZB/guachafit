/** Constantes públicas de la validación de arranque: valores de ejemplo y topes. */

/** Valor por defecto solo para desarrollo/test (también es el valor de ejemplo prohibido en producción). */
export const ENCRYPTION_KEY_DESARROLLO =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

/** Credenciales y bucket locales de MinIO que documenta `.env.example`. */
export const STORAGE_ACCESS_KEY_EJEMPLO = 'minioadmin';
export const STORAGE_SECRET_KEY_EJEMPLO = 'minioadmin';
export const STORAGE_BUCKET_EJEMPLO = 'guachafit-r2-local';

/** Contraseña de ejemplo del panel Bull-Board. */
export const BULL_BOARD_PASS_EJEMPLO = 'cambia_esta_clave';

/** Longitud mínima de la contraseña de Bull-Board en producción. */
export const LONGITUD_MINIMA_BULL_BOARD_PASS = 12;
