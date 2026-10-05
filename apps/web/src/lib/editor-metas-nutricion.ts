/**
 * RF-002 RN-01: lógica del editor de metas nutricionales del entrenador
 * (`PanelNutricionAlumno`), separada de la UI para probarla sin DOM.
 *
 * - Conversión texto → número SIN truncar: el contrato compartido exige enteros para calorías y
 *   macros, así que un valor con decimales (2200.7) se rechaza con un mensaje claro en lugar de
 *   guardarse en silencio como 2200.
 * - Traducción por campo de los issues de `MetasNutricionalesSchema`: el texto de Zod (en inglés)
 *   nunca llega a la pantalla.
 * - Detección de cambios sin guardar y de PDFs ya guardados que el PUT-replace borrará.
 */
import {
  MetasNutricionalesSchema,
  type MetasNutricionalesDTO,
  type MetasNutricionalesDetalleDTO,
  type RecursoNutricionalDTO,
  type RecursoNutricionalDetalleDTO,
} from '@guachafit/shared';
import { ApiError, ErrorDeConexion } from './api-client';
import {
  esMensajeAmigable,
  traducirIssuesValidacion,
  type IssueValidacion,
} from './mensajes-error';
import {
  construirRecursosParaGuardar,
  esFilaRecursoVacia,
  filaRecursoSinContenido,
  filaRecursoVacia,
  type FilaRecursoFormulario,
} from './recursos-pdf';

export interface FormularioMetas {
  calorias: string;
  proteina: string;
  carbohidratos: string;
  grasas: string;
  agua: string;
  recursos: FilaRecursoFormulario[];
}

export type ResultadoValidacionMetas =
  | { ok: true; datos: MetasNutricionalesDTO }
  | { ok: false; mensaje: string };

export const MENSAJE_METAS_SIN_CONEXION =
  'No hay conexión a internet: tus cambios no se guardaron. Revisa tu red y vuelve a pulsar Guardar metas.';
export const MENSAJE_METAS_ERROR_GENERICO =
  'No pudimos guardar las metas: tus cambios no se guardaron. Inténtalo de nuevo.';
/** Sin respuesta definitiva (5xx, timeout, cancelación): el cambio pudo haberse aplicado. */
export const MENSAJE_METAS_RESULTADO_INCIERTO =
  'No pudimos confirmar si se guardaron tus cambios. Recarga las metas antes de volver a intentarlo.';
export const MENSAJE_ESPERA_SUBIDA = 'Espera a que termine de subirse el PDF.';
export const MENSAJE_METAS_CARGANDO = 'Espera a que carguen las metas.';
export const MENSAJE_METAS_ERROR_CARGA = 'No pudimos cargar las metas. Reintenta antes de editarlas.';
export const MENSAJE_SUBIDA_PDF_FALLIDA =
  'No pudimos subir el archivo. Revisa tu conexión e inténtalo de nuevo.';

const MENSAJE_SIN_METAS = 'Define al menos una meta o un recurso educativo antes de guardar.';
const MENSAJE_DATO_INVALIDO = 'Revisa las metas: hay un dato que no es válido.';

const MENSAJES_POR_CAMPO: Readonly<Record<string, string>> = {
  caloriasObjetivo: 'Calorías: escribe un número entero entre 1 y 15000, sin decimales.',
  proteinaGramosObjetivo: 'Proteína: escribe un número entero de gramos entre 1 y 1000, sin decimales.',
  carbohidratosGramosObjetivo:
    'Carbohidratos: escribe un número entero de gramos entre 1 y 1500, sin decimales.',
  grasasGramosObjetivo: 'Grasas: escribe un número entero de gramos entre 1 y 1000, sin decimales.',
  aguaLitrosObjetivo: 'Agua: escribe los litros con hasta 2 decimales, por ejemplo 2,5.',
  recursos: 'Puedes añadir hasta 10 recursos educativos.',
};

const MENSAJES_POR_CAMPO_RECURSO: Readonly<Record<string, string>> = {
  titulo: 'el título debe tener entre 2 y 120 caracteres.',
  url: 'el enlace no es válido. Pégalo completo, por ejemplo https://…',
  storageKey: 'el archivo PDF no es válido. Quítalo y vuelve a subirlo.',
};

/** Texto del formulario → número; '' = no configurado. NO trunca: 2200.7 sigue siendo 2200.7. */
export function textoANumeroMeta(texto: string): number | undefined {
  const limpio = texto.trim();
  if (limpio === '') return undefined;
  return Number(limpio.replace(',', '.'));
}

