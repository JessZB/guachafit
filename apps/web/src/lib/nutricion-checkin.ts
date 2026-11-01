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
 * Además centraliza el contrato de envío: `fecha` LOCAL en la zona horaria del perfil (nunca
 * UTC, que a partir de las 20:00 en Caracas adelantaría el día; ADR-019) y la ventana horaria RN-02
 * evaluada en esa misma zona para no encolar un reporte que la API va a rechazar.
 */
import {
  CODIGO_CHECKIN_FUERA_DE_PLAZO,
  CODIGO_CHECKIN_FUERA_DE_VENTANA,
  CheckinNutricionalSchema,
  MENSAJE_CHECKIN_FUERA_DE_PLAZO,
  MENSAJE_CHECKIN_YA_REGISTRADO,
  HORA_INICIO_VENTANA_CHECKIN_NUTRICIONAL,
  type CheckinNutricionalDetalleDTO,
  type CheckinNutricionalDTO,
  type FotoComidaInputDTO,
  type SemaforoNutricional,
} from '@guachafit/shared';
import { fechaCalendarioLocal, obtenerTimezoneDispositivo } from './date-format';
import { traducirIssuesValidacion } from './mensajes-error';
import {
  getActionableMutations,
  MAX_FOTOS_CHECKIN_NUTRICIONAL,
  MENSAJE_RANGO_FOTOS_REPORTE,
  type OutboxMutation,
} from './offline-db';
import { normalizarEntradaDecimal } from './weight-unit';
import {
  esZonaHorariaValida,
  horaDeZona,
  partesEnZona,
  ZONA_HORARIA_POR_DEFECTO,
} from './zona-horaria';

export const MENSAJE_COLA_SIN_CONEXION =
  'Sin conexión: tu reporte quedó guardado en el dispositivo y se enviará automáticamente al recuperar la señal.';

export const MENSAJE_COLA_SERVIDOR =
  'No pudimos confirmar el guardado con el servidor: tu reporte quedó en la cola y se enviará automáticamente.';

export const MENSAJE_YA_REGISTRADO_HOY = MENSAJE_CHECKIN_YA_REGISTRADO;

/**
 * RF-002 §6/RN-02: mensaje claro cuando la ventana (o el día local) cerró antes de que la cola
 * alcanzara a subir las fotos y registrar el reporte.
 */
export const MENSAJE_DIA_CERRADO_REPORTE_CON_FOTOS =
  'El día ya cerró: el reporte con fotos no pudo registrarse. Las fotos y los datos siguen guardados en tu dispositivo hasta que decidas descartarlos desde el panel de sincronización.';

/**
 * Detecta el rechazo de ventana/día local del servidor (RN-02): es el único 400 del check-in que
 * merece una explicación humana en vez del detalle crudo de la API. Se clasifica por el código
 * estable (`code`); el texto queda como respaldo para servidores anteriores sin código.
 */
export function esRechazoVentanaCheckin(detalle: string, codigo?: unknown): boolean {
  if (codigo === CODIGO_CHECKIN_FUERA_DE_VENTANA) return true;
  if (codigo === CODIGO_CHECKIN_FUERA_DE_PLAZO) return false;
  // LOTE API-N2: "ya cambió" reconoce el aviso de día cambiado de la zona del perfil.
  return /18:00|23:59|ventana|día local|ya cambió/i.test(detalle);
}

export const MENSAJE_ERROR_GENERICO =
  'No se pudo guardar tu reporte. Revisa los datos e inténtalo de nuevo.';

/** RN-02: copy de la ventana antes de las 18:00 locales (aún no se puede reportar hoy). */
export const MENSAJE_ANTES_DE_VENTANA = `El reporte se habilita a las ${HORA_INICIO_VENTANA_CHECKIN_NUTRICIONAL}:00 (hora local). Cuando abra, marca tu semáforo y guarda tu día; fuera de esa ventana el día queda como "No reportado".`;

export type AccionErrorCheckinNutricional = 'encolar' | 'refrescar' | 'mostrar_error';

export interface DecisionErrorCheckinNutricional {
  accion: AccionErrorCheckinNutricional;
  mensaje: string;
}

/**
 * LOTE API-N2: el servidor recibió el reporte después de las 12:00 del día siguiente. Es un
 * rechazo definitivo (no se reintenta) y se muestra con el texto compartido, no con el crudo.
 */
