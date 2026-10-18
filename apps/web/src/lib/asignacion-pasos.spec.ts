/**
 * Lote E6 · C1: textos puros de la asignación de plantilla en 3 pasos.
 *
 * Contrato vigente del prompt 32: `apps/web/src/lib/asignacion-pasos.ts` existe y cada caso
 * fija sus salidas (títulos de paso, texto de ejercicio y resumen de asignación).
 */
import { describe, expect, it } from 'vitest';
import { ModoAsignacionPlantilla, type BloqueDiaRutinaDTO } from '@guachafit/shared';
import {
  PASOS_ASIGNACION_MASIVA,
  resumenAsignacion,
  resumenAsignacionMasiva,
  textoEjercicioPlantilla,
  textoPaso,
} from './asignacion-pasos';

type EjercicioPlantilla = BloqueDiaRutinaDTO['ejercicios'][number];

/** Ejercicio base válido del contrato; cada caso sobrescribe solo lo que prueba. */
function ej(parcial: Partial<EjercicioPlantilla> = {}): EjercicioPlantilla {
  return { nombre: 'Sentadilla', series: 4, reps: '10', peso: '', ...parcial };
}

describe('asignacion-pasos · textoPaso', () => {
  it('devuelve el título exacto de cada paso', () => {
    expect(textoPaso('elegir')).toBe('Paso 1 de 3 · Elegir plantilla');
    expect(textoPaso('revisar')).toBe('Paso 2 de 3 · Revisar y ajustar');
    expect(textoPaso('confirmar')).toBe('Paso 3 de 3 · Confirmar');
  });
});

describe('asignacion-pasos · textoEjercicioPlantilla', () => {
  it('caso del contrato: series, reps, peso decimal, esfuerzo 8.0 y descanso de 90 s', () => {
    expect(
      textoEjercicioPlantilla(
        ej({ series: 4, reps: '10', peso: '60', rpe: '8.0', descansoSegundos: 90 })
      )
    ).toBe('4 × 10 · 60 kg · Esfuerzo 8 · 1 min 30 s');
  });

  it('caso del contrato: rango de reps y peso corporal (sin esfuerzo ni descanso)', () => {
    expect(textoEjercicioPlantilla(ej({ series: 3, reps: '8-10', peso: 'Corporal' }))).toBe(
      '3 × 8-10 · Peso corporal'
    );
  });

  it('caso del contrato: peso vacío se omite', () => {
    expect(textoEjercicioPlantilla(ej({ series: 2, reps: '12', peso: '' }))).toBe('2 × 12');
  });

  it('peso decimal no entero se conserva ("60.5" → "60.5 kg")', () => {
    expect(textoEjercicioPlantilla(ej({ peso: '60.5' }))).toBe('4 × 10 · 60.5 kg');
  });

  it('peso sin número se muestra tal cual ("Moderado")', () => {
    expect(textoEjercicioPlantilla(ej({ peso: 'Moderado' }))).toBe('4 × 10 · Moderado');
  });

  it('peso ausente se omite', () => {
    const sinPeso = ej();
    delete (sinPeso as Partial<EjercicioPlantilla>).peso;
    expect(textoEjercicioPlantilla(sinPeso)).toBe('4 × 10');
  });

  it('esfuerzo "8.5" se conserva y "8.0" pierde el .0', () => {
    expect(textoEjercicioPlantilla(ej({ rpe: '8.5' }))).toBe('4 × 10 · Esfuerzo 8.5');
    expect(textoEjercicioPlantilla(ej({ rpe: '8.0' }))).toBe('4 × 10 · Esfuerzo 8');
  });

  it('el descanso se formatea con formatearSegundos (90 → "1 min 30 s")', () => {
    expect(textoEjercicioPlantilla(ej({ descansoSegundos: 90 }))).toBe('4 × 10 · 1 min 30 s');
  });
});

