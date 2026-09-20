import { describe, expect, it } from 'vitest';
import { EstadoSesion, MotivoOmision, SemaforoAdherencia } from '@guachafit/shared';
import {
  clasificarTasaAdherencia,
  etiquetaEstadoSesion,
  etiquetaMonitorAdherencia,
  etiquetaSemaforo,
  parsearNotasAlumno,
  pesoOrdenRiesgoMonitor,
  rutaExpedienteMonitor,
} from './adherencia';

describe('clasificarTasaAdherencia (RF-013 / RN-03)', () => {
  it('aplica los umbrales >=80 verde, 50-79 amarillo, <50 rojo', () => {
    expect(clasificarTasaAdherencia('84.50')).toBe(SemaforoAdherencia.VERDE);
    expect(clasificarTasaAdherencia('80.00')).toBe(SemaforoAdherencia.VERDE);
    expect(clasificarTasaAdherencia('79.99')).toBe(SemaforoAdherencia.AMARILLO);
    expect(clasificarTasaAdherencia('50.00')).toBe(SemaforoAdherencia.AMARILLO);
    expect(clasificarTasaAdherencia('49.99')).toBe(SemaforoAdherencia.ROJO);
    expect(clasificarTasaAdherencia('0.00')).toBe(SemaforoAdherencia.ROJO);
  });

  it('devuelve null cuando no hay dato evaluable (nunca un porcentaje artificial)', () => {
    expect(clasificarTasaAdherencia(null)).toBeNull();
    expect(clasificarTasaAdherencia(undefined)).toBeNull();
    expect(clasificarTasaAdherencia('')).toBeNull();
    expect(clasificarTasaAdherencia('   ')).toBeNull();
    expect(clasificarTasaAdherencia('sin-dato')).toBeNull();
  });
});

describe('etiquetaSemaforo', () => {
  it('traduce cada semáforo a texto y tono de chip', () => {
    expect(etiquetaSemaforo(SemaforoAdherencia.VERDE)).toEqual({ texto: 'Verde', tono: 'success' });
    expect(etiquetaSemaforo(SemaforoAdherencia.AMARILLO)).toEqual({
      texto: 'Amarillo',
      tono: 'warning',
    });
    expect(etiquetaSemaforo(SemaforoAdherencia.ROJO)).toEqual({ texto: 'Rojo', tono: 'danger' });
    expect(etiquetaSemaforo(null)).toEqual({ texto: 'Sin dato', tono: 'neutral' });
  });
});

describe('pesoOrdenRiesgoMonitor', () => {
  const base = {
    alumnoId: 'a1',
    alumnoPerfilId: 'perfil-a1',
    nombreCompleto: 'Alumno Uno',
    sesionesPrescritas: 3,
    sesionesCompletadas: 3,
    porcentajeCumplimientoSemanal: '100.00',
    tienePlanActivo: true,
    sinPendientesSemana: false,
    rachaDiasConsecutivos: 5,
    diasInactivo: 0,
    ultimaSesionUtc: null,
  };

  it('ordena ROJO > AMARILLO > VERDE', () => {
    const rojo = pesoOrdenRiesgoMonitor({ ...base, semaforoAdherencia: SemaforoAdherencia.ROJO });
    const amarillo = pesoOrdenRiesgoMonitor({
      ...base,
      semaforoAdherencia: SemaforoAdherencia.AMARILLO,
    });
    const verde = pesoOrdenRiesgoMonitor({ ...base, semaforoAdherencia: SemaforoAdherencia.VERDE });
    expect(rojo).toBeGreaterThan(amarillo);
    expect(amarillo).toBeGreaterThan(verde);
  });

  it('manda al final a los alumnos sin plan activo (no son riesgo evaluable)', () => {
    const sinPlan = pesoOrdenRiesgoMonitor({
      ...base,
      tienePlanActivo: false,
      semaforoAdherencia: SemaforoAdherencia.ROJO,
    });
    const verde = pesoOrdenRiesgoMonitor({ ...base, semaforoAdherencia: SemaforoAdherencia.VERDE });
    expect(sinPlan).toBeLessThan(verde);
    expect(sinPlan).toBe(0);
  });

  it('D6: un plan sin bloques vencidos no pesa como ROJO (0/0 neutral)', () => {
    const sinPendientes = pesoOrdenRiesgoMonitor({
      ...base,
      sinPendientesSemana: true,
      semaforoAdherencia: SemaforoAdherencia.ROJO,
    });
    const rojoReal = pesoOrdenRiesgoMonitor({
      ...base,
      semaforoAdherencia: SemaforoAdherencia.ROJO,
    });
    expect(sinPendientes).toBe(0);
    expect(rojoReal).toBeGreaterThan(sinPendientes);
  });
});