export function esRechazoFueraDePlazoCheckin(err: unknown): boolean {
  const codigo = (err as { problem?: { code?: unknown } } | null)?.problem?.code;
  return obtenerStatusError(err) === 400 && codigo === CODIGO_CHECKIN_FUERA_DE_PLAZO;
}

// =============================================================================
// HORA DE CAPTURA (LOTE API-N2)
// =============================================================================

/**
 * Segundos enteros transcurridos desde que el alumno tocó Guardar (`capturadoEnMs`) hasta el envío
 * (`ahoraMs`). Solo se usa el reloj del teléfono para medir una DURACIÓN: el servidor la resta a su
 * propia hora, así un reloj adelantado o atrasado no cambia la hora de captura. Si el reloj
 * retrocedió entre ambos instantes, se envía 0.
 */
export function calcularSegundosDesdeCaptura(
  capturadoEnMs: number,
  ahoraMs: number = Date.now()
): number {
  return Math.max(0, Math.round((ahoraMs - capturadoEnMs) / 1000));
}

/**
 * Cuerpo del POST del reporte en el MOMENTO de enviarlo (directo o desde la cola): agrega
 * `segundosDesdeCaptura`. Un pendiente del formato anterior que guardó `capturadoEnUtc` en el
 * payload se convierte a segundos (o se envía sin el campo si la hora no se puede leer); ese
 * campo nunca viaja. Sin instante de captura, el cuerpo sale tal cual (cuenta la hora del servidor).
 */
