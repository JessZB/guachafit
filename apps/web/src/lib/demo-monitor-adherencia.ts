/**
 * Fixture demo del monitor de adherencia semanal (RF-001 RN-03).
 *
 * SOLO se consume con la bandera `isDemoMode` activa. `ultimaSesionUtc` y `diasInactivo` se
 * calculan relativos a "ahora" para que el monitor se vea fresco en cualquier fecha.
 *
 * Coherencia entre pantallas del modo demo:
 * - Los nombres e ids de perfil (`al-00X`) son los del roster demo del directorio
 *   (`directorio-alumnos.ts`) y del dashboard; `AlumnoDetallePage` hidrata fixtures para
 *   cualquier id en modo demo, así que el enlace al expediente funciona para todos.
 * - WU26: el roster crece a 15 alumnos (más de una página de 10) para poder VER la paginación
 *   del monitor en modo demo; cada id nuevo tiene su historial en `demo-sesiones.ts`.
 * - Los estados son consistentes con `evaluarAdherenciaSemanal` de la API: ROJO si el
 *   porcentaje es < 50% o hay más de 4 días de inactividad; AMARILLO entre 50% y 79.99%;
 *   VERDE desde 80%; 0/0 sin plan activo se muestra neutral ("Sin plan").
 */
import { SemaforoAdherencia, type MonitorAdherenciaSemanalDTO } from '@guachafit/shared';

/** ISO UTC de "hace N días y H horas" (relativo a `ahora`). */
function isoHace(ahora: Date, dias: number, horas = 0): string {
  const milisegundos = (dias * 24 + horas) * 60 * 60 * 1000;
  return new Date(ahora.getTime() - milisegundos).toISOString();
}

/** Convierte días + horas atrás en días de calendario transcurridos (mínimo 0). */
function diasHace(dias: number, horas = 0): number {
  return Math.floor(dias + horas / 24);
}

