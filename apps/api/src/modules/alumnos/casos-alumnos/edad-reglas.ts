/**
 * Cálculo puro de edad (RF-011, RN-02). Sin E/S ni dependencias de Nest.
 * Movido sin cambios desde `AlumnosService.calcularEdad` (P3: semántica idéntica).
 */
export function calcularEdadDesdeFecha(fechaNacimiento: string): number {
  const nacimiento = new Date(fechaNacimiento);
  const hoy = new Date();
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const m = hoy.getMonth() - nacimiento.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nacimiento.getDate())) {
    edad--;
  }
  return Math.max(0, edad);
}
