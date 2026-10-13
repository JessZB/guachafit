/**
 * RF-018 · Ajustes del entrenador: datos de ejemplo del modo demo (lógica pura).
 *
 * Extraído de `pages/entrenador/AjustesPage.tsx:133-158` (planes) y `:182-201` (tasa).
 * Solo se usa detrás de `isDemoMode` (ADR-012). CANDIDATO a consolidar en fase D con
 * `AlumnoDetallePage.tsx:652-680` (mismos nombres/precios, ids distintos; S-5 del inv. 46).
 */
import type { PlanMembresiaDetalleDTO, TasaCambioVigenteDTO } from '@guachafit/shared';

/** Catálogo de ejemplo del coach demo. Réplica exacta de `AjustesPage.tsx:133-158`. */
export function planesDemo(): PlanMembresiaDetalleDTO[] {
  const ahora = new Date().toISOString();
  return [
    {
      id: 'plan-1',
      entrenadorId: 'coach-1',
      nombre: 'Presencial Completo Sala',
      descripcion: 'Acceso total a sala de pesas, plan de entrenamiento guiado y seguimiento en directo.',
      precioBaseUsd: '40.00',
      duracionMeses: 1,
      beneficios: ['Rutina interactiva en app', 'Seguimiento técnico', '1 Check-in antropométrico mensual'],
      activo: true,
      createdAtUtc: ahora,
      updatedAtUtc: ahora,
    },
    {
      id: 'plan-2',
      entrenadorId: 'coach-1',
      nombre: 'Asesoría Online & Nutrición',
      descripcion: 'Plan a distancia con rutina semanal interactiva y pautas de macro-nutrientes.',
      precioBaseUsd: '30.00',
      duracionMeses: 1,
      beneficios: ['Rutina semanal por bloques', 'Ajustes quincenales', 'Soporte vía WhatsApp'],
      activo: true,
      createdAtUtc: ahora,
      updatedAtUtc: ahora,
    },
  ];
}

/** Tasa de ejemplo del coach demo. Réplica exacta de `AjustesPage.tsx:183-193`. */
export function tasaDemo(): TasaCambioVigenteDTO {
  return {
    id: 'tasa-default',
    entrenadorId: 'coach-1',
    tasaOficialBcv: '66.5000',
    tasaParalelo: '74.2000',
    tasaActivaEntrenador: '66.5000',
    tasaAcordadaCliente: null,
    tasaEfectiva: '66.5000',
    fuente: 'oficial_bcv',
    fechaActualizacionUtc: new Date().toISOString(),
  };
}
