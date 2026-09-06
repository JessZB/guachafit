import { describe, it, expect, beforeEach } from 'vitest';
import {
  Moneda,
  MetodoPago,
  EstadoConciliacion,
  EstadoCuota,
  ReportarPagoSchema,
  ConciliarTransaccionSchema,
} from '@guachafit/shared';
import {
  BandejaConciliacionEngine,
  CuotaState,
  CuotaStateMachine,
} from './helpers/finance-test-engine';

describe('RF-007: Reporte de Pagos por el Cliente y Bandeja de Conciliación para el Entrenador', () => {
  let bandejaEngine: BandejaConciliacionEngine;
  let cuotaInicial: CuotaState;
  const tasaCoach = '60.0000';

  beforeEach(() => {
    bandejaEngine = new BandejaConciliacionEngine();
    cuotaInicial = {
      id: 'cuota-40-usd',
      clienteId: 'cliente-alumno-1',
      entrenadorId: 'coach-1',
      planId: 'plan-online-1',
      periodo: '2026-09',
      montoTotalUsd: '40.00',
      montoAbonadoUsd: '0.00',
      saldoPendienteUsd: '40.00',
      fechaEmisionUtc: '2026-09-01T00:00:00Z',
      fechaCorteUtc: '2026-09-30T23:59:59Z',
      estado: EstadoCuota.EMITIDA,
      transacciones: [],
    };
  });

  describe('Escenario 1: Reporte Exitoso de Pago Móvil por el Alumno (Gherkin Escenario 1 & RN-02)', () => {
    it('debe registrar la transacción en pendiente de verificación y cambiar cuota a pendiente de revisión', () => {
      // Given que el alumno tiene una cuota con saldo pendiente de $40.00 USD
      expect(cuotaInicial.saldoPendienteUsd).toBe('40.00');
      expect(cuotaInicial.estado).toBe(EstadoCuota.EMITIDA);

      // When completa el formulario con monto 1200 VES, Pago Móvil, referencia 984521 y comprobante
      const reportePayload = {
        montoOriginal: '1200.00',
        monedaOriginal: Moneda.VES,
        metodoPago: MetodoPago.PAGO_MOVIL,
        referenciaBancaria: '984521',
        fechaOperacion: '2026-09-06',
        comprobanteStorageKey: 'comprobantes/captura_banco.jpg',
        idempotencyKey: 'idemp-key-1',
      };

      // Validar esquema de contrato Zod (RF-007 RN-02)
      const parseResult = ReportarPagoSchema.safeParse(reportePayload);
      expect(parseResult.success).toBe(true);

      const { transaccion, cuotaActualizada, esDuplicadoIdempotente } =
        bandejaEngine.reportarPago({
          cuota: cuotaInicial,
          dto: reportePayload,
          tasaGlobalCoach: tasaCoach,
          registradoPor: cuotaInicial.clienteId,
        });

      // Then el sistema debe guardar la transacción en estado "Pendiente de Verificación"
      expect(transaccion.estadoConciliacion).toBe(EstadoConciliacion.PENDIENTE);
      expect(transaccion.tasaCambioFijada).toBe('60.0000');
      expect(transaccion.montoEquivalenteUsd).toBe('20.00'); // 1200 / 60
      expect(esDuplicadoIdempotente).toBe(false);

      // And cambiar temporalmente el estado de la cuota a "Pendiente de Revisión"
      expect(cuotaActualizada.estado).toBe(EstadoCuota.PENDIENTE_REVISION);
      expect(cuotaActualizada.transacciones.length).toBe(1);
    });
  });

  describe('Escenario 2: Entrenador Aprueba Pago desde la Bandeja (Gherkin Escenario 2 & RN-04)', () => {
    it('debe aprobar el pago, descontar crédito en USD y transicionar la cuota a abonada parcial', () => {
      // Given que el entrenador tiene un pago en su bandeja por Bs. 1,200 ($20.00 USD equivalentes)
      const { transaccion } = bandejaEngine.reportarPago({
        cuota: cuotaInicial,
        dto: {
          montoOriginal: '1200.00',
          monedaOriginal: Moneda.VES,
          metodoPago: MetodoPago.PAGO_MOVIL,
          referenciaBancaria: '984521',
          fechaOperacion: '2026-09-06',
          comprobanteStorageKey: 'comprobantes/recibo.jpg',
        },
        tasaGlobalCoach: tasaCoach,
        registradoPor: cuotaInicial.clienteId,
      });

      // When revisa el comprobante y presiona "Aprobar Pago"
      const { transaccion: txAprobada, cuotaActualizada } =
        bandejaEngine.aprobarTransaccion({
          cuota: cuotaInicial,
          transaccionId: transaccion.id,
        });

      // Then el sistema debe marcar la transacción como "Aprobada"
      expect(txAprobada.estadoConciliacion).toBe(EstadoConciliacion.APROBADO);
      expect(txAprobada.fechaConciliacionUtc).not.toBeNull();

      // And reducir el saldo pendiente de la cuota de $40.00 a $20.00 USD
      expect(cuotaActualizada.saldoPendienteUsd).toBe('20.00');
      expect(cuotaActualizada.montoAbonadoUsd).toBe('20.00');

      // And cambiar el estado de la cuota a "Abonada (Parcial)"
      expect(cuotaActualizada.estado).toBe(EstadoCuota.ABONADA_PARCIAL);

      // Invariante de balance estricta verificada
      CuotaStateMachine.assertBalanceInvariant(cuotaActualizada);
    });

    it('debe liquidar la cuota a estado "Al Día" cuando el saldo remanente llega exactamente a $0.00 USD', () => {
      // Registrar y aprobar primer abono ($20.00 USD)
      const { transaccion: tx1 } = bandejaEngine.reportarPago({
        cuota: cuotaInicial,
        dto: {
          montoOriginal: '1200.00',
          monedaOriginal: Moneda.VES,
          metodoPago: MetodoPago.PAGO_MOVIL,
          referenciaBancaria: 'ref-001',
          fechaOperacion: '2026-09-06',
        },
        tasaGlobalCoach: tasaCoach,
        registradoPor: cuotaInicial.clienteId,
      });
      bandejaEngine.aprobarTransaccion({ cuota: cuotaInicial, transaccionId: tx1.id });

      // Registrar y aprobar segundo abono por el saldo restante ($20.00 USD)
      const { transaccion: tx2 } = bandejaEngine.reportarPago({
        cuota: cuotaInicial,
        dto: {
          montoOriginal: '1200.00',
          monedaOriginal: Moneda.VES,
          metodoPago: MetodoPago.PAGO_MOVIL,
          referenciaBancaria: 'ref-002',
          fechaOperacion: '2026-09-07',
        },
        tasaGlobalCoach: tasaCoach,
        registradoPor: cuotaInicial.clienteId,
      });

      const { cuotaActualizada } = bandejaEngine.aprobarTransaccion({
        cuota: cuotaInicial,
        transaccionId: tx2.id,
      });

      // Saldo pendiente llega a 0.00 USD y estado pasa a AL_DIA
      expect(cuotaActualizada.saldoPendienteUsd).toBe('0.00');
      expect(cuotaActualizada.montoAbonadoUsd).toBe('40.00');
      expect(cuotaActualizada.estado).toBe(EstadoCuota.AL_DIA);
    });
  });

  describe('Escenario 3: Entrenador Rechaza Pago por Referencia Inexistente (Gherkin Escenario 3 & RN-05)', () => {
    it('debe rechazar el pago exigiendo motivo y preservar intacto el saldo adeudado del alumno', () => {
      // Given que el alumno reportó un pago pero el coach no encuentra la referencia en la cuenta
      const { transaccion } = bandejaEngine.reportarPago({
        cuota: cuotaInicial,
        dto: {
          montoOriginal: '1200.00',
          monedaOriginal: Moneda.VES,
          metodoPago: MetodoPago.PAGO_MOVIL,
          referenciaBancaria: '984521',
          fechaOperacion: '2026-09-06',
        },
        tasaGlobalCoach: tasaCoach,
        registradoPor: cuotaInicial.clienteId,
      });

      // When presiona "Rechazar Pago" e introduce el motivo
      const motivoRechazo = 'Fondos no recibidos en cuenta bancaria';
      const { transaccion: txRechazada, cuotaActualizada } =
        bandejaEngine.rechazarTransaccion({
          cuota: cuotaInicial,
          transaccionId: transaccion.id,
          dto: { accion: 'rechazar', motivoRechazo },
        });

      // Then la transacción debe transicionar a estado "Rechazado"
      expect(txRechazada.estadoConciliacion).toBe(EstadoConciliacion.RECHAZADO);
      expect(txRechazada.motivoRechazo).toBe(motivoRechazo);

      // And el saldo adeudado del alumno no debe modificarse
      expect(cuotaActualizada.saldoPendienteUsd).toBe('40.00');
      expect(cuotaActualizada.montoAbonadoUsd).toBe('0.00');

      // And la cuota debe regresar a su estado previo (EMITIDA)
      expect(cuotaActualizada.estado).toBe(EstadoCuota.EMITIDA);
    });

    it('debe validar que ConciliarTransaccionSchema exija obligatoriamente motivoRechazo al rechazar', () => {
      // Intentar rechazar sin motivo debe fallar validación de contrato
      const payloadSinMotivo = { accion: 'rechazar', motivoRechazo: '' };
      const res = ConciliarTransaccionSchema.safeParse(payloadSinMotivo);
      expect(res.success).toBe(false);

      // Rechazar con motivo válido debe pasar
      const payloadConMotivo = {
        accion: 'rechazar',
        motivoRechazo: 'Referencia duplicada o errónea',
      };
      const resValido = ConciliarTransaccionSchema.safeParse(payloadConMotivo);
      expect(resValido.success).toBe(true);
    });
  });

  describe('Escenario 4: Idempotencia y Prevención de Doble Registro (RNF-002 §4, RF-007 §6)', () => {
    it('debe devolver la transacción existente sin duplicar registro si se reintenta con el mismo X-Idempotency-Key', () => {
      const payload = {
        montoOriginal: '1200.00',
        monedaOriginal: Moneda.VES,
        metodoPago: MetodoPago.PAGO_MOVIL,
        referenciaBancaria: 'idemp-ref-1',
        fechaOperacion: '2026-09-06',
        idempotencyKey: 'request-uuid-xyz-123',
      };

      // Primer intento (creación normal)
      const intento1 = bandejaEngine.reportarPago({
        cuota: cuotaInicial,
        dto: payload,
        tasaGlobalCoach: tasaCoach,
        registradoPor: cuotaInicial.clienteId,
      });
      expect(intento1.esDuplicadoIdempotente).toBe(false);

      // Segundo intento idéntico por lag de red
      const intento2 = bandejaEngine.reportarPago({
        cuota: cuotaInicial,
        dto: payload,
        tasaGlobalCoach: tasaCoach,
        registradoPor: cuotaInicial.clienteId,
      });

      expect(intento2.esDuplicadoIdempotente).toBe(true);
      expect(intento2.transaccion.id).toBe(intento1.transaccion.id);
      expect(cuotaInicial.transacciones.length).toBe(1); // No se duplica en la cuota
    });

    it('debe rechazar intento de reporte si la tupla (metodo, referencia, fecha) ya fue registrada previamente', () => {
      const payloadOriginal = {
        montoOriginal: '1200.00',
        monedaOriginal: Moneda.VES,
        metodoPago: MetodoPago.PAGO_MOVIL,
        referenciaBancaria: 'ref-duplicada-999',
        fechaOperacion: '2026-09-06',
      };

      // Registro exitoso del primer reporte
      bandejaEngine.reportarPago({
        cuota: cuotaInicial,
        dto: payloadOriginal,
        tasaGlobalCoach: tasaCoach,
        registradoPor: cuotaInicial.clienteId,
      });

      // Segundo reporte con otra cuota o diferente payload pero misma referencia bancaria y fecha
      const payloadDuplicado = {
        ...payloadOriginal,
        montoOriginal: '1500.00',
      };

      expect(() => {
        bandejaEngine.reportarPago({
          cuota: cuotaInicial,
          dto: payloadDuplicado,
          tasaGlobalCoach: tasaCoach,
          registradoPor: cuotaInicial.clienteId,
        });
      }).toThrow('Esta referencia ya ha sido registrada previamente para este método y fecha de operación.');
    });

    it('debe exigir referencia bancaria en canales electrónicos pero permitir su omisión en pagos en efectivo', () => {
      // Pago Móvil sin referencia -> Inválido según ReportarPagoSchema
      const pagoMovilSinRef = {
        montoOriginal: '500.00',
        monedaOriginal: Moneda.VES,
        metodoPago: MetodoPago.PAGO_MOVIL,
        fechaOperacion: '2026-09-06',
      };
      const resPagoMovil = ReportarPagoSchema.safeParse(pagoMovilSinRef);
      expect(resPagoMovil.success).toBe(false);

      // Efectivo USD sin referencia -> Válido
      const efectivoUsdSinRef = {
        montoOriginal: '50.00',
        monedaOriginal: Moneda.USD,
        metodoPago: MetodoPago.EFECTIVO_USD,
        fechaOperacion: '2026-09-06',
      };
      const resEfectivo = ReportarPagoSchema.safeParse(efectivoUsdSinRef);
      expect(resEfectivo.success).toBe(true);
    });
  });
});
