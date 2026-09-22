ALTER TABLE "preferencias_notificacion" ALTER COLUMN "digest_weekly_email" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "preferencias_notificacion" ADD COLUMN "notify_seguridad_push" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "preferencias_notificacion" ADD COLUMN "notify_seguridad_email" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "preferencias_notificacion" ADD COLUMN "notify_cobranzas_push" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "preferencias_notificacion" ADD COLUMN "notify_cobranzas_email" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "preferencias_notificacion" ADD COLUMN "notify_nuevos_registros_push" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "preferencias_notificacion" ADD COLUMN "notify_nuevos_registros_email" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "preferencias_notificacion" ADD COLUMN "notify_reportes_progreso_push" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "preferencias_notificacion" ADD COLUMN "notify_reportes_progreso_email" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "preferencias_notificacion" ADD COLUMN "digest_weekly_push" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- RF-015 §B: el "Resumen Semanal" Email nace activo para los entrenadores existentes (default nuevo).
-- Las filas de alumnos se dejan intactas: el digest solo se emite hacia coaches.
UPDATE "preferencias_notificacion" SET "digest_weekly_email" = true WHERE "usuario_id" IN (SELECT "id" FROM "usuarios" WHERE "rol" = 'entrenador');--> statement-breakpoint
-- RF-015 RN-01: canal obligatorio de seguridad, blindado a nivel de base de datos.
-- (drizzle-kit 0.24 no serializa `check()` en el snapshot; el DDL vive aquí de forma explícita.)
ALTER TABLE "preferencias_notificacion" ADD CONSTRAINT "preferencias_notificacion_seguridad_email_obligatorio" CHECK ("notify_seguridad_email");