---
id: RNF-003
modulo: Seguridad
categoria: seguridad-privacidad # seguridad-privacidad | rendimiento | arquitectura
prioridad: alta
estado: implementado
fecha_verificacion: 2026-10-05
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
- **Políticas RLS en PostgreSQL:** Las tablas `alumnos` (`perfiles_alumno`), `planes` (`planes_membresia`), `cuotas` (`cuotas_membresia`), `transacciones` (`transacciones_pago`), `rutinas` y `plantillas_rutina` (banco de plantillas del coach, RF-017) cuentan con políticas de **Row-Level Security (RLS)**, ligadas al contexto de sesión de base de datos: `entrenador_id` (`app.current_entrenador_id`), acceso "self" del alumno/cliente (`app.current_usuario_id`) y bypass explícito de SuperAdmin (`app.is_superadmin`). El contexto se aplica con `set_config(..., is_local => true)` dentro de la transacción a través de `withTenant` (`packages/database/src/client.ts`), equivalente transaccional de `SET LOCAL`. Las seis tablas cuentan con `ENABLE ROW LEVEL SECURITY` activo y verificado con rol no-dueño (§3.1).

### 3.1. Estado de Implementación — FINAL (2026-09-23)
**RNF-003 implementado:** las **6 tablas** tienen `ENABLE ROW LEVEL SECURITY` activo, el 100% de sus accesos de tenant corre dentro de `withTenant` (o su transacción propia equivalente con `set_config`, documentada), y las tres etapas quedaron verificadas contra PostgreSQL real con rol no-dueño (`NOSUPERUSER NOBYPASSRLS`).
- **Etapa 1 (completa):** RLS operativo en `rutinas` (WU7, migración `0004`) y `plantillas_rutina` (WU11, migración `0005`) — políticas + `ENABLE ROW LEVEL SECURITY` + 100% de consultas envueltas en `withTenant`. Verificada con el rol no-dueño `guachafit_rls_test`.
- **Etapa 2 — finanzas (completa, commit `feat(rls): etapa 2 finanzas`):** `planes_membresia`, `cuotas_membresia` y `transacciones_pago` con `ENABLE ROW LEVEL SECURITY` (migración `0012_rls_finanzas.sql`, aditiva sobre `0004`) y políticas self completadas para los caminos reales del alumno (self-select del plan de su cuota, self-update de la cuota al reportar pago y self-insert de la transacción); el 100% de los accesos corre en `withTenant` (coach `{entrenadorId}`, alumno self `{usuarioId}` y rutas de sistema `{isSuperadmin:true}`), y `cobroDirecto`/`conciliar` usan su transacción propia con `set_config` equivalente (documentado). Verificada E2E con el rol no-dueño `guachafit_app` (aislamiento cross-tenant, flujos de pago completos y bypass de sistema, 30/30) + batería psql independiente. Rollback documentado en la migración.
- **Etapa 3 — `perfiles_alumno` (completa, migración `0013_rls_perfiles_alumno.sql`):** `ENABLE ROW LEVEL SECURITY` (aditiva sobre `0004`, que ya traía las políticas tenant + self-select) más la política nueva `rls_perfiles_alumno_self_update`, necesaria porque `finalizarSesion` persiste la racha (`racha_dias`/`racha_ultima_fecha`, RF-001 RN-02) con contexto self; sin ella el UPDATE habría afectado 0 filas en silencio. Los **72 accesos** a la tabla en **13 archivos** + seed quedaron envueltos/actor-aware (coach `{entrenadorId}`, alumno `{usuarioId}`, sistema `{isSuperadmin:true}`). Verificada **E2E 52/52** con el rol no-dueño `guachafit_app` (login vigilado, cero errores RLS en logs) + batería psql independiente + validación independiente de solo lectura (hash de la migración en `__drizzle_migrations`, `relrowsecurity=t` en las 6 tablas, cobertura 72/72). Rollback documentado en la migración.
  - **Hardening asociado:** `resolveClienteUsuarioId` exige ahora el `tx` obligatorio (sus 4 llamadores lo pasan), de modo que un futuro llamador no pueda leer 0 filas en silencio; `obtenerTasaVigente` recibe `tx`/contexto del actor y ya no lee `perfiles_alumno` por el pool raíz dentro de una transacción.
  - **Cambio de comportamiento:** `restaurar` cross-tenant ahora responde **404** (la fila ajena no es visible bajo RLS), en lugar de 403: no filtra existencia.

**D2 (deuda operativa — rol de conexión):** el `.env` de dev sigue conectando con el rol dueño (`postgres`), que ignora RLS; el enforcement real exige apuntar `DATABASE_URL` a `guachafit_app` (o un rol equivalente `NOSUPERUSER NOBYPASSRLS`). El rol `guachafit_app` existe como infraestructura de dev y fue el rol de las verificaciones E2E de las etapas 2 y 3 (en la etapa 3 se ejecutó con override de proceso de `DATABASE_URL`); el cambio del entorno normal queda pendiente. Mientras D2 siga abierta, el blindaje no está activo en dev aunque las 6 tablas tengan RLS habilitado.