export function crearMonitorAdherenciaDemo(ahora: Date = new Date()): MonitorAdherenciaSemanalDTO[] {
  return [
    // ROJO: 0/4 bloques vencidos y 6 días sin entrenar.
    {
      alumnoId: 'demo-u-009',
      alumnoPerfilId: 'al-009',
      nombreCompleto: 'Daniela Ríos Peña',
      sesionesPrescritas: 4,
      sesionesCompletadas: 0,
      porcentajeCumplimientoSemanal: '0.00',
      semaforoAdherencia: SemaforoAdherencia.ROJO,
      tienePlanActivo: true,
      sinPendientesSemana: false,
      rachaDiasConsecutivos: 0,
      diasInactivo: 6,
      ultimaSesionUtc: isoHace(ahora, 6, 4),
    },
    // ROJO: 2/5 bloques (40%) pese a haber entrenado ayer.
    {
      alumnoId: 'demo-u-010',
      alumnoPerfilId: 'al-010',
      nombreCompleto: 'Jorge Ramírez León',
      sesionesPrescritas: 5,
      sesionesCompletadas: 2,
      porcentajeCumplimientoSemanal: '40.00',
      semaforoAdherencia: SemaforoAdherencia.ROJO,
      tienePlanActivo: true,
      sinPendientesSemana: false,
      rachaDiasConsecutivos: 2,
      diasInactivo: 1,
      ultimaSesionUtc: isoHace(ahora, 1, 3),
    },
    // ROJO: nunca completó un bloque vencido y lleva 9 días sin entrenar.
    {
      alumnoId: 'demo-u-003',
      alumnoPerfilId: 'al-003',
      nombreCompleto: 'Roberto Díaz Navarro',
      sesionesPrescritas: 3,
      sesionesCompletadas: 0,
      porcentajeCumplimientoSemanal: '0.00',
      semaforoAdherencia: SemaforoAdherencia.ROJO,
      tienePlanActivo: true,
      sinPendientesSemana: false,
      rachaDiasConsecutivos: 0,
      diasInactivo: 9,
      ultimaSesionUtc: isoHace(ahora, 9),
    },
    // ROJO: 1/4 bloques y > 4 días de inactividad (doble motivo RN-03).
    {
      alumnoId: 'demo-u-004',
      alumnoPerfilId: 'al-004',
      nombreCompleto: 'Valeria Silva Castillo',
      sesionesPrescritas: 4,
      sesionesCompletadas: 1,
      porcentajeCumplimientoSemanal: '25.00',
      semaforoAdherencia: SemaforoAdherencia.ROJO,
      tienePlanActivo: true,
      sinPendientesSemana: false,
      rachaDiasConsecutivos: 1,
      diasInactivo: 5,
      ultimaSesionUtc: isoHace(ahora, 5),
    },
    // AMARILLO: 3/5 bloques (60.00%) y actividad reciente.
    {
      alumnoId: 'demo-u-007',
      alumnoPerfilId: 'al-007',
      nombreCompleto: 'Luis Fernando Rojas',
      sesionesPrescritas: 5,
      sesionesCompletadas: 3,
      porcentajeCumplimientoSemanal: '60.00',
      semaforoAdherencia: SemaforoAdherencia.AMARILLO,
      tienePlanActivo: true,
      sinPendientesSemana: false,
      rachaDiasConsecutivos: 2,
      diasInactivo: 3,
      ultimaSesionUtc: isoHace(ahora, 3),
    },
    // AMARILLO: 2/3 bloques (66.67%) y actividad reciente.
    {
      alumnoId: 'demo-u-002',
      alumnoPerfilId: 'al-002',
      nombreCompleto: 'Mariana Pérez Gómez',
      sesionesPrescritas: 3,
      sesionesCompletadas: 2,
      porcentajeCumplimientoSemanal: '66.67',
      semaforoAdherencia: SemaforoAdherencia.AMARILLO,
      tienePlanActivo: true,
      sinPendientesSemana: false,
      rachaDiasConsecutivos: 4,
      diasInactivo: 2,
      ultimaSesionUtc: isoHace(ahora, 2),
    },
    // AMARILLO: 5/8 bloques (62.50%).
    {
      alumnoId: 'demo-u-012',
      alumnoPerfilId: 'al-012',
      nombreCompleto: 'Miguel Ángel Contreras',
      sesionesPrescritas: 8,
      sesionesCompletadas: 5,
      porcentajeCumplimientoSemanal: '62.50',
      semaforoAdherencia: SemaforoAdherencia.AMARILLO,
      tienePlanActivo: true,
      sinPendientesSemana: false,
      rachaDiasConsecutivos: 8,
      diasInactivo: 2,
      ultimaSesionUtc: isoHace(ahora, 2, 6),
    },
    // AMARILLO: 4/6 bloques (66.67%).
    {
      alumnoId: 'demo-u-011',
      alumnoPerfilId: 'al-011',
      nombreCompleto: 'Sofía Herrera Blanco',
      sesionesPrescritas: 6,
      sesionesCompletadas: 4,
      porcentajeCumplimientoSemanal: '66.67',
      semaforoAdherencia: SemaforoAdherencia.AMARILLO,
      tienePlanActivo: true,
      sinPendientesSemana: false,
      rachaDiasConsecutivos: 5,
      diasInactivo: 3,
      ultimaSesionUtc: isoHace(ahora, 3),
    },
    // VERDE: 3/3 completadas hace 4 días (el porcentaje manda sobre la inactividad).
    {
      alumnoId: 'demo-u-015',
      alumnoPerfilId: 'al-015',
      nombreCompleto: 'Camila Navarro Reyes',
      sesionesPrescritas: 3,
      sesionesCompletadas: 3,
      porcentajeCumplimientoSemanal: '100.00',
      semaforoAdherencia: SemaforoAdherencia.VERDE,
      tienePlanActivo: true,
      sinPendientesSemana: false,
      rachaDiasConsecutivos: 4,
      diasInactivo: 4,
      ultimaSesionUtc: isoHace(ahora, 4),
    },
    // VERDE: semana perfecta 4/4 y racha larga.
    {
      alumnoId: 'demo-u-001',
      alumnoPerfilId: 'al-001',
      nombreCompleto: 'Carlos Alberto Mendoza Silva',
      sesionesPrescritas: 4,
      sesionesCompletadas: 4,
      porcentajeCumplimientoSemanal: '100.00',
      semaforoAdherencia: SemaforoAdherencia.VERDE,
      tienePlanActivo: true,
      sinPendientesSemana: false,
      rachaDiasConsecutivos: 12,
      diasInactivo: diasHace(0, 5),
      ultimaSesionUtc: isoHace(ahora, 0, 5),
    },
    // VERDE: 3/3 completadas ayer.
    {
      alumnoId: 'demo-u-008',
      alumnoPerfilId: 'al-008',
      nombreCompleto: 'Gabriela Torres',
      sesionesPrescritas: 3,
      sesionesCompletadas: 3,
      porcentajeCumplimientoSemanal: '100.00',
      semaforoAdherencia: SemaforoAdherencia.VERDE,
      tienePlanActivo: true,
      sinPendientesSemana: false,
      rachaDiasConsecutivos: 6,
      diasInactivo: 1,
      ultimaSesionUtc: isoHace(ahora, 1),
    },
    // VERDE: 5/5 completadas hoy mismo (madrugada).
    {
      alumnoId: 'demo-u-013',
      alumnoPerfilId: 'al-013',
      nombreCompleto: 'Lucía Fernández Ríos',
      sesionesPrescritas: 5,
      sesionesCompletadas: 5,
      porcentajeCumplimientoSemanal: '100.00',
      semaforoAdherencia: SemaforoAdherencia.VERDE,
      tienePlanActivo: true,
      sinPendientesSemana: false,
      rachaDiasConsecutivos: 3,
      diasInactivo: diasHace(0, 7),
      ultimaSesionUtc: isoHace(ahora, 0, 7),
    },
    // VERDE: semana perfecta 4/4 y actividad de hace dos días.
    {
      alumnoId: 'demo-u-014',
      alumnoPerfilId: 'al-014',
      nombreCompleto: 'Tomás Aguirre Salas',
      sesionesPrescritas: 4,
      sesionesCompletadas: 4,
      porcentajeCumplimientoSemanal: '100.00',
      semaforoAdherencia: SemaforoAdherencia.VERDE,
      tienePlanActivo: true,
      sinPendientesSemana: false,
      rachaDiasConsecutivos: 10,
      diasInactivo: 2,
      ultimaSesionUtc: isoHace(ahora, 2),
    },
    // Plan activo sin bloques vencidos aún (D6): la UI lo muestra neutral, nunca ROJO.
    {
      alumnoId: 'demo-u-006',
      alumnoPerfilId: 'al-006',
      nombreCompleto: 'Elena Gómez',
      sesionesPrescritas: 0,
      sesionesCompletadas: 0,
      porcentajeCumplimientoSemanal: '0.00',
      semaforoAdherencia: SemaforoAdherencia.ROJO,
      tienePlanActivo: true,
      sinPendientesSemana: true,
      rachaDiasConsecutivos: 0,
      diasInactivo: 8,
      ultimaSesionUtc: isoHace(ahora, 8),
    },
    // Sin rutina activa: la UI lo muestra como "Sin plan" (fuera de los conteos de riesgo).
    {
      alumnoId: 'demo-u-005',
      alumnoPerfilId: 'al-005',
      nombreCompleto: 'Andrés Silva',
      sesionesPrescritas: 0,
      sesionesCompletadas: 0,
      porcentajeCumplimientoSemanal: '0.00',
      semaforoAdherencia: SemaforoAdherencia.ROJO,
      tienePlanActivo: false,
      sinPendientesSemana: false,
      rachaDiasConsecutivos: 0,
      diasInactivo: 14,
      ultimaSesionUtc: isoHace(ahora, 14),
    },
  ];
}
