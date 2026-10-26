import { fechaAnteriorYyyyMmDd } from './adherencia.util';

// =============================================================================
// REGLA DE DOMINIO COMPARTIDA: RACHA EFECTIVA (RF-001 RN-02, RF-011)
// La usan `entrenamiento` (DTO y monitor) y `alumnos` (directorio "Mis alumnos").
// Vive en `common/` para que `alumnos` no importe de `entrenamiento`.
// =============================================================================

/**
 * Racha efectiva para DTO/monitor: si `rachaUltimaFecha` es anterior a ayer, la cadena
 * se considera rota y se muestra 0. Si es hoy o ayer, se muestra `rachaDias`.
 */
export function calcularRachaEfectiva(
  rachaDias: number,
  rachaUltimaFecha: string | null | undefined,
  fechaLocal: string
): number {
  if (!rachaUltimaFecha) return 0;
  const ayer = fechaAnteriorYyyyMmDd(fechaLocal, 1);
  if (rachaUltimaFecha < ayer) return 0;
  return Math.max(0, rachaDias ?? 0);
}
