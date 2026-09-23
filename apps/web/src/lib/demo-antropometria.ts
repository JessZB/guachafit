/**
 * WU RF-003b: fixtures demo del módulo antropométrico (alumno y coach).
 *
 * SOLO se consumen con la bandera `isDemoMode` activa (ADR-012). Todo dato sintético vive aquí:
 *
 * - **Alumno**: tres escenarios conmutables (remoto en ventana, remoto fuera de ventana y
 *   presencial de solo lectura) que ejercitan la UI sin red. El calendario se ancla relativo a
 *   "hoy" (`fechaCalendarioLocal`) para que la ventana tenga el estado esperado en cualquier fecha.
 * - **Coach**: cola de pendientes con fotos sintéticas (marca DEMO) y el modelo RN-02 completo
 *   para poder auditar valores y fotos antes de aprobar o rechazar con motivo.
 */
import {
  AnguloFoto,
  EstadoMedicion,
  Modalidad,
  OrigenAntropometria,
  PeriodicidadAntropometria,
  type ControlAntropometricoDetalleDTO,
} from '@guachafit/shared';
import { fechaCalendarioLocal, sumarDiasCalendario } from './date-format';
import { crearFotoDemoAntropometria } from './demo-evolucion';

/** Escenarios demo del alumno que ejercitan RN-03 (solo lectura) y RN-04 (ventana). */
export type EscenarioDemoAntropometria = 'remoto-ventana' | 'remoto-fuera' | 'presencial';

export const ESCENARIOS_DEMO_ANTROPOMETRIA: EscenarioDemoAntropometria[] = [
  'remoto-ventana',
  'remoto-fuera',
  'presencial',
];

export const ETIQUETAS_ESCENARIO_DEMO_ANTROPOMETRIA: Record<EscenarioDemoAntropometria, string> = {
  'remoto-ventana': 'Remoto en ventana',
  'remoto-fuera': 'Remoto fuera de ventana',
  presencial: 'Presencial (solo lectura)',
};

/** Contexto antropométrico efectivo del alumno demo (modalidad + calendario). */
export interface ContextoDemoAntropometria {
  modalidad: Modalidad;
  periodicidadAntropometria: PeriodicidadAntropometria | null;
  antropometriaInicio: string | null;
}

/**
 * Contexto del escenario demo en el día local de `ahora`:
 *
 * - `remoto-ventana`: quincenal anclado HOY ⇒ hoy es la fecha programada `D` y la ventana está
 *   abierta (cubre `D-1` y `D`).
 * - `remoto-fuera`: quincenal anclado 5 días atrás ⇒ la ventana de esa fecha ya cerró y la
 *   próxima abre en 9 días.
 * - `presencial`: modalidad presencial (RN-03: formulario en solo lectura); el calendario queda
 *   sin configurar porque las medidas las registra el entrenador en sala.
 */
export function contextoDemoAntropometria(
  escenario: EscenarioDemoAntropometria,
  ahora: Date = new Date()
): ContextoDemoAntropometria {
  const hoy = fechaCalendarioLocal(ahora);
  switch (escenario) {
    case 'remoto-fuera':
      return {
        modalidad: Modalidad.REMOTO,
        periodicidadAntropometria: PeriodicidadAntropometria.QUINCENAL,
        antropometriaInicio: sumarDiasCalendario(hoy, -5),
      };
    case 'presencial':
      return {
        modalidad: Modalidad.PRESENCIAL,
        periodicidadAntropometria: null,
        antropometriaInicio: null,
      };
    case 'remoto-ventana':
    default:
      return {
        modalidad: Modalidad.REMOTO,
        periodicidadAntropometria: PeriodicidadAntropometria.QUINCENAL,
        antropometriaInicio: hoy,
      };
  }
}

/**
 * Cola demo de evaluaciones pendientes del coach, con fotos sintéticas para poder auditarlas.
 *
 * El primer control usa el modelo RN-02 completo (brazos, muslo medio y pliegues) y 3 ángulos; el
 * segundo solo trae perímetros clásicos y una foto frontal, para ver ambos casos en la bandeja.
 */
export function crearPendientesDemoAntropometria(
  ahora: Date = new Date()
): ControlAntropometricoDetalleDTO[] {
  const hoy = fechaCalendarioLocal(ahora);
  const haceDosDias = sumarDiasCalendario(hoy, -2);
  const haceCincoDias = sumarDiasCalendario(hoy, -5);
  const creado = ahora.toISOString();

  return [
    {
      id: 'ctrl-demo-p1',
      alumnoId: 'al-demo-002',
      alumnoNombre: 'Mariana Pérez Gómez',
      fechaEvaluacion: haceDosDias,
      pesoKg: '68.20',
      alturaCm: '165.00',
      porcentajeGrasa: '21.50',
      perimetros: {
        cinturaCm: '72.00',
        caderaCm: '98.00',
        brazoRelajadoCm: '29.50',
        brazoContraidoCm: '32.10',
        musloMedioCm: '55.00',
        brazoCm: '29.50',
        musloCm: '55.00',
      },
      pliegues: {
        tricepsMm: '18.40',
        subescapularMm: '16.20',
        suprailiacoMm: '14.80',
        abdominalMm: '21.00',
      },
      modalidad: Modalidad.REMOTO,
      origen: OrigenAntropometria.REMOTO_AUTOREPORTE,
      registradoPor: 'al-demo-002',
      estado: EstadoMedicion.PENDIENTE_APROBACION,
      fotos: [
        crearFotoDemoAntropometria('ctrl-demo-p1', haceDosDias, AnguloFoto.FRONTAL, false, creado),
        crearFotoDemoAntropometria('ctrl-demo-p1', haceDosDias, AnguloFoto.LATERAL, false, creado),
        crearFotoDemoAntropometria('ctrl-demo-p1', haceDosDias, AnguloFoto.POSTERIOR, true, creado),
      ],
      createdAtUtc: creado,
      updatedAtUtc: creado,
    },
    {
      id: 'ctrl-demo-p2',
      alumnoId: 'al-demo-005',
      alumnoNombre: 'Luis Fernando Rojas',
      fechaEvaluacion: haceCincoDias,
      pesoKg: '82.40',
      porcentajeGrasa: '18.90',
      perimetros: { cinturaCm: '88.00', brazoCm: '35.20' },
      modalidad: Modalidad.REMOTO,
      origen: OrigenAntropometria.REMOTO_AUTOREPORTE,
      registradoPor: 'al-demo-005',
      estado: EstadoMedicion.PENDIENTE_APROBACION,
      fotos: [
        crearFotoDemoAntropometria('ctrl-demo-p2', haceCincoDias, AnguloFoto.FRONTAL, false, creado),
      ],
      createdAtUtc: creado,
      updatedAtUtc: creado,
    },
  ];
}
