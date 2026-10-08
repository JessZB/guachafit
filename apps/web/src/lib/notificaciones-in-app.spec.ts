import { describe, expect, it } from 'vitest';
import { Rol, type NotificacionInAppDTO } from '@guachafit/shared';
import {
  agruparNotificacionesPorDia,
  categoriaVisualDeFila,
  categoriaVisualNotificacion,
  etiquetaBotonCampana,
  etiquetaCategoriaNotificacion,
  formatearTiempoNotificacion,
  insigniaNoLeidas,
  resolverRutaNotificacion,
  rutaConfiguracionNotificaciones,
  textoNoLeidas,
} from './notificaciones-in-app';

function notificacion(
  id: string,
  createdAtUtc: string,
  extras: Partial<NotificacionInAppDTO> = {}
): NotificacionInAppDTO {
  return {
    id,
    usuarioId: 'u-1',
    titulo: `Aviso ${id}`,
    cuerpo: 'Cuerpo del aviso',
    tipoEvento: 'PAGO_APROBADO',
    leida: false,
    linkAccion: null,
    createdAtUtc,
    ...extras,
  };
}

describe('notificaciones-in-app: categoría visual por tipo de evento', () => {
  it('mapea las familias reales del despachador', () => {
    expect(categoriaVisualNotificacion('PAGO_REPORTADO')).toBe('finanzas');
    expect(categoriaVisualNotificacion('PAGO_APROBADO')).toBe('finanzas');
    expect(categoriaVisualNotificacion('CUOTA_POR_VENCER')).toBe('finanzas');
    expect(categoriaVisualNotificacion('RECORDATORIO_MANUAL')).toBe('finanzas');
    expect(categoriaVisualNotificacion('SESION_ALUMNO_FINALIZADA')).toBe('entrenamiento');
    expect(categoriaVisualNotificacion('RESUMEN_SEMANAL_COACH')).toBe('resumen');
    expect(categoriaVisualNotificacion('ALUMNO_REGISTRADO')).toBe('alumnos');
    expect(categoriaVisualNotificacion('SEGURIDAD_NUEVO_INICIO_SESION')).toBe('seguridad');
    expect(categoriaVisualNotificacion('ANTROPOMETRIA_CONTROL_APROBADO')).toBe('antropometria');
  });

  it('un tipo desconocido o vacío cae en "general" (nunca rompe)', () => {
    expect(categoriaVisualNotificacion('EVENTO_FUTURO')).toBe('general');
    expect(categoriaVisualNotificacion('')).toBe('general');
    expect(categoriaVisualNotificacion(null)).toBe('general');
    expect(categoriaVisualNotificacion(undefined)).toBe('general');
  });

  it('cada categoría tiene etiqueta humana en español', () => {
    expect(etiquetaCategoriaNotificacion('finanzas')).toBe('Pagos y cuotas');
    expect(etiquetaCategoriaNotificacion('entrenamiento')).toBe('Entrenamiento');
    expect(etiquetaCategoriaNotificacion('antropometria')).toBe('Progreso físico');
    expect(etiquetaCategoriaNotificacion('resumen')).toBe('Resumen semanal');
    expect(etiquetaCategoriaNotificacion('seguridad')).toBe('Seguridad');
    expect(etiquetaCategoriaNotificacion('alumnos')).toBe('Nuevos alumnos');
    expect(etiquetaCategoriaNotificacion('general')).toBe('Aviso');
  });

  it('mapea las filas de la matriz de preferencias al mismo lenguaje visual', () => {
    expect(categoriaVisualDeFila('FINANZAS')).toBe('finanzas');
    expect(categoriaVisualDeFila('COBRANZAS')).toBe('finanzas');
    expect(categoriaVisualDeFila('PLANIFICACION_DEPORTIVA')).toBe('entrenamiento');
    expect(categoriaVisualDeFila('REPORTES_PROGRESO')).toBe('entrenamiento');
    expect(categoriaVisualDeFila('CHECKIN_ANTROPOMETRICO')).toBe('antropometria');
    expect(categoriaVisualDeFila('NUEVOS_REGISTROS')).toBe('alumnos');
    expect(categoriaVisualDeFila('RESUMEN_SEMANAL')).toBe('resumen');
    expect(categoriaVisualDeFila('SEGURIDAD')).toBe('seguridad');
    expect(categoriaVisualDeFila('FILA_FUTURA')).toBe('general');
  });
});

describe('notificaciones-in-app: tiempo relativo y conteos', () => {
  const AHORA = Date.parse('2026-09-21T12:00:00.000Z');

  it('formatea el tiempo con el mismo lenguaje "hace X" de la frescura offline', () => {
    expect(formatearTiempoNotificacion('2026-09-21T11:55:00.000Z', AHORA)).toBe('hace 5 min');
    expect(formatearTiempoNotificacion('2026-09-21T10:00:00.000Z', AHORA)).toBe('hace 2 h');
    expect(formatearTiempoNotificacion('2026-09-18T12:00:00.000Z', AHORA)).toBe('hace 3 días');
  });

  it('una fecha inválida devuelve null y una futura se trata como recién emitida', () => {
    expect(formatearTiempoNotificacion('no-es-fecha', AHORA)).toBeNull();
    expect(formatearTiempoNotificacion(null, AHORA)).toBeNull();
    expect(formatearTiempoNotificacion('2026-09-21T12:05:00.000Z', AHORA)).toBe(
      'hace menos de un minuto'
    );
  });

  it('el copy de no leídas y el badge son honestos con 0 y con conteos altos', () => {
    expect(textoNoLeidas(0)).toBe('Sin novedades');
    expect(textoNoLeidas(1)).toBe('1 sin leer');
    expect(textoNoLeidas(12)).toBe('12 sin leer');
    expect(insigniaNoLeidas(0)).toBeNull();
    expect(insigniaNoLeidas(9)).toBe('9');
    expect(insigniaNoLeidas(10)).toBe('9+');
    expect(etiquetaBotonCampana(0)).toBe('Notificaciones: sin novedades');
    expect(etiquetaBotonCampana(3)).toBe('Notificaciones: 3 sin leer');
  });
});

