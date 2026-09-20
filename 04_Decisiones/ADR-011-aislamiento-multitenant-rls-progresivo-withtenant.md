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
  2. **Seguridad real vs. seguridad aparente:** el rol dueño de las tablas (y los superusers) ignora RLS de forma nativa. Sin un rol de conexión no-dueño o `FORCE ROW LEVEL SECURITY`, las políticas pueden existir sin aislar efectivamente: es peor un falso positivo de seguridad que una deuda declarada.
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
- **Etapa 1 (entregada, migración `0004_rls_multitenant.sql`):** `ENABLE ROW LEVEL SECURITY` únicamente en `rutinas`, la tabla cuyos caminos quedaron 100% envueltos en `withTenant`. Las otras cuatro tablas tienen políticas creadas y `ENABLE` pendiente (comentado de forma explícita en la migración).
- **Criterio de graduación por etapa:** una tabla solo se habilita cuando (1) el 100% de sus consultas de tenant corren dentro de `withTenant`, (2) la suite de tenancy lo verifica, y (3) existe verificación real contra PostgreSQL con rol no-dueño.
- **Requisito de efectividad:** sin `FORCE ROW LEVEL SECURITY`, el rol dueño de las tablas ignora las políticas. La API debe conectarse con un rol no-dueño (p. ej. `guachafit_app` con `GRANT` sobre las tablas) y/o aplicar `FORCE ROW LEVEL SECURITY` por tabla. Mientras eso no ocurra, RLS es una capa preparada, no una garantía efectiva.

### Plan de Activación por Etapas (borrador)
1. **Etapa 1 — `rutinas` (entregada):** 100% de caminos envueltos; `ENABLE` activo.
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
- **T3:** Deuda de verificación: la suite actual usa mocks; hace falta la batería real contra PostgreSQL con rol no-dueño.

### Riesgos Mitigados y Residuales
- **Riesgo Mitigado:** regresión masiva por `ENABLE` prematuro; políticas inertes por falta de contexto de sesión.
- **Riesgo Residual (alto):** el rol de conexión actual es dueño de las tablas; sin rol no-dueño ni `FORCE RLS`, las políticas de `rutinas` tampoco aíslan efectivamente. Debe resolverse antes de declarar RNF-003 implementado.
- **Riesgo Residual:** drift futuro si una consulta nueva sobre una tabla habilitada se escribe fuera de `withTenant`; se mitiga con revisión de conformidad y tests.

---

## 5. Trazabilidad y Referencias
- Requerimientos asociados: [[RNF-003-aislamiento-multitenant-seguridad-datos-salud]], [[RF-010-rbac-jerarquia-aislamiento-tenancy]]
- Decisiones relacionadas: [[ADR-009-modelo-multitenancy-aislamiento-entrenadores]]
- Implementación: `packages/database/drizzle/0004_rls_multitenant.sql`, `packages/database/src/client.ts` (`withTenant`, `setTenantSession`)
- Documentación de arquitectura: [[02_Esquema_Base_de_Datos_PostgreSQL]]
