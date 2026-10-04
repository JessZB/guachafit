-- =============================================================================
-- Aprovisiona el rol de aplicación restringido con el que el API se conecta a
-- PostgreSQL. Con RLS habilitado, el aislamiento multi-tenant solo es real si
-- el rol de conexión NO es superusuario, NO tiene BYPASSRLS y NO es dueño de las
-- tablas: el dueño y los superusers ignoran las políticas (comportamiento nativo
-- de PostgreSQL). Referencia: ADR-011 §6 (RNF-003).
--
-- IDEMPOTENTE: seguro de ejecutar las veces que haga falta.
--   * Si el rol no existe, lo crea (LOGIN + contraseña).
--   * Si ya existe, solo garantiza sus atributos y actualiza la contraseña.
--   * Los GRANT son repetibles (PostgreSQL no falla si ya estaban).
--   * NUNCA otorga propiedad (OWNER), BYPASSRLS, REPLICATION ni superusuario.
--   * Todo el aprovisionamiento corre en UNA transacción: si algo falla, no
--     queda nada a medias (psql se detiene y la conexión revierte).
--
-- REQUISITOS:
--   * psql >= 15 (usa \getenv para leer la contraseña desde el entorno).
--   * Ejecutarlo un superusuario o un miembro del rol dueño de las tablas.
--   * Las migraciones deben estar aplicadas ANTES: si no existen tablas en
--     `public` o `drizzle.__drizzle_migrations`, el script aborta y lo indica.
--
-- PARÁMETROS (variables psql):
--   -v owner_role=<rol-dueño>  OBLIGATORIO. Rol dueño de las tablas y que corre
--                              las migraciones (en desarrollo, `postgres`; en
--                              producción, el que elija el operador).
--   -v app_role=<rol>          Opcional. Por defecto: `guachafit_app`.
--   La contraseña NO se pasa por -v: se lee de la variable de entorno
--   GUACHAFIT_APP_PASSWORD (así no queda en el argv del proceso ni en el
--   historial, y nunca se escribe en un archivo). Debe estar definida y no vacía.
--
-- CÓMO DESCUBRIR EL ROL DUEÑO:
--   SELECT DISTINCT tableowner FROM pg_tables WHERE schemaname IN ('public','drizzle');
--
-- CÓMO EJECUTARLO. Placeholders: <admin> = usuario administrador; <host> =
-- servidor; <base> = base de datos; <rol-dueño> = resultado de la consulta
-- anterior; <ruta-secretos> = archivo de secretos FUERA del repositorio.
--
--   Producción (psql directo; bash):
--     export GUACHAFIT_APP_PASSWORD="$(cat <ruta-secretos>)"
--     psql "postgresql://<admin>@<host>:5432/<base>" -v ON_ERROR_STOP=1 \
--       -v owner_role=<rol-dueño> -v app_role=guachafit_app \
--       -f packages/database/scripts/crear-rol-app.sql
--
--   Local (docker compose; desde la raíz del repositorio; bash):
--     export GUACHAFIT_APP_PASSWORD="$(cat <ruta-secretos>)"
--     docker compose cp packages/database/scripts/crear-rol-app.sql postgres:/tmp/
--     docker compose exec -T -e GUACHAFIT_APP_PASSWORD postgres \
--       psql -U postgres -d guachafit -v ON_ERROR_STOP=1 -v owner_role=postgres \
--       -v app_role=guachafit_app -f /tmp/crear-rol-app.sql
--
--   PowerShell (equivalente a `export`):
--     $env:GUACHAFIT_APP_PASSWORD = Get-Content <ruta-secretos> -Raw
--
-- SALIDA ESPERADA (extracto; la primera vez `CREATE ROLE`, luego `ALTER ROLE`):
--   CREATE ROLE
--   GRANT
--   ALTER DEFAULT PRIVILEGES
--              rol           | rolcanlogin | rolsuper | rolreplication | rolbypassrls
--   -------------------------+-------------+---------+----------------+--------------
--    guachafit_app           | t           | f       | f              | f
-- Si falta GUACHAFIT_APP_PASSWORD, el script aborta antes de tocar la base.
--
-- NOTA: si usas la contraseña dentro de una URL de conexión, debe ir
-- percent-encoded (@ -> %40, : -> %3A, / -> %2F, ? -> %3F, # -> %23). Este
-- script no la usa en URL: la inyecta citada con %L.
--
-- Después: verifica con packages/database/scripts/verificar-rol-app.sql
-- conectado COMO el rol de aplicación, y apunta la DATABASE_URL del API a ese
-- rol (deuda de despliegue pendiente: hasta entonces el API conecta como el
-- dueño y RLS no aísla).
-- =============================================================================

-- Detener al primer error: mejor fallar ruidosamente que dejar un rol a medias.
\set ON_ERROR_STOP on

-- -----------------------------------------------------------------------------
-- 0. Parámetros. Se aborta ANTES de tocar la base si falta algo.
-- -----------------------------------------------------------------------------
\if :{?app_role}
\else
  \set app_role guachafit_app
\endif

\if :{?owner_role}
\else
  DO $$ BEGIN RAISE EXCEPTION 'Falta -v owner_role=<rol-dueño> (rol dueño de las tablas y de las migraciones).'; END $$;
\endif

-- La contraseña se lee del entorno: nunca por -v ni desde un archivo del repo.
\getenv app_password GUACHAFIT_APP_PASSWORD
\if :{?app_password}
\else
  DO $$ BEGIN RAISE EXCEPTION 'Falta la variable de entorno GUACHAFIT_APP_PASSWORD (contraseña del rol de aplicación; defínela desde un archivo de secretos fuera del repositorio).'; END $$;
\endif

SELECT CASE
         WHEN length(:'app_role') > 0 AND length(:'owner_role') > 0 AND length(:'app_password') > 0
         THEN 'true' ELSE 'false'
       END AS parametros_ok
\gset
\if :parametros_ok
\else
  DO $$ BEGIN RAISE EXCEPTION 'app_role, owner_role y GUACHAFIT_APP_PASSWORD no pueden estar vacíos.'; END $$;
\endif

-- Los nombres de rol se comparten con los bloques DO $$...$$ vía GUCs de sesión
-- (los valores de psql no se interpolan dentro de un DO). Solo van nombres; la
-- contraseña jamás pasa por aquí.
SELECT set_config('app_deploy.app_role', :'app_role', false) AS app,
       set_config('app_deploy.owner_role', :'owner_role', false) AS owner
\gset

-- -----------------------------------------------------------------------------
-- 1. Validaciones previas: no se modifica nada hasta que todas pasen.
-- -----------------------------------------------------------------------------

-- El rol de aplicación no puede apuntar al rol dueño ni a un superusuario ya
-- existente: el script JAMÁS debe degradar un rol privilegiado. Para rotar la
-- contraseña de un superusuario, hazlo aparte con ALTER ROLE.
DO $$
DECLARE
  app text := current_setting('app_deploy.app_role');
  dueno text := current_setting('app_deploy.owner_role');
BEGIN
  IF app = dueno THEN
    RAISE EXCEPTION 'app_role y owner_role apuntan al mismo rol («%»): el rol de aplicación debe ser distinto del dueño.', app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app AND rolsuper) THEN
    RAISE EXCEPTION 'app_role apunta a un superusuario («%»): elige un rol de aplicación distinto (p. ej. guachafit_app).', app;
  END IF;
