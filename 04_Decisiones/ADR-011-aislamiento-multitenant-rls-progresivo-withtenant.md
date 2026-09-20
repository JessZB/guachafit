---
id: ADR-011
titulo: "ADR-011: Aislamiento Multi-Tenant por Etapas — RLS Progresivo con withTenant"
fecha: 2026-09-20
estado: propuesto
decisores:
  - "Tech Lead"
  - "Principal Architect"
tags:
  - decision
  - adr
  - arquitectura
  - multi-tenant
  - seguridad
  - postgresql
  - rls
  - deuda-tecnica
---

# ADR-011: Aislamiento Multi-Tenant por Etapas — RLS Progresivo con withTenant

## 1. Estado
`propuesto`

---

## 2. Contexto y Fuerzas en Juego
[[ADR-009-modelo-multitenancy-aislamiento-entrenadores]] definió la base de datos compartida con discriminador `entrenador_id` y **Row-Level Security (RLS)** como garantía de motor. [[RNF-003-aislamiento-multitenant-seguridad-datos-salud]] exige RLS sobre cinco tablas: `perfiles_alumno`, `planes_membresia`, `cuotas_membresia`, `transacciones_pago` y `rutinas`.

Al implementarlo aparecieron fuerzas que hacen inviable un encendido total en una sola unidad:

- **Problema a resolver:** habilitar RLS sin romper producción. PostgreSQL aplica `deny-by-default` en cuanto una tabla tiene `ENABLE ROW LEVEL SECURITY`: toda consulta que no corra con el contexto de sesión correcto devuelve cero filas o falla. Las tablas de alumnos y finanzas tienen muchos puntos de acceso distribuidos (directorio, antropometría, nutrición, dashboard, notificaciones, seeds), por lo que un `ENABLE` masivo antes de envolver el 100% de los caminos provoca una caída funcional silenciosa.
- **Fuerzas en conflicto:**
  1. **Aislamiento estricto vs. disponibilidad:** el objetivo de negocio es 0% de fugas entre tenants, pero la plataforma ya opera con entrenadores reales; una etapa mal graduada rompe el servicio completo.
  2. **Seguridad real vs. seguridad aparente:** el rol dueño de las tablas ignora RLS de forma nativa y `FORCE ROW LEVEL SECURITY` solo lo somete a las políticas; los superusers y los roles con `BYPASSRLS` siguen exentos incluso con `FORCE` (comportamiento documentado de PostgreSQL). Sin un rol de conexión no-dueño `NOSUPERUSER NOBYPASSRLS`, las políticas pueden existir sin aislar efectivamente: es peor un falso positivo de seguridad que una deuda declarada. Ver apéndice §6.
  3. **Verificabilidad:** los tests actuales validan el mecanismo/contrato con mocks; la verificación de aislamiento real requiere PostgreSQL con una conexión de rol no-dueño.
  4. **Velocidad de entrega:** el equipo necesita avanzar módulo a módulo sin bloquear el resto del backlog.
- **Opciones consideradas:**
  1. *Opción A (Big Bang):* `ENABLE ROW LEVEL SECURITY` en las cinco tablas y envolver todos los accesos en una sola unidad.
     - *Descartada:* superficie de cambio inmanejable, altísimo riesgo de regresión en producción y tests verdes que no probarían la base real.
  2. *Opción B (RLS progresivo por etapas con `withTenant`):* crear todas las políticas, habilitar `ENABLE` solo en las tablas cuyos caminos de tenant ya están 100% envueltos en una transacción con contexto, y graduar el resto módulo a módulo.
     - *Seleccionada.*
  3. *Opción C (Aplazar RLS y confiar solo en filtros de aplicación):* mantener los `WHERE entrenador_id = ?` como única defensa.
     - *Descartada:* viola RNF-003 y ADR-009; un olvido de filtro se convierte en fuga directa entre competidores.

---

## 3. Decisión
Elegimos la **Opción B (RLS progresivo por etapas con `withTenant`)** porque permite avanzar hacia el aislamiento de motor sin sacrificar disponibilidad, dejando explícito y medible qué tablas están efectivamente protegidas y cuáles quedan preparadas.

