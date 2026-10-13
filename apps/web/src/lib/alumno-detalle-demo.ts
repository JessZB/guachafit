/**
 * Fixtures del modo demo explícito de la ficha del alumno (solo con `isDemoMode`).
 *
 * Lógica pura extraída de `pages/entrenador/AlumnoDetallePage.tsx` (SL-1, R1).
 * Los datos de ejemplo SOLO pueden mostrarse con la bandera activa (banner global visible).
 */
import {
  EstadoAlumno,
  Modalidad,
  PeriodicidadAntropometria,
  TipoDocumento,
  type BloqueDiaRutinaDTO,
  type EjercicioCatalogoDetalleDTO,
  type PerfilAlumnoDetalleDTO,
  type PlanMembresiaDetalleDTO,
  type ResumenFinancieroAlumnoDTO,
} from '@guachafit/shared';
import { fechaCalendarioLocal, sumarDiasCalendario } from './date-format';
import { overrideDemoAlumno } from './plan-tarifa';
import { suscripcionDemoAlumno } from './suscripcion-alumno';
import type { OverridePlanDetalleDTO } from '@guachafit/shared';

/** Fixture demo del perfil del expediente (relativo a hoy para la ventana antropométrica). */
export function crearPerfilDemoAlumno(alumnoId: string): PerfilAlumnoDetalleDTO {
  return {
    id: alumnoId,
    usuarioId: 'user-demo-' + alumnoId,
    entrenadorId: 'coach-01',
    tipoDocumento: TipoDocumento.V,
    numeroDocumento: '24123456',
    nombres: 'Carlos Alberto',
    apellidos: 'Mendoza Silva',
    email: 'carlos.mendoza@email.com',
    fechaNacimiento: '1998-05-14',
    edadCalculada: 28,
    telefonoWhatsapp: '+584121234567',
    modalidad: Modalidad.PRESENCIAL,
    estadoActivacion: EstadoAlumno.ACTIVO,
    // RF-003 RN-01 (WU RF-003b): calendario demo relativo a hoy (quincenal anclado 10 días
    // atrás) para que la próxima fecha programada y la ventana tengan datos reales que ver.
    periodicidadAntropometria: PeriodicidadAntropometria.QUINCENAL,
    antropometriaInicio: sumarDiasCalendario(fechaCalendarioLocal(), -10),
    tasaFijadaOverride: null,
    fichaSaludPrivada:
      'Cirugía de rodilla en 2022. Rango controlado en prensa, evitar sentadilla libre pesada.',
    planActivoId: 'plan-presencial',
    planActivoNombre: 'Presencial Completo Sala',
    // WU-J: override de ejemplo (base $40.00 → acordado $35.00) tras la bandera demo.
    precioAcordadoOverride: '35.00',
    semaforoPago: 'al_dia',
    createdAtUtc: new Date().toISOString(),
  };
}

/** Fixture demo del catálogo de planes del coach. */
export function crearPlanesDemo(): PlanMembresiaDetalleDTO[] {
  return [
    {
      id: 'plan-presencial',
      entrenadorId: 'coach-01',
      nombre: 'Presencial Completo Sala',
      descripcion: 'Acceso a sala de pesas, plan personalizado y asesoría en directo',
      precioBaseUsd: '40.00',
      duracionMeses: 1,
      beneficios: [
        'Rutina interactiva',
        'Monitoreo diario',
        '1 Check-in antropométrico quincenal',
      ],
      activo: true,
      createdAtUtc: new Date().toISOString(),
      updatedAtUtc: new Date().toISOString(),
    },
    {
      id: 'plan-online',
      entrenadorId: 'coach-01',
      nombre: 'Asesoría Online & Nutrición',
      descripcion: 'Plan a distancia con seguimiento por video y ajustes semanales',
      precioBaseUsd: '30.00',
      duracionMeses: 1,
      beneficios: ['Rutina en App', 'Macro-tracking', 'Check-in fotográfico quincenal'],
      activo: true,
      createdAtUtc: new Date().toISOString(),
      updatedAtUtc: new Date().toISOString(),
    },
  ];
}

/** Fixture demo del resumen financiero (la página visible la resuelve el slice del fixture). */
export function crearFinanzasDemoAlumno(alumnoId: string): ResumenFinancieroAlumnoDTO {
  return {
    alumnoId,
    usuarioId: 'user-demo-' + alumnoId,
    saldoPendienteTotalUsd: '0.00',
    saldoAFavorUsd: '0.00',
    totalPagadoHistoricoUsd: '320.00',
    totalPagadoMesActualUsd: '40.00',
    // WU24b: total real de transacciones; en el fixture coincide con las listadas abajo.
    transaccionesTotal: 2,
    cuotaMesActual: {
      id: 'cuota-actual-' + alumnoId,
      periodo: '2026-09',
      montoTotalUsd: '40.00',
      montoPagadoUsd: '40.00',
      saldoPendienteUsd: '0.00',
      estado: 'al_dia',
      fechaVencimiento: '2026-09-30T23:59:59.000Z',
    },
    // WU25b: la página visible la resuelve `cargarTransacciones` con el slice del fixture.
    transacciones: [],
  };
}

/** Fixture demo del historial de transacciones de la ficha (más reciente primero). */
export function transaccionesDemoAlumno(
  alumnoId: string
): ResumenFinancieroAlumnoDTO['transacciones'] {
  return [
    {
      id: 'tx-001',
      cuotaId: 'cuota-actual-' + alumnoId,
      montoUsd: '40.00',
      montoBs: '2600.00',
      metodoPago: 'pago_movil',
      referencia: 'REF-789456',
      estado: 'aprobado',
      createdAtUtc: '2026-09-02T14:30:00.000Z',
    },
    {
      id: 'tx-000',
      cuotaId: 'cuota-anterior-' + alumnoId,
      montoUsd: '40.00',
      montoBs: undefined,
      metodoPago: 'efectivo_usd',
      referencia: 'Cobro en Sala',
      estado: 'aprobado',
      createdAtUtc: '2026-08-01T10:15:00.000Z',
    },
  ];
}

