/**
 * Caracterización del transporte de FinanzasController (paginación y contexto del actor).
 * Fija el comportamiento actual antes de extraer la lógica a `controlador-finanzas/`.
 * Servicio simulado; sin base de datos.
 */
import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { FinanzasController } from '../../src/modules/finanzas/finanzas.controller';
import { Rol } from '@guachafit/shared';

const UUID_COACH = '11111111-1111-4111-8111-111111111111';
const UUID_ALUMNO = '22222222-2222-4222-8222-222222222222';

function crearControlador(servicioParcial: Record<string, unknown>) {
  return new FinanzasController(servicioParcial as never);
}

describe('FinanzasController: caracterización de paginación y contexto del actor', () => {
  it('la bandeja usa limit 25 y offset 0 cuando no llegan query', async () => {
    const listar = vi.fn().mockResolvedValue({ items: [], total: 0, limit: 25, offset: 0 });
    const controlador = crearControlador({ listarBandejaConciliacion: listar });

    await controlador.listarBandejaConciliacion({ user: { entrenadorId: UUID_COACH } }, undefined, undefined);

    expect(listar).toHaveBeenCalledWith(UUID_COACH, 25, 0);
  });

  it('la bandeja acota el limit al techo de 100 y el offset negativo a 0', async () => {
    const listar = vi.fn().mockResolvedValue({ items: [], total: 0 });
    const controlador = crearControlador({ listarBandejaConciliacion: listar });

    await controlador.listarBandejaConciliacion({ user: { entrenadorId: UUID_COACH } }, '500', '-3');

    expect(listar).toHaveBeenCalledWith(UUID_COACH, 100, 0);
  });

  it('la bandeja trata un limit no numérico con el valor por defecto', async () => {
    const listar = vi.fn().mockResolvedValue({ items: [], total: 0 });
    const controlador = crearControlador({ listarBandejaConciliacion: listar });

    await controlador.listarBandejaConciliacion({ user: { entrenadorId: UUID_COACH } }, 'no-numero', undefined);

    expect(listar).toHaveBeenCalledWith(UUID_COACH, 25, 0);
  });

  it('el historial sin txLimit pide todas las transacciones (undefined) con offset 0', async () => {
    const historial = vi.fn().mockResolvedValue({ transaccionesTotal: 0 });
    const controlador = crearControlador({ obtenerHistorialCliente: historial });

    await controlador.obtenerHistorialCliente(
      { user: { sub: UUID_COACH, rol: Rol.ENTRENADOR, entrenadorId: UUID_COACH } },
      UUID_ALUMNO,
      undefined,
      undefined,
    );

    expect(historial).toHaveBeenCalledWith(UUID_COACH, UUID_ALUMNO, UUID_COACH, Rol.ENTRENADOR, undefined, 0);
  });

  it('el historial acota txLimit al máximo y normaliza txOffset', async () => {
    const historial = vi.fn().mockResolvedValue({ transaccionesTotal: 0 });
    const controlador = crearControlador({ obtenerHistorialCliente: historial });

    await controlador.obtenerHistorialCliente(
      { user: { sub: UUID_COACH, rol: Rol.ENTRENADOR, entrenadorId: UUID_COACH } },
      UUID_ALUMNO,
      '9999',
      '-5',
    );

    expect(historial).toHaveBeenCalledWith(UUID_COACH, UUID_ALUMNO, UUID_COACH, Rol.ENTRENADOR, 100, 0);
  });

  it('el historial rechaza un clienteId que no es UUID sin llamar al servicio', async () => {
    const historial = vi.fn();
    const controlador = crearControlador({ obtenerHistorialCliente: historial });

    const error = await controlador
      .obtenerHistorialCliente({ user: { sub: UUID_COACH, rol: Rol.ENTRENADOR } }, 'no-uuid', undefined, undefined)
      .catch((e) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(historial).not.toHaveBeenCalled();
  });

  it('la tasa vigente resuelve el alumno como objetivo cuando el actor es alumno', async () => {
    const tasa = vi.fn().mockResolvedValue({ tasaEfectiva: '10.0000' });
    const controlador = crearControlador({ obtenerTasaVigente: tasa });

    await controlador.obtenerTasaVigente(
      { user: { sub: UUID_ALUMNO, rol: Rol.ALUMNO, entrenadorId: UUID_COACH } },
      'otro-cliente-que-se-ignora',
    );

    expect(tasa).toHaveBeenCalledWith(UUID_COACH, UUID_ALUMNO, undefined, { usuarioId: UUID_ALUMNO });
  });

  it('la tasa vigente falla con 400 sin llamar al servicio cuando falta el entrenador', async () => {
    const tasa = vi.fn();
    const controlador = crearControlador({ obtenerTasaVigente: tasa });

    const error = await controlador
      .obtenerTasaVigente({ user: { rol: Rol.ENTRENADOR } }, undefined)
      .catch((e) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.message).toBe('No se pudo determinar el contexto del entrenador para la tasa.');
    expect(tasa).not.toHaveBeenCalled();
  });
});
