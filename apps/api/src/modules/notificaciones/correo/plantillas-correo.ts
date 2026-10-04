/**
 * Plantillas de correo (funciones puras: asunto + HTML simple y accesible + texto).
 *
 * - Español con tuteo, sin jerga.
 * - Todo dato dinámico se escapa antes de entrar al HTML (`escaparHtml`) y los códigos de los
 *   enlaces se codifican en la URL.
 * - HTML sencillo con estilos en línea (los clientes de correo ignoran `<style>` externos),
 *   `lang="es"`, `<title>` y botón con texto descriptivo; el texto plano lleva el mismo contenido.
 *
 * Enlaces:
 * - Bienvenida (alumno RF-011 RN-05 y entrenador RF-010 Escenario 1): `/activar?token=…`, la
 *   misma pantalla de activación que el enlace copiable.
 * - Recuperación de contraseña: `/restablecer?token=…`.
 * Las vigencias salen de `@guachafit/shared` (misma fuente que `CryptoService` y la web).
 */
import {
  VIGENCIA_ENLACE_ACTIVACION_MS,
  VIGENCIA_ENLACE_RECUPERACION_MS,
  textoVigencia,
} from '@guachafit/shared';
import { CorreoCuentaPayload } from '../events/eventos-correo-cuenta';

export interface CorreoArmado {
  asunto: string;
  html: string;
  texto: string;
}

const VIGENCIA_ACTIVACION = textoVigencia(VIGENCIA_ENLACE_ACTIVACION_MS);
const VIGENCIA_RECUPERACION = textoVigencia(VIGENCIA_ENLACE_RECUPERACION_MS);

export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function construirEnlace(urlWeb: string, ruta: string, token: string): string {
  return `${urlWeb.replace(/\/+$/, '')}${ruta}?token=${encodeURIComponent(token)}`;
}

/**
 * Enlace de una notificación: rutas relativas de la web (`/app/pagos`) se vuelven absolutas; solo
 * se aceptan `http(s)`. Cualquier otro esquema (p. ej. `javascript:`) se descarta.
 */
function resolverEnlaceNotificacion(enlace: string | null | undefined, urlWeb: string): string | null {
  const valor = enlace?.trim();
  if (!valor) return null;
  if (valor.startsWith('/') && !valor.startsWith('//')) {
    return `${urlWeb.replace(/\/+$/, '')}${valor}`;
  }
  return /^https?:\/\//i.test(valor) ? valor : null;
}

function saludo(nombre: string | null | undefined): string {
  const limpio = nombre?.trim();
  return limpio ? `Hola, ${limpio}:` : 'Hola,';
}

interface Contenido {
  asunto: string;
  saludo: string;
  parrafos: string[];
  boton?: { texto: string; url: string };
  notas?: string[];
}

