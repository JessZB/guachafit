/**
 * Contrato de check-in antropométrico desde la web (RF-003).
 *
 * El endpoint real es `POST /antropometria/checkin` (roles ENTRENADOR y ALUMNO) y exige
 * `alumnoId` (usuarioId del alumno: el service busca `perfiles_alumno.usuario_id`) y
 * `fechaEvaluacion` (YYYY-MM-DD). Este módulo centraliza la construcción y validación del
 * payload contra `CheckinAntropometricoSchema` para que ni la página del alumno ni la del
 * coach puedan enviar un cuerpo que la API rechace con 400.
 *
 * RF-003 RN-02 (WU RF-003a/b): el modelo completo incluye brazo relajado/contraído, muslo medio y
 * los 4 pliegues cutáneos. `brazoCm`/`musloCm` se mantienen como ALIAS LEGADOS (el servidor les da
 * precedencia al modelo nuevo); aquí se envían tal cual si el formulario los usa.
 *
 * Fotos: el contrato admite `fotos: [{ angulo, storageKey }]` obtenidas vía
 * `POST /antropometria/presigned-upload-url`, pero la UX de captura/subida todavía no existe
 * en estas páginas: se omite `fotos` en lugar de inventar una subida o mandar un array vacío
 * que sugiera un contrato inexistente.
 */
import {
  CheckinAntropometricoSchema,
  type CheckinAntropometricoDTO,
  type EvolucionCorporalDTO,
} from '@guachafit/shared';
import { normalizarEntradaDecimal } from './weight-unit';
import { fechaCalendarioLocal } from './date-format';

/** Medidas tal como las escribe el usuario en los formularios (texto libre). */
export interface MedidasCheckinAntropometrico {
  pesoKg: string;
  porcentajeGrasa?: string;
  cuelloCm?: string;
  pechoCm?: string;
  cinturaCm?: string;
  caderaCm?: string;
  /** Alias legado del brazo relajado (contratos previos al WU RF-003a). */
  brazoCm?: string;
  /** Alias legado del muslo medio (contratos previos al WU RF-003a). */
  musloCm?: string;
  /** RN-02: brazo relajado (dato nuevo). */
  brazoRelajadoCm?: string;
  /** RN-02: brazo contraído (independiente del relajado). */
  brazoContraidoCm?: string;
  /** RN-02: muslo medio (dato nuevo). */
  musloMedioCm?: string;
  /** RN-02: pliegues cutáneos en mm (alternativa/complemento del % de grasa). */
  tricepsMm?: string;
  subescapularMm?: string;
  suprailiacoMm?: string;
  abdominalMm?: string;
  observacionesCoach?: string;
}

/** Campos del contrato que la validación inline puede reportar. */
export type CampoMedidaCheckinAntropometrico =
  | 'alumnoId'
  | 'fechaEvaluacion'
  | 'pesoKg'
  | 'porcentajeGrasa'
  | 'cuelloCm'
  | 'pechoCm'
  | 'cinturaCm'
  | 'caderaCm'
  | 'brazoCm'
  | 'musloCm'
  | 'brazoRelajadoCm'
  | 'brazoContraidoCm'
  | 'musloMedioCm'
  | 'tricepsMm'
  | 'subescapularMm'
  | 'suprailiacoMm'
  | 'abdominalMm';

/**
 * Fecha de calendario LOCAL (no UTC) en formato YYYY-MM-DD. Usar `toISOString()` desplazaría
 * el día en zonas como America/Caracas (UTC-4) durante la tarde/noche.
 *
 * `fechaCalendarioLocal` (date-format) es la única implementación; este alias conserva el
 * nombre histórico que ya consumen los formularios de antropometría (RF-003).
 */
export function fechaLocalHoy(ahora: Date = new Date()): string {
  return fechaCalendarioLocal(ahora);
}

function textoOpcional(valor?: string): string | undefined {
  if (valor === undefined || valor === null) return undefined;
  const normalizado = normalizarEntradaDecimal(valor);
  return normalizado === '' ? undefined : normalizado;
}

/**
 * Candidato del contrato (sin validar): solo incluye las claves realmente escritas para no
 * inventar un contrato que el formulario no llenó.
 */
function construirCandidato(
  alumnoId: string,
  medidas: MedidasCheckinAntropometrico,
  fechaEvaluacion: string
): Record<string, unknown> {
  const perimetros = {
    cuelloCm: textoOpcional(medidas.cuelloCm),
    pechoCm: textoOpcional(medidas.pechoCm),
    cinturaCm: textoOpcional(medidas.cinturaCm),
    caderaCm: textoOpcional(medidas.caderaCm),
    brazoRelajadoCm: textoOpcional(medidas.brazoRelajadoCm),
    brazoContraidoCm: textoOpcional(medidas.brazoContraidoCm),
    musloMedioCm: textoOpcional(medidas.musloMedioCm),
    brazoCm: textoOpcional(medidas.brazoCm),
    musloCm: textoOpcional(medidas.musloCm),
  };
  const perimetrosDefinidos = Object.fromEntries(
    Object.entries(perimetros).filter(([, valor]) => valor !== undefined)
  );

  const pliegues = {
    tricepsMm: textoOpcional(medidas.tricepsMm),
    subescapularMm: textoOpcional(medidas.subescapularMm),
    suprailiacoMm: textoOpcional(medidas.suprailiacoMm),
    abdominalMm: textoOpcional(medidas.abdominalMm),
  };
  const plieguesDefinidos = Object.fromEntries(
    Object.entries(pliegues).filter(([, valor]) => valor !== undefined)
  );

  const candidato: Record<string, unknown> = {
    alumnoId,
    fechaEvaluacion,
    pesoKg: textoOpcional(medidas.pesoKg) ?? '',
  };

  const porcentajeGrasa = textoOpcional(medidas.porcentajeGrasa);
  if (porcentajeGrasa !== undefined) candidato.porcentajeGrasa = porcentajeGrasa;
  if (Object.keys(perimetrosDefinidos).length > 0) candidato.perimetros = perimetrosDefinidos;
  if (Object.keys(plieguesDefinidos).length > 0) candidato.pliegues = plieguesDefinidos;

  const observaciones = medidas.observacionesCoach?.trim();
  if (observaciones) candidato.observacionesCoach = observaciones;

  return candidato;
}

