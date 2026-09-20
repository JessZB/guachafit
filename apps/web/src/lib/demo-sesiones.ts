/**
 * Fixtures demo del historial de sesiones (WU15) para el Modo Demo del coach.
 *
 * Única fuente de verdad de las sesiones de ejemplo compartidas por:
 * - `MonitorAdherenciaPage` (modal "Actividad de {alumno}", sin llamadas API en demo),
 * - `AlumnoDetallePage` (historial de la ficha y último entrenamiento realizados).
 *
 * SOLO se consumen con la bandera `isDemoMode` activa. Los nombres e ids de ejercicios salen
 * del catálogo demo (`demo-plantillas.ts`) y los alumnos/ids (`demo-u-00X` ↔ `al-00X`) son los
 * del roster del monitor (`demo-monitor-adherencia.ts`), de modo que la sesión más reciente de
 * cada alumno coincide con su `ultimaSesionUtc`.
 *
 * Los timestamps se calculan relativos a "ahora" y cada serie lleva su marca real de
 * finalización (`timestampCompletadaUtc`), así los deltas derivados con `sesion-tiempos.ts`
 * se ven frescos en cualquier fecha. `descansoSegundos` es el valor del TEMPORIZADOR
 * configurado en pantalla, no una medición del descanso efectivo.
 */
