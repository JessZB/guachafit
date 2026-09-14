CREATE TABLE IF NOT EXISTS "rutinas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alumno_id" uuid NOT NULL,
	"entrenador_id" uuid NOT NULL,
	"nombre" varchar(120) DEFAULT 'Planificación Semanal' NOT NULL,
	"bloques" jsonb NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"created_at_utc" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at_utc" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sesiones_entrenamiento" ADD COLUMN "volumen_total_kg" numeric(8, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rutinas" ADD CONSTRAINT "rutinas_alumno_id_usuarios_id_fk" FOREIGN KEY ("alumno_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rutinas" ADD CONSTRAINT "rutinas_entrenador_id_usuarios_id_fk" FOREIGN KEY ("entrenador_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
