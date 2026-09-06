---
id: RF-009
modulo: Finanzas
prioridad: alta
estado: aprobado
problema_origen: "[[PROB-002-cobranza-bimonetaria-fraccionada]]"
fecha_creacion: 2026-09-06
version: 1.0
tags:
  - requerimiento
  - rf
  - sdd
  - finanzas
  - crm
  - morosidad
  - cartera
---

# RF-009: Tablero de Control de Cartera, KPIs Financieros y Gestión de Morosidad

## 1. Contexto y Justificación
Proporciona al entrenador un panel de control tipo CRM financiero centralizado. Elimina la necesidad de auditar chats individuales o libretas de notas para conocer el estado de cobro, reuniendo en una sola pantalla los indicadores macro de flujo de caja y una tabla segmentada con acciones operativas inmediatas.

- **Objetivo:** Ofrecer visibilidad consolidada de la recaudación mensual, deuda activa y clientes en riesgo, facilitando acciones de cobranza y registro manual en 1 solo clic.
- **Valor aportado:** Reducción drástica del estrés administrativo, control del flujo de caja en tiempo real y erradicación de cobros olvidados.
- **Trazabilidad:** Resuelve la dispersión de información y ceguera de cartera identificada en [[PROB-002-cobranza-bimonetaria-fraccionada]].

---

## 2. Actores Involucrados
- **Entrenador:** Consulta métricas consolidadas, filtra alumnos por estatus financiero, dispara recordatorios manuales y registra cobros en efectivo en el acto.

---

## 3. Precondiciones
1. El entrenador debe estar autenticado en su panel de administración.
2. Deben existir cuotas emitidas asociadas a sus alumnos para el ciclo en curso.

---

## 4. Reglas de Negocio (Business Rules)

### A. Indicadores Clave Superiores (KPIs en Tiempo Real)
El tablero calcula y presenta en la cabecera cuatro métricas agregadas del mes corriente:
- **KPI-01 (Total Recaudado en el Mes):** Sumatoria de todos los abonos aprobados durante el mes calendario, mostrando el total consolidado en USD y su desglose por moneda original recaudada (ej. `$1,450.00 USD` | `Bs. 35,400.00 VES`).
- **KPI-02 (Total en Mora / Deuda Activa):** Sumatoria de todos los saldos pendientes de cuotas con fecha de corte superada o pagos parciales incompletos.
- **KPI-03 (Clientes Próximos a Vencer):** Conteo total de alumnos cuya cuota vence en una ventana crítica de $\le 5$ días y no han completado el 100% de su pago.
- **KPI-04 (Pagos por Validar):** Badge numérico de comprobantes en estado `Pendiente de Verificación` que requieren atención en la bandeja de conciliación.

### B. Tabla Segmentada y Filtros de Cartera
La vista de detalle organiza a los alumnos mediante pestañas de filtro rápido:

| Pestaña / Estado | Criterio de Selección | Información Visible en Fila | Acciones Rápidas (Botones Directos) |
| :--- | :--- | :--- | :--- |
| **`En Mora / Debiendo`** | $\text{now\_utc} > \text{fecha\_corte}$ y saldo pendiente $> 0$ | Días de atraso, Saldo en USD, Saldo calculado en Bs. a tasa vigente | 1. *Enviar Recordatorio Manual* (WhatsApp/Push/Email)<br>2. *Registrar Cobro en Efectivo* |
| **`Próximo a Vencer`** | Días restantes para corte $\le 5$ y saldo $> 0$ | Fecha exacta de vencimiento, Monto pendiente (USD y Bs.) | 1. *Anticipar Recordatorio*<br>2. *Ver Historial de Pagos* |
| **`Pendiente de Revisión`** | Existe al menos un pago en verificación | Referencia bancaria, Método, Monto reportado, Miniatura de captura | 1. *Aprobar Pago* (Verifica y actualiza saldo)<br>2. *Rechazar Pago* (Con motivo) |
| **`Al Día`** | Cuota cubierta al 100% en el ciclo actual | Nombre del plan, Próxima fecha de facturación | 1. *Ver Perfil Financiero* |

### C. Acciones Rápidas de Cobranza Directa
- **RN-01 (Registro Directo de Efectivo):** Desde la misma fila del alumno en mora o próximo a vencer, el coach puede presionar *"Cobrar en Efectivo"* (USD o Bs.), lo que genera una `TransaccionPago` aprobada instantáneamente sin requerir que el alumno suba comprobante digital.
- **RN-02 (Recordatorio Manual Un-Clic):** Al pulsar *"Enviar Recordatorio"*, el sistema abre un modal con texto preformateado que incluye: saldo pendiente en USD, saldo en Bs. a la tasa de hoy y datos bancarios del coach, permitiendo enviarlo por notificación push, email o abrir WhatsApp Web con el mensaje listo.

---

## 5. Criterios de Aceptación (Given-When-Then / Gherkin)

### Escenario 1: Visualización de KPIs Financieros del Mes
```gherkin
Given que el entrenador accede a la sección "Control de Cartera"
When carga la vista principal
Then el sistema debe calcular y renderizar en las tarjetas superiores:
  | KPI                      | Valor Esperado                                 |
  | Total Recaudado          | Suma de pagos aprobados en USD del mes         |
  | Total en Mora            | Suma de saldos pendientes vencidos en USD      |
  | Próximos a Vencer        | Número de alumnos con corte en los próximos 5 días |
  | Pagos por Validar        | Cantidad de comprobantes pendientes de revisión|
```

### Escenario 2: Filtrado por Alumnos en Mora y Envío de Recordatorio
```gherkin
Given que el entrenador selecciona la pestaña "En Mora / Debiendo"
When visualiza la lista de alumnos morosos
Then la tabla debe ordenar a los clientes por días de atraso descendente
  And mostrar para cada fila los días de mora y el saldo pendiente en USD y Bs.
When pulsa el botón de acción rápida "Enviar Recordatorio" en la fila de "Juan Perez"
Then el sistema debe generar el mensaje personalizado con el saldo exacto de Juan a la tasa de hoy
  And ofrecer la opción de disparo vía Notificación Push / Email o copia para WhatsApp
```

### Escenario 3: Registro Inmediato de Cobro en Efectivo por el Coach
```gherkin
Given que el alumno "Carlos Mendoza" adeuda $30.00 USD y le entrega al entrenador $30.00 USD en efectivo en el gimnasio
When el entrenador presiona "Registrar Cobro en Efectivo" en la fila de Carlos
  And confirma monto "$30.00", moneda "USD" y método "Efectivo"
Then el sistema debe crear una transacción con estado "Aprobado"
  And registrar "registrado_por: ID_ENTRENADOR"
  And actualizar inmediatamente el saldo pendiente de Carlos a $0.00 USD
  And mover automáticamente la fila de Carlos de "En Mora" a la pestaña "Al Día"
```

---

## 6. Casos Borde y Excepciones
- **Cambio de Tasa Cambiaria en Vivo:** Si la tasa global cambia mientras el entrenador tiene abierta la tabla de mora, una actualización reactiva en el frontend debe recalcular las columnas de *"Saldo en Bs."* sin necesidad de recargar toda la página.
- **Concurrencia en Aprobación de Pagos:** Si un pago pendiente es aprobado desde la bandeja de conciliación y simultáneamente el coach intenta registrar un cobro en efectivo sobre la misma cuota, la transacción de base de datos debe validar el saldo restante para evitar cobros dobles o saldos negativos accidentales.
