DO $$ BEGIN
 CREATE TYPE "public"."enum_motivo_omision" AS ENUM('DESCANSO', 'INCOMPLETO');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "ejercicios_sesion" ADD COLUMN "descanso_prescrito_segundos" integer DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE "perfiles_alumno" ADD COLUMN "racha_dias" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "perfiles_alumno" ADD COLUMN "racha_ultima_fecha" date;--> statement-breakpoint
ALTER TABLE "series_registro" ADD COLUMN "peso_prescrito_kg" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "series_registro" ADD COLUMN "descanso_segundos" integer;--> statement-breakpoint
ALTER TABLE "sesiones_entrenamiento" ADD COLUMN "motivo_omision" "enum_motivo_omision";--> statement-breakpoint
ALTER TABLE "sesiones_entrenamiento" ADD COLUMN "bloque_id" varchar(64);--> statement-breakpoint
ALTER TABLE "sesiones_entrenamiento" ADD COLUMN "es_dia_descanso_original" boolean DEFAULT false NOT NULL;