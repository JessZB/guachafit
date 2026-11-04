---
id: RF-010
modulo: Acceso
prioridad: alta
estado: parcial
version_implementada: v1.0.0
fecha_verificacion: 2026-10-04
problema_origen: "[[PROB-003-acceso-onboarding-dashboard-central]]"
fecha_creacion: 2026-09-06
version: 1.0
tags:
  - requerimiento
  - rf
  - sdd
  - rbac
  - seguridad
  - multi-tenant
---

# RF-010: Arquitectura de Roles Jerárquicos (RBAC) y Aislamiento de Tenancy

## 1. Contexto y Justificación
Establece la jerarquía de control de acceso basada en roles (RBAC) y el aislamiento lógico multi-inquilino (*tenant isolation*) entre entrenadores. Garantiza que la administración de la plataforma esté centralizada a nivel de licencias maestras, mientras que cada coach opera en un entorno privado, seguro e impenetrable por terceros.

- **Objetivo:** Definir los permisos y fronteras de visibilidad para los roles `Superadmin`, `Entrenador` y `Alumno`.
- **Valor aportado:** Confidencialidad legal, protección de la propiedad intelectual de las rutinas de cada coach y blindaje de la privacidad de los alumnos.
- **Trazabilidad:** Resuelve el riesgo de fuga y mezcla de datos identificado en [[PROB-003-acceso-onboarding-dashboard-central]].

---

## 2. Actores Involucrados
- **Superadmin:** Administrador maestro de la plataforma GUACHAFIT.
- **Entrenador (Tenant Owner):** Administrador de su gimnasio, box o asesoría independiente.
- **Alumno / Cliente (End User):** Usuario final que consume el servicio.

---

## 3. Precondiciones
1. Toda petición autenticada debe portar un token de sesión (JWT) que certifique: `user_id`, `role` y `entrenador_id` (en caso de alumnos y entrenadores).

---

## 4. Reglas de Negocio (Business Rules)
- **RN-01 (Matriz de Control de Acceso por Rol):**

| Funcionalidad / Recurso | Superadmin | Entrenador | Alumno |
| :--- | :---: | :---: | :---: |
| Crear / Deshabilitar Entrenadores | ✅ | ❌ | ❌ |
| Gestionar Licencias y Configuración Global | ✅ | ❌ | ❌ |
| Ver Dashboard de Negocio Propio | ❌ | ✅ | ❌ |
| Alta y Edición de Alumnos Propios | ❌ | ✅ | ❌ |
| Gestionar Rutinas y Asignar Planes | ❌ | ✅ | ❌ |
| Conciliar Pagos y Ver Cartera Propia | ❌ | ✅ | ❌ |
| Ver / Reportar Entrenamientos Propios | ❌ | ❌ | ✅ |
| Reportar Pagos y Ver Deuda Propia | ❌ | ❌ | ✅ |
| Consultar Datos de Otros Entrenadores | ❌ | ❌ | ❌ |
| Consultar Datos de Otros Alumnos | ❌ | ❌ | ❌ |

- **RN-02 (Aislamiento Estricto de Tenancy):** Ningún entrenador puede listar, buscar, modificar o consultar alumnos, métricas, cuotas, rutinas o reportes nutricionales pertenecientes a otro `entrenador_id`. Todas las consultas a la base de datos deben inyectar obligatoriamente la cláusula de discriminación por tenant.
- **RN-03 (Acceso Exclusivo del Alumno):** El alumno solo tiene acceso a lecturas y escrituras asociadas a su propio `alumno_id`. Cualquier intento de consultar datos de otro cliente retorna `403 Forbidden`.

---

## 5. Criterios de Aceptación (Given-When-Then / Gherkin)

### Escenario 1: Creación de Cuenta de Entrenador por el Superadmin
```gherkin
Given que el Superadmin se encuentra autenticado en el panel maestro
When registra un nuevo entrenador con nombre "Marcos Fitness", email "marcos@gym.com" y licencia "Plan Pro"
Then el sistema debe crear la cuenta en estado "Activo"
  And generar un código único de entrenador (ej. "coach_code: K7M2QX4P")
  And enviar un email de bienvenida a Marcos con su enlace de activación maestro
```

