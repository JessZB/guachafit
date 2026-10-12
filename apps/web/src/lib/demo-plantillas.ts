/**
 * Fixtures demo del banco de plantillas (RF-017) para el Modo Demo del coach.
 *
 * Única fuente de verdad de los datos de ejemplo compartidos por:
 * - `PlantillasPage` (listado y operaciones locales de crear/editar/desactivar/reactivar),
 * - `SelectorPlantillaAsignacion` (picker "Cargar desde plantilla" del Expediente 360°).
 *
 * SOLO se consumen con la bandera `isDemoMode` activa. Los nombres de los ejercicios y sus
 * ids son los mismos del catálogo demo del expediente (`AlumnoDetallePage`) y de los bloques
 * demo del alumno (`EntrenamientoPage`) para mantener coherencia entre pantallas.
 */
import {
  NivelObjetivoPlantilla,
  type BloqueDiaRutinaDTO,
  type EjercicioCatalogoDetalleDTO,
  type PlantillaRutinaDTO,
  type PlantillaRutinaResumenDTO,
} from '@guachafit/shared';

/** `usuarios.id` del coach demo (paridad con `demoLogin` de `auth-context`). */
export const ENTRENADOR_ID_DEMO = '11111111-2222-3333-4444-555555555555';

const FECHA_CATALOGO_DEMO = '2026-06-01T10:00:00.000Z';

/**
 * Catálogo demo del picker de ejercicios: unión de los ejercicios usados por los fixtures
 * demo existentes (expediente y entrenamiento del alumno) para que las plantillas demo
 * puedan editarse sin ejercicios "fantasma" fuera del catálogo.
 */
export const CATALOGO_DEMO: EjercicioCatalogoDetalleDTO[] = [
  { id: '11111111-1111-4111-8111-111111111c01', nombre: 'Press Plano con Mancuernas', grupoMuscular: 'Pecho', activo: true, createdAtUtc: FECHA_CATALOGO_DEMO },
  { id: '11111111-1111-4111-8111-111111111c02', nombre: 'Press Inclinado en Multipower', grupoMuscular: 'Pecho', activo: true, createdAtUtc: FECHA_CATALOGO_DEMO },
  { id: '11111111-1111-4111-8111-111111111c03', nombre: 'Fondos en Paralelas Asistidos', grupoMuscular: 'Pecho', activo: true, createdAtUtc: FECHA_CATALOGO_DEMO },
  { id: '11111111-1111-4111-8111-111111111c04', nombre: 'Extensiones de Tríceps en Polea', grupoMuscular: 'Brazos', activo: true, createdAtUtc: FECHA_CATALOGO_DEMO },
  { id: '11111111-1111-4111-8111-111111111c05', nombre: 'Jalón al Pecho Agarre Neutro', grupoMuscular: 'Espalda', activo: true, createdAtUtc: FECHA_CATALOGO_DEMO },
  { id: '11111111-1111-4111-8111-111111111c06', nombre: 'Remo con Barra T apoyado', grupoMuscular: 'Espalda', activo: true, createdAtUtc: FECHA_CATALOGO_DEMO },
  { id: '11111111-1111-4111-8111-111111111c07', nombre: 'Prensa Inclinada 45°', grupoMuscular: 'Piernas', activo: true, createdAtUtc: FECHA_CATALOGO_DEMO },
  { id: '11111111-1111-4111-8111-111111111c08', nombre: 'Curl Femoral Tumbado', grupoMuscular: 'Piernas', activo: true, createdAtUtc: FECHA_CATALOGO_DEMO },
  { id: '11111111-1111-4111-8111-111111111c09', nombre: 'Elevaciones Laterales con Mancuerna', grupoMuscular: 'Hombros', activo: true, createdAtUtc: FECHA_CATALOGO_DEMO },
  { id: '11111111-1111-4111-8111-111111111c10', nombre: 'Plancha Abdominal Isométrica', grupoMuscular: 'Core', activo: true, createdAtUtc: FECHA_CATALOGO_DEMO },
  { id: '11111111-1111-4111-8111-111111111c11', nombre: 'Face Pulls en Polea Alta', grupoMuscular: 'Espalda', activo: true, createdAtUtc: FECHA_CATALOGO_DEMO },
  { id: '11111111-1111-4111-8111-111111111c12', nombre: 'Curl con Barra Z de Pie', grupoMuscular: 'Brazos', activo: true, createdAtUtc: FECHA_CATALOGO_DEMO },
  { id: '11111111-1111-4111-8111-111111111c13', nombre: 'Sentadilla Trasera con Barra', grupoMuscular: 'Piernas', activo: true, createdAtUtc: FECHA_CATALOGO_DEMO },
  { id: '11111111-1111-4111-8111-111111111c14', nombre: 'Elevación de Gemelos en Máquina', grupoMuscular: 'Piernas', activo: true, createdAtUtc: FECHA_CATALOGO_DEMO },
  { id: '11111111-1111-4111-8111-111111111c15', nombre: 'Peso Muerto Rumano con Mancuernas', grupoMuscular: 'Piernas', activo: true, createdAtUtc: FECHA_CATALOGO_DEMO },
  { id: '11111111-1111-4111-8111-111111111c16', nombre: 'Press Militar con Mancuernas', grupoMuscular: 'Hombros', activo: true, createdAtUtc: FECHA_CATALOGO_DEMO },
  { id: '11111111-1111-4111-8111-111111111c17', nombre: 'Extensión de Cuádriceps en Máquina', grupoMuscular: 'Piernas', activo: true, createdAtUtc: FECHA_CATALOGO_DEMO },
];

