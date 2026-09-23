CREATE TABLE IF NOT EXISTS "auditoria_accesos_denegados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid,
	"rol" varchar(30),
	"ruta" varchar(255) NOT NULL,
	"metodo" varchar(10) NOT NULL,
	"motivo" varchar(100) NOT NULL,
	"fecha_utc" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notificaciones_in_app" ADD COLUMN "referencia_id" varchar(255);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auditoria_accesos_denegados" ADD CONSTRAINT "auditoria_accesos_denegados_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
