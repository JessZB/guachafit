import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ZodError } from 'zod';
import { NotificationDispatcherService } from '../../src/modules/notificaciones/notification-dispatcher.service';
import { NotificacionesController } from '../../src/modules/notificaciones/notificaciones.controller';
import {
  FiltroBandejaInAppSchema,
  LIMITE_IN_APP_MAXIMO,
  LIMITE_IN_APP_POR_DEFECTO,
} from '@guachafit/shared';

/**
 * RF-014 (Ola 3): bandeja In-App para la campana de N2.
 *
 * Verifica el envelope `{items,total,limit,offset}` + `totalNoLeidas`, el filtro `soloNoLeidas`,
 * el orden recientes-primero con desempate por `id` (ADR-013) y que marcar leída / todas leídas
 * sigue funcionando.
 */

/** Extrae las igualdades `columna = valor` de un predicado Drizzle (`and(eq(...), eq(...))`). */
function extraerIgualdades(sqlObj: any): Array<{ columna: string; valor: any }> {
  const condiciones: Array<{ columna: string; valor: any }> = [];

  function recorrer(chunks: any[]) {
    if (!Array.isArray(chunks)) return;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (chunk?.queryChunks) {
        recorrer(chunk.queryChunks);
        continue;
      }
      if (chunk && typeof chunk.name === 'string') {
        for (let j = i + 1; j < chunks.length; j++) {
          const posibleParam = chunks[j];
          if (
            posibleParam &&
            typeof posibleParam === 'object' &&
            'value' in posibleParam &&
            !Array.isArray(posibleParam.value) &&
            !posibleParam.queryChunks
          ) {
            condiciones.push({ columna: chunk.name, valor: posibleParam.value });
            break;
          }
          if (typeof posibleParam === 'string' || Array.isArray(posibleParam)) continue;
          if (posibleParam?.queryChunks) break;
        }
      }
    }
  }

  recorrer(sqlObj?.queryChunks ?? []);
  return condiciones;
}

function cumpleCondicion(condicion: any, registro: any): boolean {
  // Las columnas Drizzle exponen el nombre REAL en SQL (snake_case); el registro mock usa
  // las propiedades camelCase del schema.
  const normalizarColumna = (columna: string) =>
    columna.replace(/_([a-z])/g, (_: string, letra: string) => letra.toUpperCase());

  return extraerIgualdades(condicion).every(({ columna, valor }) => {
    const clave = normalizarColumna(columna);
    return (registro[clave] ?? registro[columna]) === valor;
  });
}

function crearMockDbBandeja(notificaciones: any[]) {
  const ordenes: any[][] = [];

  const db: any = {
    select: vi.fn((campos: any) => ({
      from: vi.fn(() => ({
        where: vi.fn((condicion: any) => {
          const filtradas = notificaciones.filter((n) => cumpleCondicion(condicion, n));

          // Consulta de conteo: `select({ total: count() })` se espera en el `where`.
          if (campos && typeof campos === 'object' && 'total' in campos) {
            return Promise.resolve([{ total: filtradas.length }]);
          }

          const consulta: any = {
            orderBy: vi.fn((...args: any[]) => {
              ordenes.push(args);
              return consulta;
            }),
            limit: vi.fn((n: number) => ({
              offset: vi.fn(async (o: number) => filtradas.slice(o, o + n)),
            })),
          };
          return consulta;
        }),
      })),
    })),
  };

  return { db, ordenes };
}

