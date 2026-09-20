DO $$ BEGIN
 CREATE TYPE "public"."enum_nivel_objetivo_plantilla" AS ENUM('principiante', 'intermedio', 'avanzado');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plantillas_rutina" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entrenador_id" uuid NOT NULL,
	"nombre" varchar(120) NOT NULL,
	"nivel_objetivo" "enum_nivel_objetivo_plantilla" NOT NULL,
	"bloques" jsonb NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"created_at_utc" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at_utc" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "plantillas_rutina" ADD CONSTRAINT "plantillas_rutina_entrenador_id_usuarios_id_fk" FOREIGN KEY ("entrenador_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_plantillas_entrenador_activa" ON "plantillas_rutina" USING btree ("entrenador_id","activa");