### Detalles de la Implementación
- **Contrato de sesión (GUCs):** `app.current_entrenador_id` (tenant dueño), `app.current_usuario_id` (acceso "self" de alumno/cliente) y `app.is_superadmin` (bypass explícito de sistema). Se aplican con `set_config(name, value, is_local => true)` dentro de la misma transacción, equivalente transaccional de `SET LOCAL` (la gramática `SET` no admite parámetros ligados).
- **Envoltorio único:** `withTenant(context, fn)` en `packages/database/src/client.ts` abre la transacción, aplica los GUCs y ejecuta el callback sobre esa misma conexión. Toda consulta a una tabla con RLS habilitado debe correr dentro de este envoltorio.
- **Políticas por tabla:** política de coach para `ALL` (`is_superadmin() OR entrenador_id = current_entrenador_id()`, con `WITH CHECK` equivalente) y, donde aplica acceso del alumno/cliente, política adicional `FOR SELECT` (`alumno_id`/`usuario_id`/`cliente_id = current_usuario_id()`).
- **Etapa 1 (entregada en dos unidades):** `ENABLE ROW LEVEL SECURITY` en las tablas cuyos caminos quedaron 100% envueltos en `withTenant`:
  - **`rutinas` (WU7, migración `0004_rls_multitenant.sql`):** 11 sitios envueltos (entrenamiento, plantillas y dashboard del coach) + seed con bypass de sistema.
  - **`plantillas_rutina` (WU11, migración `0005_rls_plantillas.sql`):** banco de plantillas del coach (RF-017); todos los accesos de `PlantillasService` (listar, obtener, crear, actualizar, desactivar y lecturas del flujo de asignación) corren en `withTenant`; sin política "self" (es herramienta del entrenador, no del alumno).
  Las otras cuatro tablas (`perfiles_alumno`, `planes_membresia`, `cuotas_membresia`, `transacciones_pago`) tienen políticas creadas y `ENABLE` pendiente (comentado de forma explícita en la migración `0004`).
- **Criterio de graduación por etapa:** una tabla solo se habilita cuando (1) el 100% de sus consultas de tenant corren dentro de `withTenant`, (2) la suite de tenancy lo verifica, y (3) existe verificación real contra PostgreSQL con rol no-dueño.
- **Requisito de efectividad:** `FORCE ROW LEVEL SECURITY` solo somete al rol dueño de la tabla; los superusers y los roles con `BYPASSRLS` la ignoran siempre (comportamiento nativo de PostgreSQL, comprobado empíricamente). Por tanto, la vía obligatoria es conectar la API con un rol no-dueño `NOSUPERUSER NOBYPASSRLS` (p. ej. `guachafit_app` con `GRANT` sobre las tablas; SQL en el apéndice §6). Mientras eso no ocurra, RLS es una capa preparada, no una garantía efectiva.

### Plan de Activación por Etapas (borrador)
1. **Etapa 1 — `rutinas` + `plantillas_rutina` (entregada):** 100% de caminos envueltos; `ENABLE` activo (migraciones `0004_rls_multitenant.sql` y `0005_rls_plantillas.sql`). Verificada contra PostgreSQL real con rol no-dueño.
2. **Etapa 2 — `perfiles_alumno`:** envolver directorio, expediente, antropometría, nutrición, dashboard y seeds; verificar y habilitar.
3. **Etapa 3 — `cuotas_membresia` y `transacciones_pago`:** finanzas y conciliación con transacciones ACID ya existentes; verificar y habilitar.
4. **Etapa 4 — `planes_membresia`:** catálogo de planes; verificar y habilitar.
5. **Transversal:** provisionar el rol de conexión no-dueño (o `FORCE RLS`) antes de declarar el aislamiento efectivo; ejecutar la batería de penetración de tenancy contra PostgreSQL real.

---

## 4. Consecuencias y Trade-offs

### Consecuencias Positivas (Beneficios)
- **C1:** Avance verificable hacia RNF-003 sin riesgo de caída funcional: cada tabla se enciende con sus caminos probados.
- **C2:** Las políticas se crean una sola vez y quedan versionadas en la migración; las etapas restantes solo requieren `ENABLE` + cobertura.
- **C3:** El contrato `withTenant`/GUC elimina el interceptor muerto y hace explícito el contexto de tenant en cada transacción.

