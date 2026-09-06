---
entidad: NotificacionInApp
modulo: Notificaciones
tipo: AggregateRoot
estado_ciclo_vida: activo
fecha_creacion: 2026-09-06
tags:
  - dominio
  - ddd
  - entidad
  - notificaciones
  - in-app
---

# Entidad de Dominio: NotificacionInApp (Centro de Alertas)

## 1. Ubiquitous Language (Lenguaje Ubicuo)
> Registro persistente de una alerta generada por el sistema que se visualiza dentro de la interfaz gráfica de la aplicación (icono de campana).

- **Definición de negocio:** Historial cronológico inmutable de avisos que el alumno o entrenador puede consultar en cualquier momento, garantizando que ninguna comunicación se pierda aunque los canales externos (Push/Email) estén desactivados.
- **Términos del Dominio:**
  - `Bandeja In-App`: Centro de notificaciones interno con contador de no leídas.
  - `Deep Link de Acción`: Enlace interno que redirige al usuario directamente a la pantalla de interés (ej. `/pagos/cuota-123` o `/rutinas/hoy`).
- **Bounded Context:** Contexto de Mensajería y Experiencia de Usuario.

---

## 2. Atributos Clave (Schema de Dominio)

| Atributo | Tipo / Value Object | Requerido | Descripción | Restricciones / Formato |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | Sí | Identificador único inmutable | UUID v4 |
| `user_id` | `UUID` | Sí | Destinatario del aviso | UUID v4 |
| `titulo` | `string` | Sí | Encabezado conciso de la alerta | 3 a 100 caracteres |
| `cuerpo` | `string` | Sí | Mensaje explicativo | Texto descriptivo |
| `tipo_evento` | `string` | Sí | Categoría (`PAGO`, `RUTINA`, `CHECKIN`, `SEGURIDAD`)| Clave de clasificación |
| `leida` | `boolean` | Sí | Estado de lectura por el usuario | Default: `false` |
| `link_accion` | `string` | No | Ruta interna para navegación directa | ej. `/finanzas/conciliacion` |
| `created_at_utc` | `DateTime` | Sí | Momento exacto de emisión | ISO 8601 UTC |

---

## 3. Invariantes de Negocio (Business Invariants)
- **INV-01 (Inmutabilidad del Mensaje):** Una vez persistida una notificación en el centro de alertas, su contenido (`titulo`, `cuerpo`, `tipo_evento`) es inmutable. Solo puede modificarse el estado booleano `leida`.
- **INV-02 (Retención Temporal):** Las notificaciones in-app tienen un periodo de retención automático de 90 días en la base de datos para evitar sobrecarga de almacenamiento.

---

## 4. Relaciones y Límites de Agregado
- **Raíz del Agregado:** `NotificacionInApp`.
- **Relación con Usuario:** Vinculado al `Usuario` mediante `user_id`.

---

## 5. Operaciones de Negocio (Comportamientos / Métodos)
- `crearAlerta(userId, titulo, cuerpo, tipoEvento, linkAccion)`: Factoría invocada siempre por el Despachador ante cualquier evento de negocio.
- `marcarComoLeida()`: Actualiza `leida = true` y decrementa el badge de la campana en la interfaz.
- `marcarTodasComoLeidas(userId)`: Actualización masiva de lectura para el usuario.

---

## 6. Eventos de Dominio Emitidos (Domain Events)
- `NotificacionInAppCreadaEvent`: Dispara la actualización reactiva en tiempo real del icono de la campana vía WebSockets / SSE.
