-- =============================================================================
-- RF-007 (decisión del dueño 2026-10-11): reversión de un pago aprobado por error.
-- =============================================================================
--   * enum_estado_conciliacion gana 'revertido': el pago queda en el historial con su motivo.
--     Los agregados de recaudado solo suman 'aprobado', así que un pago revertido deja de contar.
--     El índice único parcial de referencias pasa a excluir también 'revertido' en la 0021.
--   * transacciones_pago.motivo_reversion / fecha_reversion_utc: motivo obligatorio y fecha.
--
-- PostgreSQL 12+ admite ADD VALUE dentro de una transacción mientras el valor nuevo no se use en
-- ella (esta migración no lo usa). Columnas ADITIVAS y anulables, sin reescritura de datos.
-- Seguridad (RNF-003): la tabla ya tiene RLS y GRANT por tabla; no requiere cambios.
-- =============================================================================
ALTER TYPE "enum_estado_conciliacion" ADD VALUE 'revertido';--> statement-breakpoint
ALTER TABLE "transacciones_pago" ADD COLUMN "motivo_reversion" text;--> statement-breakpoint
ALTER TABLE "transacciones_pago" ADD COLUMN "fecha_reversion_utc" timestamp with time zone;

-- =============================================================================
-- ROLLBACK (manual): PostgreSQL no permite quitar un valor de un enum. Para revertir:
--   1. Si ya hay pagos revertidos, decide antes qué estado les corresponde (p. ej. volver a
--      'aprobado' rehaciendo el abono en su cuota): el código anterior no conoce 'revertido'.
--   2. ALTER TABLE "transacciones_pago" DROP COLUMN "fecha_reversion_utc";
--      ALTER TABLE "transacciones_pago" DROP COLUMN "motivo_reversion";
--   3. El valor 'revertido' del enum queda sin uso; eliminarlo exige recrear el tipo.
-- Nota para migraciones futuras: el migrador aplica todas las pendientes en UNA transacción, así
-- que una migración posterior del mismo run no puede usar todavía el valor 'revertido'.
-- =============================================================================