describe('RF-014: bandeja In-App paginada', () => {
  const usuarioId = '11111111-1111-4111-8111-111111111111';
  const otroUsuarioId = '99999999-9999-4999-8999-999999999999';

  function crearNotificacion(id: string, leida: boolean, usuario = usuarioId, fecha?: Date) {
    return {
      id,
      usuarioId: usuario,
      titulo: `Notificación ${id}`,
      cuerpo: 'Cuerpo',
      tipoEvento: 'CUOTA_POR_VENCER',
      leida,
      linkAccion: '/app/pagos',
      createdAtUtc: fecha ?? new Date('2026-09-22T10:00:00.000Z'),
    };
  }

  describe('envelope, paginación y filtro', () => {
    it('devuelve el envelope con total real, totalNoLeidas y orden recientes-primero', async () => {
      const notificaciones = [
        crearNotificacion('n-1', false, usuarioId, new Date('2026-09-22T10:00:00.000Z')),
        crearNotificacion('n-2', true, usuarioId, new Date('2026-09-21T10:00:00.000Z')),
        crearNotificacion('n-3', false, usuarioId, new Date('2026-09-20T10:00:00.000Z')),
        crearNotificacion('n-ajena', false, otroUsuarioId),
      ];
      const { db, ordenes } = crearMockDbBandeja(notificaciones);
      const servicio = new NotificationDispatcherService(db, {} as any, {} as any, {} as any, {} as any);

      const bandeja = await servicio.listarNotificacionesInApp(usuarioId);

      expect(bandeja.total).toBe(3);
      expect(bandeja.limit).toBe(LIMITE_IN_APP_POR_DEFECTO);
      expect(bandeja.offset).toBe(0);
      expect(bandeja.totalNoLeidas).toBe(2);
      expect(bandeja.items).toHaveLength(3);
      expect(bandeja.items.map((n) => n.id)).toEqual(['n-1', 'n-2', 'n-3']);
      expect(bandeja.items[0].createdAtUtc).toBe('2026-09-22T10:00:00.000Z');
      // Desempate estable por id para que `offset` avance sin repetir ni saltar filas.
      expect(ordenes[0]).toHaveLength(2);
    });

    it('pagina con limit/offset sobre el total real (no sobre la página)', async () => {
      const notificaciones = Array.from({ length: 30 }, (_, i) =>
        crearNotificacion(`n-${String(i).padStart(2, '0')}`, false, usuarioId, new Date(2026, 8, 1, 0, i))
      );
      const { db } = crearMockDbBandeja(notificaciones);
      const servicio = new NotificationDispatcherService(db, {} as any, {} as any, {} as any, {} as any);

      const bandeja = await servicio.listarNotificacionesInApp(usuarioId, { limit: 10, offset: 20 });

      expect(bandeja.total).toBe(30);
      expect(bandeja.limit).toBe(10);
      expect(bandeja.offset).toBe(20);
      expect(bandeja.items).toHaveLength(10);
      expect(bandeja.items[0].id).toBe('n-20');
      expect(bandeja.items[9].id).toBe('n-29');
    });

    it('`soloNoLeidas` recorta la lista y el total, pero totalNoLeidas sigue contando todas', async () => {
      const notificaciones = [
        crearNotificacion('n-1', false),
        crearNotificacion('n-2', true),
        crearNotificacion('n-3', false),
      ];
      const { db } = crearMockDbBandeja(notificaciones);
      const servicio = new NotificationDispatcherService(db, {} as any, {} as any, {} as any, {} as any);

      const bandeja = await servicio.listarNotificacionesInApp(usuarioId, { soloNoLeidas: true });

      expect(bandeja.total).toBe(2);
      expect(bandeja.totalNoLeidas).toBe(2);
      expect(bandeja.items.map((n) => n.id)).toEqual(['n-1', 'n-3']);
    });
  });

  describe('validación del filtro (zod)', () => {
    it('parsea strings de query y aplica defaults', () => {
      expect(FiltroBandejaInAppSchema.parse({})).toEqual({
        limit: LIMITE_IN_APP_POR_DEFECTO,
        offset: 0,
        soloNoLeidas: false,
      });
      expect(
        FiltroBandejaInAppSchema.parse({ limit: '10', offset: '5', soloNoLeidas: 'true' })
      ).toEqual({ limit: 10, offset: 5, soloNoLeidas: true });
      // `Boolean('false') === true`: el schema NO debe caer en ese bug.
      expect(FiltroBandejaInAppSchema.parse({ soloNoLeidas: 'false' }).soloNoLeidas).toBe(false);
    });

    it('rechaza límites inválidos con error de validación', () => {
      expect(() => FiltroBandejaInAppSchema.parse({ limit: '0' })).toThrow(ZodError);
      expect(() =>
        FiltroBandejaInAppSchema.parse({ limit: String(LIMITE_IN_APP_MAXIMO + 1) })
      ).toThrow(ZodError);
      expect(() => FiltroBandejaInAppSchema.parse({ offset: '-1' })).toThrow(ZodError);
    });
  });

  describe('controlador', () => {
    it('GET in-app parsea la query y delega en el servicio', async () => {
      const listarNotificacionesInApp = vi.fn().mockResolvedValue({
        items: [],
        total: 0,
        limit: 2,
        offset: 0,
        totalNoLeidas: 0,
      });
      const controller = new NotificacionesController({} as any, {
        listarNotificacionesInApp,
      } as any);

      const resultado = await controller.listarInApp(
        { user: { sub: usuarioId } },
        { limit: '2', soloNoLeidas: 'true' }
      );

      expect(listarNotificacionesInApp).toHaveBeenCalledWith(usuarioId, {
        limit: 2,
        offset: 0,
        soloNoLeidas: true,
      });
      expect(resultado.total).toBe(0);
    });

    it('marcar leída / todas leídas siguen expuestos y delegan en el servicio', async () => {
      const marcarLeida = vi.fn().mockResolvedValue(true);
      const marcarTodasLeidas = vi.fn().mockResolvedValue(3);
      const controller = new NotificacionesController({} as any, {
        marcarLeida,
        marcarTodasLeidas,
      } as any);

      await expect(
        controller.marcarLeida({ user: { sub: usuarioId } }, 'notif-1')
      ).resolves.toEqual({ success: true });
      expect(marcarLeida).toHaveBeenCalledWith(usuarioId, 'notif-1');

      await expect(controller.marcarTodasLeidas({ user: { sub: usuarioId } })).resolves.toEqual({
        success: true,
        count: 3,
      });
      expect(marcarTodasLeidas).toHaveBeenCalledWith(usuarioId);
    });
  });

  describe('marcar leída (servicio)', () => {
    function crearDbUpdate(resultado: any[]) {
      const db: any = {
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(() => ({
              returning: vi.fn(async () => resultado),
            })),
          })),
        })),
      };
      return db;
    }

    it('marca una notificación propia como leída', async () => {
      const servicio = new NotificationDispatcherService(
        crearDbUpdate([{ id: 'notif-1', leida: true }]),
        {} as any,
        {} as any,
        {} as any,
        {} as any
      );

      await expect(servicio.marcarLeida(usuarioId, 'notif-1')).resolves.toBe(true);
    });

    it('lanza 404 si la notificación no existe o es de otro usuario', async () => {
      const servicio = new NotificationDispatcherService(
        crearDbUpdate([]),
        {} as any,
        {} as any,
        {} as any,
        {} as any
      );

      await expect(servicio.marcarLeida(usuarioId, 'notif-ajena')).rejects.toBeInstanceOf(
        NotFoundException
      );
    });

    it('marcar todas leídas devuelve cuántas filas cambió', async () => {
      const servicio = new NotificationDispatcherService(
        crearDbUpdate([{ id: 'n-1' }, { id: 'n-2' }]),
        {} as any,
        {} as any,
        {} as any,
        {} as any
      );

      await expect(servicio.marcarTodasLeidas(usuarioId)).resolves.toBe(2);
    });
  });
});
