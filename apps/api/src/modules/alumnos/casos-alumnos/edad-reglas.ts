/**
 * Pure age calculation (RF-011, RN-02). No I/O, no Nest dependencies.
 * Moved verbatim from `AlumnosService.calcularEdad` (P3: identical semantics).
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
