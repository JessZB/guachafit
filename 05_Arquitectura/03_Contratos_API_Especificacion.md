---
id: ARCH-003
titulo: "Especificación de Contratos de API REST (Endpoints, DTOs y Seguridad)"
fecha: 2026-09-06
fecha_verificacion: 2026-09-22
autor: "Tech Lead & Principal Software Architect"
estado: aprobado
modulo: Arquitectura
tags:
  - arquitectura
  - api
  - rest
  - contratos
  - dtos
  - seguridad
  - rbac
  - onboarding
  - notificaciones
  - sdd
---

# 🔌 Especificación de Contratos de API REST - GUACHAFIT

> **Objetivo del Documento:** Definir formalmente las rutas HTTP, estructuras de petición y respuesta (DTOs en TypeScript y JSON Schemas), códigos de error, políticas de autorización (RBAC jerárquico SuperAdmin $\rightarrow$ Entrenador $\rightarrow$ Alumno) y mecanismos de idempotencia para la totalidad de módulos funcionales del sistema.

---

## 🌐 1. Estándares Globales de Comunicación y Seguridad

- **URL Base:** `https://api.guachafit.com/api/v1`
- **Formato de Carga:** `application/json; charset=utf-8` (salvo subidas binarias directas a Cloudflare R2 vía `image/webp`).
- **Autenticación:** Esquema Bearer Token (`Authorization: Bearer <jwt_access_token>`). Los tokens expiran cada 15 minutos; la renovación utiliza una cookie segura `HttpOnly; Secure; SameSite=Strict` sobre `/api/v1/auth/refresh`.
- **Contexto Multi-Tenant:** El JWT incluye los claims obligatorios `{ sub, rol, entrenador_id }`. En cada conexión de base de datos se ejecuta `SET LOCAL app.current_entrenador_id = '...'` activando el aislamiento por **Row-Level Security (RLS)** (`RNF-003`, `ADR-009`).
- **Zonas Horarias y Fechas (`ADR-002`):**
  - Todo campo con fecha y hora (`*Utc`) se serializa estrictamente en formato ISO 8601 UTC terminado en `Z` (ej. `"2026-09-06T14:30:00.000Z"`).
  - Las fechas sin hora (`fechaProgramada`, `fechaNacimiento`) utilizan formato calendario `"YYYY-MM-DD"`.
- **Precisión Financiera (`RNF-002`):**
  - Montos monetarios transmitidos como cadenas con 2 decimales (ej. `"50.00"` o `"1250.50"`).
  - Tasas de cambio como cadenas con 4 decimales (ej. `"65.4321"`).
- **Encabezado de Idempotencia (`RNF-002`, `RNF-004`):**
  - Requerido para mutaciones financieras; aplicado también a las mutaciones de sesiones de entrenamiento (`entrenar-hoy`, `iniciar`, `sincronizar-series`, `finalizar`) y a los despachos de notificaciones:
    ```http
    X-Idempotency-Key: 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d
    ```
  - El servidor deduplica por operación + usuario y devuelve la respuesta original ante reintentos. **Limitación conocida:** la caché de sesiones es un `Map` en memoria sin TTL ni garantía multi-instancia (ver [[RF-001-checklist-entrenamiento-diario]] §7.3).
- **Esquema Estándar de Error (RFC 7807 Problem Details):**
  ```json
  {
    "type": "https://api.guachafit.com/errors/resource-not-found",
    "title": "Recurso no encontrado",
    "status": 404,
    "detail": "El alumno especificado no existe o no pertenece a su cartera.",
    "instance": "/api/v1/alumnos/a1b2c3d4",
    "code": "ALUMNO_NOT_FOUND",
    "timestampUtc": "2026-09-06T14:32:00.123Z"
  }
  ```

### 1.1. Convención de Paginación Server-Side (`WU24–WU26`, `ADR-013`)
Los listados del coach con crecimiento no acotado devuelven un **envelope estándar** (`PaginadoDTO<T>`) en lugar de un arreglo plano:

```json
{
  "items": [],
  "total": 137,
  "limit": 25,
  "offset": 50
}
```

- `total` es el COUNT real de filas que cumplen los filtros (nunca el tamaño de `items`): la UI puede mostrar "Mostrando X de N" y pedir la siguiente página con `offset` sin repetir ni saltar filas.
- `limit`/`offset` reflejan la página efectiva aplicada por el servidor (pueden diferir de lo solicitado si se aplicó un techo).
- **Defaults y techos por endpoint:**

| Endpoint | `limit` por defecto | Techo de `limit` | `total` |
| :--- | :---: | :---: | :--- |
| `GET /alumnos` (directorio) | 100 | 100 | COUNT del directorio filtrado; `resumen` describe la cartera completa. |
| `GET /sesiones/alumno/{alumnoId}/historial` | 30 | 100 | COUNT del historial completo del alumno. |
| `GET /entrenador/monitor-adherencia` | 25 | 100 | COUNT de la cartera filtrada; `resumen` describe la cartera completa. |
| `GET /finanzas/conciliacion/bandeja` | 25 | 100 | COUNT de la cola FIFO. |
| `GET /antropometria/pendientes` | 25 | 100 | COUNT de la cola del coach. |