### Consecuencias Negativas (Costos y Trade-offs)
- **T1:** Aislamiento incompleto transitorio: las cuatro tablas restantes siguen dependiendo de filtros de aplicación hasta su etapa.
- **T2:** Disciplina de desarrollo: toda consulta nueva sobre una tabla con RLS habilitado debe correr dentro de `withTenant` o falla por `deny-by-default`.
- **T3:** Deuda de verificación: la suite unitaria usa mocks; la etapa 1 (`rutinas`, `plantillas_rutina`) ya se verificó contra PostgreSQL real con rol no-dueño, pero la batería debe repetirse antes de habilitar cada etapa restante.

### Riesgos Mitigados y Residuales
- **Riesgo Mitigado:** regresión masiva por `ENABLE` prematuro; políticas inertes por falta de contexto de sesión.
- **Riesgo Residual (alto):** el rol de conexión actual es dueño y superuser de las tablas; `FORCE RLS` no cubre a superusers ni a roles `BYPASSRLS`, así que las políticas de `rutinas` y `plantillas_rutina` tampoco aíslan efectivamente en ese escenario. Debe resolverse provisionando el rol de aplicación `NOSUPERUSER NOBYPASSRLS` (apéndice §6) antes de declarar RNF-003 implementado.
- **Riesgo Residual:** drift futuro si una consulta nueva sobre una tabla habilitada se escribe fuera de `withTenant`; se mitiga con revisión de conformidad y tests.

---

## 5. Trazabilidad y Referencias
- Requerimientos asociados: [[RNF-003-aislamiento-multitenant-seguridad-datos-salud]], [[RF-010-rbac-jerarquia-aislamiento-tenancy]]
- Decisiones relacionadas: [[ADR-009-modelo-multitenancy-aislamiento-entrenadores]]
- Implementación: `packages/database/drizzle/0004_rls_multitenant.sql`, `packages/database/drizzle/0005_rls_plantillas.sql`, `packages/database/src/client.ts` (`withTenant`, `setTenantSession`), `apps/api/src/modules/entrenamiento/plantillas.service.ts` (WU11: accesos de `plantillas_rutina` envueltos)
- Documentación de arquitectura: [[02_Esquema_Base_de_Datos_PostgreSQL]]

---

## 6. Apéndice: rol de aplicación en producción (SQL de referencia)

El enforcement real de RLS exige que la API se conecte con un rol **no-dueño, `NOSUPERUSER NOBYPASSRLS`**. `FORCE ROW LEVEL SECURITY` no es sustituto: solo somete al rol dueño y los superusers/`BYPASSRLS` la ignoran siempre. Pasos de referencia (ejecutar como rol administrador; ajustar tablas según las etapas habilitadas):

```sql
-- 1. Rol de aplicación: sin privilegios de superusuario ni bypass de RLS.
CREATE ROLE guachafit_app LOGIN PASSWORD '<secreto-gestionado-en-vault>'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;

-- 2. Acceso al esquema y a las tablas (ajustar a las tablas de cada etapa).
GRANT USAGE ON SCHEMA public TO guachafit_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO guachafit_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO guachafit_app;
-- IMPORTANTE: el rol NO debe ser owner de las tablas (ALTER TABLE ... OWNER TO).

-- 3. Objetos futuros: el rol de migración (dueño) aplica los mismos GRANT por defecto.
ALTER DEFAULT PRIVILEGES FOR ROLE guachafit_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO guachafit_app;
ALTER DEFAULT PRIVILEGES FOR ROLE guachafit_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO guachafit_app;
```

La aplicación (ya implementada) setea los GUC por transacción con `set_config(..., is_local => true)` vía `withTenant` (`packages/database/src/client.ts`); el pool debe apuntar `DATABASE_URL` a `guachafit_app` en producción:

```sql
BEGIN;
SELECT set_config('app.current_entrenador_id', '<uuid-del-coach>', true); -- tenant dueño
SELECT set_config('app.current_usuario_id',    '<uuid-del-usuario>', true); -- acceso self alumno/cliente
SELECT set_config('app.is_superadmin',         'true',               true); -- solo rutas de sistema
-- ... consultas de la petición ...
COMMIT;
```

Verificación mínima post-provisión (repetir antes de cada etapa): con el rol de aplicación, sin GUC la tabla habilitada devuelve 0 filas; con `app.current_entrenador_id = A` solo las filas de A; con `app.is_superadmin = 'true'` todas; INSERT con `entrenador_id = B` bajo el GUC de A falla por `WITH CHECK`.
