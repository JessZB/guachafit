ALTER TABLE "usuarios" ADD COLUMN "token_recuperacion_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "token_recuperacion_expira" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "password_cambiada_en" timestamp with time zone;