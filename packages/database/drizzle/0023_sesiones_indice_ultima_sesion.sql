-- =============================================================================
-- LOTE Mis alumnos (2026-10-19): índice para la subconsulta "última sesión completada" del
-- directorio (`MAX(fecha_fin_utc)` por alumno). Se evalúa por fila en el SELECT y en el ORDER BY
-- de `sin_entrenar`; sin índice cada ejecución recorre toda la tabla. Solo añade un índice: no
-- cambia datos ni columnas.
-- =============================================================================
CREATE INDEX IF NOT EXISTS "idx_sesiones_alumno_estado_fin" ON "sesiones_entrenamiento" USING btree ("alumno_id","estado","fecha_fin_utc");

-- ROLLBACK (manual): DROP INDEX IF EXISTS "idx_sesiones_alumno_estado_fin";