- **Paginación opt-in (compatibilidad hacia atrás):** en los endpoints que alimentan charts o fichas completas, la **ausencia** de parámetros de página conserva el comportamiento histórico (serie/lista completa) y el total viaja siempre:
  - `GET /finanzas/clientes/{clienteId}/historial`: `txLimit`/`txOffset` (techo 100); `transaccionesTotal` siempre presente.
  - `GET /antropometria/evolucion/{alumnoId}`: `controlesLimit`/`controlesOffset` (default 25 al paginar, techo 100); `controlesTotal` siempre presente. Los charts siguen solicitando la serie completa.
- **Filtros server-side:** se aplican **antes** del slice de página (paginación coherente entre páginas) y no alteran los totales globales de contexto (`resumen`, contadores de cartera).
- **UI (`WU25a`):** componente reutilizable `Paginacion` (`apps/web/src/components/common/Paginacion.tsx`) con Radix DropdownMenu (selector 10/25/50/100, números con elipsis, `aria-current="page"`, controles deshabilitados durante la carga) + hook `usePaginacionServidor` con TanStack Query (`placeholderData: keepPreviousData` para evitar parpadeos). Ver `ADR-013`.

### 1.2. Pendientes Conocidos (Deuda Declarada)
> Registro honesto de lo que **aún no** es server-side. No bloquea la entrega; se declara para que el copy de la UI no prometa más de lo que hace.

- **Filtros de página visible:** la búsqueda/método de `GET /finanzas/conciliacion/bandeja`, la búsqueda de `GET /antropometria/pendientes` y el filtro de estado de los pagos del alumno en `GET /finanzas/clientes/{clienteId}/historial` filtran SOLO la página cargada; el copy lo declara explícitamente ("en esta página").
- **Plantillas sin paginar (`RF-017`):** `GET /plantillas` devuelve el catálogo completo del tenant; el filtro por nombre/nivel/estado es client-side. Se paginará cuando el volumen lo justifique.

---

## 👤 2. Módulo de IAM, Onboarding y Ciclo de Vida de Clientes

### 2.1. Establecer Contraseña con Token de Invitación (`RF-011`, `RNF-003`)
Permite al alumno que fue dado de alta manualmente por su entrenador activar su cuenta ingresando la contraseña definitiva a partir del enlace de bienvenida recibido por correo.

- **Método y Ruta:** `POST /auth/invitacion/establecer-password`
- **Permisos:** Público (Protegido por token de un solo uso).
- **Cuerpo de Petición:**
```json
{
  "token": "d7a8f9c1b2e3456789abcdef0123456789abcdef0123456789abcdef01234567",
  "password": "PasswordSegura#2026"
}
```
- **Lógica de Ejecución:**
  1. Hashea el token con SHA-256 y busca en `usuarios` donde `token_invitacion_hash == hash` y `token_invitacion_expira > now_utc()`.
  2. Genera el hash seguro de contraseña (Argon2id / bcrypt).
  3. Limpia `token_invitacion_hash` y `token_invitacion_expira` (un solo uso, `RNF-003`).
  4. Retorna el par de tokens JWT (Access Token + Refresh Token).
- **Respuesta Exitosa (`200 OK`):**
```json
{
  "mensaje": "Contraseña establecida con éxito. Bienvenido a GUACHAFIT.",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "usuario": {
    "id": "e8f6e9c2-5509-48e2-b13c-7435f29910d1",
    "email": "carlos.mendoza@email.com",
    "rol": "alumno"
  }
}
```

### 2.2. Alta Manual de Alumno por el Entrenador (`RF-011`)
Permite al coach inscribir a un alumno en el gimnasio presencialmente. Calcula automáticamente la edad y guarda la ficha médica confidencial.

- **Método y Ruta:** `POST /alumnos/manual`
- **Permisos:** Rol `entrenador`.
- **Cuerpo de Petición:**
```json
{
  "nombres": "Carlos Alberto",
  "apellidos": "Mendoza Silva",
  "email": "carlos.mendoza@email.com",
  "tipoDocumento": "V_",
  "numeroDocumento": "24123456",
  "fechaNacimiento": "1998-05-14",
  "telefonoWhatsapp": "+584121234567",
  "modalidad": "presencial",
  "tasaFijadaOverride": "65.0000",
  "fichaSaludPrivada": "Cirugía de ligamento cruzado anterior rodilla derecha en 2022. Evitar sentadilla profunda pesada."
}
```
- **Respuesta Exitosa (`201 Created`):**
```json
{
  "id": "4a5b6c7d-8e9f-0a1b-2c3d-4e5f6a7b8c9d",
  "nombres": "Carlos Alberto",
  "apellidos": "Mendoza Silva",
  "email": "carlos.mendoza@email.com",
  "edadCalculada": 28,
  "modalidad": "presencial",
  "estadoActivacion": "activo",
  "mensaje": "Alumno registrado con éxito. Se ha enviado un correo con el enlace de activación."
}
```

