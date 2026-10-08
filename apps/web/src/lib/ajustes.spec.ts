/**
 * RF-018 RN-09 · Lote WEB: contrato de la pantalla "Ajustes" por rol (pestañas, etiquetas,
 * pestaña activa desde la URL y rutas). Lógica pura, entorno Node sin jsdom.
 */
import { describe, expect, it } from 'vitest';
import { Rol } from '@guachafit/shared';
import {
  etiquetaPestanaAjustes,
  pestanaAjustesDesdeUrl,
  pestanasAjustes,
  rutaAjustes,
  type PestanaAjustes,
} from './ajustes';
import { resolverRutaNotificacion, rutaConfiguracionNotificaciones } from './notificaciones-in-app';

describe('ajustes: pestañas por rol (RF-018 RN-09)', () => {
  it('el alumno ve Perfil, Correo y contraseña, Notificaciones y Zona horaria', () => {
    expect(pestanasAjustes(Rol.ALUMNO)).toEqual([
      'perfil',
      'seguridad',
      'notificaciones',
      'zona-horaria',
    ]);
  });

  it('el entrenador suma Planes y Tasas de cambio a las pestañas comunes', () => {
    expect(pestanasAjustes(Rol.ENTRENADOR)).toEqual([
      'perfil',
      'seguridad',
      'notificaciones',
      'planes',
      'tasas',
    ]);
  });

  it('el superadmin solo administra su correo y contraseña', () => {
    expect(pestanasAjustes(Rol.SUPERADMIN)).toEqual(['seguridad']);
  });

  it('un rol desconocido no tiene pestañas (sin superficie que pintar)', () => {
    expect(pestanasAjustes('desconocido')).toEqual([]);
    expect(pestanasAjustes(null)).toEqual([]);
  });
});

describe('ajustes: etiquetas humanas de las pestañas', () => {
  it('cada pestaña tiene su etiqueta exacta de la RN-09', () => {
    const etiquetas: Record<PestanaAjustes, string> = {
      perfil: 'Perfil',
      seguridad: 'Correo y contraseña',
      notificaciones: 'Notificaciones',
      'zona-horaria': 'Zona horaria',
      planes: 'Planes',
      tasas: 'Tasas de cambio',
    };
    for (const [pestana, etiqueta] of Object.entries(etiquetas)) {
      expect(etiquetaPestanaAjustes(pestana as PestanaAjustes)).toBe(etiqueta);
    }
  });
});

describe('ajustes: pestaña activa desde la URL (?tab=…)', () => {
  it('respeta una pestaña válida para el rol', () => {
    expect(pestanaAjustesDesdeUrl(Rol.ALUMNO, 'notificaciones')).toBe('notificaciones');
    expect(pestanaAjustesDesdeUrl(Rol.ENTRENADOR, 'tasas')).toBe('tasas');
    expect(pestanaAjustesDesdeUrl(Rol.SUPERADMIN, 'seguridad')).toBe('seguridad');
  });

  it('cae en la primera pestaña del rol cuando el valor falta o no existe para ese rol', () => {
    expect(pestanaAjustesDesdeUrl(Rol.ALUMNO, null)).toBe('perfil');
    expect(pestanaAjustesDesdeUrl(Rol.ALUMNO, 'planes')).toBe('perfil');
    expect(pestanaAjustesDesdeUrl(Rol.ENTRENADOR, 'zona-horaria')).toBe('perfil');
    expect(pestanaAjustesDesdeUrl(Rol.SUPERADMIN, 'notificaciones')).toBe('seguridad');
    expect(pestanaAjustesDesdeUrl(Rol.SUPERADMIN, null)).toBe('seguridad');
  });
});

describe('ajustes: rutas por rol', () => {
  it('sin pestaña o con la primera del rol, la ruta va limpia (sin ?tab)', () => {
    expect(rutaAjustes(Rol.ALUMNO)).toBe('/app/ajustes');
    expect(rutaAjustes(Rol.ALUMNO, 'perfil')).toBe('/app/ajustes');
    expect(rutaAjustes(Rol.ENTRENADOR, 'perfil')).toBe('/coach/ajustes');
    expect(rutaAjustes(Rol.SUPERADMIN, 'seguridad')).toBe('/admin/ajustes');
    expect(rutaAjustes(Rol.SUPERADMIN)).toBe('/admin/ajustes');
  });

  it('con otra pestaña añade ?tab=<pestana>', () => {
    expect(rutaAjustes(Rol.ALUMNO, 'seguridad')).toBe('/app/ajustes?tab=seguridad');
    expect(rutaAjustes(Rol.ALUMNO, 'zona-horaria')).toBe('/app/ajustes?tab=zona-horaria');
    expect(rutaAjustes(Rol.ENTRENADOR, 'planes')).toBe('/coach/ajustes?tab=planes');
    expect(rutaAjustes(Rol.ENTRENADOR, 'notificaciones')).toBe('/coach/ajustes?tab=notificaciones');
  });

  it('un rol desconocido no tiene ruta de ajustes', () => {
    expect(rutaAjustes('desconocido')).toBeNull();
    expect(rutaAjustes(null)).toBeNull();
  });
});

describe('ajustes: rutas del alumno en el mapa de notificaciones (RN-09)', () => {
  it('/app/ajustes existe para el alumno y /app/preferencias sigue viva porque redirige', () => {
    expect(resolverRutaNotificacion('/app/ajustes', Rol.ALUMNO)).toBe('/app/ajustes');
    expect(resolverRutaNotificacion('/app/preferencias', Rol.ALUMNO)).toBe('/app/preferencias');
  });

  it('el enlace "Configurar" de la campana apunta a la pestaña de notificaciones del alumno', () => {
    expect(rutaConfiguracionNotificaciones(Rol.ALUMNO)).toBe('/app/ajustes?tab=notificaciones');
  });
});
