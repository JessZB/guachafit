-- =============================================================================
-- RF-007 (decisión del dueño 2026-10-11): un pago REVERTIDO libera su referencia bancaria, igual
-- que uno rechazado. Si el entrenador revirtió por error, el alumno puede reenviar el mismo
-- comprobante y el entrenador aprobarlo de nuevo (vuelve a la bandeja: decide otra vez).
--
-- El predicado nombra en POSITIVO los estados que ocupan la referencia ('pendiente', 'aprobado'),
-- valores que ya existían antes de la 0020, porque:
--   * el migrador aplica todas las pendientes en una sola transacción y PostgreSQL no deja usar en
--     ella el valor 'revertido' recién añadido por la 0020;
--   * un predicado de índice solo admite expresiones IMMUTABLE (un cast enum::text no lo es).
-- Un estado que se añada en el futuro tampoco ocupará la referencia salvo que se incluya aquí.
-- Recrear el índice es seguro: el predicado nuevo solo puede quitar filas del índice.
-- =============================================================================
DROP INDEX IF EXISTS "uq_transaccion_referencia_entrenador";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_transaccion_referencia_entrenador" ON "transacciones_pago" USING btree ("entrenador_id","metodo_pago","referencia_bancaria","fecha_operacion") WHERE "transacciones_pago"."referencia_bancaria" IS NOT NULL AND "transacciones_pago"."metodo_pago" NOT IN ('efectivo_usd', 'efectivo_ves') AND "transacciones_pago"."estado_conciliacion" IN ('pendiente', 'aprobado');

-- ROLLBACK (manual): recrear el índice con el predicado de la 0018
--   (... AND "estado_conciliacion" <> 'rechazado'). Puede fallar si ya hay una referencia
--   reenviada que coincide con la de un pago revertido.
