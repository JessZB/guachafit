-- RF-002 RN-01 (WU RF-002a): metas nutricionales del coach por alumno.
-- Una fila por alumno (uq_meta_nutricional_alumno): calorías/macros/agua opcionales (NULL = no
-- configurado, nunca 0 fabricado) + recursos educativos (JSONB de enlaces validados por contrato).
-- Asociación por ALUMNO (no por plan de membresía): el RF §3 Precondición 1 habla de los objetivos
-- "del cliente"; los planes son comerciales y el RF no los menciona.
-- RLS: no se agregan políticas en esta unidad; el aislamiento multi-tenant se valida en el servicio
-- contra `perfiles_alumno` (mismo patrón que `checkins_nutricionales`, pendiente de etapa RLS).
CREATE TABLE IF NOT EXISTS "metas_nutricionales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alumno_id" uuid NOT NULL,
	"calorias_objetivo" integer,
	"proteina_gramos_objetivo" integer,
	"carbohidratos_gramos_objetivo" integer,
	"grasas_gramos_objetivo" integer,
	"agua_litros_objetivo" numeric(4, 2),
	"recursos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at_utc" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at_utc" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "metas_nutricionales" ADD CONSTRAINT "metas_nutricionales_alumno_id_usuarios_id_fk" FOREIGN KEY ("alumno_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_meta_nutricional_alumno" ON "metas_nutricionales" USING btree ("alumno_id");