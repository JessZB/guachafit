import { describe, expect, it } from 'vitest';
import { derivarEstadoEntrenamientoHoy } from './use-resumen-menu';

describe('use-resumen-menu · REVUX (G5)', () => {
  it('R14: semana completa sin bloque hoy completado devuelve Semana completada con tono success (no Completado hoy)', () => {
    const resultado = derivarEstadoEntrenamientoHoy({
      bloqueo: null,
      cargandoSemana: false,
      errorSemana: false,
      semanaProgreso: {
        semanaIso: '2026-W45',
        inicioSemana: '2026-11-02',
        finSemana: '2026-11-08',
        totalBloques: 3,
        bloquesCompletados: 3,
        porcentajeCumplimiento: '100',
        esDiaDescansoHoy: false,
        rachaDias: 3,
        bloques: [
          {
            bloqueId: 'b1',
            titulo: 'Fuerza A',
            totalEjercicios: 1,
            completado: true,
            esSugeridoHoy: false,
            estadoSesion: 'completada' as any,
          },
          {
            bloqueId: 'b2',
            titulo: 'Fuerza B',
            totalEjercicios: 1,
            completado: true,
            esSugeridoHoy: false,
            estadoSesion: 'completada' as any,
          },
          {
            bloqueId: 'b3',
            titulo: 'Fuerza C',
            totalEjercicios: 1,
            completado: true,
            esSugeridoHoy: false,
            estadoSesion: 'completada' as any,
          },
        ],
      },
    });

    expect(resultado.texto).not.toBe('Completado hoy');
    expect(resultado.texto).toBe('Semana completada');
    expect(resultado.tono).toBe('success');
  });

  it('R15: un bloque con esSugeridoHoy y completado true devuelve Completado hoy con tono success', () => {
    const resultado = derivarEstadoEntrenamientoHoy({
      bloqueo: null,
      cargandoSemana: false,
      errorSemana: false,
      semanaProgreso: {
        semanaIso: '2026-W45',
        inicioSemana: '2026-11-02',
        finSemana: '2026-11-08',
        totalBloques: 3,
        bloquesCompletados: 1,
        porcentajeCumplimiento: '33',
        esDiaDescansoHoy: false,
        rachaDias: 1,
        bloques: [
          {
            bloqueId: 'b1',
            titulo: 'Fuerza A',
            totalEjercicios: 1,
            completado: true,
            esSugeridoHoy: true,
            estadoSesion: 'completada' as any,
          },
          {
            bloqueId: 'b2',
            titulo: 'Fuerza B',
            totalEjercicios: 1,
            completado: false,
            esSugeridoHoy: false,
            estadoSesion: null,
          },
        ],
      },
    });

    expect(resultado.texto).toBe('Completado hoy');
    expect(resultado.tono).toBe('success');
  });

  it('R16: semana incompleta sin nada completado hoy devuelve Listo para iniciar (no Completado hoy ni Semana completada)', () => {
    const resultado = derivarEstadoEntrenamientoHoy({
      bloqueo: null,
      cargandoSemana: false,
      errorSemana: false,
      semanaProgreso: {
        semanaIso: '2026-W45',
        inicioSemana: '2026-11-02',
        finSemana: '2026-11-08',
        totalBloques: 3,
        bloquesCompletados: 1,
        porcentajeCumplimiento: '33',
        esDiaDescansoHoy: false,
        rachaDias: 1,
        bloques: [
          {
            bloqueId: 'b1',
            titulo: 'Fuerza A',
            totalEjercicios: 1,
            completado: true,
            esSugeridoHoy: false,
            estadoSesion: 'completada' as any,
          },
          {
            bloqueId: 'b2',
            titulo: 'Fuerza B',
            totalEjercicios: 1,
            completado: false,
            esSugeridoHoy: true,
            estadoSesion: null,
          },
        ],
      },
    });

    expect(resultado.texto).not.toBe('Completado hoy');
    expect(resultado.texto).not.toBe('Semana completada');
    expect(resultado.texto).toBe('Listo para iniciar');
    expect(resultado.tono).toBe('success');
  });
});
