import { describe, it, expect } from 'vitest';
import { RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import * as compartido from '@guachafit/shared';
import { FinanzasController } from '../../src/modules/finanzas/finanzas.controller';
import { FinanzasService } from '../../src/modules/finanzas/finanzas.service';

/**
 * M5 · lote P1 (contrato A): retiro de la emisión manual de cuotas.
 *
 * Decisión del dueño (2026-10-10): la única forma de emitir cuotas es la SUSCRIPCIÓN
 * (`asignarSuscripcion` / `emitirCuotasProgramadas`, RF-005 / RF-008). Por eso:
 * - A1: `FinanzasController` ya NO declara la ruta `POST cuotas/emitir`.
 * - A2: `FinanzasService` ya NO expone `emitirCuota`.
 * - A3: `@guachafit/shared` ya NO exporta `EmitirCuotaSchema`.
 * - V8 (correcciones del lote): `@guachafit/shared` ya NO exporta `PERIODO_MES_REGEX`
 *   (quedó huérfana al retirar `EmitirCuotaSchema`, su único consumidor).
 *
 * En fase roja A1–A3 FALLAN porque la ruta, el método y el esquema aún existen
 * (comportamiento viejo). La emisión por suscripción ya tiene su spec propio
 * (`rf005-rf008-suscripcion-servicio.spec.ts`) y los tests que dependían de la ruta
 * retirada se borraron o migraron (contrato A4).
 */
describe('M5 P1 · retiro de la emisión manual de cuotas (contrato A)', () => {
  it('A1: FinanzasController ya no declara la ruta POST cuotas/emitir', () => {
    const rutas: Array<{ metodo: string; path: string }> = [];
    for (const clave of Object.getOwnPropertyNames(FinanzasController.prototype)) {
      if (clave === 'constructor') continue;
      const handler = (FinanzasController.prototype as unknown as Record<string, unknown>)[clave];
      if (typeof handler !== 'function') continue;
      const path = Reflect.getMetadata(PATH_METADATA, handler);
      const method = Reflect.getMetadata(METHOD_METADATA, handler);
      if (typeof path === 'string' && typeof method === 'number') {
        const nombre =
          Object.entries(RequestMethod).find(([, valor]) => valor === method)?.[0] ?? String(method);
        rutas.push({ metodo: nombre, path });
      }
    }

    const retirada = rutas.find(
      (ruta) => ruta.path === 'cuotas/emitir' && ruta.metodo === 'POST'
    );
    expect(retirada).toBeUndefined();
  });

  it('A2: FinanzasService ya no expone emitirCuota', () => {
    expect(
      (FinanzasService.prototype as unknown as Record<string, unknown>).emitirCuota
    ).toBeUndefined();
  });

  it('A3: @guachafit/shared ya no exporta EmitirCuotaSchema', () => {
    expect('EmitirCuotaSchema' in compartido).toBe(false);
  });

  it('V8: @guachafit/shared ya no exporta PERIODO_MES_REGEX', () => {
    expect('PERIODO_MES_REGEX' in compartido).toBe(false);
  });
});
