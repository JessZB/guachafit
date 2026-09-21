import { describe, expect, it } from 'vitest';
import { EstadoAlumno, EstadoCuota, EstadoMedicion, OrigenAntropometria, TipoDocumento } from '@guachafit/shared';
import {
  etiquetaEstadoActivacion,
  etiquetaEstadoCuota,
  etiquetaEstadoMedicion,
  etiquetaOrigenAntropometria,
  etiquetaSemaforoPago,
  formatearDocumento,
  type SemaforoPago,
} from './etiquetas-dominio';

describe('etiquetaEstadoActivacion (§6: sin enums crudos en UI)', () => {
  it('mapea cada estado del enum a una etiqueta humana', () => {
    expect(etiquetaEstadoActivacion(EstadoAlumno.ACTIVO)).toBe('Activo');
    expect(etiquetaEstadoActivacion(EstadoAlumno.INACTIVO_PAUSADO)).toBe('Pausado');
    expect(etiquetaEstadoActivacion(EstadoAlumno.SUSPENDIDO_PAGO)).toBe('Suspendido por pago');
  });

  it('ningún estado del enum se imprime crudo (sin guiones bajos)', () => {
    for (const estado of Object.values(EstadoAlumno)) {
      const etiqueta = etiquetaEstadoActivacion(estado);
      expect(etiqueta, `estado ${estado} sin mapeo`).not.toBe('Sin dato');
      expect(etiqueta).not.toContain('_');
    }
  });

  it('un valor desconocido cae en "Sin dato"', () => {
    expect(etiquetaEstadoActivacion('estado_futuro')).toBe('Sin dato');
    expect(etiquetaEstadoActivacion(null)).toBe('Sin dato');
    expect(etiquetaEstadoActivacion(undefined)).toBe('Sin dato');
  });
});

describe('etiquetaSemaforoPago (RF-011 §6: `sin_cuota` nunca es mora)', () => {
  it('`sin_cuota` se rotula "Sin cuota emitida" en tono neutro, jamás como cuota pendiente', () => {
    expect(etiquetaSemaforoPago('sin_cuota')).toEqual({
      texto: 'Sin cuota emitida',
      tono: 'neutral',
    });
  });

  it('`moroso` sigue siendo la única variante en rojo', () => {
    expect(etiquetaSemaforoPago('moroso')).toEqual({ texto: 'Cuota pendiente', tono: 'danger' });
  });

  it('`al_dia` verde y `por_vencer` ámbar conservan su tono', () => {
    expect(etiquetaSemaforoPago('al_dia')).toEqual({ texto: 'Al día', tono: 'success' });
    expect(etiquetaSemaforoPago('por_vencer')).toEqual({ texto: 'Por vencer', tono: 'warning' });
  });

  it('cubre todos los valores del semáforo sin caer en fallback y sin guiones bajos', () => {
    const valores: SemaforoPago[] = ['al_dia', 'por_vencer', 'moroso', 'sin_cuota'];
    for (const valor of valores) {
      const etiqueta = etiquetaSemaforoPago(valor);
      expect(etiqueta.texto, `semáforo ${valor} sin mapeo`).not.toBe('Sin dato');
      expect(etiqueta.texto).not.toContain('_');
      expect(etiqueta.tono, `semáforo ${valor} con tono crudo`).not.toBe(undefined);
    }
  });

  it('sin semáforo (resumen ausente) cae en "Sin dato" neutro', () => {
    expect(etiquetaSemaforoPago(null)).toEqual({ texto: 'Sin dato', tono: 'neutral' });
    expect(etiquetaSemaforoPago(undefined)).toEqual({ texto: 'Sin dato', tono: 'neutral' });
  });
});

