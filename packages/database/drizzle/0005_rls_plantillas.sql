-- =============================================================================
-- RNF-003 / ADR-011 (WU11): RLS multi-tenant para el banco de plantillas (RF-017)
-- =============================================================================
-- Alcance de esta migración:
--
--   * `plantillas_rutina` es dato de tenant: cada entrenador ve y administra
--     únicamente sus plantillas. Se suma a la Etapa 1 del RLS (tablas con RLS
--     operativo) porque el 100% de sus accesos de tenant quedaron envueltos en
--     withTenant() dentro de esta unidad (PlantillasService: listar, obtener,
--     crear, actualizar, desactivar y las lecturas del flujo de asignación).
--
--   * No crea funciones de sesión: reutiliza las existentes de la migración
--     0004 (is_superadmin(), current_entrenador_id()).
--
--   * A diferencia de las tablas de alumno/cliente, no lleva política "self":
--     las plantillas son una herramienta del entrenador (endpoints
--     @Roles(ENTRENADOR)) y el alumno nunca las consulta. El superadmin conserva
--     el bypass explícito.
--
-- Contrato de sesión (lo aplica packages/database/src/client.ts):
--   app.current_entrenador_id -> entrenador dueño del tenant
--   app.is_superadmin         -> bypass explícito para rutas de sistema/superadmin
--
-- Notas operativas:
--   * Sin FORCE ROW LEVEL SECURITY, el rol dueño de la tabla (y los superusers)
--     siguen ignorando RLS (comportamiento nativo de PostgreSQL). Conectar la API
--     con un rol NO dueño (NOSUPERUSER NOBYPASSRLS, p. ej. `guachafit_app` con
--     GRANT sobre las tablas) es obligatorio para el enforcement real; ver el
--     apéndice de ADR-011.
--   * El seed escribe esta tabla como ruta de sistema con el bypass explícito
--     `app.is_superadmin` (packages/database/src/seed.ts).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- plantillas_rutina (RF-017) — ETAPA 1: el coach dueño tiene acceso total y el
-- superadmin bypass explícito. RLS se habilita en esta misma migración.
-- -----------------------------------------------------------------------------
CREATE POLICY rls_plantillas_rutina ON plantillas_rutina
  FOR ALL
  USING (is_superadmin() OR entrenador_id = current_entrenador_id())
  WITH CHECK (is_superadmin() OR entrenador_id = current_entrenador_id());
--> statement-breakpoint
ALTER TABLE plantillas_rutina ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- =============================================================================
-- ROLLBACK (manual, en este orden):
--
--   ALTER TABLE plantillas_rutina DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS rls_plantillas_rutina ON plantillas_rutina;
-- =============================================================================