describe('asignacion-pasos · resumenAsignacion', () => {
  const base = { plantillaNombre: 'Fuerza 4 días', alumnoNombre: 'Ana Pérez' };

  it('REEMPLAZAR con 2 ajustes', () => {
    expect(
      resumenAsignacion({ ...base, numeroAjustes: 2, modo: ModoAsignacionPlantilla.REEMPLAZAR })
    ).toBe('Se asignará «Fuerza 4 días» a Ana Pérez con 2 ajustes. Reemplaza su rutina actual.');
  });

  it('FUSIONAR sin ajustes', () => {
    expect(
      resumenAsignacion({ ...base, numeroAjustes: 0, modo: ModoAsignacionPlantilla.FUSIONAR })
    ).toBe('Se asignará «Fuerza 4 días» a Ana Pérez sin ajustes. Se añade a su rutina actual.');
  });

  it('singular: 1 ajuste', () => {
    expect(
      resumenAsignacion({ ...base, numeroAjustes: 1, modo: ModoAsignacionPlantilla.REEMPLAZAR })
    ).toBe('Se asignará «Fuerza 4 días» a Ana Pérez con 1 ajuste. Reemplaza su rutina actual.');
  });
});

/* ================================================================== */
/* Lote E10 (RF-017 RN-03) · asignación masiva en 3 pasos.             */
/* Contratos L1–L3: exports estáticos (fase verde).                    */
/* ================================================================== */

describe('asignacion-pasos masiva 3 pasos (E10 · L1–L3)', () => {
  it("L1 · PasoAsignacion admite 'alumnos' y PASOS_ASIGNACION_MASIVA es ['alumnos','revisar','confirmar']", () => {
    expect(PASOS_ASIGNACION_MASIVA).toEqual(['alumnos', 'revisar', 'confirmar']);
  });

  it("L1 · 'alumnos' está incluido en los pasos del flujo masivo", () => {
    expect(PASOS_ASIGNACION_MASIVA).toContain('alumnos');
  });

  it('L2 · textoPaso con PASOS_ASIGNACION_MASIVA titula cada paso del masivo', () => {
    const pasos = PASOS_ASIGNACION_MASIVA;
    expect(textoPaso('alumnos', pasos)).toBe('Paso 1 de 3 · Elegir alumnos');
    expect(textoPaso('revisar', pasos)).toBe('Paso 2 de 3 · Revisar y ajustar');
    expect(textoPaso('confirmar', pasos)).toBe('Paso 3 de 3 · Confirmar');
  });

  it("L2 · textoPaso('alumnos', PASOS_ASIGNACION_MASIVA) es el título del paso 1 masivo", () => {
    expect(textoPaso('alumnos', PASOS_ASIGNACION_MASIVA)).toBe('Paso 1 de 3 · Elegir alumnos');
  });

  it('L3 · 3 alumnos, 1 ajuste, FUSIONAR usa la frase masiva exacta', () => {
    expect(typeof resumenAsignacionMasiva).toBe('function');
    expect(
      resumenAsignacionMasiva({
        plantillaNombre: 'Fuerza',
        cantidad: 3,
        numeroAjustes: 1,
        modo: ModoAsignacionPlantilla.FUSIONAR,
      })
    ).toBe('Se asignará «Fuerza» a 3 alumnos con 1 ajuste. Se añade a su rutina actual.');
  });

  it('L3 · 1 alumno con nombreUnico, 0 ajustes, REEMPLAZAR nombra al alumno', () => {
    expect(typeof resumenAsignacionMasiva).toBe('function');
    expect(
      resumenAsignacionMasiva({
        plantillaNombre: 'Fuerza',
        cantidad: 1,
        nombreUnico: 'Ana Pérez',
        numeroAjustes: 0,
        modo: ModoAsignacionPlantilla.REEMPLAZAR,
      })
    ).toBe('Se asignará «Fuerza» a Ana Pérez sin ajustes. Reemplaza su rutina actual.');
  });

  it("L3 · 2 ajustes usa el plural 'con 2 ajustes'", () => {
    expect(typeof resumenAsignacionMasiva).toBe('function');
    expect(
      resumenAsignacionMasiva({
        plantillaNombre: 'Fuerza',
        cantidad: 2,
        numeroAjustes: 2,
        modo: ModoAsignacionPlantilla.FUSIONAR,
      })
    ).toContain('con 2 ajustes');
  });
});
