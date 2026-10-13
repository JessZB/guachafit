import {
  EstadoSesion,
  type SemanaEntrenamientoProgresoDTO,
  type SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';

const DEMO_BLOQUES_CATALOGO = [
  {
    bloqueId: 'd1',
    titulo: 'Día 1 (Lunes): Empuje & Pectoral / Tríceps',
    enfoque: 'Hipertrofia e intensidad alta (esfuerzo 8 de 10)',
    diaSugerido: 1,
    completado: true,
    ejercicios: [
      {
        nombre: 'Press Plano con Mancuernas',
        grupoMuscular: 'Pectoral / Deltoides',
        series: 4,
        reps: '8-10',
        peso: '28.00',
        rpe: '8.0',
        descansoSegundos: 90,
      },
      {
        nombre: 'Press Inclinado en Multipower',
        grupoMuscular: 'Pectoral Superior',
        series: 3,
        reps: '10-12',
        peso: '60.00',
        rpe: '8.5',
        descansoSegundos: 90,
      },
      {
        nombre: 'Fondos en Paralelas Asistidos',
        grupoMuscular: 'Tríceps / Pecho',
        series: 3,
        reps: '12',
        peso: '0.00',
        rpe: '8.0',
        descansoSegundos: 90,
      },
      {
        nombre: 'Extensiones de Tríceps en Polea',
        grupoMuscular: 'Tríceps',
        series: 4,
        reps: '12-15',
        peso: '25.00',
        rpe: '9.0',
        descansoSegundos: 60,
      },
    ],
  },
  {
    bloqueId: 'd2',
    titulo: 'Día 2 (Miércoles): Tracción & Espalda / Bíceps',
    enfoque: 'Volumen y Control Escapular',
    diaSugerido: 3,
    completado: false,
    ejercicios: [
      {
        nombre: 'Jalón al Pecho Agarre Neutro',
        grupoMuscular: 'Dorsal Ancho',
        series: 4,
        reps: '10-12',
        peso: '65.00',
        rpe: '8.0',
        descansoSegundos: 90,
      },
      {
        nombre: 'Remo con Barra T apoyado',
        grupoMuscular: 'Espalda Media',
        series: 4,
        reps: '8-10',
        peso: '50.00',
        rpe: '8.5',
        descansoSegundos: 90,
      },
      {
        nombre: 'Face Pulls en Polea Alta',
        grupoMuscular: 'Deltoides Posterior',
        series: 3,
        reps: '15',
        peso: '20.00',
        rpe: '7.5',
        descansoSegundos: 60,
      },
      {
        nombre: 'Curl con Barra Z de Pie',
        grupoMuscular: 'Bíceps',
        series: 3,
        reps: '10-12',
        peso: '30.00',
        rpe: '8.5',
        descansoSegundos: 60,
      },
    ],
  },
  {
    bloqueId: 'd3',
    titulo: 'Día 3 (Viernes): Pierna & Enfoque Cuádriceps / Isquios',
    enfoque: 'Fuerza Controlada (Cuidar Rodilla)',
    diaSugerido: 5,
    completado: false,
    ejercicios: [
      {
        nombre: 'Sentadilla Trasera con Barra',
        grupoMuscular: 'Cuádriceps / Glúteos',
        series: 4,
        reps: '8-10',
        peso: '85.00',
        rpe: '8.0',
        descansoSegundos: 120,
      },
      {
        nombre: 'Prensa Inclinada 45°',
        grupoMuscular: 'Cuádriceps',
        series: 4,
        reps: '10-12',
        peso: '140.00',
        rpe: '8.0',
        descansoSegundos: 120,
      },
      {
        nombre: 'Curl Femoral Tumbado',
        grupoMuscular: 'Isquiosurales',
        series: 4,
        reps: '12',
        peso: '45.00',
        rpe: '8.5',
        descansoSegundos: 90,
      },
      {
        nombre: 'Elevación de Gemelos en Máquina',
        grupoMuscular: 'Pantorrillas',
        series: 4,
        reps: '15',
        peso: '60.00',
        rpe: '8.0',
        descansoSegundos: 60,
      },
    ],
  },
  {
    bloqueId: 'd4',
    titulo: 'Día 4 (Sábado): Full Body & Core',
    enfoque: 'Acondicionamiento y Estabilidad',
    diaSugerido: 6,
    completado: false,
    ejercicios: [
      {
        nombre: 'Peso Muerto Rumano con Mancuernas',
        grupoMuscular: 'Cadena Posterior',
        series: 4,
        reps: '10-12',
        peso: '32.00',
        rpe: '8.0',
        descansoSegundos: 90,
      },
      {
        nombre: 'Press Militar con Mancuernas',
        grupoMuscular: 'Hombros',
        series: 3,
        reps: '10-12',
        peso: '20.00',
        rpe: '8.5',
        descansoSegundos: 90,
      },
      {
        nombre: 'Plancha Abdominal Isométrica',
        grupoMuscular: 'Core',
        series: 3,
        reps: '45s',
        peso: '0.00',
        rpe: '8.0',
        descansoSegundos: 60,
      },
    ],
  },
];

export function buildDemoSemanaProgreso(selectedBloqueId?: string): SemanaEntrenamientoProgresoDTO {
  const activoId = selectedBloqueId || 'd2';
  return {
    semanaIso: '2026-W38',
    inicioSemana: '2026-09-14',
    finSemana: '2026-09-20',
    totalBloques: 4,
    bloquesCompletados: 1,
    porcentajeCumplimiento: '25.00',
    siguienteBloqueSugeridoId: 'd2',
    esDiaDescansoHoy: false,
    rachaDias: 3,
    bloques: DEMO_BLOQUES_CATALOGO.map((b) => ({
      bloqueId: b.bloqueId, titulo: b.titulo, enfoque: b.enfoque, diaSugerido: b.diaSugerido,
      totalEjercicios: b.ejercicios.length, completado: b.bloqueId === 'd1',
      esSugeridoHoy: b.bloqueId === activoId,
      estadoSesion: b.bloqueId === 'd1' ? EstadoSesion.COMPLETADA : null, motivoOmision: null,
    })),
  };
}

export function buildDemoSesion(
  bloqueId: string = 'd2',
  alumnoId: string = 'demo-alumno'
): SesionEntrenamientoDetalleDTO {
  const b = DEMO_BLOQUES_CATALOGO.find((x) => x.bloqueId === bloqueId) || DEMO_BLOQUES_CATALOGO[1];
  const fechaHoy = new Date().toISOString().split('T')[0];

  return {
    id: `sesion-demo-${b.bloqueId}`,
    alumnoId,
    bloqueId: b.bloqueId,
    esDiaDescansoOriginal: b.diaSugerido === 6,
    fechaProgramada: fechaHoy,
    estado: b.completado ? EstadoSesion.COMPLETADA : EstadoSesion.PLANIFICADA,
    timezoneCliente: 'America/Caracas',
    porcentajeCumplimiento: b.completado ? '100.00' : '0.00',
    volumenTotalKg: b.completado ? '3420.00' : '0.00',
    ejercicios: b.ejercicios.map((ej, ejIdx) => ({
      id: `es-demo-${b.bloqueId}-${ejIdx}`,
      sesionId: `sesion-demo-${b.bloqueId}`,
      ejercicioId: `ej-demo-${b.bloqueId}-${ejIdx}`,
      orden: ejIdx + 1,
      notasCoach: `Enfoque técnico: ${ej.nombre} (${b.enfoque})`,
      descansoPrescritoSegundos: ej.descansoSegundos,
      ejercicio: {
        id: `ej-demo-${b.bloqueId}-${ejIdx}`, nombre: ej.nombre,
        grupoMuscular: ej.grupoMuscular, activo: true, createdAtUtc: new Date().toISOString(),
      },
      series: Array.from({ length: ej.series }, (_, sIdx) => ({
        id: `s-demo-${b.bloqueId}-${ejIdx}-${sIdx}`,
        ejercicioSesionId: `es-demo-${b.bloqueId}-${ejIdx}`,
        numeroSerie: sIdx + 1,
        repsObjetivo: parseInt(ej.reps.split('-')[0], 10) || 10,
        repsLogradas: b.completado ? parseInt(ej.reps.split('-')[0], 10) || 10 : null,
        // WU3b: la prescripción vive aparte del peso real (el backend nunca pre-rellena `pesoKg`).
        pesoKg: b.completado ? ej.peso : null,
        pesoPrescritoKg: ej.peso,
        rpe: ej.rpe,
        completada: b.completado,
        descansoSegundos: ej.descansoSegundos,
      })),
    })),
    createdAtUtc: new Date().toISOString(),
    updatedAtUtc: new Date().toISOString(),
  };
}
