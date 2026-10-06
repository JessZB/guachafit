-- =============================================================================
-- LOTE API-N2 (RF-002, decisiones del dueño 2026-10-05): columnas ADITIVAS, sin reescritura de datos.
--
--   * checkins_nutricionales.capturado_en_utc: instante en que el alumno guardó el reporte en su
--     teléfono (captura offline tardía) o la hora del servidor. NULL en reportes anteriores.
--   * checkins_nutricionales.metas_vigentes: copia de las metas del alumno al registrar. NULL sin
--     metas o en reportes anteriores.
--   * perfiles_alumno.zona_horaria: zona IANA que decide la ventana (18:00–23:59) y el plazo de
--     recepción (12:00 del día siguiente). Los perfiles existentes quedan en 'America/Caracas'.
--
-- Seguridad (RNF-003 / rol `guachafit_app`):
--   * Las políticas RLS de ambas tablas son por FILA: cubren las columnas nuevas sin cambios
--     (`perfiles_alumno` ya tiene tenant + self-select + self-update desde 0004/0013).
--   * Los GRANT de `crear-rol-app.sql` son por TABLA (SELECT/INSERT/UPDATE/DELETE): una columna
--     nueva queda incluida sin volver a otorgar permisos.
-- =============================================================================
ALTER TABLE "checkins_nutricionales" ADD COLUMN "capturado_en_utc" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "checkins_nutricionales" ADD COLUMN "metas_vigentes" jsonb;--> statement-breakpoint
ALTER TABLE "perfiles_alumno" ADD COLUMN "zona_horaria" varchar(64) DEFAULT 'America/Caracas' NOT NULL;
-- =============================================================================
-- ROLLBACK (manual):
--   ALTER TABLE "perfiles_alumno" DROP COLUMN "zona_horaria";
--   ALTER TABLE "checkins_nutricionales" DROP COLUMN "metas_vigentes";
--   ALTER TABLE "checkins_nutricionales" DROP COLUMN "capturado_en_utc";
-- =============================================================================
