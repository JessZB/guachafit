/**
 * RF-014 RN-04 (Ola 3 · N2b): lógica pura de la bandeja In-App de la campana.
 *
 * El contrato del API (`NotificacionInAppDTO`) trae `tipoEvento` (p. ej. `PAGO_APROBADO`), no una
 * categoría de presentación. Este módulo traduce ese valor técnico a la categoría visual con su
 * etiqueta humana (§6: nunca se imprime un valor crudo), agrupa la lista por día local y resuelve
 * los `linkAccion` del backend a rutas REALES del router web.
 *
 * Todo aquí es puro (sin React ni red) y se testea en Node.
 */
import {
  Rol,
  type CategoriaPreferenciaNotificacion,
  type NotificacionInAppDTO,
} from '@guachafit/shared';
import { formatearEdadFrescura } from './frescura-cache';
import { rutaAjustes } from './ajustes';

/** Categoría de presentación de una notificación: decide icono, tono y etiqueta. */
export type CategoriaVisualNotificacion =
  | 'finanzas'
  | 'entrenamiento'
  | 'antropometria'
  | 'resumen'
  | 'seguridad'
  | 'alumnos'
  | 'general';

/**
 * Traduce el `tipoEvento` técnico a la categoría visual.
 *
 * Se resuelve por familia de prefijo (no por lista cerrada) para que un tipo nuevo de una familia
 * conocida caiga en la categoría correcta sin tocar la UI. Un tipo desconocido cae en `general`.
 */
export function categoriaVisualNotificacion(tipoEvento?: string | null): CategoriaVisualNotificacion {
  const tipo = (tipoEvento ?? '').trim().toUpperCase();
  if (!tipo) return 'general';

  if (tipo.startsWith('PAGO_') || tipo.startsWith('CUOTA_') || tipo.startsWith('RECORDATORIO_')) {
    return 'finanzas';
  }
  if (
    tipo.startsWith('SESION_') ||
    tipo.startsWith('RUTINA_') ||
    tipo.startsWith('ENTRENAMIENTO_')
  ) {
    return 'entrenamiento';
  }
  if (tipo.startsWith('ANTROPOMETRIA_') || tipo.startsWith('CHECKIN_') || tipo.startsWith('CONTROL_')) {
    return 'antropometria';
  }
  if (tipo.startsWith('RESUMEN_')) return 'resumen';
  if (tipo.startsWith('SEGURIDAD_') || tipo === 'SEGURIDAD') return 'seguridad';
  if (tipo.startsWith('ALUMNO')) return 'alumnos';
  return 'general';
}

/** Etiqueta humana de la categoría (visible en el panel y en el chip de cada aviso). */
export function etiquetaCategoriaNotificacion(categoria: CategoriaVisualNotificacion): string {
  switch (categoria) {
    case 'finanzas':
      return 'Pagos y cuotas';
    case 'entrenamiento':
      return 'Entrenamiento';
    case 'antropometria':
      return 'Progreso físico';
    case 'resumen':
      return 'Resumen semanal';
    case 'seguridad':
      return 'Seguridad';
    case 'alumnos':
      return 'Nuevos alumnos';
    default:
      return 'Aviso';
  }
}

/**
 * Categoría visual de una fila de la matriz de preferencias (mismo lenguaje de iconos/tonos que la
 * bandeja): la pantalla de ajustes usa los mismos colores que el aviso que va a recibir.
 */
const CATEGORIA_VISUAL_POR_FILA: Record<
  CategoriaPreferenciaNotificacion,
  CategoriaVisualNotificacion
> = {
  FINANZAS: 'finanzas',
  PLANIFICACION_DEPORTIVA: 'entrenamiento',
  CHECKIN_ANTROPOMETRICO: 'antropometria',
  SEGURIDAD: 'seguridad',
  COBRANZAS: 'finanzas',
  NUEVOS_REGISTROS: 'alumnos',
  REPORTES_PROGRESO: 'entrenamiento',
  RESUMEN_SEMANAL: 'resumen',
};

