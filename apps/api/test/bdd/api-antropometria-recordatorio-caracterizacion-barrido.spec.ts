import { describe, expect, it, vi } from 'vitest';
import { Modalidad, PeriodicidadAntropometria } from '@guachafit/shared';
import {
  AntropometriaRecordatorioProcessor,
} from '../../src/modules/antropometria/processors/antropometria-recordatorio.processor';

/**
 * Caracterización del barrido antropométrico antes de la extracción.
 *
 * Fija el comportamiento de las piezas a extraer con base simulada:
 * ventana de 48 h, idempotencia por medianoche local, referencia única
 * por fecha en expiraciones, filtro de modalidad y nombre en el aviso.
 */
describe('Caracterización: barrido de recordatorio antropométrico', () => {
  const alumnoId = 'a3333333-3333-4333-8333-333333333333';
  const coachId = 'c1111111-1111-4111-8111-111111111111';
  const lunesCaracas06 = new Date('2026-09-07T10:00:00.000Z');
  const martesCaracas06 = new Date('2026-09-08T10:00:00.000Z');

  const alumnoSemanal = {
    usuarioId: alumnoId,
    entrenadorId: coachId,
    nombres: 'Laura',
    apellidos: 'Remota',
    periodicidad: PeriodicidadAntropometria.SEMANAL,
    inicio: '2026-09-07',
    timezone: 'America/Caracas',
  };
  const alumnoRemoto = { ...alumnoSemanal, modalidad: Modalidad.REMOTO };

  /** Base simulada secuencial: cada lectura devuelve la respuesta siguiente. */
  function crearDb(respuestas: unknown[][]) {
    let indice = 0;
    const db: any = {
      select: vi.fn(() => {
        const resultado = respuestas[indice++] ?? [];
        const consulta: any = {
          from: vi.fn(() => consulta),
          innerJoin: vi.fn(() => consulta),
          where: vi.fn(() => ({
            then: (resolver: (valor: unknown) => unknown) => resolver(resultado),
          })),
        };
        return consulta;
      }),
      execute: vi.fn(async () => undefined),
    };
    db.transaction = vi.fn(async (cb: any) => cb(db));
    return db;
  }

  it('dos alumnos con calendario reciben un aviso cada uno en fecha programada', async () => {
    const otro = { ...alumnoSemanal, usuarioId: 'a4444444-4444-4444-8444-444444444444' };
    const db = crearDb([[[alumnoSemanal, otro][0], otro], [], []]);
    const emisor = vi.fn().mockResolvedValue([]);
    const procesador = new AntropometriaRecordatorioProcessor(db, { emitAsync: emisor } as any);

    const resultado = await procesador.generarYDespachar(lunesCaracas06);

    expect(resultado.evaluados).toBe(2);
    expect(resultado.despachados).toBe(2);
    expect(emisor).toHaveBeenCalledTimes(2);
  });

  it('el control del día posterior a la fecha programada ocupa la ventana de 48 h', async () => {
    const db = crearDb([
      [alumnoSemanal],
      [{ alumnoId, fechaEvaluacion: '2026-09-08' }],
      [],
    ]);
    const emisor = vi.fn();
    const procesador = new AntropometriaRecordatorioProcessor(db, { emitAsync: emisor } as any);

    const resultado = await procesador.generarYDespachar(lunesCaracas06);

    expect(resultado.omitidosPorReporte).toBe(1);
    expect(resultado.despachados).toBe(0);
    expect(emisor).not.toHaveBeenCalled();
  });

  it('el aviso previo a la medianoche local no frena el recordatorio del día', async () => {
    const db = crearDb([
      [alumnoSemanal],
      [],
      [{ usuarioId: alumnoId, createdAtUtc: new Date('2026-09-07T03:59:59.000Z') }],
    ]);
    const emisor = vi.fn().mockResolvedValue([]);
    const procesador = new AntropometriaRecordatorioProcessor(db, { emitAsync: emisor } as any);

    const resultado = await procesador.generarYDespachar(lunesCaracas06);

    expect(resultado.omitidosPorAviso).toBe(0);
    expect(resultado.despachados).toBe(1);
  });

  it('la medición posterior al inicio de la ventana silencia la expiración', async () => {
    const db = crearDb([
      [alumnoRemoto],
      [{ alumnoId, fechaEvaluacion: '2026-09-10' }],
      [],
    ]);
    const emisor = vi.fn();
    const procesador = new AntropometriaRecordatorioProcessor(db, { emitAsync: emisor } as any);

    const resultado = await procesador.generarYDespachar(martesCaracas06);

    expect(resultado.expiracionesDespachadas).toBe(0);
    expect(resultado.expiracionesOmitidasPorMedicion).toBe(1);
    expect(emisor).not.toHaveBeenCalled();
  });

  it('la expiración solo mira alumnos remotos aunque la fecha ya cerró', async () => {
    const presencial = { ...alumnoRemoto, modalidad: Modalidad.PRESENCIAL };
    const db = crearDb([[presencial]]);
    const emisor = vi.fn();
    const procesador = new AntropometriaRecordatorioProcessor(db, { emitAsync: emisor } as any);

    const resultado = await procesador.generarYDespachar(martesCaracas06);

    expect(resultado.expiracionesDespachadas).toBe(0);
    expect(emisor).not.toHaveBeenCalled();
  });

  it('el aviso de expiración usa el nombre completo sin espacios sobrantes', async () => {
    const conEspacios = {
      ...alumnoRemoto,
      nombres: ' Laura',
      apellidos: 'Remota ',
    };
    const db = crearDb([[conEspacios], [], []]);
    const emisor = vi.fn().mockResolvedValue([]);
    const procesador = new AntropometriaRecordatorioProcessor(db, { emitAsync: emisor } as any);

    await procesador.generarYDespachar(martesCaracas06);

    const [, evento] = emisor.mock.calls[0];
    expect(evento.payload.cuerpo).toBe(
      'Laura Remota no completó su medición del 2026-09-07; considera reprogramar.'
    );
  });
});
