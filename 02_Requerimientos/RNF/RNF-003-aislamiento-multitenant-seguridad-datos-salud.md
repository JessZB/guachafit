---
id: RNF-003
modulo: Seguridad
categoria: seguridad-privacidad # seguridad-privacidad | rendimiento | arquitectura
prioridad: alta
estado: parcial
fecha_verificacion: 2026-09-20
requisito_origen: "[[RF-010-rbac-jerarquia-aislamiento-tenancy]]"
metrica_objetivo: "0% fugas entre tenants (RLS estricto) / Dashboard p95 < 200ms"
fecha_creacion: 2026-09-06
tags:
  - requerimiento
  - rnf
  - sdd
  - seguridad
  - multi-tenant
  - privacidad
---

# RNF-003: Aislamiento Multi-Tenant, Cifrado de Datos de Salud y Rendimiento del Dashboard

## 1. Definición y Alcance
Establece los requerimientos de seguridad, privacidad y rendimiento asociados a la arquitectura multi-inquilino, la protección de notas médicas de alumnos y el tiempo de respuesta del panel principal del entrenador.

- **Atributos de calidad:** Aislamiento de Datos, Confidencialidad Médica, Seguridad de Sesión y Latencia.
- **Componentes afectados:** Base de Datos (PostgreSQL RLS), Servicio de Autenticación (JWT/Tokens), Backend API.

---

## 2. Métricas Cuantitativas y SLOs / SLAs

| Métrica | Valor Mínimo Aceptable | Valor Deseado (SLO) | Condición de Medición |
| :--- | :--- | :--- | :--- |
| **Tiempo de Carga del Dashboard (p95)**| < 400 ms | < 200 ms | Consulta agregada de KPIs y listas |
| **Aislamiento Multi-Tenant** | 100% estricto | Cero riesgo de fuga | Verificación mediante Row-Level Security |
| **TTL de Tokens de Invitación** | $\le 48$ horas | 24 horas | Token de un solo uso (*single-use*) |
| **Cifrado de Ficha de Salud en Reposo**| AES-256 | AES-256-GCM | Campo sensible en base de datos |

---

## 3. Aislamiento Lógico Multi-Tenant (Row-Level Security)
- **Defensa en Profundidad:** El aislamiento de datos no debe depender únicamente de filtros `WHERE entrenador_id = ?` en el código de aplicación.
- **Políticas RLS en PostgreSQL:** Las tablas `alumnos` (`perfiles_alumno`), `planes` (`planes_membresia`), `cuotas` (`cuotas_membresia`), `transacciones` (`transacciones_pago`), `rutinas` y `plantillas_rutina` (banco de plantillas del coach, RF-017) cuentan con políticas de **Row-Level Security (RLS)**, ligadas al contexto de sesión de base de datos: `entrenador_id` (`app.current_entrenador_id`), acceso "self" del alumno/cliente (`app.current_usuario_id`) y bypass explícito de SuperAdmin (`app.is_superadmin`). El contexto se aplica con `set_config(..., is_local => true)` dentro de la transacción a través de `withTenant` (`packages/database/src/client.ts`), equivalente transaccional de `SET LOCAL`.

### 3.1. Estado de Implementación por Etapas (2026-09-20)
**RNF-003 entregado por etapas:** RLS operativo en `rutinas` (WU7, migración `0004`) y `plantillas_rutina` (WU11, migración `0005`) — políticas + `ENABLE ROW LEVEL SECURITY` + consultas envueltas en `withTenant`; las 4 tablas restantes (`perfiles_alumno`, `planes_membresia`, `cuotas_membresia`, `transacciones_pago`) quedan preparadas (políticas creadas, `ENABLE` pendiente) a la espera de envolver el 100% de sus caminos.

**Hallazgo empírico (verificación real WU7/WU11):** `FORCE ROW LEVEL SECURITY` NO protege contra superusers ni roles con `BYPASSRLS` (PostgreSQL los exime siempre). La protección real exige que la aplicación se conecte con un rol **no-dueño, `NOSUPERUSER NOBYPASSRLS`** (p. ej. `guachafit_app`); ver apéndice de [[ADR-011-aislamiento-multitenant-rls-progresivo-withtenant]].

