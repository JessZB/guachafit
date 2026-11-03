/**
 * Adaptadores puros del módulo `pagos` (fase B, prompt 54).
 *
 * Movidos tal cual desde `pages/atleta/PagosPage.tsx` (L58–175): fixture demo
 * WU25b y los 2 adaptadores del resumen financiero real al DTO que renderiza
 * la vista. Sin JSX, sin red, sin estado: solo lectura y mapeo (R1, lógica pura).
 *
 * §6: sin texto visible (los strings son IDs/URLs internas); la URL demo N2 solo
 * se renderiza con `isDemoMode` activo (decisión del llamador, no de este módulo).
 */
import {
  EstadoConciliacion,
  EstadoCuota,
  MetodoPago,
  Moneda,
  type AuthUserDTO,
  type CuotaDetalleDTO,
  type ResumenFinancieroAlumnoDTO,
  type TransaccionPagoDetalleDTO,
} from '@guachafit/shared';

/**
 * N2: imagen de demostración del visor de comprobante. SOLO se renderiza con `isDemoMode`
 * activo; en sesión real, un comprobante sin URL o con carga fallida muestra un placeholder
 * honesto (el server devuelve `comprobanteUrl = null` de forma legítima, ej. sin R2 configurado).
 */
export const COMPROBANTE_DEMO_URL =
  'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=600&q=80';

/**
 * WU25b: transacción demo del historial (mismo fixture de WU20). Solo se usa con `isDemoMode`
 * activo; el slice de página se corta localmente con la misma aritmética del `offset` del API.
 */
export function crearTransaccionesDemoPagos(
  user: AuthUserDTO | null
): TransaccionPagoDetalleDTO[] {
  return [
    {
      id: 'tx-001',
      cuotaId: 'cuota-demo-001',
      clienteId: user?.id || 'demo-alumno',
      entrenadorId: user?.entrenadorId || 'demo-coach',
      registradoPor: user?.id || 'demo-alumno',
      montoOriginal: '1300.00',
      monedaOriginal: Moneda.VES,
      tasaCambioFijada: '65.0000',
      montoEquivalenteUsd: '20.00',
      excedenteUsd: '0.00',
      metodoPago: MetodoPago.PAGO_MOVIL,
      referenciaBancaria: '987654',
      fechaOperacion: '2026-09-02',
      estadoConciliacion: EstadoConciliacion.APROBADO,
      fechaReporteUtc: new Date().toISOString(),
      createdAtUtc: new Date().toISOString(),
      updatedAtUtc: new Date().toISOString(),
    },
  ];
}

/**
 * WU20: normaliza las transacciones del historial real al DTO que renderiza la vista.
 * `GET /finanzas/clientes/:id/historial` entrega `estado`/`referencia`/`montoUsd`/`montoBs`
 * (no `estadoConciliacion`/`referenciaBancaria`/`montoEquivalenteUsd`); sin este mapeo la fila
 * mostraba "En Revisión" y montos indefinidos. Es solo lectura: no toca el flujo de reportar pago.
 */
export function adaptarTransaccionesHistorial(
  transacciones: ResumenFinancieroAlumnoDTO['transacciones'],
  contexto: { clienteId: string; entrenadorId: string }
): TransaccionPagoDetalleDTO[] {
  return transacciones.map((tx) => {
    const esVes = Boolean(tx.montoBs);
    const tasa = esVes
      ? Number(tx.montoUsd) > 0
        ? (Number(tx.montoBs) / Number(tx.montoUsd)).toFixed(4)
        : ''
      : '1.0000';

    return {
      id: tx.id,
      cuotaId: tx.cuotaId,
      clienteId: contexto.clienteId,
      entrenadorId: contexto.entrenadorId,
      registradoPor: contexto.clienteId,
      montoOriginal: tx.montoBs ?? tx.montoUsd,
      monedaOriginal: esVes ? Moneda.VES : Moneda.USD,
      tasaCambioFijada: tasa,
      montoEquivalenteUsd: tx.montoUsd,
      // El historial no trae el excedente del pago; esta vista no lo muestra.
      excedenteUsd: '0.00',
      metodoPago: tx.metodoPago as MetodoPago,
      referenciaBancaria: tx.referencia ?? null,
      fechaOperacion: tx.createdAtUtc ? tx.createdAtUtc.slice(0, 10) : '',
      estadoConciliacion: (tx.estado as EstadoConciliacion) ?? EstadoConciliacion.PENDIENTE,
      motivoReversion: tx.motivoReversion ?? null,
      motivoRechazo: tx.motivoRechazo ?? null,
      fechaReporteUtc: tx.createdAtUtc,
      createdAtUtc: tx.createdAtUtc,
      updatedAtUtc: tx.createdAtUtc,
    };
  });
}

/**
 * Adapta el resumen financiero real (`GET /finanzas/clientes/:id/historial`) a la vista de cuota.
 * Solo transporta datos reales: los campos no mostrados se rellenan con valores neutros y los
 * campos visibles (saldos, estado, vencimiento, transacciones) provienen del servidor.
 */
export function adaptarCuotaDesdeResumen(
  resumen: ResumenFinancieroAlumnoDTO,
  entrenadorId: string
): CuotaDetalleDTO | null {
  const c = resumen.cuotaMesActual;
  if (!c) return null;
  return {
    id: c.id,
    clienteId: resumen.alumnoId,
    entrenadorId,
    planId: '',
    planNombre: `Cuota del periodo ${c.periodo}`,
    periodo: c.periodo,
    montoTotalUsd: c.montoTotalUsd,
    montoAbonadoUsd: c.montoPagadoUsd,
    saldoPendienteUsd: c.saldoPendienteUsd,
    saldoAFavorAplicadoUsd: c.saldoAFavorAplicadoUsd ?? '0.00',
    fechaEmisionUtc: c.fechaVencimiento,
    fechaCorteUtc: c.fechaVencimiento,
    estado: c.estado as EstadoCuota,
    transacciones: adaptarTransaccionesHistorial(resumen.transacciones, {
      clienteId: resumen.usuarioId,
      entrenadorId,
    }),
    createdAtUtc: new Date().toISOString(),
    updatedAtUtc: new Date().toISOString(),
  };
}
