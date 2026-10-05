/**
 * LOTE API-2: traducción pura de un error de validación (Zod) a un mensaje claro para el usuario.
 *
 * Reglas:
 * - Se toma solo el PRIMER problema (un mensaje a la vez es más fácil de corregir).
 * - Si el contrato definió un mensaje propio y ya es claro (sin jerga), se respeta tal cual.
 * - Si no, se arma "Revisa el campo «<etiqueta>»: …" con el nombre legible del campo.
 * - Si el campo no tiene etiqueta legible, se devuelve un mensaje genérico.
 * Nunca se exponen rutas, códigos internos de Zod ni nombres técnicos de campos.
 */
import { ZodError, ZodIssue, ZodIssueCode, defaultErrorMap } from 'zod';
import { contieneJerga } from './jerga';

export const MENSAJE_VALIDACION_GENERICO = 'Revisa los datos e inténtalo de nuevo.';

/** Nombres técnicos de campos del contrato → etiqueta que entiende el usuario. */
const ETIQUETAS_CAMPO: Record<string, string> = {
  email: 'correo',
  password: 'contraseña',
  nombre: 'nombre',
  nombres: 'nombres',
  apellidos: 'apellidos',
  nombreComercial: 'nombre comercial',
  telefonoWhatsapp: 'WhatsApp',
  telefonoContacto: 'teléfono de contacto',
  fechaNacimiento: 'fecha de nacimiento',
  tipoDocumento: 'tipo de documento',
  numeroDocumento: 'número de documento',
  modalidad: 'modalidad',
  estado: 'estado',
  activo: 'estado',
  estadoLicencia: 'licencia',
  motivo: 'motivo',
  notas: 'notas',
  titulo: 'título',
  descripcion: 'descripción',
  fecha: 'fecha',
  desde: 'fecha de inicio',
  hasta: 'fecha de fin',
  fechaProgramada: 'fecha del entrenamiento',
  fechaEvaluacion: 'fecha de evaluación',
  fechaOperacion: 'fecha del pago',
  fechaInicioUtc: 'hora de inicio',
  fechaFinUtc: 'hora de fin',
  timestampCompletadaUtc: 'hora de la serie',
  peso: 'peso',
  pesoKg: 'peso',
  pesoPrescritoKg: 'peso indicado',
  pesoSugeridoKg: 'peso sugerido',
  reps: 'repeticiones',
  repsObjetivo: 'repeticiones objetivo',
  repsLogradas: 'repeticiones hechas',
  rpe: 'esfuerzo percibido (RPE)',
  descansoSegundos: 'descanso',
  grupoMuscular: 'grupo muscular',
  patronMovimiento: 'patrón de movimiento',
  videoUrl: 'enlace del video',
  nivelObjetivo: 'nivel',
  monto: 'monto',
  metodoPago: 'método de pago',
  referenciaBancaria: 'referencia bancaria',
  duracionMinutos: 'duración',
  duracionMeses: 'duración',
  beneficios: 'beneficios',
  motivoRechazo: 'motivo del rechazo',
  caloriasObjetivo: 'calorías objetivo',
  caloriasReportadas: 'calorías',
  proteinaGramosObjetivo: 'proteína objetivo',
  proteinaGramosReportada: 'proteína',
  carbohidratosGramosObjetivo: 'carbohidratos objetivo',
  grasasGramosObjetivo: 'grasas objetivo',
  aguaLitros: 'agua',
  aguaLitrosObjetivo: 'meta de agua',
  semaforo: 'semáforo',
  notasAlumno: 'notas',
  fotosPlatos: 'fotos de platos',
  tipoComida: 'tipo de comida',
  recursos: 'recursos',
  url: 'enlace',
  timezoneCliente: 'zona horaria',
  q: 'búsqueda',
  busqueda: 'búsqueda',
  coachCode: 'código del entrenador',
  capacidadMaxima: 'capacidad máxima',
};

/** Sin jerga que no deba llegar al usuario (lista única en `./jerga.ts`). */
function esMensajeClaro(mensaje: string): boolean {
  const limpio = mensaje.trim();
  return limpio.length > 0 && !contieneJerga(limpio);
}