import {
  EstadoSesion,
  MotivoOmision,
  type EjercicioSesionDetalleDTO,
  type SerieRegistroDetalleDTO,
  type SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';
import { CATALOGO_DEMO } from './demo-plantillas';

const CATALOGO_POR_ID = new Map(CATALOGO_DEMO.map((ejercicio) => [ejercicio.id, ejercicio]));

/** Segundos de cierre (vuelta a la calma, notas) tras la última marca de la sesión. */
const CIERRE_SEGUNDOS_POR_DEFECTO = 240;

/** Clave canónica del roster cuando llega un id demo desconocido (ficha con id arbitrario). */
const CLAVE_FALLBACK = 'al-001';

interface SerieDemoSpec {
  /** Reps reales del alumno; null cuando la serie quedó sin completar. */
  reps: number | null;
  repsObjetivo: number;
  pesoKg?: string;
  pesoPrescritoKg?: string;
  rpe?: string;
  /** Segundos desde el inicio de la sesión; null = sin marca real (serie no completada). */
  offsetSegundos?: number | null;
  /** WU17: segundos desde el inicio de la sesión de la marca de INICIO real de la serie. */
  inicioOffsetSegundos?: number | null;
  descansoSegundos?: number;
  completada?: boolean;
}

interface EjercicioDemoSpec {
  ejercicioId: string;
  orden: number;
  notasCoach?: string;
  descansoPrescritoSegundos?: number;
  series: SerieDemoSpec[];
}

interface SesionDemoSpec {
  id: string;
  /** `usuarios.id` demo del alumno (paridad con `crearMonitorAdherenciaDemo`). */
  alumnoId: string;
  bloqueId?: string;
  diasAtras?: number;
  horasAtras?: number;
  cierreSegundos?: number;
  estado: EstadoSesion;
  motivoOmision?: MotivoOmision | null;
  porcentajeCumplimiento: string;
  notasAlumno?: string | null;
  esDiaDescansoOriginal?: boolean;
  ejercicios: EjercicioDemoSpec[];
}

interface EntradaSerieCompletada {
  reps: number;
  /** Objetivo prescrito; por defecto, las mismas reps logradas. */
  repsObjetivo?: number;
  pesoKg: string;
  pesoPrescritoKg?: string;
  rpe: string;
  /** Segundos hasta la marca de la SIGUIENTE serie completada (define el Δ real derivado). */
  pausaHastaSiguienteSegundos?: number;
  /** Valor del temporizador de descanso configurado en pantalla para esta serie. */
  descansoSegundos?: number;
  /**
   * WU17: duración de ejecución del set (inicio → completada). Por defecto se estima del
   * volumen de reps (3 s/reps, mínimo 18 s) para que el descanso real derivado sea variado
   * y creíble: descanso = pausa − ejecución de la serie siguiente.
   */
  ejecucionSegundos?: number;
}

/** WU17: estimación por defecto de ejecución de un set (3 s/reps, mínimo 18 s). */
function ejecucionPorDefecto(reps: number): number {
  return Math.max(18, Math.round(reps * 3));
}

/** Construye series completadas consecutivas a partir de su primera marca real. */
function seriesCompletadas(
  primeraMarcaSegundos: number,
  entradas: readonly EntradaSerieCompletada[]
): SerieDemoSpec[] {
  let offset = primeraMarcaSegundos;
  return entradas.map((entrada) => {
    const ejecucion = entrada.ejecucionSegundos ?? ejecucionPorDefecto(entrada.reps);
    const serie: SerieDemoSpec = {
      reps: entrada.reps,
      repsObjetivo: entrada.repsObjetivo ?? entrada.reps,
      pesoKg: entrada.pesoKg,
      pesoPrescritoKg: entrada.pesoPrescritoKg,
      rpe: entrada.rpe,
      descansoSegundos: entrada.descansoSegundos,
      offsetSegundos: offset,
      inicioOffsetSegundos: offset - ejecucion,
      completada: true,
    };
    offset += entrada.pausaHastaSiguienteSegundos ?? 0;
    return serie;
  });
}

/** Serie planificada que el alumno no llegó a completar (sin reps, peso, RPE ni marca). */
function serieSinCompletar(repsObjetivo: number, pesoPrescritoKg?: string): SerieDemoSpec {
  return {
    reps: null,
    repsObjetivo,
    pesoPrescritoKg,
    completada: false,
    offsetSegundos: null,
    inicioOffsetSegundos: null,
  };
}

/**
 * Variante de un bloque donde el alumno dejó sin completar la última serie del último
 * ejercicio (caso típico de sesión OMITIDA por INCOMPLETO).
 */
function bloqueConFinalIncompleto(bloque: readonly EjercicioDemoSpec[]): EjercicioDemoSpec[] {
  return bloque.map((ejercicio, indiceEjercicio) => {
    const series = ejercicio.series.map((serie, indiceSerie) => {
      const esUltimaDelBloque =
        indiceEjercicio === bloque.length - 1 && indiceSerie === ejercicio.series.length - 1;
      if (!esUltimaDelBloque || serie.completada === false) return serie;
      return serieSinCompletar(serie.repsObjetivo, serie.pesoPrescritoKg);
    });
    return { ...ejercicio, series };
  });
}

// ---------------------------------------------------------------------------
// Bloques de ejemplo (reutilizados por varios alumnos para no duplicar sesiones)
// ---------------------------------------------------------------------------

/** Día de empuje: press plano, press inclinado y extensiones de tríceps. */
const BLOQUE_EMPUJE: EjercicioDemoSpec[] = [
  {
    ejercicioId: '11111111-1111-4111-8111-111111111c01',
    orden: 1,
    notasCoach: 'Baja controlada en 3 s; si la técnica falla, cierra la serie.',
    descansoPrescritoSegundos: 90,
    series: seriesCompletadas(300, [
      { reps: 12, pesoKg: '28.00', pesoPrescritoKg: '28.00', rpe: '7.5', descansoSegundos: 90, pausaHastaSiguienteSegundos: 95 },
      { reps: 10, pesoKg: '30.00', pesoPrescritoKg: '28.00', rpe: '8.0', descansoSegundos: 95, pausaHastaSiguienteSegundos: 105 },
      { reps: 9, pesoKg: '30.00', pesoPrescritoKg: '28.00', rpe: '8.5', descansoSegundos: 110, pausaHastaSiguienteSegundos: 115 },
      { reps: 8, pesoKg: '32.00', pesoPrescritoKg: '28.00', rpe: '9.0', descansoSegundos: 120 },
    ]),
  },
  {
    ejercicioId: '11111111-1111-4111-8111-111111111c02',
    orden: 2,
    notasCoach: 'Codos a 45°, sin rebote en la parte baja.',
    descansoPrescritoSegundos: 90,
    series: seriesCompletadas(950, [
      { reps: 10, pesoKg: '55.00', pesoPrescritoKg: '55.00', rpe: '8.0', descansoSegundos: 90, pausaHastaSiguienteSegundos: 95 },
      { reps: 9, pesoKg: '57.50', pesoPrescritoKg: '55.00', rpe: '8.5', descansoSegundos: 100, pausaHastaSiguienteSegundos: 110 },
      { reps: 8, pesoKg: '60.00', pesoPrescritoKg: '55.00', rpe: '9.0', descansoSegundos: 105 },
    ]),
  },
  {
    ejercicioId: '11111111-1111-4111-8111-111111111c04',
    orden: 3,
    descansoPrescritoSegundos: 60,
    series: seriesCompletadas(1450, [
      { reps: 15, pesoKg: '25.00', pesoPrescritoKg: '25.00', rpe: '8.0', descansoSegundos: 60, pausaHastaSiguienteSegundos: 100 },
      { reps: 13, pesoKg: '27.50', pesoPrescritoKg: '25.00', rpe: '8.5', descansoSegundos: 65, pausaHastaSiguienteSegundos: 110 },
      { reps: 12, pesoKg: '27.50', pesoPrescritoKg: '25.00', rpe: '9.0', descansoSegundos: 70 },
    ]),
  },
];

/** Día de tracción: jalón, remo con barra T y curl con barra Z. */
const BLOQUE_TRACCION: EjercicioDemoSpec[] = [
  {
    ejercicioId: '11111111-1111-4111-8111-111111111c05',
    orden: 1,
    notasCoach: 'Pecho arriba y control escapular; prohibido el balanceo.',
    descansoPrescritoSegundos: 90,
    series: seriesCompletadas(300, [
      { reps: 12, pesoKg: '60.00', pesoPrescritoKg: '65.00', rpe: '8.0', descansoSegundos: 90, pausaHastaSiguienteSegundos: 95 },
      { reps: 11, pesoKg: '65.00', pesoPrescritoKg: '65.00', rpe: '8.0', descansoSegundos: 95, pausaHastaSiguienteSegundos: 100 },
      { reps: 10, pesoKg: '65.00', pesoPrescritoKg: '65.00', rpe: '8.5', descansoSegundos: 100, pausaHastaSiguienteSegundos: 110 },
      { reps: 9, pesoKg: '67.50', pesoPrescritoKg: '65.00', rpe: '9.0', descansoSegundos: 110 },
    ]),
  },
  {
    ejercicioId: '11111111-1111-4111-8111-111111111c06',
    orden: 2,
    notasCoach: 'Tronco firme; tira con los codos, no con las manos.',
    descansoPrescritoSegundos: 90,
    series: seriesCompletadas(950, [
      { reps: 10, pesoKg: '45.00', pesoPrescritoKg: '50.00', rpe: '8.0', descansoSegundos: 90, pausaHastaSiguienteSegundos: 100 },
      { reps: 9, pesoKg: '50.00', pesoPrescritoKg: '50.00', rpe: '8.5', descansoSegundos: 100, pausaHastaSiguienteSegundos: 105 },
      { reps: 8, pesoKg: '50.00', pesoPrescritoKg: '50.00', rpe: '9.0', descansoSegundos: 110, pausaHastaSiguienteSegundos: 120 },
      { reps: 8, pesoKg: '52.50', pesoPrescritoKg: '50.00', rpe: '9.5', descansoSegundos: 120 },
    ]),
  },
  {
    ejercicioId: '11111111-1111-4111-8111-111111111c12',
    orden: 3,
    descansoPrescritoSegundos: 60,
    series: seriesCompletadas(1500, [
      { reps: 12, pesoKg: '25.00', pesoPrescritoKg: '30.00', rpe: '8.0', descansoSegundos: 60, pausaHastaSiguienteSegundos: 100 },
      { reps: 10, pesoKg: '27.50', pesoPrescritoKg: '30.00', rpe: '8.5', descansoSegundos: 65, pausaHastaSiguienteSegundos: 110 },
      { reps: 9, pesoKg: '27.50', pesoPrescritoKg: '30.00', rpe: '9.0', descansoSegundos: 70 },
    ]),
  },
];

/** Día de pierna: prensa, curl femoral y gemelos. */
const BLOQUE_PIERNA: EjercicioDemoSpec[] = [
  {
    ejercicioId: '11111111-1111-4111-8111-111111111c07',
    orden: 1,
    notasCoach: 'Rango controlado, sin bloquear la rodilla al final.',
    descansoPrescritoSegundos: 120,
    series: seriesCompletadas(360, [
      { reps: 12, pesoKg: '130.00', pesoPrescritoKg: '140.00', rpe: '7.5', descansoSegundos: 120, pausaHastaSiguienteSegundos: 130 },
      { reps: 11, pesoKg: '140.00', pesoPrescritoKg: '140.00', rpe: '8.0', descansoSegundos: 130, pausaHastaSiguienteSegundos: 140 },
      { reps: 10, pesoKg: '140.00', pesoPrescritoKg: '140.00', rpe: '8.5', descansoSegundos: 140, pausaHastaSiguienteSegundos: 145 },
      { reps: 9, pesoKg: '145.00', pesoPrescritoKg: '140.00', rpe: '9.0', descansoSegundos: 150 },
    ]),
  },
  {
    ejercicioId: '11111111-1111-4111-8111-111111111c08',
    orden: 2,
    descansoPrescritoSegundos: 90,
    series: seriesCompletadas(1100, [
      { reps: 12, pesoKg: '45.00', pesoPrescritoKg: '45.00', rpe: '8.0', descansoSegundos: 90, pausaHastaSiguienteSegundos: 100 },
      { reps: 11, pesoKg: '47.50', pesoPrescritoKg: '45.00', rpe: '8.5', descansoSegundos: 100, pausaHastaSiguienteSegundos: 105 },
      { reps: 10, pesoKg: '50.00', pesoPrescritoKg: '45.00', rpe: '9.0', descansoSegundos: 105 },
    ]),
  },
  {
    ejercicioId: '11111111-1111-4111-8111-111111111c14',
    orden: 3,
    descansoPrescritoSegundos: 60,
    series: seriesCompletadas(1550, [
      { reps: 15, pesoKg: '55.00', pesoPrescritoKg: '60.00', rpe: '7.5', descansoSegundos: 60, pausaHastaSiguienteSegundos: 95 },
      { reps: 14, pesoKg: '60.00', pesoPrescritoKg: '60.00', rpe: '8.0', descansoSegundos: 65, pausaHastaSiguienteSegundos: 105 },
      { reps: 13, pesoKg: '60.00', pesoPrescritoKg: '60.00', rpe: '8.5', descansoSegundos: 70, pausaHastaSiguienteSegundos: 100 },
      { reps: 12, pesoKg: '60.00', pesoPrescritoKg: '60.00', rpe: '9.0', descansoSegundos: 75 },
    ]),
  },
];

/** Full body de ejemplo: prensa, press militar y plancha (carga corporal). */
const BLOQUE_FULLBODY: EjercicioDemoSpec[] = [
  {
    ejercicioId: '11111111-1111-4111-8111-111111111c07',
    orden: 1,
    notasCoach: 'Pies al ancho de cadera; empuja con el talón completo.',
    descansoPrescritoSegundos: 90,
    series: seriesCompletadas(300, [
      { reps: 12, pesoKg: '100.00', pesoPrescritoKg: '100.00', rpe: '7.0', descansoSegundos: 90, pausaHastaSiguienteSegundos: 95 },
      { reps: 12, pesoKg: '110.00', pesoPrescritoKg: '100.00', rpe: '7.5', descansoSegundos: 95, pausaHastaSiguienteSegundos: 100 },
      { reps: 11, pesoKg: '110.00', pesoPrescritoKg: '100.00', rpe: '8.0', descansoSegundos: 100 },
    ]),
  },
  {
    ejercicioId: '11111111-1111-4111-8111-111111111c16',
    orden: 2,
    notasCoach: 'Core apretado; no arquees la zona lumbar.',
    descansoPrescritoSegundos: 90,
    series: seriesCompletadas(850, [
      { reps: 10, pesoKg: '12.00', pesoPrescritoKg: '12.00', rpe: '7.0', descansoSegundos: 90, pausaHastaSiguienteSegundos: 95 },
      { reps: 9, pesoKg: '14.00', pesoPrescritoKg: '12.00', rpe: '7.5', descansoSegundos: 95, pausaHastaSiguienteSegundos: 100 },
      { reps: 8, pesoKg: '14.00', pesoPrescritoKg: '12.00', rpe: '8.0', descansoSegundos: 100 },
    ]),
  },
  {
    ejercicioId: '11111111-1111-4111-8111-111111111c10',
    orden: 3,
    notasCoach: 'Cuerpo en línea; si pierdes la posición, termina la serie.',
    descansoPrescritoSegundos: 60,
    series: seriesCompletadas(1300, [
      { reps: 40, pesoKg: '0.00', rpe: '7.5', descansoSegundos: 60, pausaHastaSiguienteSegundos: 95 },
      { reps: 40, pesoKg: '0.00', rpe: '8.0', descansoSegundos: 65, pausaHastaSiguienteSegundos: 105 },
      { reps: 35, pesoKg: '0.00', rpe: '8.5', descansoSegundos: 70 },
    ]),
  },
];

// ---------------------------------------------------------------------------
// Roster demo: sesiones por alumno (ordenadas de la más reciente a la más antigua)
// ---------------------------------------------------------------------------

const ROSTER_SESIONES_DEMO: Record<string, SesionDemoSpec[]> = {
  // VERDE 4/4, racha 12: tres sesiones completas de la semana en curso.
  'al-001': [
    {
      id: 'sesion-demo-al-001-01',
      alumnoId: 'demo-u-001',
      bloqueId: 'd1',
      diasAtras: 0,
      horasAtras: 5,
      estado: EstadoSesion.COMPLETADA,
      porcentajeCumplimiento: '100.00',
      notasAlumno:
        '[RPE: 8.0/10] • [Molestia: Ninguna] • Buen bombeo en pecho; subí 2 kg en press plano.',
      ejercicios: BLOQUE_EMPUJE,
    },
    {
      id: 'sesion-demo-al-001-02',
      alumnoId: 'demo-u-001',
      bloqueId: 'd2',
      diasAtras: 2,
      horasAtras: 3,
      estado: EstadoSesion.COMPLETADA,
      porcentajeCumplimiento: '100.00',
      notasAlumno:
        '[RPE: 7.5/10] • [Molestia: Leve tirón en antebrazo] • Bajé carga en curl por precaución.',
      ejercicios: BLOQUE_TRACCION,
    },
    {
      id: 'sesion-demo-al-001-03',
      alumnoId: 'demo-u-001',
      bloqueId: 'd3',
      diasAtras: 4,
      horasAtras: 2,
      estado: EstadoSesion.COMPLETADA,
      porcentajeCumplimiento: '100.00',
      notasAlumno: null,
      ejercicios: BLOQUE_PIERNA,
    },
  ],
  // AMARILLO 2/3: un día completado y un descanso planificado (sesión sin series).
  'al-002': [
    {
      id: 'sesion-demo-al-002-01',
      alumnoId: 'demo-u-002',
      bloqueId: 'd1',
      diasAtras: 2,
      estado: EstadoSesion.COMPLETADA,
      porcentajeCumplimiento: '100.00',
      notasAlumno: '[RPE: 7.0/10] • [Molestia: Ninguna] • Sesión corta, me quedé sin tiempo para el core.',
      ejercicios: BLOQUE_EMPUJE,
    },
    {
      id: 'sesion-demo-al-002-02',
      alumnoId: 'demo-u-002',
      bloqueId: 'd4',
      diasAtras: 4,
      horasAtras: 3,
      estado: EstadoSesion.OMITIDA,
      motivoOmision: MotivoOmision.DESCANSO,
      esDiaDescansoOriginal: true,
      porcentajeCumplimiento: '0.00',
      notasAlumno: '[Descanso: Planificado] • Caminata de 20 min y movilidad de cadera.',
      ejercicios: [],
    },
  ],
  // ROJO 0/3 y 9 días inactivo: intento incompleto (paró en el tercer ejercicio) + sesión previa.
  'al-003': [
    {
      id: 'sesion-demo-al-003-01',
      alumnoId: 'demo-u-003',
      bloqueId: 'd2',
      diasAtras: 9,
      estado: EstadoSesion.OMITIDA,
      motivoOmision: MotivoOmision.INCOMPLETO,
      porcentajeCumplimiento: '62.50',
      notasAlumno: '[RPE: 6.0/10] • [Molestia: Dolor de hombro] • Paré el curl por molestia.',
      ejercicios: bloqueConFinalIncompleto(BLOQUE_TRACCION),
    },
    {
      id: 'sesion-demo-al-003-02',
      alumnoId: 'demo-u-003',
      bloqueId: 'd3',
      diasAtras: 12,
      horasAtras: 5,
      estado: EstadoSesion.COMPLETADA,
      porcentajeCumplimiento: '100.00',
      notasAlumno: null,
      ejercicios: BLOQUE_PIERNA,
    },
  ],
  // ROJO 1/4: completó un bloque y dejó otro a medias.
  'al-004': [
    {
      id: 'sesion-demo-al-004-01',
      alumnoId: 'demo-u-004',
      bloqueId: 'd1',
      diasAtras: 5,
      estado: EstadoSesion.COMPLETADA,
      porcentajeCumplimiento: '100.00',
      notasAlumno: '[RPE: 8.5/10] • [Molestia: Ninguna] • Me costó la última serie de prensa.',
      ejercicios: BLOQUE_EMPUJE,
    },
    {
      id: 'sesion-demo-al-004-02',
      alumnoId: 'demo-u-004',
      bloqueId: 'd3',
      diasAtras: 7,
      horasAtras: 4,
      estado: EstadoSesion.OMITIDA,
      motivoOmision: MotivoOmision.INCOMPLETO,
      porcentajeCumplimiento: '70.00',
      notasAlumno: '[RPE: 8.0/10] • [Molestia: Ninguna] • Me quedé sin tiempo en gemelos.',
      ejercicios: bloqueConFinalIncompleto(BLOQUE_PIERNA),
    },
  ],
  // Sin plan activo (14 días inactivo): dos sesiones antiguas completas.
  'al-005': [
    {
      id: 'sesion-demo-al-005-01',
      alumnoId: 'demo-u-005',
      bloqueId: 'd4',
      diasAtras: 14,
      estado: EstadoSesion.COMPLETADA,
      porcentajeCumplimiento: '100.00',
      notasAlumno: '[RPE: 7.5/10] • [Molestia: Ninguna] • Última sesión antes del parón.',
      ejercicios: BLOQUE_FULLBODY,
    },
    {
      id: 'sesion-demo-al-005-02',
      alumnoId: 'demo-u-005',
      bloqueId: 'd1',
      diasAtras: 19,
      horasAtras: 6,
      estado: EstadoSesion.COMPLETADA,
      porcentajeCumplimiento: '100.00',
      notasAlumno: null,
      ejercicios: BLOQUE_EMPUJE,
    },
  ],
  // Plan activo sin pendientes aún: una sesión completa la semana pasada.
  'al-006': [
    {
      id: 'sesion-demo-al-006-01',
      alumnoId: 'demo-u-006',
      bloqueId: 'd3',
      diasAtras: 8,
      estado: EstadoSesion.COMPLETADA,
      porcentajeCumplimiento: '100.00',
      notasAlumno: '[RPE: 7.0/10] • [Molestia: Ninguna] • Todo en orden.',
      ejercicios: BLOQUE_PIERNA,
    },
    {
      id: 'sesion-demo-al-006-02',
      alumnoId: 'demo-u-006',
      bloqueId: 'd1',
      diasAtras: 12,
      horasAtras: 4,
      estado: EstadoSesion.COMPLETADA,
      porcentajeCumplimiento: '100.00',
      notasAlumno: null,
      ejercicios: BLOQUE_EMPUJE,
    },
  ],
  // AMARILLO 3/5: dos sesiones completas recientes.
  'al-007': [
    {
      id: 'sesion-demo-al-007-01',
      alumnoId: 'demo-u-007',
      bloqueId: 'd1',
      diasAtras: 3,
      estado: EstadoSesion.COMPLETADA,
      porcentajeCumplimiento: '100.00',
      notasAlumno: '[RPE: 8.0/10] • [Molestia: Leve molestia lumbar] • Cuidé la técnica en remo.',
      ejercicios: BLOQUE_EMPUJE,
    },
    {
      id: 'sesion-demo-al-007-02',
      alumnoId: 'demo-u-007',
      bloqueId: 'd2',
      diasAtras: 5,
      horasAtras: 4,
      estado: EstadoSesion.COMPLETADA,
      porcentajeCumplimiento: '100.00',
      notasAlumno: null,
      ejercicios: BLOQUE_TRACCION,
    },
  ],
  // VERDE 3/3: sesión de ayer y otra de hace tres días.
  'al-008': [
    {
      id: 'sesion-demo-al-008-01',
      alumnoId: 'demo-u-008',
      bloqueId: 'd3',
      diasAtras: 1,
      estado: EstadoSesion.COMPLETADA,
      porcentajeCumplimiento: '100.00',
      notasAlumno: '[RPE: 7.5/10] • [Molestia: Ninguna] • Buena sesión.',
      ejercicios: BLOQUE_PIERNA,
    },
    {
      id: 'sesion-demo-al-008-02',
      alumnoId: 'demo-u-008',
      bloqueId: 'd1',
      diasAtras: 3,
      horasAtras: 7,
      estado: EstadoSesion.COMPLETADA,
      porcentajeCumplimiento: '100.00',
      notasAlumno: null,
      ejercicios: BLOQUE_EMPUJE,
    },
  ],
};

// ---------------------------------------------------------------------------
// Construcción del DTO
// ---------------------------------------------------------------------------

/** Fecha calendario local 'YYYY-MM-DD' (sin desfase de zona horaria). */
function fechaCalendarioLocal(fecha: Date): string {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

/** Volumen real acumulado (kg × reps) de las series con peso y reps registrados. */
function calcularVolumenKg(ejercicios: readonly EjercicioSesionDetalleDTO[]): string {
  const total = ejercicios.reduce(
    (acumulado, ejercicio) =>
      acumulado +
      ejercicio.series.reduce((sumaSerie, serie) => {
        const peso = Number(serie.pesoKg ?? 0);
        const reps = serie.repsLogradas ?? 0;
        return Number.isFinite(peso) ? sumaSerie + peso * reps : sumaSerie;
      }, 0),
    0
  );
  return total.toFixed(2);
}

/** Normaliza `al-00X` (perfiles_alumno.id) o `demo-u-00X` (usuarios.id) a la clave canónica. */
function clavePerfilDemo(alumnoId: string): string | null {
  const limpio = alumnoId.trim();
  if (/^al-00[1-8]$/.test(limpio)) return limpio;
  const coincidencia = /^demo-u-00([1-8])$/.exec(limpio);
  return coincidencia ? `al-00${coincidencia[1]}` : null;
}

function construirSesionDemo(spec: SesionDemoSpec, ahora: Date): SesionEntrenamientoDetalleDTO {
  const dias = spec.diasAtras ?? 0;
  const horas = spec.horasAtras ?? 0;
  const inicioMs = ahora.getTime() - (dias * 24 + horas) * 60 * 60 * 1000;
  const inicio = new Date(inicioMs);
  const isoEnOffset = (segundos: number) => new Date(inicioMs + segundos * 1000).toISOString();

  const ejercicios: EjercicioSesionDetalleDTO[] = spec.ejercicios.map((ejercicio) => {
    const idEjercicio = `${spec.id}-e${ejercicio.orden}`;
    const series: SerieRegistroDetalleDTO[] = ejercicio.series.map((serie, indice) => {
      const completada = serie.completada !== false;
      return {
        id: `${idEjercicio}-s${indice + 1}`,
        ejercicioSesionId: idEjercicio,
        numeroSerie: indice + 1,
        repsObjetivo: serie.repsObjetivo,
        repsLogradas: completada ? serie.reps : null,
        pesoKg: completada ? serie.pesoKg ?? null : null,
        pesoPrescritoKg: serie.pesoPrescritoKg ?? null,
        rpe: completada ? serie.rpe ?? null : null,
        descansoSegundos: serie.descansoSegundos ?? null,
        timestampInicioUtc:
          completada && serie.inicioOffsetSegundos != null
            ? isoEnOffset(serie.inicioOffsetSegundos)
            : null,
        completada,
        timestampCompletadaUtc:
          completada && serie.offsetSegundos != null ? isoEnOffset(serie.offsetSegundos) : null,
      };
    });
    return {
      id: idEjercicio,
      sesionId: spec.id,
      ejercicioId: ejercicio.ejercicioId,
      orden: ejercicio.orden,
      notasCoach: ejercicio.notasCoach ?? null,
      descansoPrescritoSegundos: ejercicio.descansoPrescritoSegundos ?? null,
      ejercicio: CATALOGO_POR_ID.get(ejercicio.ejercicioId),
      series,
    };
  });

  const marcasMs = ejercicios
    .flatMap((ejercicio) => ejercicio.series)
    .map((serie) => (serie.timestampCompletadaUtc ? new Date(serie.timestampCompletadaUtc).getTime() : null))
    .filter((ms): ms is number => ms !== null);
  const ultimaMarcaMs = marcasMs.length > 0 ? Math.max(...marcasMs) : null;
  const cierreMs = (spec.cierreSegundos ?? CIERRE_SEGUNDOS_POR_DEFECTO) * 1000;
  const finMs = ultimaMarcaMs !== null ? ultimaMarcaMs + cierreMs : null;

  return {
    id: spec.id,
    alumnoId: spec.alumnoId,
    rutinaId: null,
    bloqueId: spec.bloqueId ?? null,
    esDiaDescansoOriginal: spec.esDiaDescansoOriginal ?? false,
    fechaProgramada: fechaCalendarioLocal(inicio),
    fechaInicioUtc: finMs !== null ? inicio.toISOString() : null,
    fechaFinUtc: finMs !== null ? new Date(finMs).toISOString() : null,
    timezoneCliente: 'America/Caracas',
    estado: spec.estado,
    motivoOmision: spec.motivoOmision ?? null,
    porcentajeCumplimiento: spec.porcentajeCumplimiento,
    volumenTotalKg: calcularVolumenKg(ejercicios),
    notasAlumno: spec.notasAlumno ?? null,
    ejercicios,
    duracionMinutos: finMs !== null ? Math.round((finMs - inicioMs) / 60000) : null,
    cumpleReglaRacha:
      spec.estado === EstadoSesion.COMPLETADA && Number(spec.porcentajeCumplimiento) >= 70,
    createdAtUtc: inicio.toISOString(),
    updatedAtUtc: finMs !== null ? new Date(finMs).toISOString() : inicio.toISOString(),
  };
}

/**
 * Historial demo de un alumno, de la sesión más reciente a la más antigua.
 * Acepta `al-00X` (perfil) o `demo-u-00X` (usuario); un id desconocido cae al roster de
 * `al-001` para que la ficha demo (que hidrata un perfil de ejemplo para cualquier id)
 * siempre tenga contenido.
 */
export function sesionesDemoAlumno(
  alumnoId: string,
  ahora: Date = new Date()
): SesionEntrenamientoDetalleDTO[] {
  const clave = clavePerfilDemo(alumnoId) ?? CLAVE_FALLBACK;
  const specs = ROSTER_SESIONES_DEMO[clave] ?? ROSTER_SESIONES_DEMO[CLAVE_FALLBACK];
  return specs.map((spec) => construirSesionDemo(spec, ahora));
}