END $$;

-- El rol dueño debe existir.
DO $$
DECLARE
  dueno text := current_setting('app_deploy.owner_role');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = dueno) THEN
    RAISE EXCEPTION 'El rol dueño indicado en -v owner_role («%») no existe en esta base.', dueno;
  END IF;
END $$;

-- Quién puede ejecutar el script: un superusuario o un miembro del rol dueño
-- (hace falta para otorgar GRANT y ALTER DEFAULT PRIVILEGES FOR ROLE).
DO $$
DECLARE
  dueno text := current_setting('app_deploy.owner_role');
BEGIN
  IF NOT ((SELECT rolsuper FROM pg_roles WHERE rolname = current_user)
          OR pg_has_role(current_user, dueno, 'MEMBER')) THEN
    RAISE EXCEPTION 'El usuario «%» no puede aprovisionar este rol: ejecútalo un superusuario o un miembro de «%» (pide acceso y vuelve a intentarlo).', current_user, dueno;
  END IF;
END $$;

-- Deben existir tablas en public (es decir, migraciones aplicadas).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  ) THEN
    RAISE EXCEPTION 'El esquema public no tiene tablas: aplica las migraciones antes de aprovisionar el rol.';
  END IF;
END $$;

-- Todas las tablas de public deben pertenecer al rol dueño: los GRANT por
-- defecto y la propiedad se registran para él. Si hay otros dueños, se listan
-- para corregir -v owner_role.
DO $$
DECLARE
  dueno text := current_setting('app_deploy.owner_role');
  duenos_reales text;
BEGIN
  SELECT string_agg(DISTINCT c.relowner::regrole::text, ', ' ORDER BY c.relowner::regrole::text)
    INTO duenos_reales
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p')
    AND c.relowner <> (SELECT oid FROM pg_roles WHERE rolname = dueno);

  IF duenos_reales IS NOT NULL THEN
    RAISE EXCEPTION 'No todas las tablas de public pertenecen a «%»; dueños reales: %. Pasa el rol correcto en -v owner_role (consulta de descubrimiento en la cabecera del script).', dueno, duenos_reales;
  END IF;
