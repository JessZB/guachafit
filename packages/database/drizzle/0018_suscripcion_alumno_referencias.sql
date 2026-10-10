-- =============================================================================
-- M5-L1 (RF-005 / RF-007 / RF-008 / RNF-002): suscripción del alumno y referencias por entrenador
-- =============================================================================
--   * `perfiles_alumno` gana la suscripción (columnas ADITIVAS y anulables, sin reescritura):
--       - plan_suscrito_id: plan asignado (NULL = sin plan; no se emiten cuotas).
--       - ciclo_ancla: día local de inicio; fija el día de vencimiento de cada ciclo.
--       - proximo_corte: vencimiento (día local) de la próxima cuota que se emitirá sola.
--     La FK usa ON DELETE RESTRICT: un plan con alumnos suscritos no se puede borrar.
--
--   * `transacciones_pago`: el índice único GLOBAL (metodo_pago, referencia_bancaria,
--     fecha_operacion) hacía fallar el segundo cobro en efectivo del día en TODA la plataforma
--     (el cobro en sala guardaba la referencia fija 'COBRO_DIRECTO_SALA') y mezclaba referencias
--     de entrenadores distintos. Se sustituye por uno POR ENTRENADOR y PARCIAL: solo referencias
--     no nulas de métodos electrónicos y de pagos no rechazados (un pago rechazado puede
--     reenviarse con la misma referencia, RF-007 RN-05).
--   * La referencia centinela 'COBRO_DIRECTO_SALA' se limpia a NULL (el efectivo no lleva
--     referencia).
--
-- Seguridad (RNF-003): `perfiles_alumno` ya tiene RLS (0013) y los GRANT del rol `guachafit_app`
-- son por tabla, así que las columnas nuevas quedan cubiertas sin cambios.
-- =============================================================================
DROP INDEX IF EXISTS "uq_transaccion_idempotencia";--> statement-breakpoint
UPDATE "transacciones_pago" SET "referencia_bancaria" = NULL WHERE "referencia_bancaria" = 'COBRO_DIRECTO_SALA';--> statement-breakpoint
ALTER TABLE "perfiles_alumno" ADD COLUMN "plan_suscrito_id" uuid;--> statement-breakpoint
ALTER TABLE "perfiles_alumno" ADD COLUMN "ciclo_ancla" date;--> statement-breakpoint
ALTER TABLE "perfiles_alumno" ADD COLUMN "proximo_corte" date;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "perfiles_alumno" ADD CONSTRAINT "perfiles_alumno_plan_suscrito_id_planes_membresia_id_fk" FOREIGN KEY ("plan_suscrito_id") REFERENCES "public"."planes_membresia"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_transaccion_referencia_entrenador" ON "transacciones_pago" USING btree ("entrenador_id","metodo_pago","referencia_bancaria","fecha_operacion") WHERE "transacciones_pago"."referencia_bancaria" IS NOT NULL AND "transacciones_pago"."metodo_pago" NOT IN ('efectivo_usd', 'efectivo_ves') AND "transacciones_pago"."estado_conciliacion" <> 'rechazado';

-- =============================================================================
-- ROLLBACK (manual, en este orden).
--   1. Comprobar que el índice global puede volver: esta consulta debe devolver 0 filas (incluye
--      efectivo, rechazados y referencias de entrenadores distintos, que el índice nuevo admite):
--        SELECT metodo_pago, referencia_bancaria, fecha_operacion, count(*)
--        FROM transacciones_pago WHERE referencia_bancaria IS NOT NULL
--        GROUP BY 1, 2, 3 HAVING count(*) > 1;
--   2. Crear el índice global ANTES de soltar el nuevo, para que la tabla nunca quede sin
--      unicidad si el CREATE falla:
--        CREATE UNIQUE INDEX "uq_transaccion_idempotencia" ON "transacciones_pago" ("metodo_pago","referencia_bancaria","fecha_operacion");
--        DROP INDEX IF EXISTS "uq_transaccion_referencia_entrenador";
--   3. Quitar la suscripción (se pierden los planes asignados a los alumnos):
--        ALTER TABLE "perfiles_alumno" DROP CONSTRAINT IF EXISTS "perfiles_alumno_plan_suscrito_id_planes_membresia_id_fk";
--        ALTER TABLE "perfiles_alumno" DROP COLUMN "proximo_corte";
--        ALTER TABLE "perfiles_alumno" DROP COLUMN "ciclo_ancla";
--        ALTER TABLE "perfiles_alumno" DROP COLUMN "plan_suscrito_id";
--   IRREVERSIBLE: el saneo de 'COBRO_DIRECTO_SALA' a NULL no se deshace (y con el índice global
--   de vuelta, el segundo cobro en efectivo del día volvería a fallar).
-- =============================================================================