**Nota sobre las políticas self:** acotan **fila**, no columnas ni montos (la cuota self-update solo garantiza que la fila sea del propio alumno; la máquina de estados y los montos los valida la aplicación). Restringir columnas/montos desde la política queda como defensa en profundidad futura.

**Hallazgo empírico (verificación real WU7/WU11):** `FORCE ROW LEVEL SECURITY` NO protege contra superusers ni roles con `BYPASSRLS` (PostgreSQL los exime siempre). La protección real exige que la aplicación se conecte con un rol **no-dueño, `NOSUPERUSER NOBYPASSRLS`** (p. ej. `guachafit_app`); ver apéndice de [[ADR-011-aislamiento-multitenant-rls-progresivo-withtenant]].

| Tabla | Políticas creadas | `ENABLE RLS` | Caminos de tenant envueltos en `withTenant` |
| :--- | :---: | :---: | :--- |
| `rutinas` | ✅ | ✅ (etapa 1, WU7) | 100% |
| `plantillas_rutina` | ✅ | ✅ (etapa 1, WU11) | 100% |
| `planes_membresia` | ✅ (+ self-select, 0012) | ✅ (etapa 2, 0012) | 100% |
| `cuotas_membresia` | ✅ (+ self-update, 0012) | ✅ (etapa 2, 0012) | 100% |
| `transacciones_pago` | ✅ (+ self-insert, 0012) | ✅ (etapa 2, 0012) | 100% |
| `perfiles_alumno` | ✅ (+ self-update, 0013) | ✅ (etapa 3, `0013`) | 100% |

> **Verificación real ejecutada (etapas 1, 2 y 3):** etapa 1 contra PostgreSQL 16 con rol no-dueño `guachafit_rls_test` (`NOSUPERUSER NOBYPASSRLS`): con GUC de A solo se ven las filas de A; sin GUC, 0 filas (`deny-by-default`); `app.is_superadmin=true` ve todo; INSERT cross-tenant bloqueado por `WITH CHECK`; UPDATE/DELETE cross-tenant afectan 0 filas. Etapa 2 verificada E2E con `guachafit_app` (30/30) + batería psql independiente. Etapa 3 verificada E2E 52/52 con `guachafit_app` (login vigilado, cero errores RLS) + batería psql independiente + validación independiente (hash de la migración `0013`, `relrowsecurity=t` en las 6 tablas, cobertura 72/72 de accesos). Los tests unitarios (`rnf003-rls-multitenant.spec.ts`) cubren mecanismo y contrato; suites en verde: **API 809 / web 612**.

- **Implementado (2026-10-04, deploy-05c `bf1360e`) — aprovisionamiento del rol de aplicación restringido (`guachafit_app`):** el SQL de referencia de [[ADR-011-aislamiento-multitenant-rls-progresivo-withtenant]] §6 ya es un script del repositorio, con verificación incluida.
  - **Mecanismo:** `packages/database/scripts/crear-rol-app.sql` crea o actualiza el rol (idempotente, en **una transacción**) forzando `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS LOGIN`; otorga CRUD en todas las tablas de `public`, `USAGE`/`SELECT` en sus secuencias, lectura de `drizzle.__drizzle_migrations` y privilegios por defecto para las tablas futuras del rol dueño. La contraseña se lee de `GUACHAFIT_APP_PASSWORD` (nunca como argumento; psql ≥ 15); el script intenta desactivar el registro de sentencias de su sesión y, si no puede, avisa de que la contraseña podría quedar en el log del servidor.
  - **Guardas:** aborta antes de tocar la base si falta o está vacía la contraseña, si quien ejecuta no puede aprovisionar (no es superusuario ni miembro del rol dueño), si `owner_role` no es el dueño real de las tablas (lista los dueños reales) o si las migraciones no están aplicadas.
  - **Verificación:** `packages/database/scripts/verificar-rol-app.sql`, ejecutado **como** el rol de aplicación (contraseña por `PGPASSWORD`), comprueba que no sea superusuario, ni `BYPASSRLS`, ni dueño de tablas, ni miembro de un dueño; CRUD en las **23 tablas** y `USAGE`/`SELECT` en las secuencias; que las **6 tablas con RLS** devuelvan 0 filas sin contexto teniendo datos; y la lectura de `drizzle.__drizzle_migrations`. Reporta las **17 tablas sin RLS** como AVISO informativo (diseño del RLS progresivo) y da `INCOMPLETO` —no un PASS engañoso— si ninguna tabla con RLS tiene señal de datos (`n_live_tup`; puede necesitar `ANALYZE` tras un reinicio). Con `app.current_entrenador_id` puesto, un coach solo ve sus propias filas.
  - **Evidencia:** API 1155 → **1157** tests aprobados (1 omitida), `tsc` en verde; scripts reejecutados de forma idempotente y guardas verificadas (contraseña faltante, dueño incorrecto y ejecutor sin privilegios) contra PostgreSQL 16 real con un rol desechable, sin tocar el `guachafit_app` local.
  - **Límites honestos:** D2 sigue pendiente (el `DATABASE_URL` de desarrollo apunta al rol dueño; es decisión del dueño del proyecto); las 17 tablas sin RLS dependen solo de los controles de autorización del API (diseño de ADR-011); una tabla futura creada por un rol distinto del dueño no recibe los GRANT por defecto; y el API solo **avisa**, sin bloquear el arranque, si su rol no puede leer `drizzle.__drizzle_migrations`.