/** Categoría visual de una fila de la matriz; una fila desconocida cae en `general`. */
export function categoriaVisualDeFila(filaId: string): CategoriaVisualNotificacion {
  return CATEGORIA_VISUAL_POR_FILA[filaId as CategoriaPreferenciaNotificacion] ?? 'general';
}
/**
 * Tiempo relativo humano de una notificación ("hace 5 min", "hace 2 h", "hace 3 días").
 *
 * Reutiliza el mismo formateador de la frescura offline para que "hace X" signifique lo mismo en
 * toda la app. Una fecha inválida devuelve `null` (la UI pinta "—"); una fecha futura (reloj
 * desfasado) se trata como recién emitida, nunca como un tiempo negativo.
 */
export function formatearTiempoNotificacion(
  iso?: string | null,
  ahora: number = Date.now()
): string | null {
  if (!iso) return null;
  const milisegundos = Date.parse(iso);
  if (Number.isNaN(milisegundos)) return null;
  const edadMinutos = Math.max(0, Math.floor((ahora - milisegundos) / 60_000));
  return formatearEdadFrescura(edadMinutos);
}

/** Copy del subtítulo del panel: "Sin novedades" o "N sin leer" ("sin leer" es invariable). */
export function textoNoLeidas(total: number): string {
  const n = Math.max(0, Math.floor(total) || 0);
  return n === 0 ? 'Sin novedades' : `${n} sin leer`;
}

/** Contenido del badge de la campana: `null` con 0, "9+" cuando supera el dígito. */
export function insigniaNoLeidas(total: number): string | null {
  const n = Math.max(0, Math.floor(total) || 0);
  if (n === 0) return null;
  return n > 9 ? '9+' : String(n);
}

/** `aria-label` dinámico del botón de la campana (el conteo exacto, sin recortes). */
export function etiquetaBotonCampana(total: number): string {
  const n = Math.max(0, Math.floor(total) || 0);
  return n === 0 ? 'Notificaciones: sin novedades' : `Notificaciones: ${n} sin leer`;
}

export type ClaveGrupoNotificaciones = 'hoy' | 'ayer' | 'anteriores';

export interface GrupoNotificaciones {
  clave: ClaveGrupoNotificaciones;
  titulo: string;
  items: NotificacionInAppDTO[];
}

/** Clave de día LOCAL (`YYYY-MM-DD`): dos instantes del mismo día local caen en el mismo grupo. */
function claveDiaLocal(fecha: Date): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

/**
 * Agrupa las notificaciones en "Hoy", "Ayer" y "Anteriores" (en ese orden, sin grupos vacíos).
 *
 * La comparación es por día local del dispositivo (nunca por diferencias de 24 h, que fallan con
 * el horario de verano). Una fecha inválida cae en "Anteriores" para no perder el aviso.
 */
export function agruparNotificacionesPorDia(
  items: readonly NotificacionInAppDTO[],
  ahora: number = Date.now()
): GrupoNotificaciones[] {
  const hoy = new Date(ahora);
  const ayer = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1);
  const claveHoy = claveDiaLocal(hoy);
  const claveAyer = claveDiaLocal(ayer);

  const grupos: Record<ClaveGrupoNotificaciones, NotificacionInAppDTO[]> = {
    hoy: [],
    ayer: [],
    anteriores: [],
  };

  for (const item of items) {
    const fecha = new Date(item.createdAtUtc);
    const claveFecha = Number.isNaN(fecha.getTime()) ? null : claveDiaLocal(fecha);
    if (claveFecha === claveHoy) grupos.hoy.push(item);
    else if (claveFecha === claveAyer) grupos.ayer.push(item);
    else grupos.anteriores.push(item);
  }

  return (
    [
      { clave: 'hoy' as const, titulo: 'Hoy', items: grupos.hoy },
      { clave: 'ayer' as const, titulo: 'Ayer', items: grupos.ayer },
      { clave: 'anteriores' as const, titulo: 'Anteriores', items: grupos.anteriores },
    ] satisfies GrupoNotificaciones[]
  ).filter((grupo) => grupo.items.length > 0);
}

