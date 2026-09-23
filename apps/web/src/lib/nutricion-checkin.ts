/**
 * Reglas de error al guardar el check-in nutricional diario (RF-002).
 *
 * El endpoint `POST /nutricion/checkin-diario` es de alta con unicidad diaria
 * (alumno_id, fecha): no existe endpoint de actualización. Por eso:
 * - 2xx es el ÚNICO resultado que cuenta como éxito.
 * - 409 (ya registrado hoy) se resuelve refrescando el reporte real del servidor y avisando,
 *   nunca encolando ni mostrando "Reporte registrado".
 * - Otros 4xx (400/422) son rechazos del negocio: se muestran tal cual, sin éxito ni cola.
 * - Errores de red (sin status) o 5xx conservan la cola offline legítima: el outbox reintenta.
 *
 * Además centraliza el contrato de envío: `fecha` LOCAL del dispositivo (nunca UTC, que a
 * partir de las 20:00 en Caracas adelantaría el día) + `timezoneCliente` (RN-05/ADR-002), y la
 * ventana horaria RN-02 evaluada en la misma zona para no encolar un reporte que la API va a
 * rechazar.
 */
import {
  CheckinNutricionalSchema,
  HORA_INICIO_VENTANA_CHECKIN_NUTRICIONAL,
  type CheckinNutricionalDTO,
  type FotoComidaInputDTO,
  type SemaforoNutricional,
} from '@guachafit/shared';
import { fechaCalendarioLocal, obtenerTimezoneDispositivo } from './date-format';
import { normalizarEntradaDecimal } from './weight-unit';

export const MENSAJE_COLA_SIN_CONEXION =
  'Sin conexión: tu reporte quedó guardado en el dispositivo y se enviará automáticamente al recuperar la señal.';

export const MENSAJE_COLA_SERVIDOR =
  'No pudimos confirmar el guardado con el servidor: tu reporte quedó en la cola y se enviará automáticamente.';

export const MENSAJE_YA_REGISTRADO_HOY = 'Ya registraste tu reporte de hoy.';

/**
 * RF-002 §6/RN-02: mensaje claro cuando la ventana (o el día local) cerró antes de que la cola
 * alcanzara a subir las fotos y registrar el reporte.
 */
export const MENSAJE_DIA_CERRADO_REPORTE_CON_FOTOS =
  'El día ya cerró: el reporte con fotos no pudo registrarse. Las fotos y los datos siguen guardados en tu dispositivo hasta que decidas descartarlos desde el panel de sincronización.';

/**
 * Detecta el rechazo de ventana/día local del servidor (RN-02) por su texto: es el único 400
 * del check-in que merece una explicación humana en vez del detalle crudo de la API.
 */
export function esRechazoVentanaCheckin(detalle: string): boolean {
  return /18:00|23:59|ventana|día local/i.test(detalle);
}

export const MENSAJE_ERROR_GENERICO =
  'No se pudo guardar tu reporte. Revisa los datos e inténtalo de nuevo.';

/** RN-02: copy de la ventana antes de las 18:00 locales (aún no se puede reportar hoy). */
export const MENSAJE_ANTES_DE_VENTANA = `El check-in se habilita a las ${HORA_INICIO_VENTANA_CHECKIN_NUTRICIONAL}:00 (hora local). Cuando abra, marca tu semáforo y guarda tu día; fuera de esa ventana el día queda como "No reportado".`;

export type AccionErrorCheckinNutricional = 'encolar' | 'refrescar' | 'mostrar_error';

export interface DecisionErrorCheckinNutricional {
  accion: AccionErrorCheckinNutricional;
  mensaje: string;
}

/** Status HTTP de un error tipo ApiError; 0 = sin respuesta (fallo de red/fetch). */
export function obtenerStatusError(err: unknown): number {
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : 0;
}

/**
 * Decide qué hacer ante un error de guardado del check-in nutricional.
 *
 * @param err error capturado (ApiError con `status`, Error de red, etc.).
 * @param isOnline estado de conexión observado al intentar el POST.
 */
export function decidirAccionErrorCheckinNutricional(
  err: unknown,
  isOnline: boolean
): DecisionErrorCheckinNutricional {
  if (!isOnline) {
    return { accion: 'encolar', mensaje: MENSAJE_COLA_SIN_CONEXION };
  }

  const status = obtenerStatusError(err);

  if (status === 409) {
    return { accion: 'refrescar', mensaje: MENSAJE_YA_REGISTRADO_HOY };
  }

  if (status >= 400 && status < 500) {
    const mensaje = err instanceof Error && err.message.trim().length > 0
      ? err.message
      : MENSAJE_ERROR_GENERICO;
    return { accion: 'mostrar_error', mensaje };
  }

  // Sin status (fetch caído) o 5xx: fallo no concluyente -> cola offline con reintento.
  return {
    accion: 'encolar',
    mensaje: status >= 500 ? MENSAJE_COLA_SERVIDOR : MENSAJE_COLA_SIN_CONEXION,
  };
}

