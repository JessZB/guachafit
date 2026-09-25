---
id: ADR-016
titulo: "ADR-016: Cascada de Acceso del Entrenador a sus Alumnos — Derivada en Runtime en la Autenticación"
fecha: 2026-09-24
estado: aceptado
decisores:
  - "Tech Lead"
  - "Principal Architect"
tags:
  - decision
  - adr
  - arquitectura
  - rbac
  - tenancy
  - autenticacion
---

# ADR-016: Cascada de Acceso del Entrenador a sus Alumnos — Derivada en Runtime en la Autenticación

## 1. Estado
`aceptado`

---

## 2. Contexto y Fuerzas en Juego
[[RF-010-rbac-jerarquia-aislamiento-tenancy]] §6 exige que, al deshabilitar la cuenta de un entrenador, los tokens activos de sus alumnos asociados se invaliden "en el siguiente ciclo de verificación". La implementación del WU Admin (2026-09-23) cubrió la invalidación del lado del entrenador (login, refresh y `GET /auth/me` re-verifican cuenta y licencia), pero dejó la cascada hacia los alumnos como **pendiente explícito** en §7: un alumno del coach deshabilitado conservaba su acceso hasta que su propio token rotara. Además, los copys de confirmación del panel maestro comunicaban que el cambio no afectaba a los alumnos, mientras §6 exigía lo contrario; y [[RF-011-onboarding-alumnos-manual-deeplink]] (RN-06/RN-07) ya bloqueaba la resolución del `coach_code` con licencia suspendida, pero no con la cuenta deshabilitada.

- **Problema a resolver:** decidir cómo (y en qué punto) se propaga a los alumnos la pérdida de operabilidad de su entrenador —cuenta deshabilitada o licencia suspendida— sin añadir una verificación del estado del coach en cada petición de cada alumno.
- **Fuerzas en conflicto:**
  1. **Requisito vs. costo por petición:** §6 exige invalidar el acceso de los alumnos; hacerlo en el guard implicaría una lectura a BD por cada petición de cada alumno.
  2. **Inmediatez vs. token stateless:** el access token es un JWT sin consulta a BD en el guard; cualquier corte de sesión queda acotado por su TTL de ~15 min.
  3. **Simplicidad vs. consistencia de estados:** materializar el bloqueo sobre cada alumno exigiría migración y hacer convivir un estado nuevo con el estado propio del alumno (pausado, suspendido por pago, archivado).
  4. **Transparencia vs. filtrado de información:** el alumno no debe poder distinguir si falló la cuenta o la licencia de su coach.
- **Opciones consideradas:**
  1. *Opción A (derivada en runtime en autenticación):* en cada emisor/ciclo de sesión del alumno (login, `GET /auth/me`, refresh y canje de credenciales) se verifica que su coach esté operable (`usuarios.activo` Y `estado_licencia = 'activa'`); sin migración y con desbloqueo inmediato al reactivar.
     - *Seleccionada.*
  2. *Opción B (guard por petición):* verificar la operabilidad del coach en cada request autenticado del alumno.
     - *Rechazada:* agrega una lectura a BD por petición; es exactamente el costo que RF-010 §7 buscaba evitar.
  3. *Opción C (materializar un estado de acceso nuevo sobre el alumno):* propagar por escritura el bloqueo/desbloqueo a cada fila de alumno.
     - *Rechazada:* exige migración, ripple por el enum de estados del alumno y pierde/confunde el estado previo del alumno.
  4. *Opción D (no implementar):* mantener §6 sin cascada.
     - *Descartada por el usuario:* el requisito queda sin cubrir y el panel comunicaría un efecto falso.

---

## 3. Decisión
Elegimos la **Opción A**: la cascada se **deriva en runtime durante la autenticación**, no se materializa en la base de datos ni se evalúa en el guard. Un alumno solo obtiene o renueva sesión si su entrenador está operable; al reactivar cuenta o licencia, el desbloqueo es inmediato en el siguiente ciclo de sesión, sin migración y sin tocar los datos del alumno.

