/**
 * RF-018 · Ajustes del entrenador: payloads de planes comerciales (lógica pura).
 *
 * Extraído de `pages/entrenador/AjustesPage.tsx:289-319` (`handleGuardarPlan`).
 * Sin DOM ni red: solo construye el cuerpo que se envía a `POST/PATCH /finanzas/planes`.
 */

export interface DatosFormularioPlan {
  nombre: string;
  descripcion: string;
  precioBaseUsd: string;
  duracionMeses: number;
  beneficios: string[];
}

/** Cuerpo de `PATCH /finanzas/planes/:id` (sin `activo`: el toggle va por su propia vía). */
export function construirPayloadActualizarPlan(datos: DatosFormularioPlan): {
  nombre: string;
  descripcion: string | undefined;
  precioBaseUsd: string;
  duracionMeses: number;
  beneficios: string[];
} {
  return {
    nombre: datos.nombre.trim(),
    descripcion: datos.descripcion.trim() || undefined,
    precioBaseUsd: parseFloat(datos.precioBaseUsd).toFixed(2),
    duracionMeses: datos.duracionMeses,
    beneficios: datos.beneficios,
  };
}

/** Cuerpo de `POST /finanzas/planes` (igual que actualizar + `activo: true`). */
export function construirPayloadCrearPlan(datos: DatosFormularioPlan): {
  nombre: string;
  descripcion: string | undefined;
  precioBaseUsd: string;
  duracionMeses: number;
  beneficios: string[];
  activo: boolean;
} {
  return { ...construirPayloadActualizarPlan(datos), activo: true };
}
