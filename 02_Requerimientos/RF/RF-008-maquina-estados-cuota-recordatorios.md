---
id: RF-008
modulo: Finanzas
prioridad: alta
estado: parcial
version_implementada: v1.0.0
fecha_verificacion: 2026-10-10
problema_origen: "[[PROB-002-cobranza-bimonetaria-fraccionada]]"
fecha_creacion: 2026-09-06
version: 1.0
tags:
  - requerimiento
  - rf
  - sdd
  - finanzas
  - cobranza
  - automatizacion
---

# RF-008: Máquina de Estados de la Cuota y Recordatorios Automatizados de Cobranza

## 1. Contexto y Justificación
Automatiza el ciclo de vida de las mensualidades y delega en el sistema la tarea incómoda y desgastante de recordar los pagos a los alumnos. Mantiene la disciplina financiera del negocio mediante alertas oportunas en canales móviles y correo electrónico.

- **Objetivo:** Gobernar las transiciones de estado de cada cuota desde su emisión hasta su liquidación o mora, ejecutando disparadores de notificación programados.
- **Valor aportado:** Disminución drástica de la tasa de morosidad, cobro preventivo sin fricción humana y control de acceso automatizado.
- **Trazabilidad:** Resuelve el seguimiento manual de clientes morosos documentado en [[PROB-002-cobranza-bimonetaria-fraccionada]].

---

## 2. Actores Involucrados
- **Sistema (Worker / Cron Job):** Evalúa diariamente las fechas de corte y envía alertas automáticas.
- **Cliente:** Recibe notificaciones push y correos con su saldo actualizado y link directo a pagar.
- **Entrenador:** Visualiza en su dashboard general el mapa de alumnos organizados por estado financiero.

---

## 3. Precondiciones
1. El cliente debe tener activas sus preferencias de notificación (Token push de dispositivo móvil o correo verificado).
2. La cuota debe contar con una fecha de corte (`fecha_corte_utc`) explícita.

---

## 4. Reglas de Negocio (Business Rules)

### A. Definición de Estados de la Cuota
- **`Al Día / Pagada`:** Saldo pendiente igual a $0.00 USD. El alumno dispone de acceso total a rutinas, check-ins y servicios.
- **`Abonada (Parcial)`:** Se ha registrado y aprobado al menos un abono, pero el saldo pendiente es mayor a $0.00 USD. La app muestra prominentemente el saldo restante en USD y en Bs.
- **`Por Vencer`:** Faltan entre 5 y 1 días para la fecha de corte y la cuota no ha sido cancelada en su totalidad.
- **`Pendiente de Revisión`:** El cliente reportó un pago y está a la espera de conciliación por parte del coach. Durante este estado se pausan temporalmente los recordatorios agresivos de cobro.
- **`Vencida / En Mora`:** Se ha superado la fecha de corte ($T > \text{fecha\_corte}$) con saldo pendiente $> 0$. Se genera una alerta roja en el panel del coach y se habilita la opción de suspensión configurable del servicio.

### B. Cronograma de Recordatorios Automatizados
Un proceso en segundo plano se ejecuta diariamente a las 09:00 AM (hora local del alumno) y evalúa:

| Disparador | Canal | Plantilla del Mensaje |
| :--- | :--- | :--- |
| **T - 5 días** | Push + Email | *"Tu mensualidad vence en 5 días. Recuerda registrar tu pago con anticipación."* |
| **T - 1 día** | Push + Email | *"Mañana es tu fecha de corte. Tu saldo pendiente es de $[X] USD (o Bs. [Y])."* |
| **Día T (Corte)** | Push + Email | *"Hoy vence tu mensualidad. Reporta tu comprobante para mantener activo tu plan."* |
| **T + 2 días (Mora)** | Push + Email | *"Aviso de mora: Tu servicio se encuentra vencido con un saldo pendiente de $[X] USD. Por favor regulariza tu estatus."* |