/** `true` si el mensaje lo escribió el contrato (no es el texto por defecto de Zod, en inglés). */
function esMensajePropio(issue: ZodIssue): boolean {
  const porDefecto = defaultErrorMap(issue, { defaultError: '', data: undefined }).message;
  return issue.message !== porDefecto;
}

function etiquetaDelCampo(issue: ZodIssue): string | null {
  const campo = [...issue.path].reverse().find((segmento) => typeof segmento === 'string');
  return typeof campo === 'string' ? ETIQUETAS_CAMPO[campo] ?? null : null;
}

function plural(cantidad: number, singular: string, pluralTexto: string): string {
  return cantidad === 1 ? singular : pluralTexto;
}

function detalleDelProblema(issue: ZodIssue, etiqueta: string): string {
  const revisa = (detalle: string) => `Revisa el campo «${etiqueta}»: ${detalle}`;

  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      return issue.received === 'undefined' || issue.received === 'null'
        ? `Completa el campo «${etiqueta}».`
        : revisa('no es válido.');
    case ZodIssueCode.invalid_string:
    case ZodIssueCode.invalid_date:
      return revisa('no tiene un formato válido.');
    case ZodIssueCode.invalid_enum_value:
    case ZodIssueCode.invalid_literal:
    case ZodIssueCode.invalid_union:
      return revisa('elige una opción válida.');
    case ZodIssueCode.too_small: {
      const minimo = Number(issue.minimum);
      if (issue.type === 'string') {
        return minimo <= 1
          ? `Completa el campo «${etiqueta}».`
          : revisa(`debe tener al menos ${minimo} ${plural(minimo, 'carácter', 'caracteres')}.`);
      }
      if (issue.type === 'array' || issue.type === 'set') {
        return revisa(`agrega al menos ${minimo} ${plural(minimo, 'elemento', 'elementos')}.`);
      }
      if (issue.type === 'number' || issue.type === 'bigint') {
        return issue.inclusive
          ? revisa(`debe ser ${minimo} o más.`)
          : revisa(`debe ser mayor que ${minimo}.`);
      }
      return revisa('no es válido.');
    }
    case ZodIssueCode.too_big: {
      const maximo = Number(issue.maximum);
      if (issue.type === 'string') {
        return revisa(`no puede tener más de ${maximo} ${plural(maximo, 'carácter', 'caracteres')}.`);
      }
      if (issue.type === 'array' || issue.type === 'set') {
        return revisa(`no puede tener más de ${maximo} ${plural(maximo, 'elemento', 'elementos')}.`);
      }
      if (issue.type === 'number' || issue.type === 'bigint') {
        return issue.inclusive
          ? revisa(`debe ser ${maximo} o menos.`)
          : revisa(`debe ser menor que ${maximo}.`);
      }
      return revisa('no es válido.');
    }
    default:
      return revisa('no es válido.');
  }
}

/**
 * `true` si el error es un ZodError (de cualquier copia de Zod cargada en el proceso).
 */
export function esErrorDeValidacion(error: unknown): error is Pick<ZodError, 'issues'> {
  return (
    !!error &&
    typeof error === 'object' &&
    (error as { name?: unknown }).name === 'ZodError' &&
    Array.isArray((error as { issues?: unknown }).issues)
  );
}

/** Primer problema de validación traducido a español claro. Función pura. */
export function traducirErrorValidacion(
  error: Pick<ZodError, 'issues'> | readonly ZodIssue[]
): string {
  // Sin `instanceof`: el contrato compartido puede traer su propia copia de Zod.
  const issues: readonly ZodIssue[] = Array.isArray(error)
    ? error
    : (error as Pick<ZodError, 'issues'>).issues;
  const issue = issues[0];
  if (!issue) return MENSAJE_VALIDACION_GENERICO;

  if (esMensajePropio(issue) && esMensajeClaro(issue.message)) {
    return issue.message.trim();
  }

  const etiqueta = etiquetaDelCampo(issue);
  if (!etiqueta) return MENSAJE_VALIDACION_GENERICO;
  return detalleDelProblema(issue, etiqueta);
}
