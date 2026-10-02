/**
 * Acceso y roles (A2/A11): reglas puras de los formularios de alta de alumnos (autorregistro y
 * alta manual del coach).
 *
 * - WhatsApp: el usuario escribe su número local y el prefijo de país va aparte (por defecto +58,
 *   editable). Se envía en formato internacional `+<país><número>`, dentro del rango del schema
 *   compartido (`telefonoWhatsapp: z.string().min(8).max(30)`) y del máximo E.164 (15 dígitos).
 * - Fecha de nacimiento: obligatoria, sin valores precargados y nunca futura.
 * - Edad en vivo: `Edad: N años` calculada con el día local.
 */
import { pluralizar } from './pluralizar';

export const PREFIJO_PAIS_POR_DEFECTO = '+58';

const MINIMO_DIGITOS_NUMERO = 7;
const MAXIMO_DIGITOS_E164 = 15;

function soloDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

/**
 * Número local sin separadores. Solo para +58 quita UN 0 troncal (0412… → 412…); en otros
 * países el 0 inicial puede ser parte del número (Italia: 06…), así que se conserva.
 */
function normalizarNumeroLocal(codigoPais: string, numero: string): string {
  const digitos = soloDigitos(numero);
  return codigoPais === '58' ? digitos.replace(/^0/, '') : digitos;
}

function longitudValida(codigoPais: string, local: string): boolean {
  return (
    local.length >= MINIMO_DIGITOS_NUMERO && codigoPais.length + local.length <= MAXIMO_DIGITOS_E164
  );
}

export function componerTelefonoWhatsapp(prefijo: string, numero: string): string {
  const codigoPais = soloDigitos(prefijo);
  return `+${codigoPais}${normalizarNumeroLocal(codigoPais, numero)}`;
}

/** Devuelve el mensaje de error o `null` si el WhatsApp es válido. */
export function validarTelefonoWhatsapp(prefijo: string, numero: string): string | null {
  const codigoPais = soloDigitos(prefijo);
  if (!/^\+?\s*\d{1,4}\s*$/.test(prefijo.trim()) || codigoPais.length === 0) {
    return 'Revisa el código de país (por ejemplo, +58).';
  }

  if (numero.trim().length === 0) return 'Escribe tu número de WhatsApp.';

  const mensajeNumero =
    'Revisa tu número de WhatsApp: escribe solo números, sin el código de país.';
  if (!/^[\d\s().-]+$/.test(numero.trim())) return mensajeNumero;

  const local = normalizarNumeroLocal(codigoPais, numero);
  // Si quitando el código de país queda un número válido, lo más probable es que lo hayas
  // escrito dos veces: te avisamos en lugar de corregirlo en silencio.
  if (
    local.startsWith(codigoPais) &&
    longitudValida(codigoPais, local.slice(codigoPais.length))
  ) {
    return `Parece que incluiste el código de país. Escribe solo tu número, sin el +${codigoPais}.`;
  }
  if (!longitudValida(codigoPais, local)) return mensajeNumero;
  return null;
}

/** Fecha de hoy como `YYYY-MM-DD` según el día LOCAL (`toISOString` usaría UTC y podría adelantarse). */
export function fechaLocalHoyISO(ahora: Date = new Date()): string {
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  return `${ahora.getFullYear()}-${mes}-${dia}`;
}

/** Interpreta `YYYY-MM-DD` como fecha LOCAL (evita el corrimiento de día de `new Date(iso)`). */
function parsearFechaLocal(fechaIso: string): Date | null {
  const coincidencia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fechaIso.trim());
  if (!coincidencia) return null;
  const [, anio, mes, dia] = coincidencia.map(Number);
  const fecha = new Date(anio, mes - 1, dia);
  if (fecha.getFullYear() !== anio || fecha.getMonth() !== mes - 1 || fecha.getDate() !== dia) {
    return null;
  }
  return fecha;
}

function inicioDelDia(fecha: Date): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
}

export function validarFechaNacimiento(fechaIso: string, hoy: Date = new Date()): string | null {
  const fecha = parsearFechaLocal(fechaIso);
  if (!fecha) return 'Indica tu fecha de nacimiento.';
  if (fecha.getTime() > inicioDelDia(hoy).getTime()) {
    return 'La fecha de nacimiento no puede ser futura.';
  }
  return null;
}

/** Edad cumplida; `null` si la fecha falta, es inválida o es futura. */
export function calcularEdad(fechaIso: string, hoy: Date = new Date()): number | null {
  const nacimiento = parsearFechaLocal(fechaIso);
  if (!nacimiento || nacimiento.getTime() > inicioDelDia(hoy).getTime()) return null;

  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const diferenciaMes = hoy.getMonth() - nacimiento.getMonth();
  if (diferenciaMes < 0 || (diferenciaMes === 0 && hoy.getDate() < nacimiento.getDate())) {
    edad--;
  }
  return Math.max(0, edad);
}

export function textoEdad(fechaIso: string, hoy: Date = new Date()): string | null {
  const edad = calcularEdad(fechaIso, hoy);
  if (edad === null) return null;
  return `Edad: ${pluralizar(edad, 'año', 'años')}`;
}
