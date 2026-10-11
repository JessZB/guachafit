-- =============================================================================
-- RF-006 RN-05 (decisión del dueño 2026-10-10): saldo a favor del alumno.
-- =============================================================================
--   * perfiles_alumno.saldo_a_favor_usd: excedente acumulado de pagos aprobados o cobrados por
--     encima de la deuda. Se descuenta solo al emitirse la próxima cuota. Nunca negativo.
--   * cuotas_membresia.saldo_a_favor_aplicado_usd: parte de monto_abonado_usd que salió del
--     saldo a favor al emitirse la cuota.
--   * transacciones_pago.excedente_usd: parte de un pago aprobado que pasó al saldo a favor
--     (monto_equivalente_usd sigue siendo todo el dinero recibido, así que los agregados de
--     recaudado no cambian).
--
-- Columnas ADITIVAS con default, sin reescritura de datos. No se recalculan pagos históricos:
-- aún no hay datos de producción (sin servidor desplegado).
-- Seguridad (RNF-003): las tres tablas ya tienen RLS y GRANT por tabla; no requiere cambios.
-- =============================================================================
ALTER TABLE "cuotas_membresia" ADD COLUMN "saldo_a_favor_aplicado_usd" numeric(14, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "perfiles_alumno" ADD COLUMN "saldo_a_favor_usd" numeric(14, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "transacciones_pago" ADD COLUMN "excedente_usd" numeric(14, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "perfiles_alumno" ADD CONSTRAINT "ck_perfiles_alumno_saldo_a_favor_no_negativo" CHECK ("saldo_a_favor_usd" >= 0);

-- =============================================================================
-- ROLLBACK (manual):
--   ALTER TABLE "perfiles_alumno" DROP CONSTRAINT "ck_perfiles_alumno_saldo_a_favor_no_negativo";
--   ALTER TABLE "transacciones_pago" DROP COLUMN "excedente_usd";
--   ALTER TABLE "perfiles_alumno" DROP COLUMN "saldo_a_favor_usd";
--   ALTER TABLE "cuotas_membresia" DROP COLUMN "saldo_a_favor_aplicado_usd";
-- =============================================================================
