-- =============================================================================
-- RNF-003 / ADR-011 (etapa 3): RLS multi-tenant para `perfiles_alumno`
-- =============================================================================
-- Alcance de esta migración (última tabla de RNF-003):
--
--   * Habilita RLS (ENABLE ROW LEVEL SECURITY) en `perfiles_alumno`. Sus políticas
--     base ya existen desde la migración 0004 (tenant por entrenador con WITH CHECK
--     para INSERT/UPDATE, self-select del alumno y bypass `is_superadmin()`);
--     esta migración es ADITIVA y no reescribe 0004.
--
--   * Completa la política que faltaba para un camino REAL del alumno:
--       - `perfiles_alumno` self-update: al finalizar una sesión, la racha del
--         alumno (`racha_dias` / `racha_ultima_fecha`, RF-001 RN-02) se persiste en
--         su propio perfil con el contexto self (`current_usuario_id`). El control
--         de QUÉ columnas se actualizan sigue en la app (el endpoint del alumno solo
--         escribe la racha); RLS solo garantiza que la fila sea la propia.
--
--   * Caminos verificados contra las políticas existentes:
--       - Coach (altas manuales, edición, estado, soft delete, restauración,
--         overrides de tasa, directorio, dashboard, hidrataciones de entrenamiento/
--         finanzas/antropometría/nutrición): `rls_perfiles_alumno` (tenant).
--       - Alumno (login, refresh, /auth/me, canje de invitación, guard de acceso,
--         rutina/semana, hidratación de sesiones, nutrición, finanzas self):
--         `rls_perfiles_alumno_self_select` (+ self-update para la racha).
--       - Sistema (seed, barrido de recordatorios antropométricos, digest semanal,
--         recordatorios de cobranza): bypass explícito `is_superadmin()`.
--       - Registro público (RF-011): INSERT anónimo con contexto
--         `{ entrenadorId: coachResuelto }` (WITH CHECK del tenant).
--
-- Contrato de sesión (lo aplica packages/database/src/client.ts):
--   app.current_entrenador_id -> entrenador dueño del tenant (rutas de coach)
--   app.current_usuario_id    -> usuario autenticado (self del alumno)
--   app.is_superadmin         -> bypass explícito de rutas de sistema
--
-- Notas operativas:
--   * Sin FORCE ROW LEVEL SECURITY, el rol dueño de la tabla (y los superusers)
--     siguen ignorando RLS (comportamiento nativo de PostgreSQL). El enforcement
--     real exige que la API se conecte con un rol NO dueño (p. ej. `guachafit_app`,
--     NOSUPERUSER NOBYPASSRLS, con GRANT sobre las tablas). Ver reporte de etapa 3.
--   * Las políticas son inertes hasta que se ejecute ENABLE ROW LEVEL SECURITY.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- perfiles_alumno — ETAPA 3: falta el self-update del alumno.
-- Solo la fila propia; la app controla qué columnas se actualizan (hoy: la racha
-- al finalizar una sesión). Sin esta política, la persistencia de la racha en el
-- contexto self actualizaría 0 filas en silencio bajo RLS.
-- -----------------------------------------------------------------------------
CREATE POLICY rls_perfiles_alumno_self_update ON perfiles_alumno
  FOR UPDATE
  USING (usuario_id = current_usuario_id())
  WITH CHECK (usuario_id = current_usuario_id());
--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- ETAPA 3: habilitar RLS en `perfiles_alumno` (última tabla de RNF-003). Todos los
-- caminos activos quedaron envueltos en withTenant() (coach, alumno y rutas de
-- sistema con bypass explícito).
-- -----------------------------------------------------------------------------
ALTER TABLE perfiles_alumno ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- =============================================================================
-- ROLLBACK (manual, en este orden):
--
--   ALTER TABLE perfiles_alumno DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS rls_perfiles_alumno_self_update ON perfiles_alumno;
-- =============================================================================
