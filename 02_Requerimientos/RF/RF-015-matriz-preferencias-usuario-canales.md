---
id: RF-015
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
- **Entrenador:** Configura alertas de nuevos comprobantes, ingresos vía deep link y el resumen semanal dominical.
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
| **Resumen Semanal** | Digest dominical: balance semanal de ingresos y mora. | `false` | `true` | **Configurable** |

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
When el cron del sistema se ejecuta el domingo a las 20:00 UTC
Then el sistema debe generar el reporte consolidado de ingresos de la semana y cartera en mora
  And enviarlo al correo electrónico del entrenador
```

---

## 6. Casos Borde y Excepciones
- **Migración de Nuevas Categorías:** Si en el futuro se añade una nueva categoría (ej. *Comunidad / Chat*), el sistema debe insertar automáticamente los valores por defecto sin romper las preferencias preexistentes del usuario.
