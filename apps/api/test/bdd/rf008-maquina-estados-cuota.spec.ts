import { describe, it, expect, beforeEach } from 'vitest';
import { EstadoCuota } from '@guachafit/shared';
import {
  CuotaState,
  CuotaStateMachine,
  addDecimals,
  subtractDecimals,
} from './helpers/finance-test-engine';

describe('RF-008: Máquina de Estados de la Cuota y Recordatorios Automatizados de Cobranza', () => {
  let cuota: CuotaState;
  const fechaCorteIso = '2026-09-15T23:59:59Z';

  beforeEach(() => {
    cuota = {
      id: 'cuota-test-uuid',
      clienteId: 'cliente-test-uuid',
      entrenadorId: 'coach-test-uuid',
      planId: 'plan-test-uuid',
      periodo: '2026-09',
      montoTotalUsd: '60.00',
      montoAbonadoUsd: '0.00',
      saldoPendienteUsd: '60.00',
      fechaEmisionUtc: '2026-09-01T00:00:00Z',
      fechaCorteUtc: fechaCorteIso,
      estado: EstadoCuota.EMITIDA,
      transacciones: [],
    };
  });

  describe('Escenario 1: Invariante de Balance Estricta de la Cuota (RNF-002 §3)', () => {
    it('debe certificar que saldo_pendiente_usd == monto_total_usd - monto_abonado_usd en todo momento', () => {
      // Estado inicial: 60 - 0 = 60
      expect(() => CuotaStateMachine.assertBalanceInvariant(cuota)).not.toThrow();

      // Primer abono parcial de $25.00
      cuota.montoAbonadoUsd = addDecimals(cuota.montoAbonadoUsd, '25.00');
      cuota.saldoPendienteUsd = subtractDecimals(cuota.saldoPendienteUsd, '25.00');
      expect(cuota.saldoPendienteUsd).toBe('35.00');
      expect(() => CuotaStateMachine.assertBalanceInvariant(cuota)).not.toThrow();

      // Segundo abono parcial de $35.00
      cuota.montoAbonadoUsd = addDecimals(cuota.montoAbonadoUsd, '35.00');
      cuota.saldoPendienteUsd = subtractDecimals(cuota.saldoPendienteUsd, '35.00');
      expect(cuota.saldoPendienteUsd).toBe('0.00');
      expect(() => CuotaStateMachine.assertBalanceInvariant(cuota)).not.toThrow();
    });

    it('debe arrojar una excepción crítica si existe una discrepancia contable en el balance', () => {
      // Forzar una corrupción o desajuste de saldo (ej. montoTotal 60, abonado 20, pero pendiente 30)
      cuota.montoAbonadoUsd = '20.00';
      cuota.saldoPendienteUsd = '30.00'; // Debería ser 40.00

      expect(() => CuotaStateMachine.assertBalanceInvariant(cuota)).toThrow(
        /Violación de Invariante Contable \(RNF-002\)/
      );
    });
  });

  describe('Escenario 2: Ciclo de Vida y Transiciones de Estado de la Cuota (RF-008 §4.A, RN-04, RN-05)', () => {
    it('debe transicionar ordenadamente: emitida -> pendiente_revision -> abonada_parcial -> al_dia', () => {
      // 1. Estado inicial
      expect(cuota.estado).toBe(EstadoCuota.EMITIDA);

      // 2. Alumno reporta abono parcial ($30.00)
      CuotaStateMachine.transition(cuota, EstadoCuota.PENDIENTE_REVISION);
      expect(cuota.estado).toBe(EstadoCuota.PENDIENTE_REVISION);

      // 3. Coach aprueba abono parcial -> saldo pendiente $30.00 > $0.00
      cuota.montoAbonadoUsd = '30.00';
      cuota.saldoPendienteUsd = '30.00';
      CuotaStateMachine.assertBalanceInvariant(cuota);
      CuotaStateMachine.transition(cuota, EstadoCuota.ABONADA_PARCIAL);
      expect(cuota.estado).toBe(EstadoCuota.ABONADA_PARCIAL);

      // 4. Alumno reporta liquidación restante ($30.00)
      CuotaStateMachine.transition(cuota, EstadoCuota.PENDIENTE_REVISION);
      expect(cuota.estado).toBe(EstadoCuota.PENDIENTE_REVISION);

      // 5. Coach aprueba abono final -> saldo pendiente llega a $0.00
      cuota.montoAbonadoUsd = '60.00';
      cuota.saldoPendienteUsd = '0.00';
      CuotaStateMachine.assertBalanceInvariant(cuota);
      CuotaStateMachine.transition(cuota, EstadoCuota.AL_DIA);
      expect(cuota.estado).toBe(EstadoCuota.AL_DIA);
    });

    it('debe restaurar el estado anterior cuando un pago es rechazado (RN-05)', () => {
      // Caso 1: Cuota en estado inicial EMITIDA
      CuotaStateMachine.transition(cuota, EstadoCuota.PENDIENTE_REVISION);
      expect(cuota.estado).toBe(EstadoCuota.PENDIENTE_REVISION);

      // Rechazo restaura a EMITIDA
      const estadoRestaurado1 = cuota.estadoPrevio || EstadoCuota.EMITIDA;
      CuotaStateMachine.transition(cuota, estadoRestaurado1);
      expect(cuota.estado).toBe(EstadoCuota.EMITIDA);

      // Caso 2: Cuota que ya estaba VENCIDA
      cuota.estado = EstadoCuota.VENCIDA;
      CuotaStateMachine.transition(cuota, EstadoCuota.PENDIENTE_REVISION);
      const estadoRestaurado2 = cuota.estadoPrevio || EstadoCuota.VENCIDA;
      CuotaStateMachine.transition(cuota, estadoRestaurado2);
      expect(cuota.estado).toBe(EstadoCuota.VENCIDA);
    });
  });

  describe('Escenario 3: Transición Automática a "Vencida / En Mora" (Gherkin Escenario 3 & RF-008 §4.A)', () => {
    it('debe transicionar a "vencida" cuando la fecha actual supera fecha_corte_utc con saldo > 0', () => {
      // Fecha de corte: 2026-09-15T23:59:59Z
      const fechaDespuesDeCorte = new Date('2026-09-16T10:00:00Z');

      const estadoResultante = CuotaStateMachine.procesarCorteDiario(
        cuota,
        fechaDespuesDeCorte
      );

      expect(estadoResultante).toBe(EstadoCuota.VENCIDA);
      expect(cuota.estado).toBe(EstadoCuota.VENCIDA);
    });

    it('NO debe transicionar a "vencida" si la cuota ya se encuentra "al_dia"', () => {
      cuota.montoAbonadoUsd = '60.00';
      cuota.saldoPendienteUsd = '0.00';
      cuota.estado = EstadoCuota.AL_DIA;

      const fechaDespuesDeCorte = new Date('2026-09-20T10:00:00Z');
      const estadoResultante = CuotaStateMachine.procesarCorteDiario(
        cuota,
        fechaDespuesDeCorte
      );

      expect(estadoResultante).toBe(EstadoCuota.AL_DIA);
      expect(cuota.estado).toBe(EstadoCuota.AL_DIA);
    });

    it('NO debe transicionar a "vencida" si la cuota está en "pendiente_revision" (espera de verificación)', () => {
      cuota.estado = EstadoCuota.PENDIENTE_REVISION;

      const fechaDespuesDeCorte = new Date('2026-09-16T10:00:00Z');
      const estadoResultante = CuotaStateMachine.procesarCorteDiario(
        cuota,
        fechaDespuesDeCorte
      );

      expect(estadoResultante).toBe(EstadoCuota.PENDIENTE_REVISION);
      expect(cuota.estado).toBe(EstadoCuota.PENDIENTE_REVISION);
    });
  });

  describe('Escenario 4: Cronograma de Recordatorios y Pausa en "Pendiente de Revisión" (Gherkin Escenarios 1 & 2)', () => {
    it('debe disparar recordatorio T - 1 día cuando falta 1 día para la fecha de corte (Gherkin Escenario 1)', () => {
      // Fecha corte: 2026-09-15T23:59:59Z -> T - 1 día = 2026-09-14T23:59:59Z
      const unDiaAntes = new Date('2026-09-14T23:59:59Z');

      const evaluacion = CuotaStateMachine.evaluarDisparadorRecordatorio(
        cuota,
        unDiaAntes
      );

      expect(evaluacion.enviarRecordatorio).toBe(true);
      expect(evaluacion.tipoDisparador).toBe('T_MENOS_1');
    });

    it('debe pausar y suprimir el envío de recordatorios cuando la cuota está en "pendiente_revision" (Gherkin Escenario 2)', () => {
      cuota.estado = EstadoCuota.PENDIENTE_REVISION;

      // El día del corte (Día T)
      const diaT = new Date('2026-09-15T23:59:59Z');
      const evaluacion = CuotaStateMachine.evaluarDisparadorRecordatorio(cuota, diaT);

      expect(evaluacion.enviarRecordatorio).toBe(false);
      expect(evaluacion.motivoPausa).toContain('Pausado temporalmente');
    });

    it('debe suprimir recordatorios para cuotas completamente saldadas ("al_dia")', () => {
      cuota.estado = EstadoCuota.AL_DIA;
      cuota.saldoPendienteUsd = '0.00';
      cuota.montoAbonadoUsd = '60.00';

      const diaT = new Date('2026-09-15T23:59:59Z');
      const evaluacion = CuotaStateMachine.evaluarDisparadorRecordatorio(cuota, diaT);

      expect(evaluacion.enviarRecordatorio).toBe(false);
      expect(evaluacion.motivoPausa).toBe('Cuota completamente cancelada');
    });
  });

  describe('Escenario 5: Validación de Transiciones Prohibidas de la Máquina de Estados', () => {
    it('debe rechazar transicionar directamente de "al_dia" a "vencida"', () => {
      cuota.estado = EstadoCuota.AL_DIA;

      expect(() => {
        CuotaStateMachine.transition(cuota, EstadoCuota.VENCIDA);
      }).toThrow('Transición inválida: Una cuota pagada al día no puede transicionar a vencida.');
    });

    it('debe rechazar transiciones en cuotas anuladas (estado terminal)', () => {
      cuota.estado = EstadoCuota.ANULADA;

      expect(() => {
        CuotaStateMachine.transition(cuota, EstadoCuota.AL_DIA);
      }).toThrow(/La cuota .* se encuentra anulada/);
    });

    // M5 P1 (A4): el test del contrato `EmitirCuotaSchema` se retiró con la ruta
    // `POST /finanzas/cuotas/emitir`. El contrato VIVO de la emisión (suscripción) está
    // validado en `rf005-rf008-suscripcion-servicio.spec.ts` §C (AsignarSuscripcionSchema).
  });
});
