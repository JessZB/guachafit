/**
 * Alias de las variables de entorno de la bóveda de archivos: la familia `STORAGE_*` y la
 * histórica `R2_*` (ADR-007).
 *
 * Viven en `common/config` — y no en el servicio de antropometría — para que la configuración
 * compartida (validación de arranque, servicios de `common`) pueda leerlas sin depender del
 * módulo de almacenamiento ni cargar el SDK de AWS.
 */
export const ENV_ENDPOINT = ['STORAGE_ENDPOINT', 'R2_ENDPOINT'] as const;
export const ENV_BUCKET = ['STORAGE_BUCKET', 'STORAGE_BUCKET_NAME', 'R2_BUCKET_NAME'] as const;
export const ENV_ACCESS_KEY_ID = ['STORAGE_ACCESS_KEY_ID', 'STORAGE_ACCESS_KEY', 'R2_ACCESS_KEY_ID'] as const;
export const ENV_SECRET_ACCESS_KEY = [
  'STORAGE_SECRET_ACCESS_KEY',
  'STORAGE_SECRET_KEY',
  'R2_SECRET_ACCESS_KEY',
] as const;
