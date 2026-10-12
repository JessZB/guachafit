-- =============================================================================
-- RF-008 (decisiones del dueño 2026-10-12): anulación de cuotas sin pagos.
--   * Auditoría de quién, cuándo y por qué se anuló (columnas nulas: las cuotas existentes no
--     cambian).
--   * El índice único por alumno, plan y periodo pasa a ser parcial: una cuota anulada no ocupa su
--     periodo, para que anular, quitar el plan y reasignarlo con el mismo plan emita la cuota
--     corregida. Sigue habiendo como máximo una cuota vigente por periodo. 'anulada' existe desde
--     la creación del enum (se puede usar en esta transacción) y la comparación de enum con un
--     literal es IMMUTABLE (válida en un predicado de índice).
-- =============================================================================
DROP INDEX IF EXISTS "uq_cuota_cliente_plan_periodo";--> statement-breakpoint
ALTER TABLE "cuotas_membresia" ADD COLUMN "motivo_anulacion" text;--> statement-breakpoint
ALTER TABLE "cuotas_membresia" ADD COLUMN "fecha_anulacion_utc" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cuotas_membresia" ADD COLUMN "anulada_por" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cuotas_membresia" ADD CONSTRAINT "cuotas_membresia_anulada_por_usuarios_id_fk" FOREIGN KEY ("anulada_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_cuota_cliente_plan_periodo" ON "cuotas_membresia" USING btree ("cliente_id","plan_id","periodo") WHERE "cuotas_membresia"."estado" <> 'anulada';

-- ROLLBACK (manual): DROP INDEX "uq_cuota_cliente_plan_periodo"; recrearlo sin WHERE (falla si ya
--   hay una cuota anulada y otra vigente del mismo alumno, plan y periodo); después
--   ALTER TABLE "cuotas_membresia" DROP CONSTRAINT "cuotas_membresia_anulada_por_usuarios_id_fk",
--   DROP COLUMN "anulada_por", DROP COLUMN "fecha_anulacion_utc", DROP COLUMN "motivo_anulacion";