/** Rutas web existentes por rol (espejo del router: `router.tsx`). */
const RUTAS_WEB_ALUMNO = new Set([
  '/app/hoy',
  '/app/menu',
  '/app/nutricion',
  '/app/progreso',
  '/app/pagos',
  '/app/ajustes',
  // Redirige a `/app/ajustes?tab=notificaciones` (RF-018 RN-09); se conserva por enlaces viejos.
  '/app/preferencias',
]);

const RUTAS_WEB_ENTRENADOR = new Set([
  '/coach/dashboard',
  '/coach/menu',
  '/coach/conciliacion',
  '/coach/cartera',
  '/coach/alumnos',
  '/coach/monitor-adherencia',
  '/coach/plantillas',
  '/coach/antropometria',
  '/coach/ajustes',
]);

/**
 * Alias de `linkAccion` que el backend emite con rutas de API (no del router web).
 * P. ej. `PAGO_REPORTADO` trae `/finanzas/conciliacion`, que en la web es `/coach/conciliacion`.
 */
const ALIAS_LINKS: Record<string, { alumno?: string; entrenador?: string }> = {
  '/finanzas': { alumno: '/app/pagos', entrenador: '/coach/cartera' },
  '/finanzas/conciliacion': { entrenador: '/coach/conciliacion' },
  '/coach': { entrenador: '/coach/dashboard' },
};

/** Detalle de alumno del coach: `/coach/alumnos/<id>` (ruta dinámica real del router). */
const PATRON_DETALLE_ALUMNO = /^\/coach\/alumnos\/[A-Za-z0-9-]+$/;

/**
 * Resuelve el `linkAccion` de una notificación a una ruta navegable del router, o `null`.
 *
 * Reglas (seguridad + honestidad):
 * - Solo se navega dentro de la app: se rechaza cualquier enlace externo, absoluto o con `..`.
 * - Los alias de API se traducen a su ruta web equivalente.
 * - La ruta debe existir para el ROL del usuario; si no, se devuelve `null` y el aviso solo se
 *   marca como leído (nunca un enlace muerto que reviente en el fallback del router).
 * - El superadmin no tiene superficies de negocio: sus avisos no navegan.
 */
export function resolverRutaNotificacion(
  linkAccion: string | null | undefined,
  rol: Rol | string | null | undefined
): string | null {
  if (!linkAccion) return null;
  const link = linkAccion.trim();
  if (!link || link.includes('..') || link.includes('//') || !link.startsWith('/')) return null;

  if (rol === Rol.SUPERADMIN) return null;
  const esAlumno = rol === Rol.ALUMNO;
  const perfil: 'alumno' | 'entrenador' = esAlumno ? 'alumno' : 'entrenador';

  const alias = ALIAS_LINKS[link];
  const candidata = alias ? alias[perfil] : link;
  if (!candidata) return null;

  if (PATRON_DETALLE_ALUMNO.test(candidata)) return perfil === 'entrenador' ? candidata : null;

  const permitidas = perfil === 'alumno' ? RUTAS_WEB_ALUMNO : RUTAS_WEB_ENTRENADOR;
  return permitidas.has(candidata) ? candidata : null;
}

/**
 * Destino del enlace "Configurar" del panel de la campana según el rol.
 *
 * Alumno y coach configuran desde la pestaña "Notificaciones" de su pantalla Ajustes (RF-018
 * RN-09). El superadmin no recibe estas notificaciones: `null` para no pintar un enlace muerto.
 */
export function rutaConfiguracionNotificaciones(rol: Rol | string | null | undefined): string | null {
  if (rol !== Rol.ALUMNO && rol !== Rol.ENTRENADOR) return null;
  return rutaAjustes(rol, 'notificaciones');
}