### 2.3. Registro Público Autónomo de Alumno (Deep Link con `coachCode`, `RF-011`)
Permite a un alumno registrarse por su cuenta utilizando el enlace de captación pública de su entrenador (`/registro?coach_code=GUACHA01`).

- **Método y Ruta:** `POST /alumnos/registro-publico`
- **Permisos:** Público.
- **Cuerpo de Petición:**
```json
{
  "coachCode": "GUACHA01",
  "nombres": "Mariana",
  "apellidos": "Pérez Gómez",
  "email": "mariana.perez@email.com",
  "password": "PasswordFuerte#123",
  "tipoDocumento": "V_",
  "numeroDocumento": "26987654",
  "fechaNacimiento": "2001-11-20",
  "telefonoWhatsapp": "+584149876543",
  "modalidad": "remoto"
}
```
- **Respuesta Exitosa (`201 Created`):**
```json
{
  "id": "7b8c9d0e-1f2a-3b4c-5d6e-7f8a9b0c1d2e",
  "nombres": "Mariana",
  "email": "mariana.perez@email.com",
  "coachAsignado": "GuachaFit Performance",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "mensaje": "Registro completado con éxito."
}
```

### 2.4. Cambio de Estado de Activación y Ciclo de Vida (`RF-012`)
Permite pausar a un alumno (ej. por viaje o lesión) o reactivarlo.

- **Método y Ruta:** `PATCH /alumnos/{id}/estado`
- **Permisos:** Rol `entrenador`.
- **Cuerpo de Petición:**
```json
{
  "nuevoEstado": "inactivo_pausado",
  "motivo": "Viaje de trabajo por 3 semanas. Pausar emisión de cuotas."
}
```
- **Respuesta Exitosa (`200 OK`):**
```json
{
  "id": "4a5b6c7d-8e9f-0a1b-2c3d-4e5f6a7b8c9d",
  "estadoActivacion": "inactivo_pausado",
  "mensaje": "El alumno ha sido pausado. No se generarán recordatorios ni cuotas automáticas."
}
```

### 2.5. Baja Lógica de Alumno (*Soft Delete*, `RF-012`)
- **Método y Ruta:** `DELETE /alumnos/{id}`
- **Permisos:** Rol `entrenador`.
- **Respuesta Exitosa (`200 OK`):**
```json
{
  "id": "4a5b6c7d-8e9f-0a1b-2c3d-4e5f6a7b8c9d",
  "deletedAtUtc": "2026-09-06T15:30:00.000Z",
  "mensaje": "Alumno dado de baja exitosamente. Su histórico deportivo y financiero ha sido preservado."
}
```

### 2.6. Dashboard de Comando Central del Entrenador (`RF-013`)
Provee la fotografía ejecutiva del negocio en un solo payload optimizado ($p95 < 200$ ms, `RNF-003`).

- **Método y Ruta:** `GET /entrenador/dashboard-comando`
- **Permisos:** Rol `entrenador`.
- **Respuesta Exitosa (`200 OK`):**
```json
{
  "kpisMacro": {
    "alumnosActivos": 38,
    "capacidadMaxima": 50,
    "porcentajeOcupacion": "76.00",
    "cobranzaMesUsd": "1900.00",
    "metaCobranzaMesUsd": "2500.00",
    "porcentajeCobranza": "76.00",
    "tasaAdherenciaSemanal": "84.50",
    "alumnosEnRiesgo": 4
  },
  "bandejasRapidas": {
    "pagosPorConciliar": 3,
    "checkinsAntropometricosPendientes": 2,
    "alumnosEnMora": [
      {
        "alumnoId": "4a5b6c7d-8e9f-0a1b-2c3d-4e5f6a7b8c9d",
        "nombre": "Carlos Mendoza",
        "cuotaId": "c9d8e7f6-5a4b-3c2d-1e0f-9a8b7c6d5e4f",
        "saldoPendienteUsd": "30.00",
        "diasVencido": 5
      }
    ],
    "alumnosInactivosEntrenamiento": [
      {
        "alumnoId": "9f8e7d6c-5b4a-3c2d-1e0f-1a2b3c4d5e6f",
        "nombre": "Andrés Silva",
        "diasSinEntrenar": 6
      }
    ]
  }
}
```

### 2.7. Directorio de Alumnos Paginado (`RF-011`, `RF-012`, `RF-013`)
Listado principal de la cartera del coach con búsqueda, filtros y paginación server-side.

