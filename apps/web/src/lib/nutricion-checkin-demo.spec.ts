/**
 * Módulo 6 · Nutrición: check-in demo local (spec de la lógica pura extraída en SL3).
 */
import { describe, expect, it } from 'vitest';
import { SemaforoNutricional, TipoComida } from '@guachafit/shared';
import { construirCheckinDemo } from './nutricion-checkin-demo';

function fotoDemo() {
  return {
    id: 'foto-1',
    tipoComida: TipoComida.ALMUERZO,
    archivo: new File(['foto'], 'foto.jpg', { type: 'image/jpeg' }),
    previewUrl: 'blob:mock-1',
  };
}

const ENTRADA_BASE = {
  semaforo: SemaforoNutricional.CUMPLIDO,
  fotos: [],
  hoyLocal: '2026-09-21',
  ahora: new Date(2026, 8, 21, 19, 0, 0),
  alumnoId: 'alumno-1',
  calorias: '',
  proteina: '',
  aguaLitros: '',
  notas: '',
};

describe('construirCheckinDemo (simulación local, mismos valores de la vista)', () => {
  it('arma el check-in demo con el semáforo y la fecha elegidos', () => {
    const checkin = construirCheckinDemo(ENTRADA_BASE);

    expect(checkin.id).toBe('demo-checkin-hoy');
    expect(checkin.alumnoId).toBe('alumno-1');
    expect(checkin.fecha).toBe('2026-09-21');
    expect(checkin.semaforo).toBe(SemaforoNutricional.CUMPLIDO);
    expect(checkin.fotosPlatos).toEqual([]);
  });

  it('mapea el formulario (vacío = null) y las vistas previas como evidencia', () => {
    const checkin = construirCheckinDemo({
      ...ENTRADA_BASE,
      calorias: '2200',
      proteina: '',
      aguaLitros: '2.50',
      notas: 'Con energía',
      fotos: [fotoDemo()],
    });

    expect(checkin.caloriasReportadas).toBe(2200);
    expect(checkin.proteinaGramosReportada).toBeNull();
    expect(checkin.aguaLitros).toBe('2.50');
    expect(checkin.notasAlumno).toBe('Con energía');
    expect(checkin.fotosPlatos).toHaveLength(1);
    expect(checkin.fotosPlatos[0]?.fotoUrl).toBe('blob:mock-1');
    expect(checkin.fotosPlatos[0]?.storageKey).toContain('comidas/demo/2026-09-21/');
  });
});
