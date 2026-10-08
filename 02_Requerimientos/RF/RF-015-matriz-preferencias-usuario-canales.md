---
id: RF-015
modulo: Notificaciones
prioridad: alta
estado: aprobado
estado_implementacion: parcial
problema_origen: "[[PROB-004-orquestacion-preferencias-notificaciones]]"
fecha_creacion: 2026-09-06
version: 1.0
tags:
  - requerimiento
  - rf
  - sdd
  - notificaciones
  - preferencias
  - ux
---

# RF-015: Matriz de Preferencias de Notificaciones por Rol y Canal

## 1. Contexto y Justificación
Empodera al usuario (alumno y entrenador) para decidir qué tipo de comunicaciones desea recibir en cada canal físico (Push en la app y Correo Electrónico). Previene la saturación comunicativa (*notification fatigue*), reduce las desinstalaciones y salvaguarda la entrega forzada de eventos de alta criticidad (seguridad y fraude).

- **Objetivo:** Ofrecer una pantalla de ajustes con interruptores granulares categorizados por rol, aplicando reglas inviolables para alertas transaccionales maestras.
- **Valor aportado:** Mayor tasa de apertura de mensajes relevantes, respeto a la privacidad del usuario y cumplimiento de normativas anti-spam (CAN-SPAM / GDPR).
- **Trazabilidad:** Resuelve la saturación y silenciamiento forzado de alertas de [[PROB-004-orquestacion-preferencias-notificaciones]].

---

## 2. Actores Involucrados
- **Alumno:** Configura qué alertas deportivas, financieras y antropométricas desea recibir.
- **Entrenador:** Configura alertas de nuevos comprobantes, ingresos vía deep link y el resumen semanal de los lunes.
- **Sistema:** Aplica las preferencias y bloquea la desactivación de alertas de seguridad.

---

## 3. Precondiciones
1. El usuario debe estar autenticado para acceder a sus ajustes de perfil.
2. Cada usuario nuevo hereda las preferencias por defecto (*defaults óptimos*).

---

## 4. Reglas de Negocio (Business Rules)

### A. Matriz para el Alumno / Cliente

| Categoría de Notificación | Eventos Vinculados | Push (Default) | Email (Default) | Estado en Interfaz |
| :--- | :--- | :---: | :---: | :---: |
| **Finanzas y Pagos** | Recordatorios T-5, T-1, Día T; confirmación/rechazo de pagos. | `true` | `true` | **Configurable** |
| **Planificación Deportiva** | Nueva rutina asignada, correcciones técnicas del coach. | `true` | `false` | **Configurable** |
| **Check-in Antropométrico** | Alerta matutina en ayunas del día de control. | `true` | `false` | **Configurable** |
| **Seguridad de Cuenta** | Recuperación de clave, cambio de email, inicio de sesión. | `false` | `true` | **BLOQUEADO (Siempre Activo)** |

### B. Matriz para el Entrenador

| Categoría de Notificación | Eventos Vinculados | Push (Default) | Email (Default) | Estado en Interfaz |
| :--- | :--- | :---: | :---: | :---: |
| **Cobranzas Entrantes** | Alumno cargó comprobante (Pago Móvil, Zelle, etc.). | `true` | `true` | **Configurable** |
| **Nuevos Registros** | Alumno inscrito a través de su Deep link (`coach_code`). | `true` | `true` | **Configurable** |
| **Reportes de Progreso** | Alumno completó check-in o subió fotos de evolución. | `true` | `false` | **Configurable** |
| **Resumen Semanal** | Digest semanal (lunes 08:00 UTC): balance semanal de ingresos y mora. | `false` | `true` | **Configurable** |

### C. Regla de Alertas Críticas Transaccionales
- **RN-01 (Inviolabilidad de Alertas de Seguridad):** Las notificaciones de seguridad (reseteo de contraseña, revocación de tokens, inicio de sesión desde nueva IP) y los comprobantes oficiales de pago aprobado se enviarán **obligatoriamente por Email**, anulando cualquier intento de desactivación. En la interfaz gráfica, el switch aparece marcado y deshabilitado (*disabled*) con una nota: *"Obligatorio por motivos de seguridad"*.
- **RN-02 (Recomendación de Canal Mínimo en Finanzas):** Si el usuario intenta apagar simultáneamente Push y Email para la categoría "Finanzas y Pagos", el sistema emite una advertencia: *"Recomendamos mantener al menos un canal activo para no perder tu acceso por cuotas vencidas"*, permitiendo continuar si el usuario lo confirma.

---

## 5. Criterios de Aceptación (Given-When-Then / Gherkin)

### Escenario 1: Alumno Personaliza Preferencias Deportivas
```gherkin
Given que el alumno se encuentra en "Ajustes de Notificaciones"
When desactiva el switch "Planificación Deportiva - Push" y presiona "Guardar"
Then el sistema debe persistir `notify_workouts_push = false`
  And al asignársele una nueva rutina, no debe recibir alerta push en su teléfono
  And la rutina debe continuar registrándose en su bandeja In-App
```

### Escenario 2: Protección contra Desactivación de Alertas de Seguridad
```gherkin
Given que un usuario inspecciona el formulario de notificaciones de seguridad
When intenta desmarcar el switch de correo de seguridad
Then la interfaz debe mantener el interruptor bloqueado en estado "Activo"
  And mostrar la leyenda explicativa: "Este canal es obligatorio para proteger tu cuenta"
```