- **Método y Ruta:** `GET /alumnos`
- **Permisos:** `entrenador`, `superadmin`.
- **Parámetros de consulta:** `q` (búsqueda literal case-insensitive sobre nombre/apellido/correo/documento, máx. 200 caracteres), `estado`, `modalidad`, `incluirArchivados` (default `false`), `soloArchivados` (default `false`; tiene prioridad sobre `incluirArchivados`), `semaforoPago` (`moroso | al_dia | sin_cuota`), `limit` (default y techo 100) y `offset` (default 0).
- **Respuesta Exitosa (`200 OK`):** envelope `{ items, total, limit, offset, resumen }`. `resumen` son contadores de la cartera COMPLETA (COUNT en el servidor) y nunca se altera por la búsqueda, los filtros ni la página.
```json
{
  "items": [
    {
      "id": "4a5b6c7d-8e9f-0a1b-2c3d-4e5f6a7b8c9d",
      "nombres": "Carlos Alberto",
      "apellidos": "Mendoza Silva",
      "estadoActivacion": "activo",
      "modalidad": "presencial",
      "semaforoPago": "al_dia"
    }
  ],
  "total": 38,
  "limit": 100,
  "offset": 0,
  "resumen": {
    "total": 41,
    "activos": 38,
    "pausados": 2,
    "morosos": 4,
    "presenciales": 20,
    "remotos": 21,
    "archivados": 3
  }
}
```

---

## 🔔 3. Módulo de Notificaciones, Preferencias y Dispositivos

### 3.1. Consultar y Actualizar Matriz de Preferencias (`RF-015`)
- **Consultar:** `GET /notificaciones/preferencias` (Rol `alumno` o `entrenador`).
- **Actualizar:** `PUT /notificaciones/preferencias`
- **Cuerpo de Petición:**
```json
{
  "notifyPaymentsPush": true,
  "notifyPaymentsEmail": true,
  "notifyWorkoutsPush": true,
  "notifyWorkoutsEmail": false,
  "notifyCheckinsPush": true,
  "notifyCheckinsEmail": false,
  "digestWeeklyEmail": true
}
```
- **Respuesta Exitosa (`200 OK`):**
```json
{
  "mensaje": "Preferencias de notificación actualizadas exitosamente."
}
```

### 3.2. Registro y Rotación de Token Push de Dispositivo (`RF-016`)
- **Método y Ruta:** `POST /dispositivos/registrar`
- **Permisos:** Autenticado (`alumno`, `entrenador`).
- **Cuerpo de Petición:**
```json
{
  "deviceToken": "fcm_token_c5k7d9...8x1",
  "platform": "android"
}
```
- **Respuesta Exitosa (`200 OK`):**
```json
{
  "id": "d1e2f3a4-b5c6-7890-1234-567890abcdef",
  "isActive": true,
  "mensaje": "Dispositivo registrado para alertas push."
}
```

### 3.3. Centro de Alertas In-App (`RF-014`)
- **Consultar Alertas:** `GET /notificaciones/in-app?limit=20&soloNoLeidas=false`
- **Marcar Leída:** `PATCH /notificaciones/in-app/{id}/leer`
- **Respuesta Exitosa de Consulta (`200 OK`):**
```json
{
  "totalNoLeidas": 2,
  "notificaciones": [
    {
      "id": "a1b2c3d4-e5f6-7890-1234-567890abcdef",
      "titulo": "Pago Recibido",
      "cuerpo": "Tu entrenador ha validado tu abono de $20.00 USD.",
      "tipoEvento": "PAGO",
      "leida": false,
      "linkAccion": "/finanzas/cuotas/c9d8e7f6",
      "createdAtUtc": "2026-09-06T14:10:00.000Z"
    }
  ]
}
```

### 3.4. Sincronización Cross-Device de Tema de Interfaz (Dark Mode Persistente)
Permite almacenar la preferencia de visualización en la cuenta del usuario para que persista al cambiar de dispositivo, respetando la elección local inmediata en `localStorage`.

> **Nota de implementación (2026-09-21):** el endpoint existe y actualiza `usuarios.tema_ui`, pero la PWA aún no lo invoca: el tema se persiste solo en `localStorage` (clave `guachafit-theme`) y la sincronización cross-device queda pendiente (ver [[ADR-004-stack-frontend-pwa-offline-first]] §"Estado implementado").

- **Método y Ruta:** `PATCH /usuarios/me/preferencias`
- **Permisos:** Autenticado (`superadmin`, `entrenador`, `alumno`).
- **Cuerpo de Petición:**
```json
{
  "temaUi": "dark"
}
```
- **Valores Permitidos:** `"system"`, `"dark"`, `"light"`.
- **Respuesta Exitosa (`200 OK`):**
```json
{
  "temaUi": "dark",
  "mensaje": "Preferencia de interfaz actualizada con éxito."
}
```

---

## 🏋️ 4. Módulo de Entrenamiento, Plantillas y Nutrición

### 4.1. Checklist Interactivo de Entrenamiento Diario (`RF-001`)

