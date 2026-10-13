import { describe, expect, it } from 'vitest';
import { EstadoAlumno } from '@guachafit/shared';
import {
  MENSAJE_EXITO_ESTADO,
  TEXTO_BOTON_CAMBIO_ESTADO,
  separarPreguntaYDetalle,
} from './alumno-detalle-textos';

describe('alumno-detalle-textos', () => {
  it('separa pregunta y detalle por "? "', () => {
    expect(separarPreguntaYDetalle('¿Pausar a Ana? Dejará de ver su planificación.')).toEqual({
      titulo: '¿Pausar a Ana?',
      detalle: 'Dejará de ver su planificación.',
    });
  });

  it('sin "? " devuelve todo como título', () => {
    expect(separarPreguntaYDetalle('Archivar alumno')).toEqual({
      titulo: 'Archivar alumno',
      detalle: '',
    });
  });

  it('cubre los tres estados en botones y mensajes', () => {
    for (const estado of [
      EstadoAlumno.ACTIVO,
      EstadoAlumno.INACTIVO_PAUSADO,
      EstadoAlumno.SUSPENDIDO_PAGO,
    ]) {
      expect(TEXTO_BOTON_CAMBIO_ESTADO[estado]).toBeTruthy();
      expect(MENSAJE_EXITO_ESTADO[estado]).toBeTruthy();
    }
    expect(TEXTO_BOTON_CAMBIO_ESTADO[EstadoAlumno.INACTIVO_PAUSADO]).toBe('Pausar');
  });
});
