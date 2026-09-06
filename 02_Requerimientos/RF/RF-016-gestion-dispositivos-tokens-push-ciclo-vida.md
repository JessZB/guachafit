---
id: RF-016
modulo: Notificaciones
prioridad: alta
estado: aprobado
problema_origen: "[[PROB-004-orquestacion-preferencias-notificaciones]]"
fecha_creacion: 2026-09-06
version: 1.0
tags:
  - requerimiento
  - rf
  - sdd
  - notificaciones
  - push
  - dispositivos
---

# RF-016: Gestión Multi-Dispositivo, Registro de Tokens Push y Depuración Reactiva

## 1. Contexto y Justificación
Permite a los usuarios acceder a GUACHAFIT desde múltiples dispositivos (ej. teléfono móvil personal y tablet o navegador web en laptop) manteniendo la entrega sincronizada de alertas push. Además, implementa un ciclo de vida reactivo que detecta tokens caducados o apps desinstaladas para depurar la base de datos y evitar penalizaciones de los proveedores de mensajería (FCM / APNs).

- **Objetivo:** Registrar, renovar y dar de baja de forma transparente los tokens criptográficos de dispositivos asociados a cada cuenta.
- **Valor aportado:** Entrega multicanal sin duplicados, ahorro de recursos en servidores y eliminación de envíos "zombie" a dispositivos inactivos.
- **Trazabilidad:** Resuelve el desperdicio de cuotas y fallos de entrega documentados en [[PROB-004-orquestacion-preferencias-notificaciones]].

---

## 2. Actores Involucrados
- **Cliente / Dispositivo Móvil:** Obtiene el token del sistema operativo (Firebase Cloud Messaging / Apple Push Notification service) y lo registra en la API.
- **Servicio de Dispositivos:** Persiste y asocia los identificadores al `user_id`.
- **Worker Push:** Detecta respuestas de error del proveedor externo (FCM/APNs) y activa la depuración.

---

## 3. Precondiciones
1. El usuario debe haber otorgado permisos de notificación en el sistema operativo de su dispositivo.
2. La app cliente debe contar con conectividad para enviar el token al backend tras el login o inicio.

---

## 4. Reglas de Negocio (Business Rules)
- **RN-01 (Soporte Multi-Dispositivo):** Un mismo usuario puede tener $N$ dispositivos activos registrados simultáneamente en la tabla `user_devices`. Cuando se dispara una alerta push, el sistema envía la notificación a todos los dispositivos con `is_active == true`.
- **RN-02 (Registro y Renovación Idempotente):** Al abrir la app o iniciar sesión, el cliente envía su `device_token` y `platform` (`ios`, `android`, `web`). Si el token ya existe para ese usuario, se actualiza `updated_at = now_utc()` y se asegura `is_active = true`. Si pertenecía a otro usuario previo en el mismo teléfono, se reasigna al usuario actual.
- **RN-03 (Desactivación por Logout):** Cuando el usuario cierra sesión deliberadamente en un dispositivo específico, la app envía una solicitud para marcar `is_active = false` exclusivamente para ese `device_token`.
- **RN-04 (Depuración Reactiva ante Errores de Proveedor):**
  Cuando el `WorkerPush` realiza un envío y el proveedor retorna códigos de error de token muerto:
  - Firebase: `messaging/registration-token-not-registered` o `messaging/invalid-registration-token`.
  - Apple: `410 BadDeviceToken` o `Unregistered`.
  El sistema **marca inmediatamente `is_active = false`** en `user_devices` y evita futuros intentos de envío hacia ese identificador.

---

## 5. Criterios de Aceptación (Given-When-Then / Gherkin)

### Escenario 1: Registro Exitoso de Nuevo Dispositivo al Iniciar Sesión
```gherkin
Given que el usuario inicia sesión en un teléfono Android nuevo
When el SDK de FCM emite el token "fcm_token_abc_123"
  And la app móvil ejecuta `POST /api/v1/devices` con plataforma "android"
Then el sistema debe registrar el dispositivo con:
  | Campo        | Valor                |
  | user_id      | ID_DEL_USUARIO       |
  | device_token | "fcm_token_abc_123"  |
  | platform     | "android"            |
  | is_active    | true                 |
```

### Escenario 2: Entrega Multi-Dispositivo Simultánea
```gherkin
Given que el entrenador tiene 2 dispositivos activos: su iPhone (iOS) y su iPad (iOS)
When se aprueba un pago de un alumno y el despachador genera una alerta Push
Then el Worker Push debe enviar el payload a ambos tokens registrados
  And el entrenador debe recibir la notificación simultáneamente en su iPhone y iPad
```

### Escenario 3: Depuración Automática de Token Obsoleto tras Desinstalación
```gherkin
Given que un alumno desinstaló la app de su teléfono
When el Worker Push intenta enviar un recordatorio de check-in hacia su token
  And FCM responde con el error "registration-token-not-registered"
Then el sistema debe actualizar inmediatamente el registro a `is_active = false`
  And registrar un log de auditoría de token depurado
  And no volver a intentar envíos a ese token en futuras alertas
```

---

## 6. Casos Borde y Excepciones
- **Rotación de Tokens en Segundo Plano por el SO:** Si el sistema operativo rota o refresca el token push, la app móvil debe capturar el evento `onTokenRefresh` y notificar inmediatamente a la API para reemplazar el token antiguo sin interrumpir la recepción de mensajes.