export function cuerpoCheckinParaEnviar<T extends object>(
  payload: T,
  capturadoEnMs: number | undefined,
  ahoraMs: number = Date.now()
): Omit<T, 'capturadoEnUtc'> & { segundosDesdeCaptura?: number } {
  const { capturadoEnUtc, ...resto } = payload as T & { capturadoEnUtc?: unknown };
  const cuerpo = resto as Omit<T, 'capturadoEnUtc'>;
  const capturaAnterior = typeof capturadoEnUtc === 'string' ? Date.parse(capturadoEnUtc) : NaN;
  const captura = capturadoEnMs ?? (Number.isFinite(capturaAnterior) ? capturaAnterior : undefined);
  if (captura === undefined) return cuerpo;
  return { ...cuerpo, segundosDesdeCaptura: calcularSegundosDesdeCaptura(captura, ahoraMs) };
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

  if (esRechazoFueraDePlazoCheckin(err)) {
    return { accion: 'mostrar_error', mensaje: MENSAJE_CHECKIN_FUERA_DE_PLAZO };
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
  /** Fecha local YYYY-MM-DD en la zona evaluada, la misma que viaja como `fecha`. */
  fechaLocalHoy: string;
  /** Hora local 0–23 en la zona evaluada. */
  horaLocal: number;
  motivo?: 'ANTES_DE_VENTANA';
}

/**
 * Evalúa la ventana RN-02 con la zona del PERFIL del alumno (ADR-019), la misma con la que decide
 * el servidor. Evita encolar o enviar un reporte que el servidor rechazará con 400. Sin zona válida
 * usa la del dispositivo (compatibilidad); la pantalla siempre pasa una zona resuelta con
 * `zonaPerfilEfectiva` para coincidir con el servidor.
 */
export function evaluarVentanaCheckinLocal(
  ahora: Date = new Date(),
  zonaHoraria?: string | null
): ResultadoVentanaCheckinLocal {
  const enZona = esZonaHorariaValida(zonaHoraria) ? partesEnZona(ahora, zonaHoraria) : null;
  const fechaLocalHoy = enZona ? enZona.fecha : fechaCalendarioLocal(ahora);
  const horaLocal = enZona ? enZona.hora : ahora.getHours();
  if (horaLocal < HORA_INICIO_VENTANA_CHECKIN_NUTRICIONAL) {
    return { permitido: false, fechaLocalHoy, horaLocal, motivo: 'ANTES_DE_VENTANA' };
  }
  return { permitido: true, fechaLocalHoy, horaLocal };
}

/** Ventana del reporte para mostrar en textos: "18:00 a 23:59". */
export const HORARIO_VENTANA_CHECKIN = `${HORA_INICIO_VENTANA_CHECKIN_NUTRICIONAL}:00 a 23:59`;

/**
 * Zona con la que decide el servidor: la del perfil si es válida; si falta o no es válida, la zona
 * por defecto del producto (la misma que aplica el API).
 */
export function zonaPerfilEfectiva(zonaHoraria?: string | null): string {
  return esZonaHorariaValida(zonaHoraria) ? zonaHoraria : ZONA_HORARIA_POR_DEFECTO;
}

/** Horario del reporte explicado con la zona del perfil, p. ej. "(hora de Caracas)". */
export function textoHorarioCheckin(zonaHoraria?: string | null): string {
  return `Puedes enviar tu reporte de ${HORARIO_VENTANA_CHECKIN} (${horaDeZona(zonaPerfilEfectiva(zonaHoraria))}).`;
}

/** Etiqueta del botón deshabilitado fuera de la ventana RN-02 con la zona del perfil. */
export function textoBotonFueraDeVentanaCheckin(zonaHoraria?: string | null): string {
  return `Disponible a partir de las ${HORA_INICIO_VENTANA_CHECKIN_NUTRICIONAL}:00 (${horaDeZona(zonaPerfilEfectiva(zonaHoraria))})`;
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

/** Pregunta del semáforo del día (nombre accesible del grupo). */
export const ETIQUETA_SEMAFORO = '¿Cómo te fue hoy con tu plan?';

/** Pide elegir el semáforo antes de guardar (también traduce un semáforo inválido). */
export const MENSAJE_ELIGE_SEMAFORO = 'Elige cómo te fue hoy con tu plan.';

/** RN-03: máximo de fotos alcanzado al intentar agregar otra. */
export const MENSAJE_FOTOS_MAXIMO_ALCANZADO = `Ya agregaste ${MAX_FOTOS_CHECKIN_NUTRICIONAL} fotos, el máximo del día. Quita una para cambiarla.`;

/** RN-03: se eligieron más fotos de las que caben; se conservan las primeras. */
export const MENSAJE_FOTOS_RECORTADAS = `Puedes subir hasta ${MAX_FOTOS_CHECKIN_NUTRICIONAL} fotos por día; agregamos las primeras.`;

/** Fallo del PUT de una foto a la bóveda (sin exponer el código HTTP). */
export const MENSAJE_ERROR_SUBIDA_FOTO =
  'No pudimos subir la foto. Revisa tu conexión e inténtalo de nuevo.';

/**
 * Errores de validación del cliente traducidos por campo: el texto por defecto de Zod está en
 * inglés ("Number must be less than…") y nunca debe llegar a la pantalla.
 */
const MENSAJES_VALIDACION_CHECKIN: Readonly<Record<string, string>> = {
  semaforo: MENSAJE_ELIGE_SEMAFORO,
  aguaLitros: 'Agua: escribe los litros con hasta 2 decimales, por ejemplo 2,5.',
  caloriasReportadas: 'Calorías: escribe un número entre 0 y 15000.',
  proteinaGramosReportada: 'Proteína: escribe los gramos con un número entre 0 y 1000.',
  notasAlumno: 'Notas: usa como máximo 280 caracteres.',
  fotosPlatos: MENSAJE_RANGO_FOTOS_REPORTE,
};

export interface ErroresCamposCheckinNutricional {
  [campo: string]: string | undefined;
  aguaLitros?: string;
  calorias?: string;
  proteina?: string;
}

function mensajeNoEntero(etiqueta: string): string {
  return `${etiqueta}: usa solo números enteros (sin decimales).`;
}

/**
 * Valida por separado los campos numéricos opcionales del formulario (`aguaLitros`, `calorias`,
 * `proteina`) cuando tienen contenido no vacío, devolviendo el mensaje traducido de cada campo
 * inválido para asociarlo con `aria-invalid` y `aria-describedby`.
 */
export function validarCamposOpcionalesCheckin(
  entrada: Pick<EntradaCheckinNutricional, 'aguaLitros' | 'calorias' | 'proteina'>
): ErroresCamposCheckinNutricional {
  const errores: ErroresCamposCheckinNutricional = {};

  const agua = entrada.aguaLitros === undefined ? '' : normalizarEntradaDecimal(entrada.aguaLitros);
  if (agua !== '') {
    const resAgua = CheckinNutricionalSchema.shape.aguaLitros.safeParse(agua);
    if (!resAgua.success) {
      errores.aguaLitros = MENSAJES_VALIDACION_CHECKIN.aguaLitros;
    }
  }

  const calTexto = entrada.calorias === undefined ? '' : normalizarEntradaDecimal(entrada.calorias);
  if (calTexto !== '') {
    if (!/^\d+$/.test(calTexto)) {
      errores.calorias = mensajeNoEntero('Calorías inválidas');
    } else {
      const resCal = CheckinNutricionalSchema.shape.caloriasReportadas.safeParse(Number(calTexto));
      if (!resCal.success) {
        errores.calorias = MENSAJES_VALIDACION_CHECKIN.caloriasReportadas;
      }
    }
  }

  const protTexto = entrada.proteina === undefined ? '' : normalizarEntradaDecimal(entrada.proteina);
  if (protTexto !== '') {
    if (!/^\d+$/.test(protTexto)) {
      errores.proteina = mensajeNoEntero('Proteína inválida');
    } else {
      const resProt = CheckinNutricionalSchema.shape.proteinaGramosReportada.safeParse(
        Number(protTexto)
      );
      if (!resProt.success) {
        errores.proteina = MENSAJES_VALIDACION_CHECKIN.proteinaGramosReportada;
      }
    }
  }

  return errores;
}

/** Entero opcional del formulario: vacío = sin dato; texto no entero = error visible. */
function enteroOpcional(texto: string | undefined, etiqueta: string): number | undefined {
  if (texto === undefined) return undefined;
  const normalizado = normalizarEntradaDecimal(texto);
  if (normalizado === '') return undefined;
  if (!/^\d+$/.test(normalizado)) {
    throw new Error(mensajeNoEntero(etiqueta));
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
    throw new Error(
      traducirIssuesValidacion(
        resultado.error.issues,
        MENSAJES_VALIDACION_CHECKIN,
        MENSAJE_ERROR_GENERICO
      )
    );
  }
  return resultado.data;
}

// =============================================================================
// ESTADO DEL REPORTE DE HOY (carga, rehidratación y pendiente en la cola)
// =============================================================================

export const MENSAJE_ERROR_CARGA_REPORTE_HOY =
  'No pudimos cargar tu reporte de hoy. Revisa tu conexión e inténtalo de nuevo.';

/** Fallo al consultar el reporte de hoy que NO es "todavía no hay reporte". */
export interface ErrorCargaReporte {
  mensaje: string;
  /** El dispositivo estaba sin conexión al fallar la consulta. */
  sinConexion: boolean;
}

/**
 * Error al consultar el reporte de hoy:
 * - 404/204: todavía no hay reporte; no es un error (`null`).
 * - cualquier otro fallo: mensaje claro, recordando si fue sin conexión.
 */
export function clasificarErrorCargaReporteHoy(
  err: unknown,
  isOnline: boolean
): ErrorCargaReporte | null {
  const status = obtenerStatusError(err);
  if (status === 404 || status === 204) return null;
  return { mensaje: MENSAJE_ERROR_CARGA_REPORTE_HOY, sinConexion: !isOnline };
}

/**
 * ¿Se muestra el error de carga con su Reintentar?
 * - Nunca junto a un reporte registrado.
 * - Mientras se confirma un envío, siempre: el formulario sigue bloqueado y reintentar es la salida.
 * - En el resto, solo con conexión (sin ella ya lo explica el aviso de datos sin conexión).
 */
export function debeMostrarErrorCargaReporte(
  estado: EstadoReporteNutricional,
  error: ErrorCargaReporte | null
): boolean {
  if (!error || estado === 'saved') return false;
  if (estado === 'confirmando') return true;
  return !error.sinConexion;
}

/** Valores del formulario del alumno (texto libre) rehidratados desde el reporte guardado. */
export interface ValoresFormularioCheckin {
  semaforo: SemaforoNutricional;
  aguaLitros: string;
  calorias: string;
  proteina: string;
  notas: string;
}

/** Rehidrata el formulario sin ocultar los valores 0 reportados (solo `null` queda vacío). */
export function valoresFormularioDesdeCheckin(
  checkin: Pick<
    CheckinNutricionalDetalleDTO,
    'semaforo' | 'aguaLitros' | 'caloriasReportadas' | 'proteinaGramosReportada' | 'notasAlumno'
  >
): ValoresFormularioCheckin {
  return {
    semaforo: checkin.semaforo,
    aguaLitros: checkin.aguaLitros ?? '',
    calorias: checkin.caloriasReportadas != null ? String(checkin.caloriasReportadas) : '',
    proteina:
      checkin.proteinaGramosReportada != null ? String(checkin.proteinaGramosReportada) : '',
    notas: checkin.notasAlumno ?? '',
  };
}

/**
 * Resultado de leer la cola durable: un fallo de lectura (IndexedDB) NO equivale a "no hay
 * pendiente", así que se distingue explícitamente.
 */
export type ResultadoColaReporte =
  | { tipo: 'pendiente'; fotos: number }
  | { tipo: 'vacia' }
  /** LOTE API-N1: el reporte de hoy no se envió porque el servidor ya tenía otro distinto. */
  | { tipo: 'rechazado-otros-datos' }
  | { tipo: 'error' };

/**
 * LOTE API-N1: rechazo visible cuando el servidor ya tenía el reporte del día con otros datos (o
 * no se pudo comprobar que fuera este). Los blobs locales se conservan hasta que el alumno decida.
 */
export const MENSAJE_REPORTE_CON_OTROS_DATOS =
  'Ya tenías un reporte de hoy registrado con otros datos; este no se envió.';

/** Texto opcional normalizado: ausente, `null` o vacío cuentan igual. */
function textoOpcional(valor: string | null | undefined): string | null {
  const limpio = valor?.trim();
  return limpio ? limpio : null;
}

/** Número opcional normalizado (`null`/`undefined` → `null`). */
function numeroOpcional(valor: number | null | undefined): number | null {
  return valor ?? null;
}

/** Litros como número (2.5 y "2.50" son lo mismo); ausente → `null`. */
function litrosOpcionales(valor: string | null | undefined): number | null {
  const limpio = textoOpcional(valor);
  return limpio === null ? null : Number(limpio);
}

/**
 * LOTE API-N1 (función pura): ¿el reporte que el servidor ya tiene hoy es ESTE pendiente de la
 * cola? Se usa tras un 409 "ya registrado" para distinguir un reintento cuyo éxito se perdió (los
 * datos coinciden) de un reporte distinto que nunca llegó. Compara semáforo, notas, calorías,
 * proteína, agua y cantidad de fotos.
 */
export function coincideReporteServidorConPendiente(
  servidor: Pick<
    CheckinNutricionalDetalleDTO,
    | 'semaforo'
    | 'notasAlumno'
    | 'caloriasReportadas'
    | 'proteinaGramosReportada'
    | 'aguaLitros'
    | 'fotosPlatos'
  >,
  pendiente: Partial<CheckinNutricionalDTO>,
  fotosPendiente: number
): boolean {
  return (
    servidor.semaforo === pendiente.semaforo &&
    textoOpcional(servidor.notasAlumno) === textoOpcional(pendiente.notasAlumno) &&
    numeroOpcional(servidor.caloriasReportadas) === numeroOpcional(pendiente.caloriasReportadas) &&
    numeroOpcional(servidor.proteinaGramosReportada) ===
      numeroOpcional(pendiente.proteinaGramosReportada) &&
    litrosOpcionales(servidor.aguaLitros) === litrosOpcionales(pendiente.aguaLitros) &&
    (servidor.fotosPlatos?.length ?? 0) === fotosPendiente
  );
}

export const ENDPOINT_CHECKIN_DIARIO = '/nutricion/checkin-diario';

/**
 * RF-002 §6: busca en la cola durable un reporte de `fecha` del alumno actual que todavía no
 * llegó (pendiente, enviándose o fallido con reintento automático). Sobrevive a recargas: la
 * pantalla lo consulta al montar para mostrar el pendiente y no permitir encolar un duplicado.
 * - Los rechazados quedan fuera: esperan una decisión del usuario en "Cambios por enviar".
 * - Filas de otro alumno se ignoran; las antiguas sin `alumnoId` cuentan (no hay con qué filtrarlas).
 */
export async function buscarCheckinNutricionalPendiente(
  fecha: string,
  alumnoId: string | undefined,
  leerCola: () => Promise<OutboxMutation[]> = getActionableMutations
): Promise<ResultadoColaReporte> {
  let mutaciones: OutboxMutation[];
  try {
    mutaciones = await leerCola();
  } catch {
    return { tipo: 'error' };
  }
  const delDia = (item: OutboxMutation) =>
    item.endpoint === ENDPOINT_CHECKIN_DIARIO &&
    item.payload?.fecha === fecha &&
    (!item.alumnoId || item.alumnoId === alumnoId);
  const pendiente = mutaciones.find(
    (item) =>
      delDia(item) &&
      (item.status === 'pending' || item.status === 'syncing' || item.status === 'failed')
  );
  if (pendiente) return { tipo: 'pendiente', fotos: pendiente.fotos?.length ?? 0 };
  const rechazadoOtrosDatos = mutaciones.some(
    (item) =>
      delDia(item) && item.status === 'rejected' && item.motivoRechazo === 'reporte-con-otros-datos'
  );
  return rechazadoOtrosDatos ? { tipo: 'rechazado-otros-datos' } : { tipo: 'vacia' };
}

// =============================================================================
// MÁQUINA DE ESTADOS DEL REPORTE DE HOY
// =============================================================================

/**
 * - `idle`: sin reporte; el formulario está abierto.
 * - `saved`: confirmado por el servidor; único estado de éxito.
 * - `queued`: espera en la cola del dispositivo; formulario bloqueado (sin duplicados).
 * - `confirmando`: el pendiente salió de la cola y se consulta si quedó registrado; sigue bloqueado.
 * - `error`: rechazo del envío directo; el formulario sigue abierto para corregir.
 */
export type EstadoReporteNutricional = 'idle' | 'saved' | 'queued' | 'confirmando' | 'error';

export interface EstadoReporteHoy {
  estado: EstadoReporteNutricional;
  /** Fotos que acompañan al reporte pendiente (0 = sin fotos). */
  fotosEncoladas: number;
  /** Aviso informativo que deja una transición (p. ej. el pendiente no llegó a enviarse). */
  aviso: string | null;
}

export type EventoReporteNutricional =
  /** Lectura de la cola durable (al montar, al cambiar la cola o justo después de encolar). */
  | { tipo: 'cola'; resultado: ResultadoColaReporte }
  /** Consulta del reporte de hoy al servidor. */
  | { tipo: 'carga'; resultado: 'encontrado' | 'sin-reporte' | 'error' }
  | { tipo: 'encolado'; fotos: number }
  | { tipo: 'guardado' }
  | { tipo: 'rechazado' };

export const ESTADO_REPORTE_INICIAL: EstadoReporteHoy = {
  estado: 'idle',
  fotosEncoladas: 0,
  aviso: null,
};

export const MENSAJE_REPORTE_NO_ENVIADO =
  'Tu reporte no se pudo enviar. Revisa tus cambios por enviar e inténtalo de nuevo.';

/**
 * Transición pura del estado del reporte de hoy. Devuelve el MISMO objeto cuando el evento no
 * cambia nada (así React no vuelve a renderizar).
 */
export function siguienteEstadoReporte(
  previo: EstadoReporteHoy,
  evento: EventoReporteNutricional
): EstadoReporteHoy {
  switch (evento.tipo) {
    case 'cola': {
      const { resultado } = evento;
      if (resultado.tipo === 'pendiente') {
        if (previo.estado === 'saved') return previo;
        return { estado: 'queued', fotosEncoladas: resultado.fotos, aviso: null };
      }
      if (resultado.tipo === 'vacia' && previo.estado === 'queued') {
        return { ...previo, estado: 'confirmando' };
      }
      // LOTE API-N1: el pendiente de hoy no se envió (el servidor ya tenía otro reporte). Si se
      // esperaba su envío, se consulta el del servidor; si no (pantalla recién abierta o ya
      // registrado), solo se muestra el aviso junto al reporte.
      if (resultado.tipo === 'rechazado-otros-datos') {
        if (previo.estado === 'queued' || previo.estado === 'confirmando') {
          return { estado: 'confirmando', fotosEncoladas: 0, aviso: MENSAJE_REPORTE_CON_OTROS_DATOS };
        }
        if (previo.aviso === MENSAJE_REPORTE_CON_OTROS_DATOS) return previo;
        return { ...previo, aviso: MENSAJE_REPORTE_CON_OTROS_DATOS };
      }
      // Cola ilegible: no se sabe si el pendiente salió; se conserva el estado.
      return previo;
    }
    case 'carga':
      if (evento.resultado === 'encontrado') {
        // Conserva el aviso de "este no se envió" que dejó un rechazo de hoy.
        const aviso = previo.aviso === MENSAJE_REPORTE_CON_OTROS_DATOS ? previo.aviso : null;
        return { estado: 'saved', fotosEncoladas: 0, aviso };
      }
      if (evento.resultado === 'sin-reporte' && previo.estado === 'confirmando') {
        return { estado: 'idle', fotosEncoladas: 0, aviso: MENSAJE_REPORTE_NO_ENVIADO };
      }
      return previo;
    case 'encolado':
      if (previo.estado === 'saved') return previo;
      return { estado: 'queued', fotosEncoladas: evento.fotos, aviso: null };
    case 'guardado':
      return { estado: 'saved', fotosEncoladas: 0, aviso: null };
    case 'rechazado':
      return { estado: 'error', fotosEncoladas: 0, aviso: null };
  }
}
