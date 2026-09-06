---
id: ARCH-003
titulo: "Especificación de Contratos de API REST (Endpoints, DTOs y Seguridad)"
fecha: 2026-09-06
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
  - Requerido para mutaciones financieras y despachos de notificaciones:
    ```http
    X-Idempotency-Key: 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d
    ```
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

## 🏋️ 4. Módulo de Entrenamiento y Nutrición

- `GET /alumnos/me/sesiones/hoy`: Consulta la sesión programada de hoy en zona horaria local.
- `POST /sesiones/{id}/iniciar`: Acción explícita `comenzarEntrenamiento()`.
- `PUT /sesiones/{id}/series`: Checklist de series (compatible con sincronización offline en batch).
- `POST /sesiones/{id}/finalizar`: Finaliza, evalúa regla de racha ($\ge 70\%$) y emite `SesionEntrenamientoCompletadaEvent`.
- `POST /nutricion/checkin-diario`: Semáforo 1-Tap con fotos de comida y agua.

---

## 📏 5. Módulo de Antropometría y Fotos de Progreso

- `POST /antropometria/presigned-upload-url`: Genera URL PUT directa a Cloudflare R2 (TTL 15 min, `RNF-001`).
- `POST /antropometria/checkin`: Envío de evaluación corporal (Presencial $\rightarrow$ Aprobado; Remoto $\rightarrow$ Pendiente según `ADR-001`).
- `GET /antropometria/evolucion/{alumnoId}`: Historial y URLs presignadas GET de 15 minutos para el comparador (`RF-004`).
- `PATCH /antropometria/{id}/conciliar`: Aprobación o rechazo con observaciones por el coach.

---

## 💰 6. Módulo de Finanzas, Cobranza y Conciliación

- `GET /finanzas/tasas/vigente`: Consulta de tasa BCV, tasa activa del coach y tasa acordada (`ADR-003`).
- `POST /finanzas/cuotas/{id}/reportar-pago`: Abono bimonetario reportado con `X-Idempotency-Key`. Congela tasa snapshot.
- `POST /finanzas/cuotas/{id}/cobro-directo`: Cobro en efectivo en sala registrado por el coach (auto-aprobado inmediato).
- `PATCH /finanzas/transacciones/{id}/conciliar`: Conciliación bancaria bajo transacción interactiva ACID en PostgreSQL con lock pesimista `SELECT ... FOR UPDATE` (`RNF-002`).
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
| `GET /alumnos/me/sesiones/hoy` | ❌ | ❌ | ✅ | Acceso exclusivo a sus propios datos. |
| `POST /sesiones/{id}/iniciar` | ❌ | ❌ | ✅ | Titular de la sesión. |
| `PUT /sesiones/{id}/series` | ❌ | ❌ | ✅ | Solo en sesiones `en_progreso`. |
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
- **Requerimientos funcionales:** [[RF-001-checklist-entrenamiento-diario]] al [[RF-016-gestion-dispositivos-tokens-push-ciclo-vida]].
- **Requerimientos no funcionales:** [[RNF-001-almacenamiento-seguridad-fotos-progreso]] al [[RNF-004-resiliencia-notificaciones-idempotencia-fallbacks]].
- **Decisiones arquitecturales:** [[ADR-001-modelo-hibrido-auditoria-antropometrica]] al [[ADR-010-arquitectura-event-driven-notificaciones-multicanal]].
- **Documentos de diseño:** [[01_Evaluacion_Stack_Tecnologico]], [[02_Esquema_Base_de_Datos_PostgreSQL]].
