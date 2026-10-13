/**
 * Demo queue for the conciliation tray.
 *
 * The fixture mirrors the WU20 queue: it is only used behind `isDemoMode`, and the
 * page slices it locally with the same `offset` arithmetic the server envelope uses.
 */
import { MetodoPago, Moneda, type TransaccionPagoDetalleDTO } from '@guachafit/shared';

/**
 * Demo receipt shown by the viewer. It only renders with `isDemoMode` active; in a
 * real session a receipt without URL (or with a failed load) shows an honest
 * placeholder instead (the server legitimately returns `comprobanteUrl = null`,
 * e.g. without R2 configured).
 */
export const COMPROBANTE_DEMO_URL =
  'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=800&q=80';

export function crearColaDemo(): TransaccionPagoDetalleDTO[] {
  return [
    {
      id: 'tx-pending-1',
      cuotaId: 'cuota-101',
      clienteId: 'cli-01',
      entrenadorId: 'coach-01',
      clienteNombre: 'Carlos Mendoza',
      registradoPor: 'cli-01',
      montoOriginal: '1950.00',
      monedaOriginal: Moneda.VES,
      tasaCambioFijada: '65.0000',
      montoEquivalenteUsd: '30.00',
      excedenteUsd: '0.00',
      metodoPago: MetodoPago.PAGO_MOVIL,
      referenciaBancaria: '445566',
      fechaOperacion: '2026-09-06',
      comprobanteStorageKey: 'comprobantes/cli-01/2026/demo-recibo-1.webp',
      comprobanteUrl:
        'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=800&q=80',
      estadoConciliacion: 'pendiente' as never,
      fechaReporteUtc: new Date().toISOString(),
      createdAtUtc: new Date().toISOString(),
      updatedAtUtc: new Date().toISOString(),
    },
    {
      id: 'tx-pending-2',
      cuotaId: 'cuota-102',
      clienteId: 'cli-02',
      entrenadorId: 'coach-01',
      clienteNombre: 'Mariana Pérez',
      registradoPor: 'cli-02',
      montoOriginal: '50.00',
      monedaOriginal: Moneda.USD,
      tasaCambioFijada: '65.0000',
      montoEquivalenteUsd: '50.00',
      excedenteUsd: '0.00',
      metodoPago: MetodoPago.ZELLE,
      referenciaBancaria: 'ZEL-998811',
      fechaOperacion: '2026-09-05',
      comprobanteStorageKey: 'comprobantes/cli-02/2026/demo-recibo-2.webp',
      comprobanteUrl:
        'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=800&q=80',
      estadoConciliacion: 'pendiente' as never,
      fechaReporteUtc: new Date().toISOString(),
      createdAtUtc: new Date().toISOString(),
      updatedAtUtc: new Date().toISOString(),
    },
  ];
}
