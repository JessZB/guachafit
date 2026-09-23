DO $$ BEGIN
 CREATE TYPE "public"."enum_periodicidad_antropometria" AS ENUM('semanal', 'quincenal', 'mensual');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "controles_antropometricos" ADD COLUMN "brazo_relajado_cm" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "controles_antropometricos" ADD COLUMN "brazo_contraido_cm" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "controles_antropometricos" ADD COLUMN "muslo_medio_cm" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "controles_antropometricos" ADD COLUMN "pliegue_triceps_mm" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "controles_antropometricos" ADD COLUMN "pliegue_subescapular_mm" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "controles_antropometricos" ADD COLUMN "pliegue_suprailiaco_mm" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "controles_antropometricos" ADD COLUMN "pliegue_abdominal_mm" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "perfiles_alumno" ADD COLUMN "periodicidad_antropometria" "enum_periodicidad_antropometria";--> statement-breakpoint
ALTER TABLE "perfiles_alumno" ADD COLUMN "antropometria_inicio" date;