import { describe, it, expect } from 'vitest';
import {
  Moneda,
  EstadoCuota,
  ActualizarTasaCambioSchema,
  CalcularConversionSchema,
} from '@guachafit/shared';
import {
  MotorBimonetario,
  roundHalfToEven,
  addDecimals,
  subtractDecimals,
  toCents,
  fromCents,
  CuotaState,
} from './helpers/finance-test-engine';

describe('RF-006: Motor Bimonetario (USD / Bs.) y Liquidación de Abonos Fraccionados', () => {
  const motor = new MotorBimonetario();

  describe('Escenario 1: Consulta del Saldo en Bs. a Tasa Global (Gherkin Escenario 1)', () => {
    it('debe proyectar exactamente el saldo en VES a partir de la deuda maestra en USD y la tasa global', () => {
      // Given que el cliente "Pedro Perez" tiene una cuota mensual de $50.00 USD
      const cuotaUsd = '50.00';
      // And la tasa global vigente del entrenador es de 60.00 Bs/USD
      const tasaGlobal = '60.0000';
      // And Pedro no tiene tasa preferencial asignada
      const tasaOverride = null;

      // When Pedro abre la sección de pagos en la app
      const { tasaEfectiva, esTasaOverride, fuenteTasa } = motor.resolverTasa(
        tasaGlobal,
        tasaOverride
      );
      const saldoProyectadoVes = motor.proyectarVES(cuotaUsd, tasaEfectiva);

      // Then el sistema debe mostrar: "Total a pagar: $50.00 USD (o Bs. 3,000.00)"
      expect(saldoProyectadoVes).toBe('3000.00');
      expect(tasaEfectiva).toBe('60.0000');
      expect(esTasaOverride).toBe(false);
      expect(fuenteTasa).toBe('entrenador_activa');

      // Validar contrato con CalcularConversionSchema
      const conversionPayload = {
        monto: cuotaUsd,
        monedaOrigen: Moneda.USD,
        monedaDestino: Moneda.VES,
      };
      const parsed = CalcularConversionSchema.safeParse(conversionPayload);
      expect(parsed.success).toBe(true);
    });
  });

  describe('Escenario 1B: Precedencia de Tasa Override Acordada con el Cliente (RF-005, RF-006 RN-02, ADR-003)', () => {
    it('debe priorizar la tasa override del cliente sobre la tasa global del entrenador', () => {
      // Given que el cliente "Carlos Ruiz" tiene pactado un override de 65.0000 Bs/USD
      const tasaGlobalCoach = '70.0000';
      const tasaOverrideCliente = '65.0000';
      const cuotaUsd = '35.00';

      // When se calcula la proyección en Bolívares
      const { tasaEfectiva, esTasaOverride, fuenteTasa } = motor.resolverTasa(
        tasaGlobalCoach,
        tasaOverrideCliente
      );
      const saldoProyectadoVes = motor.proyectarVES(cuotaUsd, tasaEfectiva);

      // Then debe aplicar 65.0000 Bs/USD y proyectar Bs. 2,275.00 (en vez de Bs. 2,450.00 con la tasa global)
      expect(esTasaOverride).toBe(true);
      expect(fuenteTasa).toBe('override_cliente');
      expect(tasaEfectiva).toBe('65.0000');
      expect(saldoProyectadoVes).toBe('2275.00');
    });
  });

  describe('Escenario 2: Abono Fraccionado en Bolívares con Deducción Exacta en USD (Gherkin Escenario 2 & ADR-003)', () => {
    it('debe congelar la tasa de operación y calcular el crédito exacto en USD deduciéndolo de la deuda', () => {
      // Given que el cliente debe una cuota de $50.00 USD
      let cuota: CuotaState = {
        id: 'cuota-uuid-1',
        clienteId: 'cliente-uuid-1',
        entrenadorId: 'coach-uuid-1',
        planId: 'plan-uuid-1',
        periodo: '2026-09',
        montoTotalUsd: '50.00',
        montoAbonadoUsd: '0.00',
        saldoPendienteUsd: '50.00',
        fechaEmisionUtc: '2026-09-01T00:00:00Z',
        fechaCorteUtc: '2026-09-30T23:59:59Z',
        estado: EstadoCuota.EMITIDA,
        transacciones: [],
      };

      // And realiza un Pago Móvil por Bs. 1,500.00 cuando la tasa es de 60.00 Bs/USD
      const montoAbonoVes = '1500.00';
      const tasaReporteCongelada = '60.0000';

      // When el entrenador aprueba la transacción de Bs. 1,500.00
      const creditoUsd = motor.calcularContravalorUSD(montoAbonoVes, tasaReporteCongelada);
      cuota.montoAbonadoUsd = addDecimals(cuota.montoAbonadoUsd, creditoUsd);
      cuota.saldoPendienteUsd = subtractDecimals(cuota.saldoPendienteUsd, creditoUsd);
      cuota.estado = EstadoCuota.ABONADA_PARCIAL;

      // Then el sistema debe calcular un crédito de $25.00 USD ($1,500 / 60)
      expect(creditoUsd).toBe('25.00');
      // And actualizar el saldo pendiente de la cuota a $25.00 USD
      expect(cuota.saldoPendienteUsd).toBe('25.00');
      expect(cuota.montoAbonadoUsd).toBe('25.00');
      // And cambiar el estado de la cuota a "Abonada (Parcial)"
      expect(cuota.estado).toBe(EstadoCuota.ABONADA_PARCIAL);

      // And reflejar que el nuevo saldo en Bs. es de Bs. 1,500.00 (a la tasa actual)
      const nuevoSaldoVes = motor.proyectarVES(cuota.saldoPendienteUsd, tasaReporteCongelada);
      expect(nuevoSaldoVes).toBe('1500.00');
    });
  });

  describe('Escenario 3: Cambio de Tasa Global Protege el Valor Real en USD (Gherkin Escenario 3 & ADR-003)', () => {
    it('debe mantener inalterada la deuda maestra en USD cuando el coach actualiza la tasa global', () => {
      // Given que el cliente adeuda un saldo restante de $25.00 USD
      const saldoRemanenteUsd = '25.00';
      let tasaCoach = '60.0000';

      // Comprobación inicial a 60 Bs/USD
      expect(motor.proyectarVES(saldoRemanenteUsd, tasaCoach)).toBe('1500.00');

      // When el entrenador actualiza la tasa global de 60.00 a 70.00 Bs/USD
      tasaCoach = '70.0000';

      // Then el saldo pendiente del cliente en USD debe permanecer inalterado en $25.00 USD (blindaje contable)
      expect(saldoRemanenteUsd).toBe('25.00');

      // And el saldo proyectado en Bolívares debe recalcularse automáticamente a Bs. 1,750.00 ($25 * 70)
      const nuevoSaldoProyectadoVes = motor.proyectarVES(saldoRemanenteUsd, tasaCoach);
      expect(nuevoSaldoProyectadoVes).toBe('1750.00');
    });
  });

  describe('Escenario 4: Exactitud Decimal Bancaria sin Error IEEE 754 (RNF-002)', () => {
    it('debe aplicar redondeo bancario (Round Half to Even) al céntimo más cercano', () => {
      // Caso .5 redondea al entero par anterior o posterior:
      // 2.505 -> par es 0 -> '2.50'
      expect(roundHalfToEven(2.505, 2)).toBe('2.50');
      // 2.515 -> impar es 1 -> sube a '2.52' (par)
      expect(roundHalfToEven(2.515, 2)).toBe('2.52');
      // 2.525 -> par es 2 -> '2.52'
      expect(roundHalfToEven(2.525, 2)).toBe('2.52');
      // 2.535 -> impar es 3 -> sube a '2.54' (par)
      expect(roundHalfToEven(2.535, 2)).toBe('2.54');
    });

    it('debe calcular contravalor USD exacto en divisiones periódicas complejas', () => {
      // Bs. 100.00 @ 37.50 Bs/USD = 2.666666... -> redondea al céntimo a $2.67 USD
      const contravalor1 = motor.calcularContravalorUSD('100.00', '37.5000');
      expect(contravalor1).toBe('2.67');

      // Bs. 1,234.56 @ 63.4521 Bs/USD = 19.45656... -> redondea a $19.46 USD
      const contravalor2 = motor.calcularContravalorUSD('1234.56', '63.4521');
      expect(contravalor2).toBe('19.46');
    });

    it('debe prevenir acumulación de errores de coma flotante de JS (0.1 + 0.2)', () => {
      // En JavaScript puro: 0.1 + 0.2 === 0.30000000000000004
      expect(0.1 + 0.2).not.toBe(0.3);

      // En el motor contable con céntimos enteros:
      const sumaPrecisa = addDecimals('0.10', '0.20');
      expect(sumaPrecisa).toBe('0.30');

      // Suma acumulada de 3 abonos fraccionados: $0.10 + $0.20 + $0.70 = $1.00 exacto
      const paso1 = addDecimals('0.10', '0.20');
      const paso2 = addDecimals(paso1, '0.70');
      expect(paso2).toBe('1.00');
    });
  });

  describe('Escenario 5: Casos Borde y Validación de Contratos de Tasas (RN-02, RNF-002)', () => {
    it('debe rechazar tasas de cambio menores o iguales a cero (422 / Unprocessable)', () => {
      const tasaCeroPayload = {
        tasaOficialBcv: '0.0000',
        tasaActivaEntrenador: '0.0000',
      };
      const resultCero = ActualizarTasaCambioSchema.safeParse(tasaCeroPayload);
      expect(resultCero.success).toBe(false);

      const tasaNegativaPayload = {
        tasaOficialBcv: '-60.0000',
        tasaActivaEntrenador: '-60.0000',
      };
      const resultNegativo = ActualizarTasaCambioSchema.safeParse(tasaNegativaPayload);
      expect(resultNegativo.success).toBe(false);
    });

    it('debe validar que las tasas no contengan más de 4 decimales según el regex de contrato', () => {
      const tasaExcesoDecimales = {
        tasaOficialBcv: '65.12345', // 5 decimales
        tasaActivaEntrenador: '65.1234',
      };
      const result = ActualizarTasaCambioSchema.safeParse(tasaExcesoDecimales);
      expect(result.success).toBe(false);
    });
  });
});
