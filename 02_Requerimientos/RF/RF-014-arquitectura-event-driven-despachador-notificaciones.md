---
id: RF-014
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
  - event-driven
  - arquitectura
---

# RF-014: Arquitectura Event-Driven y Despachador de Notificaciones Multicanal

## 1. Contexto y Justificación
Desacopla totalmente los módulos centrales del negocio (Finanzas, Entrenamiento, Antropometría) de la infraestructura de entrega física de mensajes (Push y Correo Electrónico). Implementa un patrón Publicador-Suscriptor donde los servicios emiten eventos de dominio inmutables y un servicio despachador central orquesta el filtrado y encolamiento.

- **Objetivo:** Garantizar que ninguna operación de negocio se bloquee por latencias de proveedores externos y permitir el intercambio transparente de pasarelas de mensajería.
- **Valor aportado:** Alta resiliencia, tolerancia a fallas de proveedores, velocidad de respuesta en la API y trazabilidad centralizada de comunicaciones.
- **Trazabilidad:** Resuelve el acoplamiento y las caídas en cascada identificadas en [[PROB-004-orquestacion-preferencias-notificaciones]].

---

## 2. Actores Involucrados
- **Módulos Publicadores de Negocio:** Servicios de Rutinas, Finanzas, Check-ins y Auth que emiten eventos.
- **Servicio Despachador (Notification Dispatcher):** Componente que intercepta eventos, consulta preferencias y encola trabajos.
- **Workers Especializados:**
  - `WorkerPush`: Consume tareas de la cola y despacha vía FCM / APNs / WebPush.
  - `WorkerEmail`: Consume tareas y despacha vía Resend / SendGrid / SMTP.
- **Bandeja In-App (Campana de Alertas):** Almacén persistente de notificaciones internas dentro de la aplicación.

---

## 3. Precondiciones
1. El motor de colas (Redis / BullMQ) debe estar operativo.
2. Cada evento emitido debe contener: `tipo_evento`, `destinatario_user_id`, `entrenador_id`, `payload` estructurado y `timestamp_utc`.

---

## 4. Reglas de Negocio (Business Rules)
- **RN-01 (Prohibición de Envío Directo en Servicios de Negocio):** Queda terminantemente prohibido que los controladores o servicios de aplicación invoquen APIs de Push o Email de forma directa o sincrónica. Todo envío debe nacer de un evento de dominio (`emit('evento', payload)`).
- **RN-02 (Pipeline de Procesamiento del Despachador):**
  Al recibir un evento, el despachador ejecuta en milisegundos:
  1. Registra **siempre** la notificación en la entidad `NotificacionInApp` (campana interna del usuario).
  2. Consulta la tabla `notification_preferences` del destinatario.
  3. Si la categoría del evento está activa para Push $\rightarrow$ busca los dispositivos activos en `user_devices` y encola un trabajo en `cola-push`.
  4. Si la categoría está activa para Email $\rightarrow$ encola un trabajo en `cola-email`.
- **RN-03 (Aislamiento de Fallos de Proveedores):** Si el proveedor de correo electrónico está fuera de servicio o devuelve errores 5xx, el `WorkerEmail` reintenta en segundo plano mediante colas con backoff exponencial. El flujo de usuario, la base de datos y la entrega de Push continuarán operando sin afectación.
- **RN-04 (Fallback In-App Universal):** Si el usuario tiene desactivados ambos canales externos (Push y Email) para una alerta no crítica, el sistema asegura que la notificación exista en su bandeja In-App para consulta cuando abra la aplicación.

---

## 5. Criterios de Aceptación (Given-When-Then / Gherkin)

### Escenario 1: Despacho Asíncrono de Recordatorio de Pago sin Bloquear la API
```gherkin
Given que el cron de cobranza detecta que una cuota vence en T - 1 día
When el servicio emite el evento "CUOTA_POR_VENCER" con el ID del alumno
Then el servicio emisor debe retornar inmediatamente en < 10 ms sin esperar a la pasarela de correo
  And el Despachador debe leer las preferencias del alumno
  And si Push está activo, debe crear un trabajo en la cola BullMQ de Push
  And si Email está activo, debe crear un trabajo en la cola BullMQ de Email
  And persistir la alerta en la bandeja In-App del alumno
```

### Escenario 2: Resiliencia ante Caída del Proveedor de Email
```gherkin
Given que la pasarela de Email externa (Resend / SendGrid) sufre un corte de servicio (HTTP 503)
When el Worker de Email procesa una notificación de rutina nueva
Then el Worker debe capturar el error y reencolar la tarea con reintento exponencial
  And la notificación Push asociada debe haberse entregado exitosamente al alumno
  And la base de datos principal de la aplicación no debe presentar bloqueos de conexión
```

### Escenario 3: Usuario con Canales Externos Apagados
```gherkin
Given que el alumno configuró Push = false y Email = false para recordatorios de entrenamiento
When el entrenador le asigna una nueva rutina diaria
Then el Despachador NO debe enviar trabajos a las colas de Push ni Email
  And DEBE guardar la notificación en la bandeja In-App para mostrarla con un badge al ingresar
```

---

## 6. Casos Borde y Excepciones
- **Eventos a Múltiples Destinatarios:** En caso de anuncios globales del coach a todos sus alumnos, el despachador debe fragmentar el envío en lotes (*batch chunking*) de 50 usuarios para no saturar la memoria de Redis ni las cuotas por segundo del proveedor.