- **Consulta pasiva de la sesión de hoy:** `GET /alumnos/me/sesiones/hoy?timezone={IANA}&bloqueId={diaId}` (Rol `alumno`). Devuelve la sesión del día en fecha local; `204 No Content` si no existe. Navegar o consultar no altera el estado (RN-04).
- **Acción explícita para entrenar un bloque hoy:** `POST /alumnos/me/sesiones/bloques/{bloqueId}/entrenar-hoy` (Rol `alumno`, `X-Idempotency-Key`).
  - **Cuerpo:**
    ```json
    { "timezoneCliente": "America/Caracas", "iniciarInmediato": false }
    ```
  - Reutiliza una sesión viva (`planificada` / `en_progreso`) del mismo bloque; si el bloque ya fue `completada`/`omitida`, crea una nueva sesión (repetición) conservando el historial.
  - `409 Conflict` si existe un entrenamiento `en_progreso` de otro bloque (no se permiten dos sesiones activas).
  - `iniciarInmediato: true` (repetir un bloque ya completado) crea/arranca la sesión directamente en `en_progreso`.
- **Inicio explícito:** `POST /sesiones/{id}/iniciar` (Rol `alumno`, `X-Idempotency-Key`). Cuerpo `{ "timezoneCliente": "America/Caracas", "fechaInicioUtc?": "..." }`. Transiciona `planificada → en_progreso` y captura `fecha_inicio_utc` en UTC (RN-05).
- **Sincronización batch de series:** `PUT /sesiones/{id}/series` (Rol `alumno`, `X-Idempotency-Key`). Cuerpo `{ "series": [{ "serieId", "repsLogradas", "pesoKg"?, "rpe"?, "descansoSegundos"?, "completada", "timestampCompletadaUtc"? }] }`; compatible con la cola offline. Límites (2026-10-11): `pesoKg` de 0 a 999 kg con hasta 2 decimales, `repsLogradas` de 0 a 200 y `rpe` de 1 a 10 en pasos de 0,5 (`LIMITES_SERIE` en `@guachafit/shared`); fuera de rango, 400 con el mensaje del campo.
- **Finalización:** `POST /sesiones/{id}/finalizar` (Rol `alumno`, `X-Idempotency-Key`).
  - **Cuerpo:** `{ "notasAlumno"?, "fechaFinUtc"? ("...Z"), "tipoCierre"? }` con `tipoCierre ∈ COMPLETADA | DESCANSADA | INCOMPLETA`.
  - Evalúa la racha por volumen prescrito (`ratioVolumenPct >= 70%`, con fallback cualitativo) y responde `{ sesion, cumpleReglaRacha, nuevaRacha, duracionMinutos, volumenTotalKg }`.
  - **Cierre sin series (`RF-001` Escenario 5):** si `seriesCompletadas = 0` y falta `tipoCierre`, responde `400 Bad Request` con código máquina estable:
    ```json
    {
      "statusCode": 400,
      "error": "Bad Request",
      "code": "SESION_VACIA",
      "message": "La sesión no registra series completadas. Indica si el día fue descansado o incompleto."
    }
    ```
    Con decisión explícita `DESCANSADA`/`INCOMPLETA` la sesión queda `omitida` con `motivoOmision: DESCANSO | INCOMPLETO` y no incrementa la racha; `COMPLETADA` con 0 series se rechaza.
- **Progreso semanal del alumno:** `GET /alumnos/me/rutina/semana-actual?timezone={IANA}` (Rol `alumno`). Expone `bloques[]` (con `estadoSesion`/`motivoOmision` cuando aplica), `porcentajeCumplimiento`, `siguienteBloqueSugeridoId`, `esDiaDescansoHoy` y `rachaDias` (racha efectiva; 0 si la cadena está rota).
- **Historial de sesiones del alumno (`WU24`):** `GET /sesiones/alumno/{alumnoId}/historial?limit={1..100}&offset={n}` (Roles `entrenador`, `alumno` titular, `superadmin`). Envelope `{ items, total, limit, offset }`; `limit` default 30 (techo 100), `offset` default 0; `total` es el COUNT real del historial completo.
- **Monitor semanal del coach (RN-03):** `GET /entrenador/monitor-adherencia?timezone={IANA}` (Rol `entrenador`). Evalúa la ventana Lunes 00:00 local → ahora y ordena por riesgo (rojo primero). Ejemplo de un elemento del arreglo `items[]` del envelope:
  ```json
  {
    "alumnoId": "4a5b6c7d-8e9f-0a1b-2c3d-4e5f6a7b8c9d",
    "alumnoPerfilId": "9f8e7d6c-5b4a-3c2d-1e0f-1a2b3c4d5e6f",
    "nombreCompleto": "Carlos Mendoza",
    "sesionesPrescritas": 3,
    "sesionesCompletadas": 2,
    "porcentajeCumplimientoSemanal": "66.67",
    "semaforoAdherencia": "amarillo",
    "tienePlanActivo": true,
    "sinPendientesSemana": false,
    "rachaDiasConsecutivos": 4,
    "diasInactivo": 1,
    "ultimaSesionUtc": "2026-09-19T22:40:00.000Z"
  }
  ```
  `tienePlanActivo = false` → la UI muestra "sin plan" (nunca rojo); `sinPendientesSemana = true` → "Al día — sin pendientes" (nunca rojo). `alumnoPerfilId` habilita el enlace directo al expediente del alumno.
  - **Paginación (`WU24`):** envelope `{ items, total, limit, offset, resumen }`; `limit` default 25 (techo 100), `offset` default 0. `resumen` cuenta la cartera completa, nunca la página.
  - **Filtros y orden server-side (`WU25a`, `WU26`):** `q` (nombre normalizado, literal) y `semaforo` (`rojo | amarillo | verde | sinPlan | sinPendientes`) recortan la lista, y `orden` (`riesgo` default | `nombre` A–Z) se aplica **antes** del slice; ambos órdenes mantienen la paginación por offset coherente. `resumen` no se altera por los filtros.
  - **Nota honesta:** el filtro `semaforo` se aplica en el servidor, pero el semáforo se **calcula en memoria** (agregados por alumno), no es una columna SQL consultable.