---

## 5. Criterios de Aceptación (Given-When-Then / Gherkin)

### Escenario 1: Disparo de Recordatorio T - 1 Día
```gherkin
Given que la cuota de "Luis Navarro" vence mañana a las 23:59 UTC
  And el saldo pendiente actual es de $30.00 USD (equivalente a Bs. 1,800.00)
  And el estado de la cuota es "Por Vencer"
When el worker de notificaciones ejecuta el cron de las 09:00 AM
Then debe enviar una notificación push y correo electrónico a Luis
  And el mensaje debe incluir: "Mañana es tu fecha de corte. Tu saldo pendiente es de $30.00 (o Bs. 1,800.00)"
  And un botón de acción rápida que abre directamente el formulario de reporte de pago
```

### Escenario 2: Pausa de Alertas al Entrar en "Pendiente de Revisión"
```gherkin
Given que la cuota de un alumno se encuentra en el día de corte (Día T)
When el alumno reporta un comprobante de pago por el saldo total
Then el estado de la cuota debe cambiar inmediatamente a "Pendiente de Revisión"
  And el sistema debe suprimir el envío de recordatorios de mora posteriores mientras el coach no rechace el comprobante
```

### Escenario 3: Transición Automática a "Vencida / En Mora"
```gherkin
Given que la fecha de corte de la cuota ha expirado
  And el saldo pendiente sigue siendo mayor a $0.00 USD
  And no existen pagos en estado "Pendiente de Verificación"
When el sistema realiza el corte diario
Then el estado de la cuota debe transicionar a "Vencida / En Mora"
  And el alumno debe aparecer marcado con semáforo financiero rojo en el dashboard del entrenador
```

---

## 6. Casos Borde y Excepciones
- **Abono Parcial en Día T:** Si el alumno pagó el 50% de la cuota, la notificación de T+2 debe adaptarse dinámicamente indicando: *"Tu cuota se encuentra parcialmente vencida con un saldo remanente de $[X] USD"*.
- **Desactivación de Notificaciones por el Coach:** El entrenador puede marcar un cliente como *"Exento de recordatorios automáticos"* en caso de acuerdos personales fuera de plataforma.

---

## 7. Estado real de implementación

**Resuelto (verificado 2026-09-21):**

- Recordatorios T-5, T-1, Día T y T+2: colas BullMQ ([[ADR-008-motor-colas-background-workers-bullmq]]) con los 4 hitos agendados contra `fecha_corte_utc` al emitirse la cuota; los hitos ya vencidos se omiten (nunca se envía un mensaje con fechas incorrectas). El procesador reverifica el estado real en PostgreSQL antes de despachar, pausa si hay pago en revisión (Gherkin 2) y adapta el T+2 al caso de abono parcial (§6).
- Cancelación al liquidar: cuando el pago conciliado deja el saldo en $0.00 se eliminan los jobs futuros por `jobId`; es best-effort posterior al commit (un fallo de Redis no revierte el pago).
- Barrido diario repetible e idempotente (`upsertJobScheduler`, cron UTC 09:00 configurable por env) para todos los tenants: transiciona a `VENCIDA` cuando el corte ya pasó y a `POR_VENCER` dentro de la ventana de 5 días, sin degradar cuotas anuladas, saldadas ni pendientes de revisión.
- Migración `0007`: `ALTER TYPE enum_estado_cuota ADD VALUE 'por_vencer'` — el estado `Por Vencer` ya existe en la base real.
- Semáforo: `POR_VENCER` es preventivo (ámbar) y nunca cuenta como mora; la regla única de mora lo excluye y el dashboard lo mantiene fuera de "Alumnos en Mora".
- Recordatorio manual un clic (RF-009 RN-02): despacho inmediato con cooldown anti-spam, independiente del cronograma automático.