END $$;

-- Las migraciones deben estar aplicadas: sin drizzle.__drizzle_migrations el
-- arranque del API no podría comprobar el journal. La tabla debe ser del dueño.
DO $$
DECLARE
  falta text;
  dueno text := current_setting('app_deploy.owner_role');
  dueno_real text;
BEGIN
  IF to_regnamespace('drizzle') IS NULL THEN
    falta := 'el esquema drizzle';
  ELSIF to_regclass('drizzle.__drizzle_migrations') IS NULL THEN
    falta := 'la tabla drizzle.__drizzle_migrations';
  END IF;
  IF falta IS NOT NULL THEN
    RAISE EXCEPTION 'No existe %: aplica las migraciones primero (pnpm db:migrate:prod o, dentro de la imagen del API, node /app/node_modules/@guachafit/database/dist/migrate.js con DATABASE_URL_MIGRACIONES) y vuelve a ejecutar este script.', falta;
  END IF;

  SELECT c.relowner::regrole::text INTO dueno_real
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'drizzle' AND c.relname = '__drizzle_migrations';
  IF dueno_real IS DISTINCT FROM dueno THEN
    RAISE EXCEPTION 'drizzle.__drizzle_migrations pertenece a «%», no a «%»: pasa el rol dueño real en -v owner_role.', dueno_real, dueno;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Aprovisionamiento atómico: todo dentro de una transacción. Si una sentencia
--    falla, psql se detiene (ON_ERROR_STOP) y la conexión revierte el resto.
-- -----------------------------------------------------------------------------
BEGIN;

-- 2.1 Desactivar el registro de sentencias ANTES de escribir la contraseña:
--     CREATE/ALTER ROLE ... PASSWORD puede quedar en el log del servidor
--     (log_statement=ddl|all, log_min_duration_statement). Requiere superusuario;
--     si no se puede, se avisa (no se aborta) para que el operador lo sepa.
DO $$
BEGIN
  PERFORM set_config('log_statement', 'none', false);
  PERFORM set_config('log_min_duration_statement', '-1', false);
  RAISE NOTICE 'Registro de sentencias desactivado para esta sesión: la contraseña no quedará en el log.';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'AVISO · no se pudo desactivar el registro de sentencias (log_statement / log_min_duration_statement): la contraseña podría quedar en el log del servidor. Ejecuta el script como superusuario para evitarlo, o revisa y depura el log después.';
END $$;

-- 2.2 Rol: crear si falta; si ya existe, solo atributos y contraseña.
--     NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOREPLICATION/NOINHERIT/NOBYPASSRLS.
--     Nota: los valores de psql no se interpolan dentro de un DO $$...$$, por eso
--     se usa format() + \gexec (%I cita el nombre y %L la contraseña).
SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_role')
         THEN 'true' ELSE 'false' END AS app_role_existe
\gset

\if :app_role_existe
  SELECT format(
    'ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT NOBYPASSRLS',
    :'app_role', :'app_password'
  )
  \gexec
\else
  SELECT format(
    'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT NOBYPASSRLS',
    :'app_role', :'app_password'
  )
  \gexec
\endif

-- 2.3 Privilegios sobre los objetos existentes (ADR-011 §6). Nada de OWNER: el
--     rol debe seguir siendo no-dueño para que RLS aplique de verdad.
GRANT USAGE ON SCHEMA public TO :"app_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app_role";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"app_role";

-- 2.4 Lectura de la tabla de control de migraciones (solo esa tabla; nada más
--     del esquema drizzle): es lo que consulta el arranque del API.
GRANT USAGE ON SCHEMA drizzle TO :"app_role";
GRANT SELECT ON TABLE drizzle.__drizzle_migrations TO :"app_role";

-- 2.5 Objetos futuros: las migraciones corren con el rol dueño
--     (DATABASE_URL_MIGRACIONES), así que los permisos por defecto se registran
--     PARA ESE ROL. Las tablas y secuencias de las próximas etapas de RLS nacen
--     accesibles para el rol de aplicación.
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner_role" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_role";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner_role" IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO :"app_role";

COMMIT;

-- -----------------------------------------------------------------------------
-- 3. Resumen final para la evidencia: LOGIN, sin superusuario, sin REPLICATION,
--    sin BYPASSRLS y sin poder crear bases ni roles.
-- -----------------------------------------------------------------------------
SELECT rolname AS rol, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolreplication, rolbypassrls
FROM pg_roles
WHERE rolname = :'app_role';
