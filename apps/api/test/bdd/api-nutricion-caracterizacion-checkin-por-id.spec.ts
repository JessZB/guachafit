import { describe, it, expect, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { getTableName } from '@guachafit/database';
import { NutricionService } from '../../src/modules/nutricion/nutricion.service';

/**
 * Prompt 106 §2 — Caracterización de `obtenerCheckinPorId`, único método público sin
 * invocación directa en los specs (solo se ejerce vía `registrarCheckinDiario`).
 * DB simulada al estilo de `nutricion-service.spec.ts`; en verde sobre el código SIN TOCAR.
 */
describe('106 Caracterización: obtenerCheckinPorId', () => {
  const ALUMNO_ID = 'a1111111-1111-4111-8111-111111111111';

  function crearDbSimulada(tablas: Record<string, any[]>) {
    const db: any = {
      select: vi.fn(() => {
        const q: any = {};
        q.from = vi.fn((tabla: any) => {
          q.filas = tablas[getTableName(tabla)] ?? [];
          return q;
        });
        q.where = vi.fn(() => q);
        q.orderBy = vi.fn(() => q);
        q.limit = vi.fn(() => q);
        q.then = (resolve: any) => resolve([...(q.filas ?? [])]);
        return q;
      }),
    };
    const withTenant = vi.fn(async (_ctx: any, fn: any) => fn(db));
    return { db, withTenant };
  }

  function filaCheckin() {
    return {
      id: 'chk-1',
      alumnoId: ALUMNO_ID,
      fecha: '2026-09-06',
      semaforo: 'cumplido',
      caloriasReportadas: 2100,
      proteinaGramosReportada: 150,
      aguaLitros: '2.00',
      notasAlumno: null,
      capturadoEnUtc: new Date('2026-09-07T02:00:00.000Z'),
      metasVigentes: null,
      createdAtUtc: new Date('2026-09-07T02:00:00.000Z'),
      updatedAtUtc: new Date('2026-09-07T02:00:00.000Z'),
    };
  }

  it('responde 404 con el mensaje histórico si el id no existe', async () => {
    const { db, withTenant } = crearDbSimulada({ checkins_nutricionales: [] });
    const servicio = new NutricionService(db, undefined, withTenant);

    const error = await servicio.obtenerCheckinPorId('inexistente').catch((e) => e);

    expect(error).toBeInstanceOf(NotFoundException);
    expect(error.message).toBe('No encontramos ese reporte. Actualiza la pantalla.');
  });

  it('hidrata el detalle con fotos, nombre del alumno y zona del perfil', async () => {
    const { db, withTenant } = crearDbSimulada({
      checkins_nutricionales: [filaCheckin()],
      fotos_comida: [
        {
          id: 'foto-1',
          checkinId: 'chk-1',
          tipoComida: 'almuerzo',
          storageKey: `comidas/${ALUMNO_ID}/2026-09-06/foto.webp`,
          createdAtUtc: new Date('2026-09-07T02:00:00.000Z'),
        },
      ],
      perfiles_alumno: [
        {
          usuarioId: ALUMNO_ID,
          nombres: 'Pedro',
          apellidos: 'Pérez',
          zonaHoraria: 'Europe/Madrid',
        },
      ],
    });
    const servicio = new NutricionService(db, undefined, withTenant);

    const detalle = await servicio.obtenerCheckinPorId('chk-1');

    expect(detalle.id).toBe('chk-1');
    expect(detalle.alumnoNombre).toBe('Pedro Pérez');
    expect(detalle.zonaHoraria).toBe('Europe/Madrid');
    expect(detalle.fotosPlatos).toHaveLength(1);
    expect(detalle.fotosPlatos[0]).toMatchObject({ id: 'foto-1', fotoUrl: null });
    expect(withTenant).toHaveBeenCalledWith({ usuarioId: ALUMNO_ID }, expect.any(Function));
  });

  it('sin perfil del alumno no lanza: nombre indefinido y zona por defecto', async () => {
    const { db, withTenant } = crearDbSimulada({
      checkins_nutricionales: [filaCheckin()],
      fotos_comida: [],
      perfiles_alumno: [],
    });
    const servicio = new NutricionService(db, undefined, withTenant);

    const detalle = await servicio.obtenerCheckinPorId('chk-1');

    expect(detalle.alumnoNombre).toBeUndefined();
    expect(detalle.zonaHoraria).toBe('America/Caracas');
  });
});
