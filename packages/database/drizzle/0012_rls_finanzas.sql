-- =============================================================================
-- RNF-003 / ADR-011 (etapa 2): RLS multi-tenant para el módulo de finanzas
-- =============================================================================
-- Alcance de esta migración:
--
--   * Habilita RLS (ENABLE ROW LEVEL SECURITY) en las 3 tablas financieras:
--     `planes_membresia`, `cuotas_membresia` y `transacciones_pago`. Sus políticas
--     base ya existen desde la migración 0004 (tenant por entrenador, self-select
--     del alumno y bypass `is_superadmin()`); esta migración es ADITIVA y no
--     reescribe 0004.
--
--   * Completa las políticas que faltaban para los caminos REALES del alumno
--     (reportar un pago escribe, no solo lee):
--       - `planes_membresia` self-select: el alumno lee el plan de SU cuota
--         (obtenerCuotaPorId lo expone como `planNombre`).
--       - `cuotas_membresia` self-update: el alumno marca su propia cuota como
--         `pendiente_revision` al reportar un pago (RF-007). El control de QUÉ
--         columnas/transiciones son válidas sigue en la app (máquina de estados);
--         RLS solo garantiza que la fila sea del propio alumno.
--       - `transacciones_pago` self-insert: el alumno registra la transacción de
--         su reporte de pago (RF-007) con `cliente_id = current_usuario_id()`.
--
--   * `perfiles_alumno` queda PREPARADA (políticas de 0004, RLS deshabilitado):
--     es la etapa 3, porque sus consultas viven en módulos con muchos puntos de
--     acceso (alumnos, auth, antropometría, nutrición, entrenamiento...).
--
-- Contrato de sesión (lo aplica packages/database/src/client.ts):
--   app.current_entrenador_id -> entrenador dueño del tenant (rutas de coach)
--   app.current_usuario_id    -> usuario autenticado (self del alumno/cliente)
--   app.is_superadmin         -> bypass explícito de rutas de sistema (processors
--                                de cobranza/digest, seed) — nunca silencioso.
--
-- Notas operativas:
--   * Sin FORCE ROW LEVEL SECURITY, el rol dueño de la tabla (y los superusers)
--     siguen ignorando RLS (comportamiento nativo de PostgreSQL). El enforcement
--     real exige que la API se conecte con un rol NO dueño (p. ej. `guachafit_app`,
--     NOSUPERUSER NOBYPASSRLS, con GRANT sobre las tablas). Ver reporte de etapa 2.
--   * Las políticas son inertes hasta que se ejecute ENABLE ROW LEVEL SECURITY.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- planes_membresia — ETAPA 2: falta el self-select del alumno.
-- El alumno solo puede ver los planes que respaldan SUS cuotas (subconsulta sobre
-- cuotas_membresia, que a su vez aplica su propia política self_select: sin ciclo).
-- -----------------------------------------------------------------------------
CREATE POLICY rls_planes_membresia_self_select ON planes_membresia
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM cuotas_membresia c
      WHERE c.plan_id = planes_membresia.id
        AND c.cliente_id = current_usuario_id()
    )
  );
--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- cuotas_membresia — ETAPA 2: falta el self-update del alumno (reportar pago).
-- Solo la fila propia; la app valida el cambio de estado (`pendiente_revision`).
-- -----------------------------------------------------------------------------
CREATE POLICY rls_cuotas_membresia_self_update ON cuotas_membresia
  FOR UPDATE
  USING (cliente_id = current_usuario_id())
  WITH CHECK (cliente_id = current_usuario_id());
--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- transacciones_pago — ETAPA 2: falta el self-insert del alumno (reportar pago).
-- -----------------------------------------------------------------------------
CREATE POLICY rls_transacciones_pago_self_insert ON transacciones_pago
  FOR INSERT
  WITH CHECK (cliente_id = current_usuario_id());
--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- ETAPA 2: habilitar RLS en las 3 tablas financieras. Todos los caminos activos
-- (coach, alumno y rutas de sistema) quedaron envueltos en withTenant().
-- -----------------------------------------------------------------------------
ALTER TABLE planes_membresia ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE cuotas_membresia ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE transacciones_pago ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- =============================================================================
-- ROLLBACK (manual, en este orden):
--
--   ALTER TABLE transacciones_pago DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE cuotas_membresia DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE planes_membresia DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS rls_transacciones_pago_self_insert ON transacciones_pago;
--   DROP POLICY IF EXISTS rls_cuotas_membresia_self_update ON cuotas_membresia;
--   DROP POLICY IF EXISTS rls_planes_membresia_self_select ON planes_membresia;
-- =============================================================================
