-- =============================================================================
-- Verifica, COMO el rol de aplicación (nunca como administrador), que RLS aísla
-- de verdad y que el rol tiene todo lo necesario para operar. SOLO LECTURA: no
-- cambia nada.
-- =============================================================================
-- Comprueba:
--   (a) atributos: sin superusuario, sin BYPASSRLS, sin ser dueño de ninguna
--       tabla de public ni miembro de sus dueños;
--   (b) privilegios: SELECT/INSERT/UPDATE/DELETE en todas las tablas de public y
--       USAGE/SELECT en sus secuencias;
--   (c) sin contexto de tenant, cada tabla con RLS habilitado y CON DATOS
--       devuelve 0 filas; las tablas sin señal de datos se reportan como AVISO
--       (sin datos no se puede demostrar el aislamiento);
--   (d) lectura de drizzle.__drizzle_migrations (la comprobación que hará el API
--       al arrancar).
-- Imprime líneas PASS/FAIL/AVISO por comprobación. Si hay algún FAIL, termina
-- con error (código != 0). Si no hay FAIL pero ninguna tabla RLS tiene señal de
-- datos, el resultado es INCOMPLETO: repite la verificación con datos reales.
--
-- REQUISITOS: psql >= 15. La contraseña va por entorno (PGPASSWORD), nunca en la
-- URL ni en el argumento de conexión. Si usas una URL con contraseña, esta debe
-- ir percent-encoded (@ -> %40, : -> %3A, / -> %2F, ? -> %3F, # -> %23).
--
-- CÓMO EJECUTARLO. Placeholders: <rol> = rol de aplicación; <base> = base de
-- datos; <host> = servidor; <ruta-secretos> = archivo FUERA del repositorio.
--
--   Local (docker compose; desde la raíz del repositorio; bash):
--     export GUACHAFIT_APP_PASSWORD="$(cat <ruta-secretos>)"
--     docker compose cp packages/database/scripts/verificar-rol-app.sql postgres:/tmp/
--     docker compose exec -T -e PGPASSWORD="$GUACHAFIT_APP_PASSWORD" postgres \
--       psql -h 127.0.0.1 -U <rol> -d <base> -v ON_ERROR_STOP=1 \
--       -f /tmp/verificar-rol-app.sql
--
--   Producción (psql directo; bash):
--     PGPASSWORD="$(cat <ruta-secretos>)" psql \
--       "postgresql://<rol>@<host>:5432/<base>" -v ON_ERROR_STOP=1 \
--       -f packages/database/scripts/verificar-rol-app.sql
--
-- NOTA sobre (c): la señal de datos es n_live_tup (estimado de filas vivas de
-- pg_stat_user_tables, que refresca ANALYZE). Si esperas datos y todo sale como
-- AVISO, ejecuta ANALYZE como el rol dueño y repite la verificación.
-- =============================================================================

-- Detener al primer error que no se maneje (los FAIL de las comprobaciones se
-- acumulan y se reportan juntos al final).
\set ON_ERROR_STOP on

DO $$
DECLARE
  hay_fallos boolean := false;
  tablas_public integer := 0;
  tablas_ok integer := 0;
  tablas_rls integer := 0;
  tablas_rls_con_datos integer := 0;
  secuencias_public integer := 0;
  secuencias_ok integer := 0;
  atributos record;
  oid_actual oid;
  sin_rls text;
  duenos_miembro text;
  tabla record;
  secuencia record;
  filas bigint;
  faltantes text;
BEGIN
  -- Contexto de sesión vacío: ninguna comprobación debe depender de GUCs
  -- heredados. (set_config a cadena vacía equivale a "sin contexto" para las
  -- funciones de la migración 0004.)
  PERFORM set_config('app.current_entrenador_id', '', false);
  PERFORM set_config('app.current_usuario_id', '', false);
  PERFORM set_config('app.is_superadmin', '', false);

  -- ---------------------------------------------------------------------------
  -- (a) Atributos del rol verificado.
  -- ---------------------------------------------------------------------------
  SELECT oid, rolsuper, rolbypassrls INTO atributos
  FROM pg_roles WHERE rolname = current_user;
  oid_actual := atributos.oid;

  IF atributos.rolsuper THEN
    RAISE NOTICE 'FAIL · el rol % es superusuario: las políticas RLS no lo someten', current_user;
    hay_fallos := true;
  ELSE
    RAISE NOTICE 'PASS · el rol % no es superusuario', current_user;
  END IF;

  IF atributos.rolbypassrls THEN
    RAISE NOTICE 'FAIL · el rol % tiene BYPASSRLS: las políticas RLS no lo someten', current_user;
    hay_fallos := true;
  ELSE
    RAISE NOTICE 'PASS · el rol % no tiene BYPASSRLS', current_user;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relowner = oid_actual
  ) THEN
    RAISE NOTICE 'FAIL · el rol % es dueño de tabla(s) en public: un dueño ignora RLS', current_user;
    hay_fallos := true;
  ELSE
    RAISE NOTICE 'PASS · el rol % no es dueño de ninguna tabla en public', current_user;
  END IF;

  -- Miembro (directo o indirecto) o con uso de algún dueño de tabla: podría
  -- saltarse RLS con SET ROLE, así que también es FAIL.
  SELECT string_agg(DISTINCT c.relowner::regrole::text, ', ')
    INTO duenos_miembro
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    AND c.relowner <> oid_actual
    AND (pg_has_role(oid_actual, c.relowner, 'MEMBER') OR pg_has_role(oid_actual, c.relowner, 'USAGE'));

  IF duenos_miembro IS NOT NULL THEN
    RAISE NOTICE 'FAIL · el rol % es miembro de dueño(s) de tablas de public (%): podría saltarse RLS con SET ROLE', current_user, duenos_miembro;
    hay_fallos := true;
  ELSE
    RAISE NOTICE 'PASS · el rol % no es miembro de ningún dueño de tablas de public', current_user;
  END IF;

  -- ---------------------------------------------------------------------------
  -- (b) Privilegios de operación sobre TODAS las tablas y secuencias de public.
  --     Se comprueba privilegio por privilegio: la variante con lista devuelve
  --     verdadero si se tiene CUALQUIERA, y aquí hace falta tenerlos todos.
  -- ---------------------------------------------------------------------------
  FOR tabla IN
    SELECT c.oid, c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    ORDER BY c.relname
  LOOP
    tablas_public := tablas_public + 1;

    SELECT string_agg(p.privilegio, ', ' ORDER BY p.privilegio)
      INTO faltantes
    FROM (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS p(privilegio)
    WHERE NOT has_table_privilege(oid_actual, tabla.oid, p.privilegio);

    IF faltantes IS NULL THEN
      tablas_ok := tablas_ok + 1;
    ELSE
      RAISE NOTICE 'FAIL · %: faltan privilegios de tabla (%)', tabla.relname, faltantes;
      hay_fallos := true;
    END IF;
  END LOOP;

  IF tablas_public = 0 THEN
    RAISE NOTICE 'FAIL · el esquema public no tiene tablas: aplica las migraciones antes de verificar';
    hay_fallos := true;
  ELSIF tablas_ok = tablas_public THEN
    RAISE NOTICE 'PASS · las % tablas de public tienen SELECT/INSERT/UPDATE/DELETE', tablas_public;
  END IF;

  FOR secuencia IN
    SELECT c.oid, c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'S'
    ORDER BY c.relname
  LOOP
    secuencias_public := secuencias_public + 1;

    SELECT string_agg(p.privilegio, ', ' ORDER BY p.privilegio)
      INTO faltantes
    FROM (VALUES ('USAGE'), ('SELECT')) AS p(privilegio)
    WHERE NOT has_sequence_privilege(oid_actual, secuencia.oid, p.privilegio);

    IF faltantes IS NULL THEN
      secuencias_ok := secuencias_ok + 1;
    ELSE
      RAISE NOTICE 'FAIL · secuencia %: faltan privilegios (%)', secuencia.relname, faltantes;
      hay_fallos := true;
    END IF;
  END LOOP;

  IF secuencias_public > 0 AND secuencias_ok = secuencias_public THEN
    RAISE NOTICE 'PASS · las % secuencias de public tienen USAGE/SELECT', secuencias_public;
  END IF;

  -- Informativo: tablas de public que todavía no tienen RLS habilitado. Las
  -- etapas de RLS se encienden por módulo cuando todos sus caminos están
  -- cubiertos; esto solo reporta el estado.
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
    INTO sin_rls
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity;

  IF sin_rls IS NOT NULL THEN
    RAISE NOTICE 'AVISO · tablas de public sin RLS habilitado (informativo): %', sin_rls;
  ELSE
    RAISE NOTICE 'PASS · todas las tablas de public tienen RLS habilitado';
  END IF;

  -- ---------------------------------------------------------------------------
  -- (c) Sin contexto de tenant, cada tabla con RLS y CON DATOS debe devolver 0.
  --     Señal de datos: n_live_tup (pg_stat_user_tables). Sin señal no se puede
  --     demostrar el aislamiento: AVISO, nunca PASS.
  -- ---------------------------------------------------------------------------
  FOR tabla IN
    SELECT c.oid, c.relname, COALESCE(s.n_live_tup, 0) AS filas_estimadas
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relrowsecurity
    ORDER BY c.relname
  LOOP
    tablas_rls := tablas_rls + 1;
    BEGIN
      EXECUTE format('SELECT count(*) FROM public.%I', tabla.relname) INTO filas;
      IF filas > 0 THEN
        RAISE NOTICE 'FAIL · % devolvió % fila(s) sin contexto de tenant: RLS inerte o sin políticas', tabla.relname, filas;
        hay_fallos := true;
      ELSIF tabla.filas_estimadas = 0 THEN
        RAISE NOTICE 'AVISO · % no tiene filas: el aislamiento no se pudo comprobar con datos', tabla.relname;
      ELSE
        RAISE NOTICE 'PASS · % devuelve 0 filas sin contexto con datos presentes (RLS activo)', tabla.relname;
        tablas_rls_con_datos := tablas_rls_con_datos + 1;
      END IF;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'FAIL · %: sin permiso de lectura (falta GRANT SELECT al rol)', tabla.relname;
      hay_fallos := true;
    END;
  END LOOP;

  IF tablas_rls = 0 THEN
    RAISE NOTICE 'FAIL · no hay tablas con RLS habilitado en public: las migraciones no están aplicadas';
    hay_fallos := true;
  END IF;

  -- ---------------------------------------------------------------------------
  -- (d) Lectura de la tabla de control de migraciones (arranque del API).
  -- ---------------------------------------------------------------------------
  IF to_regclass('drizzle.__drizzle_migrations') IS NULL THEN
    RAISE NOTICE 'FAIL · drizzle.__drizzle_migrations no existe: aplica las migraciones antes de verificar';
    hay_fallos := true;
  ELSE
    BEGIN
      EXECUTE 'SELECT count(*) FROM drizzle.__drizzle_migrations' INTO filas;
      RAISE NOTICE 'PASS · lectura de drizzle.__drizzle_migrations correcta (% fila(s))', filas;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'FAIL · sin permiso de lectura sobre drizzle.__drizzle_migrations: provisiona el rol con packages/database/scripts/crear-rol-app.sql';
      hay_fallos := true;
    END;
  END IF;

  -- ---------------------------------------------------------------------------
  -- Resumen final: PASS solo con cero FAIL y al menos una tabla RLS comprobada
  -- con datos; si solo hubo AVISOs, el resultado es INCOMPLETO.
  -- ---------------------------------------------------------------------------
  IF hay_fallos THEN
    RAISE EXCEPTION 'RESULTADO · FAIL: hay comprobaciones en FAIL (ver las líneas anteriores y corregir antes de conectar el API con este rol).';
  ELSIF tablas_rls_con_datos = 0 THEN
    RAISE NOTICE 'RESULTADO · INCOMPLETO: sin FAIL, pero ninguna tabla con RLS tiene señal de datos (n_live_tup = 0). Repite la verificación con datos reales; si esperabas datos, ejecuta ANALYZE como el rol dueño para refrescar las estadísticas.';
  ELSE
    RAISE NOTICE 'RESULTADO · PASS: el rol % puede usarse como rol de aplicación con RLS efectivo (% tabla(s) con RLS comprobadas con datos)', current_user, tablas_rls_con_datos;
  END IF;
END $$;