### Detalles de la Implementación
1. **Coach operable:** `verificarEntrenadorOperable` (`auth.service.ts`) lee `usuarios.activo` + `perfiles_entrenador.estado_licencia` y exige `activo = true` y licencia `activa`; la ausencia de fila de perfil equivale a no operable.
2. **Cuatro emisores/ciclos de sesión del alumno:** login, `GET /auth/me` (`obtenerSesion`), `POST /auth/refresh` y canje de credenciales (`POST /auth/invitacion/establecer-password`). En el canje la verificación corre antes de escribir: si bloquea, el token de invitación no se consume.
3. **Mensaje único:** *"Tu entrenador no está disponible en este momento. Inténtalo de nuevo más tarde."* (401), idéntico para cuenta deshabilitada y licencia suspendida: no revela cuál de los dos interruptores falló.
4. **Frontera pública:** la resolución del `coach_code` y el registro público ([[RF-011-onboarding-alumnos-manual-deeplink]], RN-07) exigen coach operable y responden el mismo 404 uniforme que un código inexistente.
5. **Guards intactos:** el `JwtAuthGuard` no cambia; no hay verificación por petición.
6. **Filas legacy sin coach:** un perfil de alumno sin `entrenador_id` queda exento del chequeo (hoy 0 filas); no se inventa un coach para bloquearlas ni se altera su comportamiento.
7. **UI honesta:** los copys de confirmación de `/admin` declaran el efecto real sobre los alumnos (antes decían que no se veían afectados).

---

## 4. Consecuencias y Trade-offs

### Consecuencias Positivas (Beneficios)
- **C1:** Sin migración ni cambio de esquema: la cascada se apoya en columnas existentes y se despliega con el código.
- **C2:** Desbloqueo inmediato: al reactivar la cuenta o la licencia, el alumno vuelve a entrar en su siguiente login/refresh, sin procesos de reconciliación.
- **C3:** Cobertura uniforme en la API: los cuatro caminos que emiten o renuevan la sesión del alumno comparten el mismo helper y el mismo mensaje.

### Consecuencias Negativas (Costos y Trade-offs)
- **T1:** Un access token ya emitido sigue vigente hasta ~15 min en endpoints que no pasan por login/me/refresh/canje (límite inherente al JWT stateless).
- **T2:** Los alumnos con perfil legacy sin coach quedan exentos del chequeo (hoy 0 filas; se documenta en vez de fabricar un bloqueo).
- **T3:** El canje está cubierto por tests unitarios, no por un E2E con token real de invitación.

### Riesgos Mitigados y Residuales
- **Riesgo Mitigado:** un alumno de coach deshabilitado o con licencia suspendida no puede iniciar sesión, refrescar tokens ni canjear credenciales; la frontera pública de captación queda cerrada.
- **Riesgo Residual:** ventana de hasta ~15 min para sesiones ya emitidas hasta el próximo ciclo de verificación.

---

## 5. Trazabilidad y Referencias
- Requerimientos asociados: [[RF-010-rbac-jerarquia-aislamiento-tenancy]] (§6 y §7), [[RF-011-onboarding-alumnos-manual-deeplink]] (RN-06/RN-07, §6).
- Decisiones relacionadas: [[ADR-011-aislamiento-multitenant-rls-progresivo-withtenant]] (la operabilidad del coach es una frontera de tenancy previa a RLS).
- Implementación: `apps/api/src/modules/auth/auth.service.ts` (`verificarEntrenadorOperable`, `login`, `obtenerSesion`, `refresh`, `establecerPasswordConToken`), `apps/api/src/modules/alumnos/alumnos.service.ts` (`resolverCoachPublico`, `registroPublico`), `apps/web/src/pages/admin/AdminPage.tsx` (copys de confirmación).
- Evidencia de verificación (2026-09-24): suite API **832 passed / 1 skipped**, web **624**, typechecks OK; E2E real contra Postgres con cuenta `activo=false` y licencia `suspendida_superadmin` (el alumno recibe 401 con el mensaje exacto en login/me/refresh; el link público responde 404; el coach recibe su propio 401), restauración verificada por SELECT; validación independiente PASA CON SALVEDADES.
