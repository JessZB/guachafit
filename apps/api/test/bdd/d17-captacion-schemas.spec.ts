import { describe, it, expect } from 'vitest';
import {
  ActualizarCaptacionSchema,
  CrearEntrenadorSchema,
  OrigenRegistro,
} from '@guachafit/shared';

/**
 * D17 · Contratos de shared (reubicados desde
 * `packages/shared/src/schemas/captacion.spec.ts`).
 * `packages/shared` no tiene vitest en devDependencies, por lo que el spec
 * vive en apps/api donde sí se ejecuta (mismo patrón que mis-alumnos-orden-schema.spec.ts).
 * Fase roja: `OrigenRegistro` y `ActualizarCaptacionSchema` aún no existen en `@guachafit/shared`,
 * y `CrearEntrenadorSchema.coachCode` aún es requerido.
 */
describe('D17 · Tarea 6: Shared (ActualizarCaptacionSchema, CrearEntrenadorSchema.coachCode y OrigenRegistro)', () => {
  describe('6.1 OrigenRegistro enum', () => {
    it('OrigenRegistro debe exportarse en @guachafit/shared con valores "manual" y "enlace"', () => {
      expect(
        OrigenRegistro,
        'OrigenRegistro debe exportarse en @guachafit/shared'
      ).toBeDefined();

      expect(OrigenRegistro).toMatchObject({
        MANUAL: 'manual',
        ENLACE: 'enlace',
      });
    });
  });

  describe('6.2 ActualizarCaptacionSchema', () => {
    it('ActualizarCaptacionSchema debe exportarse en @guachafit/shared', () => {
      expect(
        ActualizarCaptacionSchema,
        'ActualizarCaptacionSchema debe exportarse en @guachafit/shared'
      ).toBeDefined();
    });

    it('acepta { activa: true } y { activa: false }', () => {
      expect(
        ActualizarCaptacionSchema,
        'ActualizarCaptacionSchema debe exportarse en @guachafit/shared'
      ).toBeDefined();

      const resultadoTrue = ActualizarCaptacionSchema.safeParse({ activa: true });
      expect(resultadoTrue.success).toBe(true);
      if (resultadoTrue.success) {
        expect(resultadoTrue.data.activa).toBe(true);
      }

      const resultadoFalse = ActualizarCaptacionSchema.safeParse({ activa: false });
      expect(resultadoFalse.success).toBe(true);
      if (resultadoFalse.success) {
        expect(resultadoFalse.data.activa).toBe(false);
      }
    });

    it('rechaza ausencia de activa ({})', () => {
      expect(
        ActualizarCaptacionSchema,
        'ActualizarCaptacionSchema debe exportarse en @guachafit/shared'
      ).toBeDefined();

      const resultado = ActualizarCaptacionSchema.safeParse({});
      expect(resultado.success).toBe(false);
    });

    it('rechaza activa no booleano (string, número, null, undefined)', () => {
      expect(
        ActualizarCaptacionSchema,
        'ActualizarCaptacionSchema debe exportarse en @guachafit/shared'
      ).toBeDefined();

      expect(ActualizarCaptacionSchema.safeParse({ activa: 'true' }).success).toBe(false);
      expect(ActualizarCaptacionSchema.safeParse({ activa: 1 }).success).toBe(false);
      expect(ActualizarCaptacionSchema.safeParse({ activa: 0 }).success).toBe(false);
      expect(ActualizarCaptacionSchema.safeParse({ activa: null }).success).toBe(false);
    });
  });

  describe('6.3 CrearEntrenadorSchema.coachCode opcional', () => {
    const dtoBase = {
      nombres: 'Alejandro',
      apellidos: 'García',
      email: 'alejandro@guachafit.com',
      capacidadMaxima: 30,
      tasaCambioGlobal: '65.0000',
      telefonoContacto: '+584121234567',
    };

    it('acepta el DTO sin coachCode (campo opcional para autogeneración del servidor)', () => {
      const parsed = CrearEntrenadorSchema.safeParse(dtoBase);
      expect(
        parsed.success,
        'CrearEntrenadorSchema debe aceptar el DTO sin coachCode'
      ).toBe(true);
    });

    it('con coachCode dado, sigue validando que cumpla el formato permitido', () => {
      // Formato válido
      const conCodigoValido = CrearEntrenadorSchema.safeParse({
        ...dtoBase,
        coachCode: 'ALEJANDRO1',
      });
      expect(conCodigoValido.success).toBe(true);

      // Formato inválido (caracteres no permitidos o longitud menor a 3/4)
      const conCodigoInvalido = CrearEntrenadorSchema.safeParse({
        ...dtoBase,
        coachCode: '!',
      });
      expect(conCodigoInvalido.success).toBe(false);
    });
  });
});
