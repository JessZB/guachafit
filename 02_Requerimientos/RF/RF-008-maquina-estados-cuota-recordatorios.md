---
id: RF-008
modulo: Finanzas
prioridad: alta
estado: parcial
version_implementada: v1.0.0
fecha_verificacion: 2026-09-20
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

- Recordatorios T-5, T-1, Día T y T+2 inexistentes: cero crons de cobranza implementados.
- Corte diario y renovaciones automáticas ausentes.
- El estado `Por Vencer` no existe en la implementación.
- La máquina de estados solo vive en el simulador de tests, no opera en producción.