/** Último segmento del path de un issue de Zod (el nombre del campo visible). */
function campoDeIssue(path: readonly (string | number)[]): string | null {
  const ultimo = path[path.length - 1];
  return typeof ultimo === 'string' ? ultimo : null;
}

/**
 * Validación inline por campo contra el contrato compartido.
 *
 * Devuelve el primer mensaje de error por campo (`pesoKg`, `cinturaCm`, `tricepsMm`, …) para que el
 * formulario pueda señalarlo debajo del input sin esperar al 400 del servidor. Un campo ausente o
 * vacío nunca genera error (todos los perímetros/pliegues son opcionales; el peso lo exige el
 * contrato y su mensaje se muestra al intentar enviar).
 */
export function validarMedidasCheckinAntropometrico(
  alumnoId: string,
  medidas: MedidasCheckinAntropometrico,
  fechaEvaluacion: string = fechaLocalHoy()
): Partial<Record<CampoMedidaCheckinAntropometrico, string>> {
  const resultado = CheckinAntropometricoSchema.safeParse(
    construirCandidato(alumnoId, medidas, fechaEvaluacion)
  );
  if (resultado.success) return {};

  const errores: Partial<Record<CampoMedidaCheckinAntropometrico, string>> = {};
  for (const issue of resultado.error.issues) {
    const campo = campoDeIssue(issue.path) as CampoMedidaCheckinAntropometrico | null;
    if (!campo || errores[campo]) continue;
    errores[campo] = issue.message;
  }
  return errores;
}

/** Medidas listas para precargar el formulario de check-in remoto (todas de texto, '' = vacío). */
export interface MedidasUltimaEvaluacion {
  pesoKg: string;
  porcentajeGrasa: string;
  cinturaCm: string;
  /** Alias legado del brazo relajado (se mantiene por compatibilidad de consumidores). */
  brazoCm: string;
  /** RN-02: brazo relajado (dato nuevo). */
  brazoRelajadoCm: string;
  /** RN-02: brazo contraído. */
  brazoContraidoCm: string;
  /** RN-02: muslo medio. */
  musloMedioCm: string;
  /** RN-02: pliegues cutáneos (mm). */
  tricepsMm: string;
  subescapularMm: string;
  suprailiacoMm: string;
  abdominalMm: string;
}

/**
 * Última medición real disponible en la evolución cargada.
 *
 * `GET /antropometria/evolucion/:alumnoId` devuelve las evaluaciones en orden cronológico
 * ASCENDENTE, así que la última es la del final del arreglo. Solo se usa para precargar el
 * formulario con datos reales; si no hay serie, devuelve `null` y el formulario queda vacío
 * (nunca se inventan medidas de fixture).
 */
export function obtenerUltimaMedicionReal(
  evolucion: Pick<EvolucionCorporalDTO, 'evaluaciones'> | null | undefined
): MedidasUltimaEvaluacion | null {
  const evaluaciones = evolucion?.evaluaciones ?? [];
  if (evaluaciones.length === 0) return null;
  const ultima = evaluaciones[evaluaciones.length - 1];
  const perimetros = ultima.perimetros;
  const pliegues = ultima.pliegues;
  // El API hidrata los alias legados; el modelo nuevo tiene precedencia si ambos vienen.
  const brazoRelajadoCm = perimetros?.brazoRelajadoCm ?? perimetros?.brazoCm ?? '';
  const musloMedioCm = perimetros?.musloMedioCm ?? perimetros?.musloCm ?? '';
  return {
    pesoKg: ultima.pesoKg ?? '',
    porcentajeGrasa: ultima.porcentajeGrasa ?? '',
    cinturaCm: perimetros?.cinturaCm ?? '',
    brazoCm: brazoRelajadoCm,
    brazoRelajadoCm,
    brazoContraidoCm: perimetros?.brazoContraidoCm ?? '',
    musloMedioCm,
    tricepsMm: pliegues?.tricepsMm ?? '',
    subescapularMm: pliegues?.subescapularMm ?? '',
    suprailiacoMm: pliegues?.suprailiacoMm ?? '',
    abdominalMm: pliegues?.abdominalMm ?? '',
  };
}

/**
 * Construye y valida el body del check-in antropométrico.
 *
 * @param alumnoId usuarioId del alumno (el mismo valor que aceptan `evolucion/:alumnoId` y
 *   `presigned-upload-url`), no el id de `perfiles_alumno`.
 * @param medidas textos del formulario (se recortan y se normaliza la coma decimal).
 * @param fechaEvaluacion fecha local YYYY-MM-DD; por defecto hoy.
 * @throws Error con el primer mensaje de validación del contrato compartido.
 */
export function construirPayloadCheckinAntropometrico(
  alumnoId: string,
  medidas: MedidasCheckinAntropometrico,
  fechaEvaluacion: string = fechaLocalHoy()
): CheckinAntropometricoDTO {
  const resultado = CheckinAntropometricoSchema.safeParse(
    construirCandidato(alumnoId, medidas, fechaEvaluacion)
  );
  if (!resultado.success) {
    throw new Error(resultado.error.issues[0]?.message ?? 'Datos de check-in inválidos.');
  }
  return resultado.data;
}