/**
 * Plantillas demo (detalle completo, con bloques) del banco del coach.
 * Las tres nacen activas: el selector de asignación filtra por `activa=true` y el filtro
 * "Activas" del banco las muestra todas. Las operaciones demo posteriores son locales.
 */
export const PLANTILLAS_DEMO: PlantillaRutinaDTO[] = [
  {
    id: '22222222-2222-4222-8222-222222222201',
    entrenadorId: ENTRENADOR_ID_DEMO,
    nombre: 'Tren Superior Hipertrofia A',
    nivelObjetivo: NivelObjetivoPlantilla.INTERMEDIO,
    activa: true,
    createdAtUtc: '2026-07-12T09:00:00.000Z',
    updatedAtUtc: '2026-09-15T18:30:00.000Z',
    bloques: [
      {
        diaId: 'd1',
        diaSugerido: 1,
        titulo: 'Día 1 (Lunes): Empuje & Pectoral / Tríceps',
        enfoque: 'Hipertrofia e Intensidad RPE 8',
        ejercicios: [
          { id: '33333333-3333-4333-8333-333333333e01', ejercicioId: '11111111-1111-4111-8111-111111111c01', nombre: 'Press Plano con Mancuernas', series: 4, reps: '8-10', peso: '28.00', rpe: '8.0', descansoSegundos: 90 },
          { id: '33333333-3333-4333-8333-333333333e02', ejercicioId: '11111111-1111-4111-8111-111111111c02', nombre: 'Press Inclinado en Multipower', series: 3, reps: '10-12', peso: '60.00', rpe: '8.5', descansoSegundos: 90 },
          { id: '33333333-3333-4333-8333-333333333e03', ejercicioId: '11111111-1111-4111-8111-111111111c03', nombre: 'Fondos en Paralelas Asistidos', series: 3, reps: '12', peso: 'Corporal', rpe: '8.0', descansoSegundos: 90 },
          { id: '33333333-3333-4333-8333-333333333e04', ejercicioId: '11111111-1111-4111-8111-111111111c04', nombre: 'Extensiones de Tríceps en Polea', series: 4, reps: '12-15', peso: '25.00', rpe: '9.0', descansoSegundos: 60 },
        ],
      },
      {
        diaId: 'd2',
        diaSugerido: 3,
        titulo: 'Día 2 (Miércoles): Tracción & Espalda / Bíceps',
        enfoque: 'Volumen y Control Escapular',
        ejercicios: [
          { id: '33333333-3333-4333-8333-333333333e05', ejercicioId: '11111111-1111-4111-8111-111111111c05', nombre: 'Jalón al Pecho Agarre Neutro', series: 4, reps: '10-12', peso: '65.00', rpe: '8.0', descansoSegundos: 90 },
          { id: '33333333-3333-4333-8333-333333333e06', ejercicioId: '11111111-1111-4111-8111-111111111c06', nombre: 'Remo con Barra T apoyado', series: 4, reps: '8-10', peso: '50.00', rpe: '8.5', descansoSegundos: 90 },
          { id: '33333333-3333-4333-8333-333333333e07', ejercicioId: '11111111-1111-4111-8111-111111111c11', nombre: 'Face Pulls en Polea Alta', series: 3, reps: '15', peso: '20.00', rpe: '7.5', descansoSegundos: 60 },
          { id: '33333333-3333-4333-8333-333333333e08', ejercicioId: '11111111-1111-4111-8111-111111111c12', nombre: 'Curl con Barra Z de Pie', series: 3, reps: '10-12', peso: '30.00', rpe: '8.5', descansoSegundos: 60 },
        ],
      },
    ],
  },
  {
    id: '22222222-2222-4222-8222-222222222202',
    entrenadorId: ENTRENADOR_ID_DEMO,
    nombre: 'Fullbody 3 Días Principiante',
    nivelObjetivo: NivelObjetivoPlantilla.PRINCIPIANTE,
    activa: true,
    createdAtUtc: '2026-08-03T10:15:00.000Z',
    updatedAtUtc: '2026-09-10T11:45:00.000Z',
    bloques: [
      {
        diaId: 'd1',
        diaSugerido: 1,
        titulo: 'Día 1 (Lunes): Full Body A',
        enfoque: 'Técnica y Adaptación Neuromuscular',
        ejercicios: [
          { id: '33333333-3333-4333-8333-333333333f01', ejercicioId: '11111111-1111-4111-8111-111111111c07', nombre: 'Prensa Inclinada 45°', series: 3, reps: '12', peso: '100.00', rpe: '7.0', descansoSegundos: 90 },
          { id: '33333333-3333-4333-8333-333333333f02', ejercicioId: '11111111-1111-4111-8111-111111111c01', nombre: 'Press Plano con Mancuernas', series: 3, reps: '10-12', peso: '20.00', rpe: '7.5', descansoSegundos: 90 },
          { id: '33333333-3333-4333-8333-333333333f03', ejercicioId: '11111111-1111-4111-8111-111111111c06', nombre: 'Remo con Barra T apoyado', series: 3, reps: '10-12', peso: '35.00', rpe: '7.5', descansoSegundos: 90 },
          { id: '33333333-3333-4333-8333-333333333f04', ejercicioId: '11111111-1111-4111-8111-111111111c10', nombre: 'Plancha Abdominal Isométrica', series: 3, reps: '40s', peso: 'Corporal', rpe: '7.0', descansoSegundos: 60 },
        ],
      },
      {
        diaId: 'd2',
        diaSugerido: 3,
        titulo: 'Día 2 (Miércoles): Full Body B',
        enfoque: 'Estabilidad y Core',
        ejercicios: [
          { id: '33333333-3333-4333-8333-333333333f05', ejercicioId: '11111111-1111-4111-8111-111111111c16', nombre: 'Press Militar con Mancuernas', series: 3, reps: '10-12', peso: '12.00', rpe: '7.0', descansoSegundos: 90 },
          { id: '33333333-3333-4333-8333-333333333f06', ejercicioId: '11111111-1111-4111-8111-111111111c05', nombre: 'Jalón al Pecho Agarre Neutro', series: 3, reps: '12', peso: '45.00', rpe: '7.5', descansoSegundos: 90 },
          { id: '33333333-3333-4333-8333-333333333f07', ejercicioId: '11111111-1111-4111-8111-111111111c08', nombre: 'Curl Femoral Tumbado', series: 3, reps: '12', peso: '30.00', rpe: '7.0', descansoSegundos: 90 },
          { id: '33333333-3333-4333-8333-333333333f08', ejercicioId: '11111111-1111-4111-8111-111111111c09', nombre: 'Elevaciones Laterales con Mancuerna', series: 3, reps: '12-15', peso: '8.00', rpe: '7.5', descansoSegundos: 60 },
        ],
      },
      {
        diaId: 'd3',
        diaSugerido: 5,
        titulo: 'Día 3 (Viernes): Full Body C',
        enfoque: 'Cadena Posterior y Acondicionamiento',
        ejercicios: [
          { id: '33333333-3333-4333-8333-333333333f09', ejercicioId: '11111111-1111-4111-8111-111111111c13', nombre: 'Sentadilla Trasera con Barra', series: 3, reps: '10', peso: '40.00', rpe: '7.5', descansoSegundos: 90 },
          { id: '33333333-3333-4333-8333-333333333f10', ejercicioId: '11111111-1111-4111-8111-111111111c15', nombre: 'Peso Muerto Rumano con Mancuernas', series: 3, reps: '10-12', peso: '20.00', rpe: '7.5', descansoSegundos: 90 },
          { id: '33333333-3333-4333-8333-333333333f11', ejercicioId: '11111111-1111-4111-8111-111111111c02', nombre: 'Press Inclinado en Multipower', series: 3, reps: '10-12', peso: '40.00', rpe: '7.5', descansoSegundos: 90 },
          { id: '33333333-3333-4333-8333-333333333f12', ejercicioId: '11111111-1111-4111-8111-111111111c14', nombre: 'Elevación de Gemelos en Máquina', series: 3, reps: '15', peso: '40.00', rpe: '7.0', descansoSegundos: 60 },
        ],
      },
    ],
  },
  {
    id: '22222222-2222-4222-8222-222222222203',
    entrenadorId: ENTRENADOR_ID_DEMO,
    nombre: 'Pierna Énfasis Isquios',
    nivelObjetivo: NivelObjetivoPlantilla.AVANZADO,
    activa: true,
    createdAtUtc: '2026-06-20T08:30:00.000Z',
    updatedAtUtc: '2026-09-18T16:20:00.000Z',
    bloques: [
      {
        diaId: 'd1',
        diaSugerido: 2,
        titulo: 'Día 1 (Martes): Isquios & Cadena Posterior',
        enfoque: 'Fuerza Excéntrica Controlada',
        ejercicios: [
          { id: '33333333-3333-4333-8333-333333333a01', ejercicioId: '11111111-1111-4111-8111-111111111c15', nombre: 'Peso Muerto Rumano con Mancuernas', series: 4, reps: '8-10', peso: '32.00', rpe: '8.5', descansoSegundos: 120 },
          { id: '33333333-3333-4333-8333-333333333a02', ejercicioId: '11111111-1111-4111-8111-111111111c08', nombre: 'Curl Femoral Tumbado', series: 4, reps: '10-12', peso: '50.00', rpe: '9.0', descansoSegundos: 90 },
          { id: '33333333-3333-4333-8333-333333333a03', ejercicioId: '11111111-1111-4111-8111-111111111c07', nombre: 'Prensa Inclinada 45°', series: 4, reps: '12', peso: '140.00', rpe: '8.0', descansoSegundos: 120 },
          { id: '33333333-3333-4333-8333-333333333a04', ejercicioId: '11111111-1111-4111-8111-111111111c14', nombre: 'Elevación de Gemelos en Máquina', series: 4, reps: '15', peso: '60.00', rpe: '8.0', descansoSegundos: 60 },
        ],
      },
      {
        diaId: 'd2',
        diaSugerido: 5,
        titulo: 'Día 2 (Viernes): Cuádriceps & Glúteo',
        enfoque: 'Rango Controlado (Cuidar Rodilla)',
        ejercicios: [
          { id: '33333333-3333-4333-8333-333333333a05', ejercicioId: '11111111-1111-4111-8111-111111111c13', nombre: 'Sentadilla Trasera con Barra', series: 4, reps: '8-10', peso: '85.00', rpe: '8.0', descansoSegundos: 120 },
          { id: '33333333-3333-4333-8333-333333333a06', ejercicioId: '11111111-1111-4111-8111-111111111c17', nombre: 'Extensión de Cuádriceps en Máquina', series: 3, reps: '15', peso: '50.00', rpe: '9.0', descansoSegundos: 60 },
          { id: '33333333-3333-4333-8333-333333333a07', ejercicioId: '11111111-1111-4111-8111-111111111c10', nombre: 'Plancha Abdominal Isométrica', series: 3, reps: '45s', peso: 'Corporal', rpe: '8.0', descansoSegundos: 60 },
        ],
      },
    ],
  },
];

