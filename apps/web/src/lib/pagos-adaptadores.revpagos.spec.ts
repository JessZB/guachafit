import { afterEach, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';
import { EstadoConciliacion, MetodoPago } from '@guachafit/shared';
import { adaptarTransaccionesHistorial } from './pagos-adaptadores';

afterEach(() => {
  cleanup();
});

describe('lib/pagos-adaptadores · mapeo de motivoRechazo (D15)', () => {
  it('P7: adaptarTransaccionesHistorial mapea motivoRechazo con la cadena recibida y null cuando falta', () => {
    const transacciones = [
      {
        id: 'tx-rechazada-1',
        cuotaId: 'cuota-1',
        montoUsd: '30.00',
        montoBs: '1950.00',
        metodoPago: MetodoPago.PAGO_MOVIL,
        referencia: 'REF-001',
        estado: EstadoConciliacion.RECHAZADO,
        motivoRechazo: 'Comprobante borroso',
        createdAtUtc: '2026-10-10T12:00:00.000Z',
      },
      {
        id: 'tx-aprobada-2',
        cuotaId: 'cuota-1',
        montoUsd: '30.00',
        montoBs: '1950.00',
        metodoPago: MetodoPago.PAGO_MOVIL,
        referencia: 'REF-002',
        estado: EstadoConciliacion.APROBADO,
        createdAtUtc: '2026-10-10T12:00:00.000Z',
      },
    ];

    const contexto = {
      clienteId: 'cliente-uuid-1',
      entrenadorId: 'entrenador-uuid-1',
    };

    const adaptadas = adaptarTransaccionesHistorial(transacciones as any, contexto);

    expect(adaptadas).toHaveLength(2);
    expect(adaptadas[0].motivoRechazo).toBe('Comprobante borroso');
    expect(adaptadas[1].motivoRechazo).toBeNull();
  });
});