---

## 4. Confidencialidad y Protección de Datos de Salud
- La ficha médica y notas de salud (`lesiones`, `cirugias`, `patologias`) constituyen datos de categoría especial (sensibles bajo GDPR y estándares de protección biomédica).
- **Control de Acceso Estricto:** La columna de notas de salud solo se expone en endpoints autorizados para el rol `ENTRENADOR` y jamás debe serializarse en los DTOs de respuesta destinados al frontend del alumno.
- **Higiene de logout en dispositivos compartidos (WU22):** al cerrar sesión se eliminan los datos locales del usuario en IndexedDB/offline (cola outbox, rutina cacheada, check-ins de nutrición y catálogo de ejercicios) y las cachés runtime del Service Worker que contienen respuestas de API autenticadas (`api-cache`, `workbox-runtime-*`), conservando únicamente el precache del app shell (assets estáticos, sin datos de usuario). Las mutaciones pendientes de sincronizar se descartan a propósito, con rastro en consola: la privacidad en un dispositivo compartido prevalece sobre la pérdida de una mutación local (`clearOfflineData`/`limpiarCachesRuntime`, best-effort: un fallo de limpieza nunca rompe el logout).
- **Implementado (2026-10-04, front módulos 1-2 `95d2e27`/`7f6c2a1`) — aislamiento por usuario en el dispositivo:**
  - **Cambio de usuario:** el dispositivo recuerda el último usuario (`guachafit_ultimo_usuario_id`, `apps/web/src/lib/sesion-local.ts`). Si entra **otra persona** (o no había nadie registrado), se limpian caché de consultas, IndexedDB y cachés de API del usuario anterior **antes** de guardar la sesión nueva.
  - **Cierre de sesión ordenado:** cancela las consultas en vuelo, retira los tokens y **espera** la limpieza antes de navegar a `/login`; un refresco que termina después del cierre se descarta.
  - **Sesión vencida ≠ cierre manual:** si la sesión vence (refresh rechazado), la cola offline **se conserva**; si vuelve a entrar la misma persona se envía sola, y si entra otra se limpia por la regla anterior. El cierre de sesión manual sigue descartando los pendientes (con la confirmación previa de la web).
  - **Caché runtime del Service Worker:** `NetworkFirst` con corte a 4 s y **sin rutas `/auth/`** (`apps/web/src/lib/api-cache-pattern.ts`): ninguna respuesta de autenticación queda en caché. Lectura segura de la sesión persistida: un `guachafit_user` corrupto ya no rompe el arranque.
  - Evidencia: web 701 → **771** tests.
- **Implementado (2026-10-04, LOTE API-3 `bc53864`):** los 403 de tenancy de `alumnos.service` quedan registrados en `auditoria_accesos_denegados` ([[RF-010-rbac-jerarquia-aislamiento-tenancy]] Escenario 2). Pendiente: el resto de servicios aún no audita sus rechazos de tenancy.
- **Implementado (2026-10-04, deploy-05a `1e4d5d7`) — endurecimiento de la clave de cifrado de fichas de salud:**
  - **Fail-fast:** en producción, sin `ENCRYPTION_KEY` el API no arranca; el error indica generarla con `openssl rand -hex 32` (`apps/api/src/common/config/validar-configuracion-produccion.ts`, `apps/api/src/main.ts`).
  - **Nunca más la clave de desarrollo publicada en el repositorio en silencio:** en producción se rechazan la clave de ejemplo y las claves formadas por un solo carácter repetido; una clave **presente pero mal formada** (no hexadecimal o con menos de 64 caracteres) detiene el arranque en **cualquier** entorno: `CryptoService` ya no cae a la clave conocida (`apps/api/src/common/services/crypto.service.ts`).
  - **Compatibilidad de formato:** se usan exactamente 64 caracteres hexadecimales; si el valor original tenía más de 64, se usan sus primeros 64 (compatible con los datos ya cifrados y el seed), con aviso en el log.
  - **Límite honesto — la rotación no está soportada:** cambiar la clave deja ilegibles las fichas cifradas (AES-256-GCM sin re-cifrado); el mensaje de arranque distingue un primer despliegue de uno con datos ya cifrados.
  - Evidencia: API 1087 → **1143** tests aprobados (1 omitida), `tsc` y `nest build` en verde; web **797**.