### Escenario 3: Entrenador Activa Resumen Semanal por Correo
```gherkin
Given que el entrenador tiene `digest_weekly_email = true`
When el cron del sistema se ejecuta el lunes a las 08:00 UTC
Then el sistema debe generar el reporte consolidado de ingresos de la semana y cartera en mora
  And enviarlo al correo electrónico del entrenador
```

> **Nota (doc-sync Ola 3):** el escenario original decía "domingo 20:00 UTC"; la implementación usa
> **lunes 08:00 UTC** (`0 8 * * 1`, tz UTC), configurable con la env `RESUMEN_SEMANAL_CRON` y
> documentada igual en [[RF-014-arquitectura-event-driven-despachador-notificaciones]] §7. El digest
> siempre registra copia In-App; el job de Email se encola según `digest_weekly_email` (default
> `true` del entrenador) y su entrega sigue simulada por log (proveedor real pendiente).

---

## 6. Casos Borde y Excepciones
- **Migración de Nuevas Categorías:** Si en el futuro se añade una nueva categoría (ej. *Comunidad / Chat*), el sistema debe insertar automáticamente los valores por defecto sin romper las preferencias preexistentes del usuario.

---

## 7. Estado real de implementación

### N2a (Ola 3) — implementado (base de datos, contrato y despachador)
- **Esquema/migración `0008_thankful_mimic`:** `preferencias_notificacion` pasa de 7 a 16 booleanos con
  los defaults de §A y §B. Campos nuevos: `notify_seguridad_push` (false), `notify_seguridad_email`
  (true, obligatorio), `notify_cobranzas_push`/`_email` (true/true), `notify_nuevos_registros_push`/
  `_email` (true/true), `notify_reportes_progreso_push`/`_email` (true/false), `digest_weekly_push`
  (false) y `digest_weekly_email` (pasa a **true** para el entrenador). Aplicada y verificada contra
  PostgreSQL real; un `INSERT` que solo declara `usuario_id` nace con la matriz exacta del doc.
- **Matriz por rol:** una fila por usuario con la matriz completa; el rol (`usuarios.rol`) decide qué
  mitad gobierna (`GET/PUT /notificaciones/preferencias` devuelve `rol`, `matriz` y
  `canalesObligatorios`, y rechaza campos que no pertenecen al rol).
- **RN-01:** el correo de seguridad no puede desactivarse — validación Zod + servicio (400 con mensaje
  explicativo) y `CHECK` en base de datos. El despachador fuerza además el Email en la categoría
  `SEGURIDAD` y en los comprobantes de pago aprobado (`esCriticoSeguridad`).
- **RN-02:** apagar Push y Email de "Finanzas y Pagos" exige la confirmación explícita
  `confirmarSinCanalesFinanzas: true`; sin ella el PUT responde 400 con la advertencia del doc.
- **Despachador:** enruta cada evento por fila `(rol, categoría)` → campos reales
  (FINANZAS del coach = "Cobranzas Entrantes"; `ALUMNOS` = "Nuevos Registros"; ENTRENAMIENTO/
  ANTROPOMETRIA del coach = "Reportes de Progreso"; `RESUMEN_SEMANAL` = digest) con la precedencia
  canal obligatorio → preferencia del usuario → default del doc; el In-App sigue siendo universal.
- **Tests:** suite de API en verde ampliada (621 casos, 37 archivos) con la matriz del despachador,
  RN-01/RN-02 y los defaults por rol.

### N2b (Ola 3) — implementado (UI)
- **Preferencias del coach:** pestaña **Notificaciones** en Ajustes (`/coach/ajustes?tab=notificaciones`),
  con la matriz del §B, switches por canal, candado de Seguridad (RN-01) y modal de confirmación de
  Finanzas (RN-02).
- **Preferencias del alumno:** pestaña **Notificaciones** de **Ajustes** (`/app/ajustes?tab=notificaciones`,
  matriz del §A), accesible desde el menú del alumno. Desde 2026-10-08 (RF-018 RN-09) reemplaza a la
  pantalla "Mis Notificaciones"; `/app/preferencias` redirige ahí.
- **Componente compartido:** `MatrizPreferenciasNotificacion` consume `GET/PUT
  /notificaciones/preferencias`, pinta `canalesObligatorios` como candados, aplica el copy de RN-02,
  muestra estados de carga/error/éxito y usa fixtures en modo demo (sin persistir).
- **Campana In-App:** el panel de la campana enlaza "Configurar mis notificaciones" a la pantalla del
  rol correspondiente (detalle en [[RF-014-arquitectura-event-driven-despachador-notificaciones]] §7).
- Suites en verde: web 465 · API 621.

### Cierre RF-003 (Ola 3) — emisor de "Reportes de Progreso"
- **Emisor implementado:** antropometría publica en el bus `CHECKIN_ANTROPOMETRICO_RECIBIDO`
  (autoreporte remoto del alumno → coach) y `CHECKIN_ANTROPOMETRICO_EXPIRADO` (ventana cerrada sin
  medición, §6 de [[RF-003-checkin-antropometrico-rbac-hibrido]]). Ambos viajan por la categoría
  `ANTROPOMETRIA` y el despachador los enruta por la fila **Reportes de Progreso** del coach
  (In-App universal + Push/Email según preferencias) con `jobId` determinista; el aviso de
  expiración además se pre-chequea en la bandeja In-App por referencia `alumno + fecha programada`.
- Suites en verde tras el cierre: API **771/771** · Web **612/612**.

### Pendiente (siguientes)
- **Entrega real por Email:** el job de Email se encola con la preferencia del usuario; la entrega
  sigue simulada por log (proveedor real pendiente).