describe('etiquetaEstadoCuota (§6: badge del pago del alumno)', () => {
  it('cubre todos los estados del enum sin caer en fallback', () => {
    for (const estado of Object.values(EstadoCuota)) {
      const etiqueta = etiquetaEstadoCuota(estado);
      expect(etiqueta.texto, `estado ${estado} sin mapeo`).not.toBe('Sin dato');
      expect(etiqueta.texto).not.toContain('_');
    }
  });

  it('mapea los textos visibles del dominio', () => {
    expect(etiquetaEstadoCuota(EstadoCuota.AL_DIA).texto).toBe('Al día');
    expect(etiquetaEstadoCuota(EstadoCuota.ABONADA_PARCIAL).texto).toBe('Abono parcial');
    expect(etiquetaEstadoCuota(EstadoCuota.EMITIDA).texto).toBe('Pendiente');
    expect(etiquetaEstadoCuota(EstadoCuota.PENDIENTE_REVISION).texto).toBe('Pago en revisión');
    expect(etiquetaEstadoCuota(EstadoCuota.VENCIDA).texto).toBe('Vencida');
    expect(etiquetaEstadoCuota(EstadoCuota.ANULADA).texto).toBe('Anulada');
  });

  it('un estado desconocido cae en "Sin dato" neutro', () => {
    expect(etiquetaEstadoCuota('estado_futuro')).toEqual({ texto: 'Sin dato', tono: 'neutral' });
  });
});

describe('etiquetaOrigenAntropometria / etiquetaEstadoMedicion (§6: evolución del alumno)', () => {
  it('traduce el origen verificado y el autorreporte a lenguaje del alumno', () => {
    expect(etiquetaOrigenAntropometria(OrigenAntropometria.PRESENCIAL_VERIFICADO)).toBe(
      'Verificado por tu entrenador'
    );
    expect(etiquetaOrigenAntropometria(OrigenAntropometria.REMOTO_AUTOREPORTE)).toBe(
      'Reportado por ti'
    );
  });

  it('ningún origen del enum se imprime crudo', () => {
    for (const origen of Object.values(OrigenAntropometria)) {
      const etiqueta = etiquetaOrigenAntropometria(origen);
      expect(etiqueta, `origen ${origen} sin mapeo`).not.toBe('Sin dato');
      expect(etiqueta).not.toContain('_');
    }
  });

  it('un control pendiente no puede pintarse como verde', () => {
    expect(etiquetaEstadoMedicion(EstadoMedicion.PENDIENTE_APROBACION)).toEqual({
      texto: 'Pendiente de aprobación',
      tono: 'warning',
    });
    expect(etiquetaEstadoMedicion(EstadoMedicion.APROBADO).tono).toBe('success');
    expect(etiquetaEstadoMedicion(EstadoMedicion.RECHAZADO).tono).toBe('danger');
  });

  it('cubre todos los estados de medición sin fallback', () => {
    for (const estado of Object.values(EstadoMedicion)) {
      expect(etiquetaEstadoMedicion(estado).texto, `estado ${estado} sin mapeo`).not.toBe(
        'Sin dato'
      );
    }
  });
});

describe('formatearDocumento (§6: `V_` → `V-`)', () => {
  it('convierte el enum crudo en documento humano con guion', () => {
    expect(formatearDocumento(TipoDocumento.V, '12345678')).toBe('V-12345678');
    expect(formatearDocumento(TipoDocumento.E, '84992211')).toBe('E-84992211');
  });

  it('acepta el valor legado sin guion bajo y no duplica separadores', () => {
    expect(formatearDocumento('V', '12345678')).toBe('V-12345678');
    expect(formatearDocumento('V_', '12345678')).toBe('V-12345678');
  });

  it('el pasaporte conserva su nombre completo', () => {
    expect(formatearDocumento(TipoDocumento.PASAPORTE, 'A123456')).toBe('PASAPORTE-A123456');
  });

  it('sin tipo o sin número devuelve null (el llamador muestra "—")', () => {
    expect(formatearDocumento(null, '12345678')).toBeNull();
    expect(formatearDocumento(TipoDocumento.V, '')).toBeNull();
    expect(formatearDocumento(undefined, undefined)).toBeNull();
    expect(formatearDocumento(TipoDocumento.V, '   ')).toBeNull();
  });

  it('ningún documento formateado conserva el guion bajo', () => {
    for (const tipo of Object.values(TipoDocumento)) {
      expect(formatearDocumento(tipo, '123')).not.toContain('_');
    }
  });
});
