---
id: ADR-009
titulo: "ADR-009: Arquitectura Multi-Tenancy mediante Discriminador de Tenant y Row-Level Security en Base de Datos Compartida"
fecha: 2026-09-06
estado: aceptado
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
---

# ADR-009: Arquitectura Multi-Tenancy mediante Discriminador de Tenant y Row-Level Security en Base de Datos Compartida

## 1. Estado
`aceptado`

---

## 2. Contexto y Fuerzas en Juego
La plataforma **GUACHAFIT** es una solución SaaS B2B2C donde múltiples entrenadores independientes y boxes operan en la misma infraestructura.

### Fuerzas en Conflicto
1. **Aislamiento Absoluto de Datos vs. Costo de Infraestructura:** Cada entrenador es un competidor directo en el mercado del fitness; la filtración o exposición accidental de alumnos, rutinas o finanzas de un coach hacia otro constituiría un fallo crítico de negocio y de cumplimiento de privacidad.
2. **Complejidad de Mantenimiento y Migraciones:** Para un producto en etapa MVP / crecimiento inicial, mantener decenas o cientos de bases de datos o esquemas aislados aumenta los costos en la nube y hace que las migraciones de esquema (*DDL migrations*) sean complejas y propensas a fallos.
3. **Velocidad de Consultas Agregadas para el Superadmin:** La administración central requiere métricas agregadas globales de la plataforma sin tener que iterar entre cientos de conexiones de bases de datos.

### Opciones Evaluadas
- **Opción A (Base de Datos Aislada por Entrenador - Database per Tenant):**
  - *Descartada:* Costo mensual excesivo para un MVP; sobrecarga insostenible en el pool de conexiones.
- **Opción B (Esquema Aislado por Entrenador - Schema per Tenant):**
  - *Descartada:* Mayor complejidad en herramientas de migración (Drizzle / Prisma) y límites de catálogo en PostgreSQL.
- **Opción C (Base de Datos Compartida con Discriminador Tenant `entrenador_id` + Row-Level Security):**
  - Todas las tablas del dominio deportivo y financiero incluyen una columna `entrenador_id UUID NOT NULL`.
  - La seguridad se garantiza en dos capas:
    1. A nivel de aplicación mediante Repositorios con filtro forzado.
    2. A nivel de motor de base de datos mediante políticas nativas de **Row-Level Security (RLS)** de PostgreSQL.

---

## 3. Decisión
Adoptamos la **Opción C**.

```
[Cliente Web / Móvil]
       │
       ▼ (Bearer JWT con claims: { sub, role, entrenador_id })
[Backend NestJS API Middleware]
       │
       ├── Valida JWT y extrae `entrenador_id`
       │
       ▼ (Abre conexión con transacción de BD)
[PostgreSQL Session Execution]
       │
       ├── Ejecuta: SET LOCAL app.current_entrenador_id = 'c128-4f8a-...';
       │
       ▼ (Motor de Base de Datos PostgreSQL)
[Políticas RLS en Tablas]
       └── CREATE POLICY tenant_isolation ON alumnos
           USING (entrenador_id = NULLIF(current_setting('app.current_entrenador_id', true), '')::uuid);
```

### Reglas Técnicas
1. **Defensa en Profundidad:** Incluso si un desarrollador olvida colocar el `WHERE entrenador_id = ...` en una consulta de TypeORM/Drizzle, el motor PostgreSQL descarta automáticamente cualquier fila que no pertenezca al tenant de la sesión activa.
2. **Rol de Superadmin (Bypass Controlado):** El Superadmin utiliza un contexto especial (`app.is_superadmin = 'true'`) que le permite auditar el sistema completo sin violar las políticas estándar.

---

## 4. Consecuencias y Trade-offs

### Consecuencias Positivas (Beneficios)
- **Máxima Eficiencia de Costos:** Una única instancia gestionada de PostgreSQL (ej. Supabase / Neon / RDS) puede soportar miles de entrenadores y decenas de miles de alumnos con costo mínimo.
- **Migraciones Instantáneas:** Un solo comando de migración (`drizzle-kit push / migrate`) actualiza toda la plataforma atómicamente.
- **Garantía Criptográfica y de Motor:** El aislamiento de datos está garantizado por el kernel de PostgreSQL y no por disciplina manual del programador.

### Consecuencias Negativas (Trade-offs)
- Requiere configurar correctamente la variable de contexto de sesión (`SET LOCAL`) en cada transacción o consulta proveniente del backend.

---

## 5. Trazabilidad y Referencias
- Resuelve la problemática: [[PROB-003-acceso-onboarding-dashboard-central]]
- Requerimientos asociados:
  - [[RF-010-rbac-jerarquia-aislamiento-tenancy]]
  - [[RF-011-onboarding-alumnos-manual-deeplink]]
  - [[RF-012-ciclo-vida-alumno-soft-delete]]
  - [[RF-013-dashboard-comando-entrenador-kpis]]
  - [[RNF-003-aislamiento-multitenant-seguridad-datos-salud]]
- Entidades vinculadas: [[Entidad-Usuario]], [[Entidad-PerfilAlumno]], [[Entidad-PerfilEntrenador]]