describe('etiquetaMonitorAdherencia (D6: 0/0 a inicio de semana nunca es ROJO)', () => {
  const base = {
    tienePlanActivo: true,
    sinPendientesSemana: false,
    semaforoAdherencia: SemaforoAdherencia.ROJO,
  };

  it('muestra "Sin plan" cuando no hay rutina activa', () => {
    expect(etiquetaMonitorAdherencia({ ...base, tienePlanActivo: false })).toEqual({
      texto: 'Sin plan',
      tono: 'neutral',
    });
  });

  it('neutraliza el 0/0 cuando aún no vence ningún bloque', () => {
    expect(etiquetaMonitorAdherencia({ ...base, sinPendientesSemana: true })).toEqual({
      texto: 'Al día — sin pendientes',
      tono: 'neutral',
    });
  });

  it('mantiene el semáforo real cuando sí hay bloques debidos', () => {
    expect(etiquetaMonitorAdherencia(base)).toEqual({ texto: 'Rojo', tono: 'danger' });
    expect(
      etiquetaMonitorAdherencia({ ...base, semaforoAdherencia: SemaforoAdherencia.VERDE })
    ).toEqual({ texto: 'Verde', tono: 'success' });
  });
});

describe('rutaExpedienteMonitor (enlace del monitor al expediente)', () => {
  it('construye la ruta al expediente con perfiles_alumno.id (no el usuarioId)', () => {
    expect(rutaExpedienteMonitor('perfil-alumno-1')).toBe('/coach/alumnos/perfil-alumno-1');
  });

  it('cae al directorio cuando el perfilId viene vacío o ausente', () => {
    expect(rutaExpedienteMonitor('')).toBe('/coach/alumnos');
    expect(rutaExpedienteMonitor('   ')).toBe('/coach/alumnos');
    expect(rutaExpedienteMonitor(null)).toBe('/coach/alumnos');
    expect(rutaExpedienteMonitor(undefined)).toBe('/coach/alumnos');
  });
});

describe('etiquetaEstadoSesion (RF-001 Escenario 5)', () => {
  it('etiqueta Planificada / En progreso / Completada', () => {
    expect(etiquetaEstadoSesion(EstadoSesion.PLANIFICADA).texto).toBe('Planificada');
    expect(etiquetaEstadoSesion(EstadoSesion.EN_PROGRESO).texto).toBe('En progreso');
    expect(etiquetaEstadoSesion(EstadoSesion.COMPLETADA)).toEqual({
      texto: 'Completada',
      tono: 'success',
    });
  });

  it('distingue el motivo de una sesión omitida', () => {
    expect(etiquetaEstadoSesion(EstadoSesion.OMITIDA, MotivoOmision.DESCANSO).texto).toBe(
      'Descansado'
    );
    expect(etiquetaEstadoSesion(EstadoSesion.OMITIDA, MotivoOmision.INCOMPLETO)).toEqual({
      texto: 'Incompleto',
      tono: 'danger',
    });
    expect(etiquetaEstadoSesion(EstadoSesion.OMITIDA, null).texto).toBe('Omitida');
  });
});

describe('parsearNotasAlumno (feedback visible del alumno)', () => {
  it('separa etiquetas [Título: valor] del texto libre', () => {
    const resultado = parsearNotasAlumno(
      '[RPE: 8.0/10] • [Molestia: Ninguna] • Buen bombeo en cuadriceps'
    );
    expect(resultado.etiquetas).toEqual([
      { titulo: 'RPE', valor: '8.0/10' },
      { titulo: 'Molestia', valor: 'Ninguna' },
    ]);
    expect(resultado.textoLibre).toBe('Buen bombeo en cuadriceps');
  });

  it('parsea el tag de descanso promedio con separador interno "·" como una sola etiqueta', () => {
    const resultado = parsearNotasAlumno(
      '[RPE: 8.0/10] • [Descanso promedio: 2 min (planificado: 1 min 30 s · +30 s)] • Buen ritmo'
    );
    expect(resultado.etiquetas).toEqual([
      { titulo: 'RPE', valor: '8.0/10' },
      { titulo: 'Descanso promedio', valor: '2 min (planificado: 1 min 30 s · +30 s)' },
    ]);
    expect(resultado.textoLibre).toBe('Buen ritmo');
  });

  it('acepta texto plano sin etiquetas', () => {
    const resultado = parsearNotasAlumno('Todo bien, subí carga en prensa');
    expect(resultado.etiquetas).toEqual([]);
    expect(resultado.textoLibre).toBe('Todo bien, subí carga en prensa');
  });

  it('devuelve estructura vacía para null, undefined o texto en blanco', () => {
    expect(parsearNotasAlumno(null)).toEqual({ etiquetas: [], textoLibre: null });
    expect(parsearNotasAlumno(undefined)).toEqual({ etiquetas: [], textoLibre: null });
    expect(parsearNotasAlumno('   ')).toEqual({ etiquetas: [], textoLibre: null });
  });
});
