-- =============================================================================
-- RF-018 "Mi perfil" (cambio de correo con confirmación, decisión del dueño 2026-10-06):
-- columnas ADITIVAS y opcionales, sin reescritura de datos.
--
--   * usuarios.correo_pendiente: correo nuevo esperando confirmación (hasta entonces se entra con
--     `email`).
--   * usuarios.token_cambio_correo_hash / token_cambio_correo_expira: hash SHA-256 del enlace de
--     un solo uso enviado al correo nuevo y su vencimiento (24 horas). Nunca se guarda el token.
--
-- Seguridad (RNF-003 / rol `guachafit_app`): `usuarios` no tiene RLS y los GRANT del rol son por
-- tabla, así que las columnas nuevas quedan cubiertas sin cambios.
-- =============================================================================
ALTER TABLE "usuarios" ADD COLUMN "correo_pendiente" varchar(255);--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "token_cambio_correo_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "token_cambio_correo_expira" timestamp with time zone;

-- =============================================================================
-- ROLLBACK (manual):
--   ALTER TABLE "usuarios" DROP COLUMN "token_cambio_correo_expira";
--   ALTER TABLE "usuarios" DROP COLUMN "token_cambio_correo_hash";
--   ALTER TABLE "usuarios" DROP COLUMN "correo_pendiente";
-- =============================================================================