export function formularioDesdeMetas(metas: MetasNutricionalesDetalleDTO | null): FormularioMetas {
  const aTexto = (valor: number | null | undefined) =>
    valor === null || valor === undefined ? '' : String(valor);
  return {
    calorias: aTexto(metas?.caloriasObjetivo),
    proteina: aTexto(metas?.proteinaGramosObjetivo),
    carbohidratos: aTexto(metas?.carbohidratosGramosObjetivo),
    grasas: aTexto(metas?.grasasGramosObjetivo),
    agua: metas?.aguaLitrosObjetivo ?? '',
    // Un PDF guardado se reabre por su clave y SIN la URL firmada (caduca); la URL solo se
    // precarga cuando el recurso es un enlace externo.
    recursos: (metas?.recursos ?? []).map((recurso) => ({
      ...filaRecursoVacia(),
      titulo: recurso.titulo,
      url: recurso.storageKey ? '' : recurso.url ?? '',
      storageKey: recurso.storageKey ?? '',
    })),
  };
}

/** Huella comparable de una fila: un PDF se identifica por su clave, un enlace por su URL. */
function huellaRecurso(fila: FilaRecursoFormulario): string {
  const storageKey = fila.storageKey.trim();
  return JSON.stringify([fila.titulo.trim(), storageKey, storageKey ? '' : fila.url.trim()]);
}

export function hayCambiosSinGuardar(inicial: FormularioMetas, actual: FormularioMetas): boolean {
  const campos = ['calorias', 'proteina', 'carbohidratos', 'grasas', 'agua'] as const;
  if (campos.some((campo) => inicial[campo].trim() !== actual[campo].trim())) return true;
  if (actual.recursos.some((fila) => fila.subiendo)) return true;

  const huellas = (filas: FilaRecursoFormulario[]) =>
    filas.filter((fila) => !esFilaRecursoVacia(fila)).map(huellaRecurso);
  const antes = huellas(inicial.recursos);
  const despues = huellas(actual.recursos);
  return antes.length !== despues.length || antes.some((huella, i) => huella !== despues[i]);
}

/** Traduce el primer issue a un mensaje por campo; el texto de Zod nunca se muestra. */
function traducirIssueMetas(
  issues: ReadonlyArray<IssueValidacion>,
  numeroFilaRecurso: (indicePayload: number) => number
): string {
  const [campo, indice, subcampo] = issues[0]?.path ?? [];

  // Caso especial: los recursos son un campo anidado con índice; el mensaje debe nombrar la fila
  // del editor y el subcampo, algo que la traducción plana (solo `path[0]`) no puede expresar.
  if (campo === 'recursos' && typeof indice === 'number') {
    const prefijo = `Recurso ${numeroFilaRecurso(indice)}: `;
    const detalle =
      subcampo === undefined
        ? 'pega un enlace o sube un PDF.'
        : MENSAJES_POR_CAMPO_RECURSO[String(subcampo)];
    return detalle ? prefijo + detalle : MENSAJE_DATO_INVALIDO;
  }

  // Todos los campos planos del esquema tienen traducción; el único issue sin campo es el refine
  // "al menos una meta", por eso es el texto por defecto.
  return traducirIssuesValidacion(issues, MENSAJES_POR_CAMPO, MENSAJE_SIN_METAS);
}

export function validarFormularioMetas(formulario: FormularioMetas): ResultadoValidacionMetas {
  const recursos = construirRecursosParaGuardar(formulario.recursos);
  // Posición (1-based) de cada recurso del payload en el editor: las filas sin contenido se omiten
  // al guardar (misma regla que `construirRecursosParaGuardar`), pero el mensaje debe nombrar la
  // fila que el entrenador ve.
  const filasConContenido = formulario.recursos
    .map((fila, indice) => ({ fila, numero: indice + 1 }))
    .filter(({ fila }) => !filaRecursoSinContenido(fila))
    .map(({ numero }) => numero);

  const agua = formulario.agua.trim();
  const candidato = {
    caloriasObjetivo: textoANumeroMeta(formulario.calorias),
    proteinaGramosObjetivo: textoANumeroMeta(formulario.proteina),
    carbohidratosGramosObjetivo: textoANumeroMeta(formulario.carbohidratos),
    grasasGramosObjetivo: textoANumeroMeta(formulario.grasas),
    aguaLitrosObjetivo: agua === '' ? undefined : agua.replace(',', '.'),
    recursos: recursos.length > 0 ? recursos : undefined,
  };

  const resultado = MetasNutricionalesSchema.safeParse(candidato);
  if (!resultado.success) {
    return {
      ok: false,
      mensaje: traducirIssueMetas(
        resultado.error.issues,
        (indice) => filasConContenido[indice] ?? indice + 1
      ),
    };
  }

  const datos = Object.fromEntries(
    Object.entries(resultado.data).filter(([, valor]) => valor !== undefined)
  ) as MetasNutricionalesDTO;
  return { ok: true, datos };
}

