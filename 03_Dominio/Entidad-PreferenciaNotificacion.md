---
entidad: PreferenciaNotificacion
modulo: Notificaciones
tipo: AggregateRoot
estado_ciclo_vida: activo
fecha_creacion: 2026-09-06
tags:
  - dominio
  - ddd
  - entidad
  - notificaciones
  - preferencias
---

# Entidad de Dominio: PreferenciaNotificacion

## 1. Ubiquitous Language (Lenguaje Ubicuo)
> Representa la configuración granular de consentimiento y canales de comunicación elegidos por un usuario.

- **Definición de negocio:** Registro 1 a 1 vinculado a una cuenta de usuario que determina si una alerta de negocio debe traducirse en un mensaje Push móvil, un Correo Electrónico o únicamente una notificación interna en la app.
- **Términos del Dominio:**
  - `Canal Físico`: Medio de transmisión (`Push`, `Email`, `In-App`).
  - `Categoría de Evento`: Tipología del mensaje (`Pagos`, `Entrenamientos`, `Check-ins`, `Digest Semanal`).
  - `Alerta Transaccional Inviolable`: Notificación crítica que anula las preferencias y se despacha forzosamente por motivos de seguridad o legales.
- **Bounded Context:** Contexto de Mensajería y Preferencias de Usuario.

---

## 2. Atributos Clave (Schema de Dominio)

| Atributo | Tipo / Value Object | Requerido | Descripción | Restricciones / Formato |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | Sí | Identificador único inmutable | UUID v4 |
| `user_id` | `UUID` | Sí | Usuario titular de la configuración | Relación 1 a 1 estricta |
| `notify_payments_push` | `boolean` | Sí | Alertas de vencimiento y pagos vía Push | Default: `true` |
| `notify_payments_email`| `boolean` | Sí | Recibos y avisos de cobro vía Email | Default: `true` |
| `notify_workouts_push` | `boolean` | Sí | Nuevas rutinas y correcciones vía Push | Default: `true` |
| `notify_workouts_email`| `boolean` | Sí | Resumen de ejercicios vía Email | Default: `false` |
| `notify_checkins_push` | `boolean` | Sí | Recordatorio de pesaje en ayunas vía Push| Default: `true` |
| `notify_checkins_email`| `boolean` | Sí | Recordatorio de pesaje vía Email | Default: `false` |
| `digest_weekly_email` | `boolean` | Sí | Resumen dominical (exclusivo coaches) | Default: `true` para entrenadores |
| `updated_at_utc` | `DateTime` | Sí | Timestamp de última modificación | ISO 8601 UTC |

---

## 3. Invariantes de Negocio (Business Invariants)
- **INV-01 (Inviolabilidad de Alertas de Seguridad):** No existe ningún atributo booleano para apagar correos de seguridad (reseteo de contraseña o auditoría de acceso). Estas alertas se consideran del sistema y siempre se despachan por Email.
- **INV-02 (Unicidad 1 a 1 por Usuario):** Cada `user_id` tiene exactamente una fila de preferencias asociada en la base de datos.
- **INV-03 (Valores por Defecto Saludables):** Al crearse un usuario, sus preferencias se inicializan con configuraciones no invasivas (ej. no enviar correos de cada entrenamiento por defecto para evitar saturación de la bandeja de entrada).

---

## 4. Relaciones y Límites de Agregado
- **Raíz del Agregado:** `PreferenciaNotificacion`.
- **Relación con Usuario:** Vinculado al agregado `Usuario` mediante `user_id`.

---

## 5. Operaciones de Negocio (Comportamientos / Métodos)
- `inicializarPorDefecto(userId, rol)`: Factory que aplica los defaults diferenciados para alumnos o entrenadores.
- `actualizarPreferencias(nuevasPreferencias)`: Modifica los interruptores y actualiza `updated_at_utc`.
- `esCanalHabilitado(categoria, canal)`: Función pura utilizada por el Despachador para consultar si procede encolar una tarea física hacia Push o Email.

---

## 6. Eventos de Dominio Emitidos (Domain Events)
- `PreferenciasNotificacionModificadasEvent`: Notifica a los servicios de analítica sobre ajustes de consentimiento del usuario.