/** Fixture demo del override vigente (base $40.00 → acordado $35.00). */
export function crearOverridesDemoAlumno(): OverridePlanDetalleDTO[] {
  return [overrideDemoAlumno()];
}

/** Fixture demo de la suscripción (plan Presencial Completo Sala). */
export function crearSuscripcionDemoAlumno() {
  return suscripcionDemoAlumno(fechaCalendarioLocal(), {
    id: 'plan-presencial',
    nombre: 'Presencial Completo Sala',
    duracionMeses: 1,
  });
}

/** Fixture demo del catálogo de ejercicios. */
export function crearCatalogoDemo(): EjercicioCatalogoDetalleDTO[] {
  const ahora = new Date().toISOString();
  const fila = (
    id: string,
    nombre: string,
    grupoMuscular: string
  ): EjercicioCatalogoDetalleDTO => ({
    id,
    nombre,
    grupoMuscular,
    activo: true,
    createdAtUtc: ahora,
  });
  return [
    fila('11111111-1111-4111-8111-111111111c01', 'Press Plano con Mancuernas', 'Pecho'),
    fila('11111111-1111-4111-8111-111111111c02', 'Press Inclinado en Multipower', 'Pecho'),
    fila('11111111-1111-4111-8111-111111111c03', 'Fondos en Paralelas Asistidos', 'Pecho'),
    fila('11111111-1111-4111-8111-111111111c04', 'Extensiones de Tríceps en Polea', 'Brazos'),
    fila('11111111-1111-4111-8111-111111111c05', 'Jalón al Pecho Agarre Neutro', 'Espalda'),
    fila('11111111-1111-4111-8111-111111111c06', 'Remo con Barra T apoyado', 'Espalda'),
    fila('11111111-1111-4111-8111-111111111c07', 'Prensa Inclinada 45°', 'Piernas'),
    fila('11111111-1111-4111-8111-111111111c08', 'Curl Femoral Tumbado', 'Piernas'),
    fila('11111111-1111-4111-8111-111111111c09', 'Elevaciones Laterales con Mancuerna', 'Hombros'),
    fila('11111111-1111-4111-8111-111111111c10', 'Plancha Abdominal Isométrica', 'Core'),
  ];
}

/** Fixture demo de la rutina semanal activa (3 días). */
export function crearRutinaDemoAlumno(): BloqueDiaRutinaDTO[] {
  return [
    {
      diaId: 'd1',
      diaSugerido: 1,
      titulo: 'Día 1 (Lunes): Empuje & Pectoral / Tríceps',
      enfoque: 'Hipertrofia e Intensidad RPE 8',
      ejercicios: [
        { id: 'e1', nombre: 'Press Plano con Mancuernas', series: 4, reps: '8-10', peso: '28kg', rpe: '8.0', descansoSegundos: 90 },
        { id: 'e2', nombre: 'Press Inclinado en Multipower', series: 3, reps: '10-12', peso: '60kg', rpe: '8.5', descansoSegundos: 90 },
        { id: 'e3', nombre: 'Fondos en Paralelas Asistidos', series: 3, reps: '12', peso: 'Corporal', rpe: '8.0', descansoSegundos: 90 },
        { id: 'e4', nombre: 'Extensiones de Tríceps en Polea', series: 4, reps: '12-15', peso: '25kg', rpe: '9.0', descansoSegundos: 60 },
      ],
    },
    {
      diaId: 'd2',
      diaSugerido: 3,
      titulo: 'Día 2 (Miércoles): Tracción & Espalda / Bíceps',
      enfoque: 'Volumen y Control Escapular',
      ejercicios: [
        { id: 'e5', nombre: 'Jalón al Pecho Agarre Neutro', series: 4, reps: '10-12', peso: '65kg', rpe: '8.0', descansoSegundos: 90 },
        { id: 'e6', nombre: 'Remo con Barra T apoyado', series: 4, reps: '8-10', peso: '50kg', rpe: '8.5', descansoSegundos: 90 },
        { id: 'e7', nombre: 'Face Pulls en Polea Alta', series: 3, reps: '15', peso: '20kg', rpe: '7.5', descansoSegundos: 60 },
        { id: 'e8', nombre: 'Curl con Barra Z de Pie', series: 3, reps: '10-12', peso: '30kg', rpe: '8.5', descansoSegundos: 60 },
      ],
    },
    {
      diaId: 'd3',
      diaSugerido: 5,
      titulo: 'Día 3 (Viernes): Pierna & Enfoque Cuádriceps / Isquios',
      enfoque: 'Fuerza Controlada (Cuidar Rodilla)',
      ejercicios: [
        { id: 'e9', nombre: 'Prensa Inclinada 45°', series: 4, reps: '10-12', peso: '140kg', rpe: '8.0', descansoSegundos: 120 },
        { id: 'e10', nombre: 'Curl Femoral Tumbado', series: 4, reps: '12', peso: '45kg', rpe: '8.5', descansoSegundos: 90 },
        { id: 'e11', nombre: 'Extensión de Cuádriceps en Máquina', series: 3, reps: '15', peso: '50kg', rpe: '9.0', descansoSegundos: 60 },
        { id: 'e12', nombre: 'Elevación de Gemelos en Máquina', series: 4, reps: '15', peso: '60kg', rpe: '8.0', descansoSegundos: 60 },
      ],
    },
  ];
}
