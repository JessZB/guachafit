-- =============================================================================
-- D17: ciclo de vida del enlace de captación del entrenador.
--
--   * perfiles_entrenador.captacion_activa: interruptor de captación por enlace. `false` = el
--     enlace no admite registros nuevos (se responde como si el código no existiera).
--   * perfiles_entrenador.enlace_rotado_en_utc: instante de la última rotación del coach_code
--     (NULL = nunca rotado). Delimita el contador de registros del enlace vigente.
--   * perfiles_alumno.origen_registro: 'manual' (alta del entrenador) | 'enlace' (autorregistro).
--
-- Columnas ADITIVAS con default, sin reescritura de datos: los entrenadores existentes quedan con
-- captacion_activa = true y los alumnos existentes con origen_registro = 'manual'.
-- Seguridad (RNF-003 / rol `guachafit_app`): las políticas RLS de `perfiles_alumno` son por FILA y
-- los GRANT por TABLA; las columnas nuevas quedan cubiertas sin cambios.
-- =============================================================================
ALTER TABLE "perfiles_alumno" ADD COLUMN "origen_registro" varchar(16) DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "perfiles_entrenador" ADD COLUMN "captacion_activa" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "perfiles_entrenador" ADD COLUMN "enlace_rotado_en_utc" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "perfiles_alumno" ADD CONSTRAINT "ck_perfiles_alumno_origen_registro" CHECK ("origen_registro" IN ('manual', 'enlace'));

-- =============================================================================
-- ROLLBACK (manual):
--   ALTER TABLE "perfiles_alumno" DROP CONSTRAINT "ck_perfiles_alumno_origen_registro";
--   ALTER TABLE "perfiles_entrenador" DROP COLUMN "enlace_rotado_en_utc";
--   ALTER TABLE "perfiles_entrenador" DROP COLUMN "captacion_activa";
--   ALTER TABLE "perfiles_alumno" DROP COLUMN "origen_registro";
-- =============================================================================