- **Implementado (2026-10-05, unidad `24609ba`) — pertenencia de las fotos de comidas y autorización de nutrición:** el API solo acepta en el reporte nutricional claves de fotos del alumno autenticado (prefijo `comidas/{alumnoId}/`, estructura válida, máximo 255 caracteres); una clave ajena responde 400 y nunca se guarda ni se firma. Nuevos tests de autorización: el superadmin recibe 403 en metas, `checkin/hoy` y `checkin-diario`, y el alumno A no lista los reportes del alumno B. Límite honesto: las filas antiguas con claves ajenas guardadas antes del cambio no se sanean. Detalle en [[RF-002-nutricion-agil-reporte-rapido]]. Evidencia: API **1192** aprobados (1 omitida), web **904**.

---

## 5. Seguridad en Invitaciones y Tokens de Contraseña
- Los enlaces de entrega de credenciales disparados por el correo de bienvenida contienen un token criptográfico seguro generado con `crypto.randomBytes(32)`.
- El token se almacena en base de datos en formato **hash SHA-256** (nunca en texto plano).
- Al ser consumido una vez para establecer la contraseña, el token se invalida permanentemente.
- **Implementado (2026-10-04, API-4 `79ba082`):** los correos de bienvenida (alumno y entrenador) y el de recuperación de contraseña ya salen de verdad (Brevo, [[ADR-018-proveedor-correo-transaccional-brevo]]) y el **token de recuperación** sigue la misma regla: `crypto.randomBytes(32)`, solo su hash SHA-256 en `usuarios.token_recuperacion_hash` (migración `0015`), un solo uso y vigencia de 1 h. Datos sensibles fuera de Redis y de los logs:
  - El código en claro solo vive en memoria y en el job de `notificaciones-email` hasta la entrega: `removeOnComplete: true` y fallidos retenidos **24 h**; con Redis no listo el despachador no llama a `add` (el código no queda en la cola de comandos de ioredis). El `jobId` lleva una huella del código, nunca el código.
  - La **DLQ** guarda de los correos de cuenta solo tipo, usuario y destinatario enmascarado, **sin enlace ni correo completo**.
  - **Correos enmascarados en logs** (`a***@dominio`, `apps/api/src/common/enmascarar-correo.util.ts`): worker, despachador, recuperación y límite de intentos; el detalle de error de Brevo se recorta y se le quitan los correos.
  - Límites honestos: un `add` ya enviado a ioredis antes de una caída no se puede retirar; si Redis vuelve, el correo (con el enlace) sale tarde. El **adaptador simulado** (sin `BREVO_API_KEY`, desarrollo) escribe el destinatario **completo** en su línea `[Correo simulado]` (sin el enlace); el enmascarado aplica al worker, al despachador y a los demás logs.

---

## 6. Estrategia de Pruebas y Auditoría
- **Pruebas de Penetración de Tenancy:** Tests automatizados que intentan acceder con el token del Entrenador A a recursos del Entrenador B, validando que el 100% de las peticiones fallen con `403 Forbidden` o `404 Not Found`.
- **Verificación contra PostgreSQL real (etapas 1, 2 y 3 ejecutadas):** la suite (`rnf003-rls-multitenant.spec.ts`) prueba mecanismo/contrato con mocks; la etapa 1 se verificó contra PostgreSQL con el rol no-dueño `guachafit_rls_test` y las etapas 2 y 3 con `guachafit_app` (E2E 30/30 y 52/52 respectivamente + baterías psql independientes y validación independiente) — deny-by-default sin GUC, aislamiento por GUC, bypass superadmin explícito y bloqueo de escritura cross-tenant; suites en verde (API 809 / web 612). Cualquier cambio futuro de políticas o de superficies de acceso debe repetir la batería con rol no-dueño antes de desplegar; `FORCE ROW LEVEL SECURITY` no sustituye al rol no-dueño porque los superusers y roles `BYPASSRLS` la ignoran. El enforcement en el entorno normal queda condicionado a D2 (rol de conexión, ver §3.1).
- **Pruebas de Carga en Dashboard:** Simulación de 50 entrenadores consultando concurrentemente sus KPIs matutinos para asegurar tiempos de respuesta $< 200$ ms mediante índices adecuados en `cuotas(entrenador_id, estado)` y `alumnos(entrenador_id, estado)`.