| Tabla | Políticas creadas | `ENABLE RLS` | Caminos de tenant envueltos en `withTenant` |
| :--- | :---: | :---: | :--- |
| `rutinas` | ✅ | ✅ (etapa 1, WU7) | 100% |
| `plantillas_rutina` | ✅ | ✅ (etapa 1, WU11) | 100% |
| `perfiles_alumno` | ✅ | ⏳ pendiente | parcial |
| `planes_membresia` | ✅ | ⏳ pendiente | parcial |
| `cuotas_membresia` | ✅ | ⏳ pendiente | parcial |
| `transacciones_pago` | ✅ | ⏳ pendiente | parcial |

> **Verificación real ejecutada (etapa 1):** contra PostgreSQL 16 con rol no-dueño `guachafit_rls_test` (`NOSUPERUSER NOBYPASSRLS`): con GUC de A solo se ven las filas de A; sin GUC, 0 filas (`deny-by-default`); `app.is_superadmin=true` ve todo; INSERT cross-tenant bloqueado por `WITH CHECK`; UPDATE/DELETE cross-tenant afectan 0 filas. Los tests unitarios (`rnf003-rls-multitenant.spec.ts`) cubren mecanismo y contrato. Falta ejecutar la batería equivalente antes de habilitar cada etapa restante.

---

## 4. Confidencialidad y Protección de Datos de Salud
- La ficha médica y notas de salud (`lesiones`, `cirugias`, `patologias`) constituyen datos de categoría especial (sensibles bajo GDPR y estándares de protección biomédica).
- **Control de Acceso Estricto:** La columna de notas de salud solo se expone en endpoints autorizados para el rol `ENTRENADOR` y jamás debe serializarse en los DTOs de respuesta destinados al frontend del alumno.
- **Higiene de logout en dispositivos compartidos (WU22):** al cerrar sesión se eliminan los datos locales del usuario en IndexedDB/offline (cola outbox, rutina cacheada, check-ins de nutrición y catálogo de ejercicios) y las cachés runtime del Service Worker que contienen respuestas de API autenticadas (`api-cache`, `workbox-runtime-*`), conservando únicamente el precache del app shell (assets estáticos, sin datos de usuario). Las mutaciones pendientes de sincronizar se descartan a propósito, con rastro en consola: la privacidad en un dispositivo compartido prevalece sobre la pérdida de una mutación local (`clearOfflineData`/`limpiarCachesRuntime`, best-effort: un fallo de limpieza nunca rompe el logout).

---

## 5. Seguridad en Invitaciones y Tokens de Contraseña
- Los enlaces de entrega de credenciales disparados por el correo de bienvenida contienen un token criptográfico seguro generado con `crypto.randomBytes(32)`.
- El token se almacena en base de datos en formato **hash SHA-256** (nunca en texto plano).
- Al ser consumido una vez para establecer la contraseña, el token se invalida permanentemente.

---

## 6. Estrategia de Pruebas y Auditoría
- **Pruebas de Penetración de Tenancy:** Tests automatizados que intentan acceder con el token del Entrenador A a recursos del Entrenador B, validando que el 100% de las peticiones fallen con `403 Forbidden` o `404 Not Found`.
- **Verificación contra PostgreSQL real (etapa 1 ejecutada; etapas restantes pendientes):** la suite (`rnf003-rls-multitenant.spec.ts`) prueba mecanismo/contrato con mocks y la etapa 1 se verificó contra PostgreSQL con un rol no-dueño `NOSUPERUSER NOBYPASSRLS` (deny-by-default sin GUC, aislamiento por GUC, bypass superadmin explícito y bloqueo de escritura cross-tenant). Antes de activar el `ENABLE` de cada etapa restante debe repetirse esa batería con rol no-dueño; `FORCE ROW LEVEL SECURITY` no sustituye al rol no-dueño porque los superusers y roles `BYPASSRLS` la ignoran.
- **Pruebas de Carga en Dashboard:** Simulación de 50 entrenadores consultando concurrentemente sus KPIs matutinos para asegurar tiempos de respuesta $< 200$ ms mediante índices adecuados en `cuotas(entrenador_id, estado)` y `alumnos(entrenador_id, estado)`.