### 4.2. Banco de Plantillas del Entrenador (`RF-017`)

- `GET /plantillas?activa={true|false}`: listado resumido del tenant (`PlantillaRutinaResumenDTO`: nombre, nivel, totalDias, totalEjercicios, activa).
- `POST /plantillas`: crea la plantilla asociada al tenant.
  ```json
  {
    "nombre": "Pierna Énfasis Isquios",
    "nivelObjetivo": "intermedio",
    "bloques": [ { "diaId": "dia-1", "titulo": "Pierna A", "ejercicios": [ "..." ] } ]
  }
  ```
- `GET /plantillas/{id}` / `PATCH /plantillas/{id}` / `DELETE /plantillas/{id}`: detalle, edición y desactivación (soft delete vía `activa`). `404 Not Found` si la plantilla pertenece a otro tenant.
- `POST /plantillas/{id}/asignar`: asignación individual o masiva con copia profunda (deep clone).
  - **Cuerpo:** `{ "alumnoIds": ["<uuid>", "..."], "modo": "REEMPLAZAR | FUSIONAR", "ajustes?": [{ "diaId", "ejercicioId? | nombre?", "pesoPrescritoKg?", "series?", "reps?", "rpe?" }] }` (máx. 50 alumnos y 100 ajustes por solicitud). `pesoPrescritoKg` de 0 a 999 y `rpe` de 1 a 10 en pasos de 0,5; los bloques de rutinas y plantillas aplican los mismos topes a los números de su texto libre de carga y repeticiones (2026-10-11).
  - **Respuesta (`200 OK`):** reporte parcial por alumno; el fallo de un alumno no aborta el resto.
    ```json
    {
      "plantillaId": "b7c8d9e0-1f2a-3b4c-5d6e-7f8a9b0c1d2e",
      "modo": "FUSIONAR",
      "totalSolicitados": 3,
      "exitosos": 2,
      "fallidos": 1,
      "resultados": [
        { "alumnoId": "4a5b6c7d-...", "exito": true, "rutinaId": "c9d8...", "bloquesTotal": 4 },
        { "alumnoId": "9f8e7d6c-...", "exito": false, "error": "El alumno no pertenece a su cartera." }
      ]
    }
    ```
  - `REEMPLAZAR` sustituye la rutina activa del alumno; `FUSIONAR` anexa los días de la plantilla a los bloques existentes. Los ajustes se aplican antes de confirmar la prescripción (Escenario 2).

### 4.3. Nutrición (`RF-002`)

- **Check-in 1-Tap del alumno:**
  - `POST /nutricion/checkin-diario` (Rol `alumno`): registra el semáforo (`cumplido | parcial | no_cumplido`) con agua, notas (≤ 280 caracteres), calorías/proteína reportadas y hasta **4 fotos de platos** (`tipoComida` + `storageKey`); responde `201 Created` y `409 Conflict` si ya existe un check-in de esa fecha (unicidad diaria por alumno).
  - **Ventana horaria (RN-02):** solo se habilita entre las **18:00 y las 23:59 hora local del alumno** (zona IANA en `timezoneCliente`; por defecto `America/Caracas`). Fuera de la ventana, o con una `fecha` distinta al día local en curso, responde `400 Bad Request` y el día queda como "No reportado" (estado derivado, RF-002 §6).
  - **Tolerancia ±10% (Escenario 3):** el response agrega `dentroMargenTolerancia`, `desviacionCaloriasPct` y `desviacionProteinasPct` comparando lo reportado contra las **metas reales del coach**; sin metas configuradas (o sin dimensión evaluable) queda "sin evaluar" (campos ausentes), nunca un falso OK.
  - `GET /nutricion/checkin/hoy?fecha={YYYY-MM-DD}&timezoneCliente={IANA}` (Rol `alumno`): reporte del día en curso (sin `fecha`, el día se resuelve en la zona local del alumno); `204 No Content` si aún no reportó.