/** PDFs ya guardados que el PUT-replace dejará sin referencia (la API los borra para siempre). */
export function pdfsQueSeEliminaran(
  previos: ReadonlyArray<RecursoNutricionalDetalleDTO>,
  nuevos: ReadonlyArray<RecursoNutricionalDTO> | undefined
): Array<{ titulo: string; storageKey: string }> {
  const clavesNuevas = new Set((nuevos ?? []).map((recurso) => recurso.storageKey).filter(Boolean));
  return previos
    .filter((recurso): recurso is RecursoNutricionalDetalleDTO & { storageKey: string } =>
      Boolean(recurso.storageKey)
    )
    .filter((recurso) => !clavesNuevas.has(recurso.storageKey))
    .map((recurso) => ({ titulo: recurso.titulo, storageKey: recurso.storageKey }));
}

/**
 * El editor no usa cola offline. Solo se afirma que NO se guardó cuando hay certeza: sin conexión
 * (la petición no salió) o un rechazo 4xx. Sin respuesta definitiva (5xx, timeout, cancelación u
 * otro fallo) el cambio pudo haberse aplicado, así que se pide recargar antes de reintentar.
 */
export function mensajeErrorGuardarMetas(error: unknown): string {
  if (error instanceof ErrorDeConexion) return MENSAJE_METAS_SIN_CONEXION;
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
    if (!esMensajeAmigable(error.message)) return MENSAJE_METAS_ERROR_GENERICO;
    const mensaje = error.message.trim();
    return `${mensaje}${/[.!?]$/.test(mensaje) ? '' : '.'} Tus cambios no se guardaron.`;
  }
  return MENSAJE_METAS_RESULTADO_INCIERTO;
}

/** La subida directa del archivo puede fallar con textos del navegador en inglés: nunca se muestran. */
export function mensajeErrorSubidaPdf(error: unknown): string {
  if (error instanceof ApiError && esMensajeAmigable(error.message)) {
    return error.message;
  }
  return MENSAJE_SUBIDA_PDF_FALLIDA;
}

export type EstadoEdicionMetas = { habilitado: true } | { habilitado: false; motivo: string };

/**
 * Guardar reemplaza la fila completa (incluida la lista de PDFs): sin conocer lo ya guardado, un
 * PUT podría borrar PDFs sin avisar. Por eso el editor solo se abre con las metas cargadas.
 */
export function estadoEdicionMetas({
  cargando,
  error,
  cargadas,
}: {
  cargando: boolean;
  error: string | null;
  cargadas: boolean;
}): EstadoEdicionMetas {
  if (error) return { habilitado: false, motivo: MENSAJE_METAS_ERROR_CARGA };
  if (cargando || !cargadas) return { habilitado: false, motivo: MENSAJE_METAS_CARGANDO };
  return { habilitado: true };
}

export type DecisionAlGuardar = 'esperar-subida' | 'confirmar-borrado' | 'enviar';

/** En modo demostración no se borra nada real: avisar de un borrado permanente sería falso. */
export function decidirAlGuardar({
  haySubidaEnCurso,
  pdfsAEliminar,
  modoDemo,
}: {
  haySubidaEnCurso: boolean;
  pdfsAEliminar: number;
  modoDemo: boolean;
}): DecisionAlGuardar {
  if (haySubidaEnCurso) return 'esperar-subida';
  if (pdfsAEliminar > 0 && !modoDemo) return 'confirmar-borrado';
  return 'enviar';
}

export type DecisionAlCerrar = 'confirmar-descarte' | 'cerrar';

export function decidirAlCerrar(inicial: FormularioMetas, actual: FormularioMetas): DecisionAlCerrar {
  return hayCambiosSinGuardar(inicial, actual) ? 'confirmar-descarte' : 'cerrar';
}

/** Textos del diálogo de borrado de PDFs, concordados en número desde una sola variable. */
export function textosConfirmacionBorrado(cantidad: number): { titulo: string; detalle: string } {
  const varios = cantidad !== 1;
  return {
    titulo: varios ? `¿Borrar estos ${cantidad} PDFs para siempre?` : '¿Borrar este PDF para siempre?',
    detalle: varios
      ? 'Al guardar, estos archivos se borrarán de forma permanente del espacio privado del alumno. No podrás recuperarlos; tendrías que volver a subirlos.'
      : 'Al guardar, este archivo se borrará de forma permanente del espacio privado del alumno. No podrás recuperarlo; tendrías que volver a subirlo.',
  };
}