### Escenario 2: Intento de Acceso Cruzado entre Entrenadores (Aislamiento)
```gherkin
Given que el entrenador "Coach A" intenta consultar vía API la lista de clientes o ingresos del "Coach B"
When el backend procesa el token de autorización de Coach A
Then el middleware de tenancy debe interceptar la solicitud
  And rechazar la operación con código HTTP 403 Forbidden
  And registrar un evento de intento de violación de aislamiento en los logs de seguridad
```

### Escenario 3: Alumno Consulta su Perfil sin Permisos Administrativos
```gherkin
Given que el alumno "Carlos Ruiz" inicia sesión en la aplicación
When navega por la interfaz
Then solo debe poder visualizar sus rutinas asignadas, sus medidas y sus cuotas pendientes
  And no debe tener acceso a ninguna pantalla de conciliación bancaria ni datos de otros alumnos
```

---

## 6. Casos Borde y Excepciones
- **Desactivación de Cuenta de Entrenador:** Si el Superadmin deshabilita a un entrenador (por cese de suscripción de la plataforma), todos los tokens activos de dicho entrenador y de sus alumnos asociados son invalidados en el siguiente ciclo de verificación.

---

## 7. Estado real de implementación

- RBAC base y aislamiento de tenancy de alumnos implementados con tests reales.
- Resuelto (2026-09-21): bypass total del SUPERADMIN eliminado. El guard aplica la matriz RN-01 sin jerarquía implícita (el negocio del coach/alumno le responde 403) y el front aterriza por rol: el superadmin solo accede a `/admin` (`apps/web/src/lib/rutas-rol.ts`).
- Implementado (2026-09-23, WU Admin — gestión de entrenadores):
  - Listado paginado real del panel (`GET /auth/entrenadores`, envelope `{ items, total, limit, offset }`).
  - Deshabilitar/reactivar cuentas (`PATCH /auth/entrenadores/:id/estado`, idempotente, sin auto-deshabilitación y solo sobre entrenadores) y activar/suspender licencias (`PATCH /auth/entrenadores/:id/licencia`, idempotente). El panel web (`/admin`) expone ambas acciones con confirmación accesible y feedback solo con 2xx.
  - **Invalidación de sesión (§6, ENTRENADOR) — mecanismo real:** el estado se re-verifica contra la BD en cada ciclo de sesión (login, refresh y `GET /auth/me`); no hay listas negras. Al deshabilitar la cuenta o suspender la licencia, login y refresh responden 401 con mensaje claro y `/auth/me` cierra la sesión de la web. Límite documentado y aceptado: un access token ya emitido es un JWT stateless sin consulta a BD en el guard, así que sigue siendo válido como máximo sus 15 minutos de TTL.
  - Suspender la licencia también bloquea la resolución pública del `coach_code` (RF-011 RN-07.1) y excluye al coach del resumen semanal (RF-014).
- Implementado (2026-09-24, unidad CASCADA-COACH): la cascada del §6 a los alumnos se evalúa **derivada en runtime durante la autenticación** (decisión del usuario, opción A; ver [[ADR-016-cascada-acceso-coach-alumnos-autenticacion]]), sin migración y sin verificación en cada petición:
  - Coach operable = cuenta habilitada (`usuarios.activo`) Y licencia vigente (`perfiles_entrenador.estado_licencia = 'activa'`). Se aplica en los 4 emisores/ciclos de sesión del alumno: login, `GET /auth/me`, refresh y canje de credenciales (`POST /auth/invitacion/establecer-password`; si bloquea, el token no se consume). El mensaje es único y no revela cuál de los dos interruptores falló: *"Tu entrenador no está disponible en este momento. Inténtalo de nuevo más tarde."* (401).
  - La resolución pública del `coach_code` y el registro público (RF-011) ahora exigen coach operable (mismo 404 uniforme que un código inexistente). Los guards no cambian: no hay costo por petición.
  - D17 (2026-11-04, `db2d68f`): el alta de entrenador por el superadmin ya no pide el `coach_code`: lo genera el servidor (8 caracteres aleatorios sin ambiguos) y la respuesta lo devuelve. La API aún acepta uno manual si viene en el cuerpo. El entrenador puede rotar su código y pausar su captación (RF-011 RN-08, [[ADR-026-ciclo-de-vida-enlace-captacion-coach]]).
  - Límites honestos: un access token ya emitido sigue vigente hasta ~15 min en endpoints que no pasan por login/me/refresh/canje; las filas legacy de alumno sin coach quedan exentas (hoy 0 filas); el canje está cubierto por tests unitarios, no por un E2E con token real.
  - Evidencia (2026-09-24): API 832 passed / 1 skipped y web 624; typechecks OK; E2E real contra Postgres (cuenta `activo=false` y licencia `suspendida_superadmin`: el alumno recibe 401 con el mensaje exacto en login/me/refresh, el link público responde 404 y el coach su propio 401; al restaurar, todo vuelve a 200 con restauración verificada por SELECT). Validación independiente: PASA CON SALVEDADES.