### Emisión automática y recordatorios a las 09:00 locales (2026-10-09, `ee23aef`)
- **Renovación resuelta:** el barrido diario emite primero la cuota de cada alumno activo con plan cuyo vencimiento está a 5 días o menos (y avanza su ciclo) y después evalúa los estados. Una cuota `VENCIDA` sigue con su saldo; la del periodo siguiente se emite aparte. Alumnos pausados, suspendidos o archivados no generan cuotas; al volver se emite solo la del ciclo en curso. Detalle en [[ADR-020-suscripcion-alumno-emision-automatica-cuotas]].
- **Hora local real (§4.B):** los hitos de las cuotas emitidas por suscripción salen a las 09:00 de la zona del alumno, también en días de cambio de horario. Si la cuota se emite el mismo día local de un hito cuya hora ya pasó (p. ej. el T-5 por la tarde), se envía de inmediato en vez de perderse.
- **Redis caído:** agendar o cancelar recordatorios espera como máximo 3 s por llamada; el barrido de estados ya no se congela.
- Evidencia: `rf008-wu-h-scheduler.spec.ts`, `rf005-rf009-m5l1-correcciones.spec.ts` (C1–C3, C8); API **1447** aprobados.

### Reposición de recordatorios y Redis caído (2026-10-10, `68457a6`)
- **Reposición diaria:** al final del barrido, `reconciliarRecordatorios` vuelve a agendar los hitos FUTUROS de las cuotas abiertas (BullMQ ignora los que ya existen, así que no duplica). No repone el hito del mismo día, para no repetir un aviso que quizá ya salió. Antes de empezar sondea la cola por si una emisión del mismo barrido la dejó en pausa.
- **Alumnos inactivos (decisión del dueño):** archivados, pausados o suspendidos no reciben recordatorios automáticos. Se excluyen en la reposición y se revalidan al enviar cada aviso (`alumno_inactivo`). Su deuda sigue en Control de Cobros.
- **Redis caído:** tras un tiempo agotado (3 s), la cola queda en pausa 60 s; el barrido espera una sola vez, no 3 s por alumno. La pausa se avisa una vez por ventana.
- **Aviso tardío:** si un aviso llega con más de 24 h de retraso respecto a su hora (un `add` que quedó encolado mientras Redis estaba caído), se descarta (`hito_obsoleto`).
- **Emisión manual retirada:** ya no existe la ruta que agendaba los hitos sin zona.
- Evidencia: `m5p1-reconciliar-recordatorios.spec.ts`, `m5p1-procesador-recordatorios.spec.ts`, `m5p1-scheduler-pausa-hitos.spec.ts`, `m5p1-barrido-recordatorios.spec.ts`; API **1491** aprobados (6 omitidos). Revisado con los 4 enfoques y validado.

**Límites aceptados:**

- La pausa es por proceso (sin coordinar réplicas) y puede dar falsos negativos si Redis solo estaba lento. Un hito del mismo día omitido en esa ventana no se repone.
- La reposición es lineal (hasta 4 `add` por cuota abierta y día); si la cartera crece, conviene acotarla o usar `addBulk`.
- Si el alumno cambia de zona horaria entre un aviso fallido y la reposición, ese aviso podría contarse como repuesto sin enviarse (teórico, ventana de horas).

**Nota técnica verificada — formato de `jobId`:**

El ADR-008 §3.1 documentaba `cuota:{cuotaId}:hito:{HITO}`, pero la implementación real usa `cuota_{cuotaId}_hito_{T_MINUS_5 | T_MINUS_1 | T_ZERO | T_PLUS_2}`. El porqué: BullMQ 5.x rechaza todo `jobId` personalizado que contenga `:` salvo que tenga exactamente 3 segmentos (`Custom Id cannot contain :`), verificado empíricamente contra el Redis real del proyecto. Con `_` el id sigue siendo determinista: deduplica re-emisiones y permite cancelar por id exacto.