function renderHtml(contenido: Contenido): string {
  const parrafos = contenido.parrafos
    .map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#1f2933;">${escaparHtml(p)}</p>`)
    .join('\n');
  const boton = contenido.boton
    ? `<p style="margin:24px 0;">
  <a href="${escaparHtml(contenido.boton.url)}" style="display:inline-block;padding:14px 24px;border-radius:10px;background:#16a34a;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;">${escaparHtml(contenido.boton.texto)}</a>
</p>
<p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#52606d;">Si el botón no funciona, copia y pega este enlace en tu navegador:<br><a href="${escaparHtml(contenido.boton.url)}" style="color:#15803d;word-break:break-all;">${escaparHtml(contenido.boton.url)}</a></p>`
    : '';
  const notas = (contenido.notas ?? [])
    .map((n) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:#52606d;">${escaparHtml(n)}</p>`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escaparHtml(contenido.asunto)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f7fa;">
<div role="article" aria-label="${escaparHtml(contenido.asunto)}" style="max-width:560px;margin:0 auto;padding:24px;font-family:Arial,Helvetica,sans-serif;">
<p style="margin:0 0 24px;font-size:20px;font-weight:bold;color:#16a34a;">GUACHAFIT</p>
<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#1f2933;">${escaparHtml(contenido.saludo)}</p>
${parrafos}
${boton}
${notas}
</div>
</body>
</html>`;
}

function renderTexto(contenido: Contenido): string {
  const lineas = [contenido.saludo, '', ...contenido.parrafos.flatMap((p) => [p, ''])];
  if (contenido.boton) lineas.push(`${contenido.boton.texto}: ${contenido.boton.url}`, '');
  for (const nota of contenido.notas ?? []) lineas.push(nota, '');
  lineas.push('GUACHAFIT');
  return lineas.join('\n');
}

function armar(contenido: Contenido): CorreoArmado {
  return { asunto: contenido.asunto, html: renderHtml(contenido), texto: renderTexto(contenido) };
}

interface DatosEnlace {
  nombre: string | null | undefined;
  token: string;
  urlWeb: string;
}

/** RF-011 RN-05: alumno dado de alta por su entrenador. */
export function plantillaBienvenidaAlumno({ nombre, token, urlWeb }: DatosEnlace): CorreoArmado {
  return armar({
    asunto: 'Te damos la bienvenida a GUACHAFIT: crea tu contraseña',
    saludo: saludo(nombre),
    parrafos: [
      'Tu entrenador te registró en GUACHAFIT. Ahí verás tus entrenamientos, tu progreso y tus pagos.',
      'Para empezar, crea tu contraseña con el botón de abajo.',
    ],
    boton: { texto: 'Crear mi contraseña', url: construirEnlace(urlWeb, '/activar', token) },
    notas: [
      `El enlace se usa una sola vez y vence en ${VIGENCIA_ACTIVACION}. Si vence, pídele uno nuevo a tu entrenador.`,
      'Si no esperabas este correo, puedes ignorarlo.',
    ],
  });
}

/** RF-010 Escenario 1: entrenador creado por el administrador de la plataforma. */
export function plantillaBienvenidaEntrenador({ nombre, token, urlWeb }: DatosEnlace): CorreoArmado {
  return armar({
    asunto: 'Tu cuenta de entrenador en GUACHAFIT está lista',
    saludo: saludo(nombre),
    parrafos: [
      'Creamos tu cuenta de entrenador en GUACHAFIT. Desde ahí gestionas a tus alumnos, sus rutinas y tus cobros.',
      'Para entrar, crea tu contraseña con el botón de abajo.',
    ],
    boton: { texto: 'Crear mi contraseña', url: construirEnlace(urlWeb, '/activar', token) },
    notas: [
      `El enlace se usa una sola vez y vence en ${VIGENCIA_ACTIVACION}. Si vence, escríbele al equipo de GUACHAFIT para que te envíe otro.`,
      'Si no esperabas este correo, puedes ignorarlo.',
    ],
  });
}

/** Enlace para restablecer la contraseña (lo pide el propio usuario desde el inicio de sesión). */
export function plantillaRecuperacionPassword({ nombre, token, urlWeb }: DatosEnlace): CorreoArmado {
  return armar({
    asunto: 'Restablece tu contraseña de GUACHAFIT',
    saludo: saludo(nombre),
    parrafos: [
      'Recibimos un pedido para restablecer la contraseña de tu cuenta de GUACHAFIT.',
      'Para elegir una nueva, usa el botón de abajo.',
    ],
    boton: { texto: 'Restablecer mi contraseña', url: construirEnlace(urlWeb, '/restablecer', token) },
    notas: [
      `El enlace se usa una sola vez y vence en ${VIGENCIA_RECUPERACION}. Si vence, pide uno nuevo desde la pantalla de inicio de sesión.`,
      'Si no pediste este cambio, ignora este correo: tu contraseña actual sigue funcionando.',
    ],
  });
}

/** Avisos del despachador (pagos, recordatorios…) que llegan al worker sin HTML propio. */
export function plantillaNotificacionGenerica({
  titulo,
  cuerpo,
  enlace,
  urlWeb,
}: {
  titulo: string;
  cuerpo: string;
  enlace?: string | null;
  urlWeb: string;
}): CorreoArmado {
  const url = resolverEnlaceNotificacion(enlace, urlWeb);
  return armar({
    asunto: titulo,
    saludo: 'Hola,',
    parrafos: [cuerpo],
    boton: url ? { texto: 'Abrir en GUACHAFIT', url } : undefined,
  });
}

/** Correo de cuenta (bienvenidas y recuperación) a partir del evento de dominio. */
export function construirCorreoCuenta(payload: CorreoCuentaPayload, urlWeb: string): CorreoArmado {
  const datos = { nombre: payload.nombre, token: payload.token, urlWeb };
  switch (payload.tipo) {
    case 'BIENVENIDA_ALUMNO':
      return plantillaBienvenidaAlumno(datos);
    case 'BIENVENIDA_ENTRENADOR':
      return plantillaBienvenidaEntrenador(datos);
    case 'RECUPERACION_PASSWORD':
      return plantillaRecuperacionPassword(datos);
  }
}