describe('notificaciones-in-app: agrupado por día local', () => {
  // Fechas construidas en hora LOCAL del runner: el agrupado compara días locales, no instantes.
  const AHORA = new Date(2026, 8, 21, 12, 0, 0).getTime();
  const hoy = new Date(2026, 8, 21, 9, 0, 0).toISOString();
  const ayer = new Date(2026, 8, 20, 23, 30, 0).toISOString();
  const antiguo = new Date(2026, 8, 10, 8, 0, 0).toISOString();

  it('separa Hoy, Ayer y Anteriores en ese orden y sin grupos vacíos', () => {
    const grupos = agruparNotificacionesPorDia(
      [notificacion('antiguo', antiguo), notificacion('hoy', hoy), notificacion('ayer', ayer)],
      AHORA
    );
    expect(grupos.map((grupo) => grupo.clave)).toEqual(['hoy', 'ayer', 'anteriores']);
    expect(grupos.map((grupo) => grupo.titulo)).toEqual(['Hoy', 'Ayer', 'Anteriores']);
    expect(grupos[0].items.map((item) => item.id)).toEqual(['hoy']);
    expect(grupos[1].items.map((item) => item.id)).toEqual(['ayer']);
    expect(grupos[2].items.map((item) => item.id)).toEqual(['antiguo']);
  });

  it('omite los grupos sin notificaciones', () => {
    const grupos = agruparNotificacionesPorDia([notificacion('hoy', hoy)], AHORA);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].clave).toBe('hoy');
  });

  it('una fecha inválida no se pierde: cae en Anteriores', () => {
    const grupos = agruparNotificacionesPorDia([notificacion('rota', 'no-es-fecha')], AHORA);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].clave).toBe('anteriores');
  });

  it('sin notificaciones no hay grupos', () => {
    expect(agruparNotificacionesPorDia([], AHORA)).toEqual([]);
  });
});

describe('notificaciones-in-app: resolución del linkAccion a rutas reales', () => {
  it('traduce los alias de API a las rutas web del rol', () => {
    expect(resolverRutaNotificacion('/finanzas/conciliacion', Rol.ENTRENADOR)).toBe(
      '/coach/conciliacion'
    );
    expect(resolverRutaNotificacion('/finanzas', Rol.ALUMNO)).toBe('/app/pagos');
    expect(resolverRutaNotificacion('/finanzas', Rol.ENTRENADOR)).toBe('/coach/cartera');
    expect(resolverRutaNotificacion('/coach', Rol.ENTRENADOR)).toBe('/coach/dashboard');
  });

  it('acepta rutas web que existen para el rol, incluida la ficha dinámica del alumno', () => {
    expect(resolverRutaNotificacion('/app/pagos', Rol.ALUMNO)).toBe('/app/pagos');
    expect(resolverRutaNotificacion('/coach/alumnos/abc-123', Rol.ENTRENADOR)).toBe(
      '/coach/alumnos/abc-123'
    );
    expect(resolverRutaNotificacion('/app/hoy', Rol.ALUMNO)).toBe('/app/hoy');
  });

  it('nunca navega a una ruta que no existe para el rol (sin enlaces muertos)', () => {
    expect(resolverRutaNotificacion('/app/pagos', Rol.ENTRENADOR)).toBeNull();
    expect(resolverRutaNotificacion('/coach/alumnos/abc-123', Rol.ALUMNO)).toBeNull();
    expect(resolverRutaNotificacion('/ruta-inexistente', Rol.ALUMNO)).toBeNull();
    expect(resolverRutaNotificacion('/finanzas', Rol.SUPERADMIN)).toBeNull();
  });

  it('rechaza enlaces externos, protocol-relative o con traversal', () => {
    expect(resolverRutaNotificacion('https://evil.example/app/pagos', Rol.ALUMNO)).toBeNull();
    expect(resolverRutaNotificacion('//evil.example/app/pagos', Rol.ALUMNO)).toBeNull();
    expect(resolverRutaNotificacion('/app/../coach/alumnos', Rol.ALUMNO)).toBeNull();
    expect(resolverRutaNotificacion('', Rol.ALUMNO)).toBeNull();
    expect(resolverRutaNotificacion(null, Rol.ALUMNO)).toBeNull();
  });

  it('el destino de "Configurar" depende del rol y no existe para el superadmin', () => {
    expect(rutaConfiguracionNotificaciones(Rol.ALUMNO)).toBe('/app/ajustes?tab=notificaciones');
    expect(rutaConfiguracionNotificaciones(Rol.ENTRENADOR)).toBe(
      '/coach/ajustes?tab=notificaciones'
    );
    expect(rutaConfiguracionNotificaciones(Rol.SUPERADMIN)).toBeNull();
    expect(rutaConfiguracionNotificaciones(null)).toBeNull();
  });
});