// =============================================================================
// VENTANA HORARIA LOCAL (RF-002 RN-02)
// =============================================================================

export interface ResultadoVentanaCheckinLocal {
  /** `true` si el día local en curso ya entró en la ventana 18:00–23:59. */
  permitido: boolean;
  /** Fecha local YYYY-MM-DD del dispositivo, la misma que viaja como `fecha`. */
  fechaLocalHoy: string;
  /** Hora local 0–23 del dispositivo. */
  horaLocal: number;
  motivo?: 'ANTES_DE_VENTANA';
}

/**
 * Evalúa la ventana RN-02 con el reloj/zona del DISPOSITIVO, que es la misma zona que viaja en
 * `timezoneCliente`. Evita encolar o enviar un reporte que el servidor rechazará con 400.
 */
export function evaluarVentanaCheckinLocal(
  ahora: Date = new Date()
): ResultadoVentanaCheckinLocal {
  const fechaLocalHoy = fechaCalendarioLocal(ahora);
  const horaLocal = ahora.getHours();
  if (horaLocal < HORA_INICIO_VENTANA_CHECKIN_NUTRICIONAL) {
    return { permitido: false, fechaLocalHoy, horaLocal, motivo: 'ANTES_DE_VENTANA' };
  }
  return { permitido: true, fechaLocalHoy, horaLocal };
}

// =============================================================================
// CONTRATO DE ENVÍO DEL CHECK-IN
// =============================================================================

/** Valores del formulario del alumno; los numéricos llegan como texto libre. */
export interface EntradaCheckinNutricional {
  semaforo: SemaforoNutricional;
  /** Fecha local YYYY-MM-DD; por defecto, hoy en la zona del dispositivo. */
  fecha?: string;
  /** Zona IANA del cliente; por defecto, la del dispositivo. */
  timezoneCliente?: string;
  aguaLitros?: string;
  calorias?: string;
  proteina?: string;
  notas?: string;
  fotosPlatos?: FotoComidaInputDTO[];
}

/** Entero opcional del formulario: vacío = sin dato; texto no entero = error visible. */
function enteroOpcional(texto: string | undefined, etiqueta: string): number | undefined {
  if (texto === undefined) return undefined;
  const normalizado = normalizarEntradaDecimal(texto);
  if (normalizado === '') return undefined;
  if (!/^\d+$/.test(normalizado)) {
    throw new Error(`${etiqueta}: usa solo números enteros (sin decimales).`);
  }
  return Number(normalizado);
}

/**
 * Construye y valida el cuerpo del check-in contra `CheckinNutricionalSchema`.
 *
 * `fecha` y `timezoneCliente` se resuelven LOCALMENTE por defecto: enviar `fecha` en UTC hacía
 * que, entre las 20:00 y las 23:59 de Caracas, la API rechazara el día por no coincidir con su
 * día local (RN-02). Un cuerpo inválido nunca sale del cliente: se lanza el primer mensaje del
 * contrato compartido.
 */
export function construirPayloadCheckinNutricional(
  entrada: EntradaCheckinNutricional,
  ahora: Date = new Date()
): CheckinNutricionalDTO {
  const candidato: Record<string, unknown> = {
    fecha: entrada.fecha ?? fechaCalendarioLocal(ahora),
    timezoneCliente: entrada.timezoneCliente ?? obtenerTimezoneDispositivo(),
    semaforo: entrada.semaforo,
  };

  const agua = entrada.aguaLitros === undefined ? '' : normalizarEntradaDecimal(entrada.aguaLitros);
  if (agua !== '') candidato.aguaLitros = agua;

  const calorias = enteroOpcional(entrada.calorias, 'Calorías inválidas');
  if (calorias !== undefined) candidato.caloriasReportadas = calorias;

  const proteina = enteroOpcional(entrada.proteina, 'Proteína inválida');
  if (proteina !== undefined) candidato.proteinaGramosReportada = proteina;

  const notas = (entrada.notas ?? '').trim();
  if (notas !== '') candidato.notasAlumno = notas;

  if (entrada.fotosPlatos && entrada.fotosPlatos.length > 0) {
    candidato.fotosPlatos = entrada.fotosPlatos;
  }

  const resultado = CheckinNutricionalSchema.safeParse(candidato);
  if (!resultado.success) {
    throw new Error(resultado.error.issues[0]?.message ?? MENSAJE_ERROR_GENERICO);
  }
  return resultado.data;
}