/**
 * Genera un id único para altas locales del modo demo.
 * Usa `crypto.randomUUID` (UUID válido para el contrato) con fallback para contextos
 * sin `crypto` seguro (demo servida por HTTP en red local).
 */
export function generarIdDemo(): string {
  const cripto = globalThis.crypto;
  if (cripto && typeof cripto.randomUUID === 'function') {
    return cripto.randomUUID();
  }
  return `demo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Resumen (listado) derivado de un detalle: única fuente de verdad de los conteos. */
export function resumirPlantillaDemo(plantilla: PlantillaRutinaDTO): PlantillaRutinaResumenDTO {
  return {
    id: plantilla.id,
    entrenadorId: plantilla.entrenadorId,
    nombre: plantilla.nombre,
    nivelObjetivo: plantilla.nivelObjetivo,
    totalDias: plantilla.bloques.length,
    totalEjercicios: plantilla.bloques.reduce(
      (total, bloque) => total + bloque.ejercicios.length,
      0
    ),
    activa: plantilla.activa,
    createdAtUtc: plantilla.createdAtUtc,
    updatedAtUtc: plantilla.updatedAtUtc,
  };
}

/** Resúmenes de las plantillas demo (listado del banco). */
export function plantillasDemoResumen(): PlantillaRutinaResumenDTO[] {
  return PLANTILLAS_DEMO.map(resumirPlantillaDemo);
}

/** Resúmenes de las plantillas demo activas (picker de asignación: `?activa=true`). */
export function plantillasDemoActivas(): PlantillaRutinaResumenDTO[] {
  return plantillasDemoResumen().filter((plantilla) => plantilla.activa);
}

/** Detalle demo por id (editar en el banco y previsualizar en el selector). */
export function detallePlantillaDemo(id: string): PlantillaRutinaDTO | undefined {
  return PLANTILLAS_DEMO.find((plantilla) => plantilla.id === id);
}

export interface EntradaPlantillaDemo {
  /** Id existente al editar; ausente en la creación (se genera uno nuevo). */
  id?: string;
  nombre: string;
  nivelObjetivo: NivelObjetivoPlantilla;
  bloques: BloqueDiaRutinaDTO[];
  activa?: boolean;
  createdAtUtc?: string;
  /** Inyectable en tests; por defecto, el instante actual. */
  ahoraUtc?: string;
}

/**
 * Construye el detalle local de una plantilla demo para las operaciones del modo demo
 * (crear/editar sin API), con el mismo contrato `PlantillaRutinaDTO` de la respuesta real.
 */
export function crearPlantillaDemo(entrada: EntradaPlantillaDemo): PlantillaRutinaDTO {
  const ahora = entrada.ahoraUtc ?? new Date().toISOString();
  return {
    id: entrada.id ?? generarIdDemo(),
    entrenadorId: ENTRENADOR_ID_DEMO,
    nombre: entrada.nombre,
    nivelObjetivo: entrada.nivelObjetivo,
    bloques: entrada.bloques,
    activa: entrada.activa ?? true,
    createdAtUtc: entrada.createdAtUtc ?? ahora,
    updatedAtUtc: ahora,
  };
}