- **Historial de check-ins:** `GET /nutricion/alumnos/{alumnoId}/checkins?desde&hasta&semaforo` (Roles `entrenador`, `alumno` titular): lista cronológica descendente (sin paginación) con tenancy validada.
- **Metas nutricionales (RN-01):**
  - `PUT /nutricion/alumnos/{alumnoId}/metas` (Rol `entrenador`): reemplaza la fila completa del alumno; cada objetivo es opcional por separado, pero el cuerpo exige al menos uno. Un campo omitido queda en `NULL` ("no configurado", nunca 0 fabricado) y admite hasta **10 recursos** por enlace (`titulo` + `url` validada). `403` si el alumno no pertenece a la cartera del coach.
    ```json
    {
      "caloriasObjetivo": 2200,
      "proteinaGramosObjetivo": 160,
      "carbohidratosGramosObjetivo": 240,
      "grasasGramosObjetivo": 70,
      "aguaLitrosObjetivo": "3.00",
      "recursos": [ { "titulo": "Lista de compras", "url": "https://ejemplo.com/lista.pdf" } ]
    }
    ```
  - `GET /nutricion/alumnos/{alumnoId}/metas` (Rol `entrenador`) y `GET /nutricion/metas` (Rol `alumno`): metas del alumno; `204 No Content` si el coach aún no las configuró.
- **Fotos de platos (RN-03):** al leer (check-in de hoy o historial), cada foto expone `storageKey` y `fotoUrl` **firmada con TTL de 900 s**; si la firma falla o no hay bóveda configurada el campo queda `null` (la UI lo declara, nunca un enlace inventado).

> **Nota de verificación (2026-09-22):** endpoints, ventana, tolerancia y límites contrastados contra el controlador/servicio de nutrición, los contratos Zod compartidos y la migración `0009`.

---

## 📏 5. Módulo de Antropometría y Fotos de Progreso

- `POST /antropometria/presigned-upload-url`: Genera URL PUT directa a Cloudflare R2 (TTL 15 min, `RNF-001`).
- `POST /antropometria/checkin`: Envío de evaluación corporal (Presencial $\rightarrow$ Aprobado; Remoto $\rightarrow$ Pendiente según `ADR-001`).
- `GET /antropometria/pendientes`: Cola de check-ins pendientes del coach con envelope `{ items, total, limit, offset }` (`limit` default 25, techo 100; `offset` default 0; orden por fecha de evaluación descendente).
- `GET /antropometria/evolucion/{alumnoId}`: Historial y URLs presignadas GET de 15 minutos para el comparador (`RF-004`). Paginación **opt-in**: `controlesLimit`/`controlesOffset` (default 25 al paginar, techo 100) y `controlesTotal` siempre presente; sin estos parámetros devuelve la serie cronológica completa (los charts la necesitan).
- `PATCH /antropometria/{id}/conciliar`: Aprobación o rechazo con observaciones por el coach.

---

## 💰 6. Módulo de Finanzas, Cobranza y Conciliación

- `GET /finanzas/tasas/vigente`: Consulta de tasa BCV, tasa activa del coach y tasa acordada (`ADR-003`).
- `POST /finanzas/cuotas/{id}/reportar-pago`: Abono bimonetario reportado con `X-Idempotency-Key`. Congela tasa snapshot.
- `POST /finanzas/cuotas/{id}/cobro-directo`: Cobro en efectivo en sala registrado por el coach (auto-aprobado inmediato).
- `GET /finanzas/conciliacion/bandeja`: Bandeja FIFO de transacciones pendientes del coach con envelope `{ items, total, limit, offset }` (`limit` default 25, techo 100; `offset` default 0).
- `PATCH /finanzas/transacciones/{id}/conciliar`: Conciliación bancaria bajo transacción interactiva ACID en PostgreSQL con lock pesimista `SELECT ... FOR UPDATE` (`RNF-002`).
- `GET /finanzas/clientes/{clienteId}/historial`: Historial financiero y resumen del alumno (Roles `entrenador`, `alumno` titular, `superadmin`). Paginación **opt-in** de transacciones con `txLimit`/`txOffset` (techo 100) y `transaccionesTotal` siempre presente; sin estos parámetros devuelve todas las transacciones (comportamiento histórico).
- `GET /finanzas/cartera/dashboard`: Tablero analítico de cobranza y morosidad (`RF-009`).

---

## 🔒 7. Matriz Global de Autorización (RBAC Jerárquico)