- Implementado (2026-10-04, LOTE API-1 `5bd50df` + LOTE API-2 `eeec4e0`) — endurecimiento de la autenticación:
  - **Secretos JWT fail-fast:** una única fuente (`apps/api/src/common/config/secretos-jwt.ts`); en producción el API **no arranca** si faltan o conservan el valor de ejemplo. Los tests ya no copian el secreto.
  - **Límite de intentos** (`@nestjs/throttler`, `apps/api/src/common/guards/limite-intentos.guard.ts`): login 5/min por **IP + correo** y 60/min por IP; refresh 60/min por IP; rutas públicas 20/min. El exceso responde **429** con *"Hiciste demasiados intentos. Espera un momento y vuelve a intentarlo."*; el rechazo queda en el log con el correo enmascarado. Sin guard global: solo las rutas marcadas quedan limitadas.
  - **`TRUST_PROXY`** (`apps/api/src/common/config/trust-proxy.ts`, desactivado por defecto): número de saltos o lista de IPs/CIDR de confianza para usar la IP real detrás de Cloudflare/Nginx; `true` se rechaza porque permitiría falsear la IP.
  - **Login sin revelar estado:** compara la contraseña (con hash ficticio si el usuario no existe) **antes** de informar el estado de la cuenta; con credenciales erróneas siempre responde *"Correo o contraseña incorrectos."*. El correo se recorta antes de validar (un correo con espacios al inicio/fin entra igual).
  - **Mensajes vigentes** (tuteo, sin jerga; detalle técnico solo en logs, `apps/api/src/common/mensajes-acceso.ts`): sesión vencida *"Tu sesión venció. Inicia sesión de nuevo."*; sin permiso *"No tienes permiso para ver esta sección."*; cuenta inactiva *"Tu cuenta está desactivada. Contacta a tu entrenador."* (sustituye a "Su cuenta se encuentra inactiva o bloqueada"); alumno de otro coach *"No tienes acceso a este alumno."* / *"Este alumno no está en tu lista."*. Datos inválidos responden **400** con el campo traducido y un error inesperado **500** con *"Tuvimos un problema. Inténtalo de nuevo en unos minutos. (Ref. xxxxxxxx)"*, cuya referencia corta queda en el log con método y ruta.
- Implementado (2026-10-04, front módulos 1-2 `95d2e27`/`ea18172`) — sesión renovable en la web:
  - Ante un 401 la web hace **un único refresco compartido** (`POST /auth/refresh`) y reintenta una vez; si el refresh se rechaza, cierra la sesión con el aviso de sesión vencida. **Sin red no se cierra la sesión** (modo offline). Los tokens de un refresco que termina después de cerrar sesión se descartan (`apps/web/src/lib/api-client.ts`).
  - La sesión se valida con **`GET /auth/me`** al montar la app y al volver a primer plano (solo con red y fuera del modo demo) (`apps/web/src/context/auth-context.tsx`).
  - Mensajes técnicos del servidor traducidos a textos claros (`apps/web/src/lib/mensajes-error.ts`); login que redirige si ya hay sesión, **demo solo en desarrollo**, botón para mostrar la contraseña y errores anunciados al lector de pantalla.
- Implementado (2026-10-04, LOTE API-3 `bc53864`) — **Escenario 2 (auditoría de acceso cruzado):** los 403 de tenancy de `alumnos.service` (un coach que pide un alumno de otro coach) se registran en `auditoria_accesos_denegados` (mismo servicio best-effort que ya usaban los guards; un fallo de auditoría nunca cambia el 403). El test de tenancy que definía su propia `assertTenantMatch` (tautológico) se reemplazó por uno que ejercita el servicio real y comprueba 403 + auditoría (`apps/api/test/bdd/rf010-rbac-tenancy.spec.ts`).
- Límites honestos / pendientes (2026-10-04):
  - El **almacén del throttler es en memoria** (por proceso): con varias instancias del API cada una cuenta por separado; pasar a Redis cuando se escale.
  - La auditoría de acceso cruzado cubre los guards y `alumnos.service`; **otros servicios** (finanzas, antropometría, nutrición, entrenamiento) aún no auditan sus 403/404 de tenancy.
  - Resuelto (2026-10-04): Escenario 1, el **correo de bienvenida** al entrenador, y la recuperación de contraseña ya están implementados (API-4, bloque siguiente).
  - Algunos tests HTTP son **intermitentes bajo carga** (la máquina ocupada); no indican fallo funcional pero restan confianza a la evidencia.
  - Evidencia: API 852 → **867** tras API-1, **916** tras API-2 y **986** tras API-3; web **771** tras los módulos 1-2 del front (777 tras API-2, 785 tras API-3).
