---
entidad: DispositivoUsuario
modulo: Notificaciones
tipo: AggregateRoot
estado_ciclo_vida: activo
fecha_creacion: 2026-09-06
tags:
  - dominio
  - ddd
  - entidad
  - notificaciones
  - push
  - dispositivos
---

# Entidad de Dominio: DispositivoUsuario (Push Token)

## 1. Ubiquitous Language (Lenguaje Ubicuo)
> Representa un terminal físico (teléfono, tablet o navegador web) registrado por el usuario para la recepción de mensajes push.

- **Definición de negocio:** Vínculo técnico entre la cuenta del usuario y el token de registro emitido por el servicio de notificaciones del sistema operativo (Firebase Cloud Messaging o Apple Push Notification service).
- **Términos del Dominio:**
  - `Device Token`: Identificador de enrutamiento emitido por FCM / APNs.
  - `Plataforma`: Sistema operativo anfitrión (`ios`, `android`, `web`).
  - `Token Activo`: Dispositivo con autorización vigente que puede recibir paquetes de datos.
- **Bounded Context:** Contexto de Enrutamiento y Entrega Push.

---

## 2. Atributos Clave (Schema de Dominio)

| Atributo | Tipo / Value Object | Requerido | Descripción | Restricciones / Formato |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | Sí | Identificador único inmutable | UUID v4 |
| `user_id` | `UUID` | Sí | Titular del dispositivo | Llave foránea lógica |
| `device_token` | `string` | Sí | Token criptográfico de FCM/APNs | Cadena no vacía, índice único |
| `platform` | `EnumPlataforma` | Sí | `ios`, `android`, `web` | Enumeración controlada |
| `is_active` | `boolean` | Sí | Estado de entrega habilitado | `true` o `false` |
| `updated_at_utc` | `DateTime` | Sí | Último refresco de actividad/token | ISO 8601 UTC |

---

## 3. Invariantes de Negocio (Business Invariants)
- **INV-01 (Unicidad del Device Token):** Un mismo `device_token` no puede estar activo simultáneamente para dos usuarios distintos. Si un usuario A se loguea en un teléfono donde antes estuvo logueado el usuario B, el token se reasigna a A y se desactiva para B.
- **INV-02 (Depuración Inmediata ante Baja del Proveedor):** Si el proveedor de mensajería notifica que el token es inválido o no registrado, `is_active` debe pasar a `false` inmediatamente.

---

## 4. Relaciones y Límites de Agregado
- **Raíz del Agregado:** `DispositivoUsuario`.
- **Cardinalidad:** 1 `Usuario` puede tener 1 a $N$ `DispositivoUsuario` activos.

---

## 5. Operaciones de Negocio (Comportamientos / Métodos)
- `registrarORenovar(userId, token, platform)`: Da de alta el token o reactiva uno existente actualizando su timestamp.
- `desactivarPorLogout()`: Marca `is_active = false` cuando el usuario pulsa cerrar sesión en ese dispositivo.
- `marcarObsoletoPorProveedor(motivoError)`: Desactiva el token ante respuestas `NotRegistered` de FCM/APNs para evitar reintentos inútiles.

---

## 6. Eventos de Dominio Emitidos (Domain Events)
- `DispositivoRegistradoEvent`: Disparado al asociar un nuevo terminal.
- `TokenPushObsoletoDepuradoEvent`: Disparado al detectar la desinstalación de la app; alimenta métricas de salud de la base de datos de dispositivos.
