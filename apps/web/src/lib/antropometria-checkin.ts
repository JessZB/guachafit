/**
 * Contrato de check-in antropométrico desde la web (RF-003).
 *
 * El endpoint real es `POST /antropometria/checkin` (roles ENTRENADOR y ALUMNO) y exige
 * `alumnoId` (usuarioId del alumno: el service busca `perfiles_alumno.usuario_id`) y
 * `fechaEvaluacion` (YYYY-MM-DD). Este módulo centraliza la construcción y validación del
 * payload contra `CheckinAntropometricoSchema` para que ni la página del alumno ni la del
 * coach puedan enviar un cuerpo que la API rechace con 400.
 *
 * Fotos: el contrato admite `fotos: [{ angulo, storageKey }]` obtenidas vía
 * `POST /antropometria/presigned-upload-url`, pero la UX de captura/subida todavía no existe
 * en estas páginas: se omite `fotos` en lugar de inventar una subida o mandar un array vacío
 * que sugiera un contrato inexistente.
 */
import { CheckinAntropometricoSchema, type CheckinAntropometricoDTO } from '@guachafit/shared';
import { normalizarEntradaDecimal } from './weight-unit';

/** Medidas tal como las escribe el usuario en los formularios (texto libre). */
export interface MedidasCheckinAntropometrico {
  pesoKg: string;
  porcentajeGrasa?: string;
  cuelloCm?: string;
  pechoCm?: string;
  cinturaCm?: string;
  caderaCm?: string;
  brazoCm?: string;
  musloCm?: string;
  observacionesCoach?: string;
}

/**
 * Fecha de calendario LOCAL (no UTC) en formato YYYY-MM-DD. Usar `toISOString()` desplazaría
 * el día en zonas como America/Caracas (UTC-4) durante la tarde/noche.
 */
export function fechaLocalHoy(ahora: Date = new Date()): string {
  const anio = ahora.getFullYear();
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

function textoOpcional(valor?: string): string | undefined {
  if (valor === undefined || valor === null) return undefined;
  const normalizado = normalizarEntradaDecimal(valor);
  return normalizado === '' ? undefined : normalizado;
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
  const perimetros = {
    cuelloCm: textoOpcional(medidas.cuelloCm),
    pechoCm: textoOpcional(medidas.pechoCm),
    cinturaCm: textoOpcional(medidas.cinturaCm),
    caderaCm: textoOpcional(medidas.caderaCm),
    brazoCm: textoOpcional(medidas.brazoCm),
    musloCm: textoOpcional(medidas.musloCm),
  };
  const perimetrosDefinidos = Object.fromEntries(
    Object.entries(perimetros).filter(([, valor]) => valor !== undefined)
  );

  const candidato: Record<string, unknown> = {
    alumnoId,
    fechaEvaluacion,
    pesoKg: textoOpcional(medidas.pesoKg) ?? '',
  };

  const porcentajeGrasa = textoOpcional(medidas.porcentajeGrasa);
  if (porcentajeGrasa !== undefined) candidato.porcentajeGrasa = porcentajeGrasa;
  if (Object.keys(perimetrosDefinidos).length > 0) candidato.perimetros = perimetrosDefinidos;

  const observaciones = medidas.observacionesCoach?.trim();
  if (observaciones) candidato.observacionesCoach = observaciones;

  const resultado = CheckinAntropometricoSchema.safeParse(candidato);
  if (!resultado.success) {
    throw new Error(resultado.error.issues[0]?.message ?? 'Datos de check-in inválidos.');
  }
  return resultado.data;
}
