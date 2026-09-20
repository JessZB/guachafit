-- =============================================================================
-- RNF-003 / ADR-009: Aislamiento multi-tenant con Row-Level Security (RLS)
-- =============================================================================
-- Alcance de esta migración (WU7, entrega por etapas):
--
--   * Crea las funciones de sesión y las políticas RLS de las 5 tablas que exige
--     RNF-003: perfiles_alumno (alumnos), planes_membresia (planes),
--     cuotas_membresia (cuotas), transacciones_pago (transacciones) y rutinas.
--     (`rutinas` no estaba en el diseño de 05_Arquitectura, pero RNF-003 la exige.)
--
--   * Habilita RLS (ENABLE ROW LEVEL SECURITY) SOLO en `rutinas`: es la única tabla
--     cuyas consultas de tenant quedaron 100% envueltas en withTenant()
--     (transacción + set_config local) dentro de esta unidad.
--
--   * Las otras 4 tablas quedan PREPARADAS (políticas creadas, RLS deshabilitado).
--     Sus consultas viven en módulos con muchos puntos de acceso (alumnos, finanzas,
--     antropometría, nutrición, dashboard...) y habilitarlas sin envolver el 100% de
--     los caminos activaría el deny-by-default de PostgreSQL y rompería producción.
--     Se habilitarán por etapas, módulo por módulo, en unidades posteriores.
--
-- Contrato de sesión (lo aplica packages/database/src/client.ts):
--   app.current_entrenador_id -> entrenador dueño del tenant
--   app.current_usuario_id    -> usuario autenticado (acceso "self" de alumno/cliente)
--   app.is_superadmin         -> bypass explícito para rutas de sistema/superadmin
--
-- Notas operativas:
--   * Sin FORCE ROW LEVEL SECURITY, el rol dueño de la tabla (y los superusers)
--     siguen ignorando RLS (comportamiento nativo de PostgreSQL). Para que el
--     aislamiento sea efectivo, la API debe conectarse con un rol NO dueño
--     (p. ej. `guachafit_app` con GRANT sobre las tablas). Ver reporte de WU7.
--   * Las políticas son inertes hasta que se ejecute ENABLE ROW LEVEL SECURITY.
--   * Bypass explícito, sin excepciones silenciosas: la única vía de acceso total
--     es `is_superadmin()`; el contexto se setea desde el JWT en el backend.
-- =============================================================================

-- Funciones de sesión.
-- STABLE (no IMMUTABLE): el valor del GUC cambia por transacción.
-- No son SECURITY DEFINER: `current_setting` no requiere privilegios elevados y
-- el diseño original de 05_Arquitectura lo declaraba así sin necesidad real.
CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true';
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION current_entrenador_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_entrenador_id', true), '')::uuid;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION current_usuario_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_usuario_id', true), '')::uuid;
$$;
--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- rutinas (RNF-003; omitida en el diseño original de 05_Arquitectura)
-- Coach dueño: acceso total. Alumno titular: solo lectura de su rutina.
-- Superadmin: bypass explícito.
-- -----------------------------------------------------------------------------
CREATE POLICY rls_rutinas ON rutinas
  FOR ALL
  USING (is_superadmin() OR entrenador_id = current_entrenador_id())
  WITH CHECK (is_superadmin() OR entrenador_id = current_entrenador_id());
--> statement-breakpoint
CREATE POLICY rls_rutinas_self_select ON rutinas
  FOR SELECT
  USING (alumno_id = current_usuario_id());
--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- perfiles_alumno (alumnos) — PREPARADA, SIN ENABLE en esta etapa
-- -----------------------------------------------------------------------------
CREATE POLICY rls_perfiles_alumno ON perfiles_alumno
  FOR ALL
  USING (is_superadmin() OR entrenador_id = current_entrenador_id())
  WITH CHECK (is_superadmin() OR entrenador_id = current_entrenador_id());
--> statement-breakpoint
CREATE POLICY rls_perfiles_alumno_self_select ON perfiles_alumno
  FOR SELECT
  USING (usuario_id = current_usuario_id());
--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- planes_membresia (planes) — PREPARADA, SIN ENABLE en esta etapa
-- -----------------------------------------------------------------------------
CREATE POLICY rls_planes_membresia ON planes_membresia
  FOR ALL
  USING (is_superadmin() OR entrenador_id = current_entrenador_id())
  WITH CHECK (is_superadmin() OR entrenador_id = current_entrenador_id());
--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- cuotas_membresia (cuotas) — PREPARADA, SIN ENABLE en esta etapa
-- -----------------------------------------------------------------------------
CREATE POLICY rls_cuotas_membresia ON cuotas_membresia
  FOR ALL
  USING (is_superadmin() OR entrenador_id = current_entrenador_id())
  WITH CHECK (is_superadmin() OR entrenador_id = current_entrenador_id());
--> statement-breakpoint
CREATE POLICY rls_cuotas_membresia_self_select ON cuotas_membresia
  FOR SELECT
  USING (cliente_id = current_usuario_id());
--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- transacciones_pago (transacciones) — PREPARADA, SIN ENABLE en esta etapa
-- -----------------------------------------------------------------------------
CREATE POLICY rls_transacciones_pago ON transacciones_pago
  FOR ALL
  USING (is_superadmin() OR entrenador_id = current_entrenador_id())
  WITH CHECK (is_superadmin() OR entrenador_id = current_entrenador_id());
--> statement-breakpoint
CREATE POLICY rls_transacciones_pago_self_select ON transacciones_pago
  FOR SELECT
  USING (cliente_id = current_usuario_id());
--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- ETAPA 1: habilitar RLS solo en `rutinas` (todos sus caminos están envueltos).
-- -----------------------------------------------------------------------------
ALTER TABLE rutinas ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- ETAPA 2 (PENDIENTE): descomentar por tabla únicamente cuando TODAS sus consultas
-- de tenant corran dentro de withTenant() y la suite lo verifique.
-- ALTER TABLE perfiles_alumno ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE planes_membresia ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE cuotas_membresia ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE transacciones_pago ENABLE ROW LEVEL SECURITY;
-- -----------------------------------------------------------------------------

-- =============================================================================
-- ROLLBACK (manual, en este orden):
--
--   ALTER TABLE rutinas DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS rls_rutinas ON rutinas;
--   DROP POLICY IF EXISTS rls_rutinas_self_select ON rutinas;
--   DROP POLICY IF EXISTS rls_perfiles_alumno ON perfiles_alumno;
--   DROP POLICY IF EXISTS rls_perfiles_alumno_self_select ON perfiles_alumno;
--   DROP POLICY IF EXISTS rls_planes_membresia ON planes_membresia;
--   DROP POLICY IF EXISTS rls_cuotas_membresia ON cuotas_membresia;
--   DROP POLICY IF EXISTS rls_cuotas_membresia_self_select ON cuotas_membresia;
--   DROP POLICY IF EXISTS rls_transacciones_pago ON transacciones_pago;
--   DROP POLICY IF EXISTS rls_transacciones_pago_self_select ON transacciones_pago;
--   DROP FUNCTION IF EXISTS is_superadmin();
--   DROP FUNCTION IF EXISTS current_entrenador_id();
--   DROP FUNCTION IF EXISTS current_usuario_id();
-- =============================================================================