- Implementado (2026-10-04, API-4 `79ba082`) — **Escenario 1 (correo de bienvenida del entrenador)** y **recuperación de contraseña**:
  - **Bienvenida del entrenador:** `crearEntrenador` (superadmin) publica `correo-cuenta.bienvenida-entrenador` con el enlace de activación (`/activar`, 48 h, un solo uso); mismo mecanismo que la bienvenida del alumno ([[RF-011-onboarding-alumnos-manual-deeplink]] §7): evento → despachador → cola `notificaciones-email` (BullMQ) → worker con adaptador Brevo ([[ADR-018-proveedor-correo-transaccional-brevo]]). La respuesta incluye `correoEnviado` y solo afirma el envío si el correo quedó en camino (encolado + proveedor real configurado); el panel `/admin` muestra el enlace copiable como respaldo.
  - **Recuperación (`POST /auth/recuperar-password`, `POST /auth/restablecer-password`; web `/recuperar` y `/restablecer`, enlace "¿Olvidaste tu contraseña?" en el login):**
    - **Sin enumeración:** responde siempre 200 con *"Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña."*, ni por contenido ni por tiempo: todo el trabajo que depende de la cuenta (búsqueda, reglas de acceso, generación del código, encolado) corre **en segundo plano** y la respuesta no lo espera. Las cuentas sin acceso (desactivada, bloqueada, licencia suspendida, alumno archivado o con coach no operable) no reciben enlace, con la misma respuesta.
    - **Enlace de un solo uso, 1 h:** código aleatorio del que se guarda **solo el hash SHA-256** (`usuarios.token_recuperacion_hash` + `token_recuperacion_expira`); el canje lo consume en el mismo UPDATE condicionado al hash (dos canjes simultáneos no lo usan dos veces), aplica la política de contraseña de la activación, anula una invitación pendiente y no emite sesión (la web lleva al login con aviso). Enlace inexistente, vencido o usado → 404 *"Este enlace ya no sirve: venció o ya se usó. Pide uno nuevo."*.
    - **No se rota un enlace reciente:** si el enlace vigente se emitió hace < 15 min, no se genera otro ni se envía otro correo (un tercero no puede anular el enlace de otra persona pidiendo uno nuevo).
    - **Límites de intentos:** 20/min por IP, 3 cada 15 min por IP + correo y **3/h solo por correo** (independiente de la IP, contra quien rote IPs para saturar un buzón); el restablecer usa el límite público (20/min por IP).
    - **Revocación de sesiones previas:** el canje marca `usuarios.password_cambiada_en`; el refresh rechaza (401 sesión vencida) los refresh tokens emitidos antes del cambio.
    - **Migración `0015_usuarios_recuperacion_password.sql`:** 3 columnas opcionales en `usuarios` (`token_recuperacion_hash`, `token_recuperacion_expira`, `password_cambiada_en`); aditiva.
  - **Límites honestos:** el **access token ya emitido** sigue válido hasta sus 15 min de TTL tras cambiar la contraseña (solo se corta la renovación); un refresh emitido en el mismo segundo del cambio sigue válido (`iat` en segundos); los errores del trabajo en segundo plano solo se registran (correo enmascarado) y la persona debe volver a pedir el enlace; si Redis está caído el correo de recuperación no sale y no hay respaldo visible (se registra como error); el throttler sigue en memoria por proceso.
  - Evidencia: API 986 → **1087** tests (1 skipped; `apps/api/test/bdd/api4-recuperacion-password.spec.ts`, `api4-correo-garantias.spec.ts`, `api4-correo-real.spec.ts`); web 785 → **797** (`apps/web/src/lib/recuperacion-password.spec.ts`).