| Endpoint | Rol SuperAdmin | Rol Entrenador | Rol Alumno | Regla de Tenancy / Seguridad |
| :--- | :---: | :---: | :---: | :--- |
| `POST /auth/invitacion/establecer-password` | Público | Público | Público | Token SHA-256 de un solo uso con TTL $\le 48$h. |
| `POST /alumnos/manual` | ❌ | ✅ | ❌ | Asocia el alumno al `entrenador_id` activo. |
| `POST /alumnos/registro-publico` | Público | Público | Público | Requiere un `coach_code` válido. |
| `PATCH /alumnos/{id}/estado` | ❌ | ✅ | ❌ | Solo sobre alumnos de su propio tenant. |
| `DELETE /alumnos/{id}` | ❌ | ✅ | ❌ | Aplica Soft Delete (`deleted_at_utc`). |
| `GET /entrenador/dashboard-comando` | ❌ | ✅ | ❌ | Agrega métricas exclusivas de su cartera. |
| `GET /entrenador/monitor-adherencia` | ❌ | ✅ | ❌ | Semáforo RN-03 de su cartera; filtros (`q`, `semaforo`, `orden`) y paginación server-side. |
| `GET /alumnos` | ✅ | ✅ | ❌ | Directorio paginado y filtrado server-side del tenant activo. |
| `GET /sesiones/alumno/{alumnoId}/historial` | ✅ | ✅ | ✅ (titular) | Historial paginado; el alumno solo accede a su propio historial. |
| `GET /finanzas/conciliacion/bandeja` | ❌ | ✅ | ❌ | Bandeja FIFO paginada de su cartera. |
| `GET /finanzas/clientes/{clienteId}/historial` | ✅ | ✅ | ✅ (titular) | Paginación opt-in de transacciones; `transaccionesTotal` real. |
| `GET /antropometria/pendientes` | ✅ | ✅ | ❌ | Cola paginada de check-ins pendientes del tenant. |
| `GET/POST/PATCH/DELETE /plantillas` y `POST /plantillas/{id}/asignar` | ❌ | ✅ | ❌ | Banco de plantillas tenant-scoped; asignación con reporte parcial por alumno. |
| `GET /alumnos/me/sesiones/hoy` | ❌ | ❌ | ✅ | Acceso exclusivo a sus propios datos. |
| `POST /sesiones/{id}/iniciar` | ❌ | ❌ | ✅ | Titular de la sesión. |
| `PUT /sesiones/{id}/series` | ❌ | ❌ | ✅ | Solo en sesiones `en_progreso`. |
| `POST /alumnos/me/sesiones/bloques/{bloqueId}/entrenar-hoy` | ❌ | ❌ | ✅ | Acción explícita RN-04; idempotente; `409` si hay otro bloque en progreso. |
| `GET /alumnos/me/rutina/semana-actual` | ❌ | ❌ | ✅ | Progreso y racha del propio alumno. |
| `POST /sesiones/{id}/finalizar` | ❌ | ❌ | ✅ | Exige `tipoCierre` si no hay series completadas (`SESION_VACIA`). |
| `POST /antropometria/checkin` | ❌ | ✅ (Presencial) | ✅ (Remoto) | RBAC híbrido (`ADR-001`). |
| `PATCH /antropometria/{id}/conciliar` | ❌ | ✅ | ❌ | Requiere motivo descriptivo si se rechaza. |
| `POST /finanzas/cuotas/{id}/reportar-pago` | ❌ | ❌ | ✅ | Exige `X-Idempotency-Key` y comprobante. |
| `POST /finanzas/cuotas/{id}/cobro-directo` | ❌ | ✅ | ❌ | Efectivo en sala auto-aprobado. |
| `PATCH /finanzas/transacciones/{id}/conciliar` | ❌ | ✅ | ❌ | Transacción interactiva ACID en PostgreSQL. |
| `GET /notificaciones/in-app` | ✅ | ✅ | ✅ | Bandeja privada de cada usuario autenticado. |
| `POST /dispositivos/registrar` | ✅ | ✅ | ✅ | Asocia token FCM/APNs a la cuenta activa. |

---

## 🔗 8. Trazabilidad y Referencias
- **Problemas resueltos:** [[PROB-001-adherencia-trazabilidad]] al [[PROB-004-orquestacion-preferencias-notificaciones]].
- **Requerimientos funcionales:** [[RF-001-checklist-entrenamiento-diario]] al [[RF-017-banco-plantillas-rutinas-entrenamiento]].
- **Requerimientos no funcionales:** [[RNF-001-almacenamiento-seguridad-fotos-progreso]] al [[RNF-004-resiliencia-notificaciones-idempotencia-fallbacks]].
- **Decisiones arquitecturales:** [[ADR-001-modelo-hibrido-auditoria-antropometrica]] al [[ADR-010-arquitectura-event-driven-notificaciones-multicanal]]; borradores [[ADR-011-aislamiento-multitenant-rls-progresivo-withtenant]], [[ADR-012-modo-demo-explicito-datos-sinteticos]], [[ADR-013-paginacion-server-side-stack-listas]] y [[ADR-014-actualizaciones-guiadas-sw-frescura-offline]].
- **Documentos de diseño:** [[01_Evaluacion_Stack_Tecnologico]], [[02_Esquema_Base_de_Datos_PostgreSQL]].
