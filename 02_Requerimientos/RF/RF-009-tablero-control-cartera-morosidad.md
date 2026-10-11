---
id: RF-009
modulo: Finanzas
prioridad: alta
estado: aprobado
estado_implementacion: parcial
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

---

## 7. Estado real de implementación

**Implementado (verificado 2026-09-21):**

- Endpoint `GET /finanzas/cartera` (rol Entrenador; `entrenadorId` sale del token): KPIs del mes + lista paginada de la pestaña activa (`mora` | `por_vencer` | `revision` | `al_dia`), búsqueda server-side por nombre y aislamiento de tenant en todas las consultas.
- KPIs con sumas reales de PostgreSQL (calculados sobre la cartera completa, nunca sobre la página cargada): recaudado del mes UTC en curso, total y alumnos en mora, total y próximos a vencer, y pagos por validar.
- Orden por urgencia: `MIN(fecha_corte_utc)` ascendente — días de atraso descendente en "En Mora" y vencimiento más próximo en "Próximos a Vencer" — con desempate por `cliente_id` para paginación estable.
- Página **"Control de Cobros"** (`apps/web/src/pages/entrenador/CarteraPage.tsx`) con las 4 pestañas con contadores, búsqueda, paginación y estados vacíos honestos por pestaña.
- RN-01 (Registro Directo de Efectivo): modal por fila (monto, moneda USD/Bs., fecha) que dispara el cobro directo auto-aprobado y recarga el saldo al confirmar.
- RN-02 (Recordatorio Manual Un-Clic): despacho por notificaciones (categoría FINANZAS, in-app garantizada) con el saldo exacto en USD y proyección en Bs. a tasa real; cooldown anti-spam de 6 h entre recordatorios manuales (no afecta a los automáticos de RF-008), pausa si hay pago en revisión y motivo honesto si no hay saldo; copia del texto y enlace a WhatsApp.
- KPI-01 del dashboard ([[RF-013-dashboard-comando-entrenador-kpis]]): corregido — se delimita al mes UTC en curso con `fecha_conciliacion_utc` (fallback `fecha_reporte_utc`) y cast explícito `::timestamptz` en los límites, que evita el fallo real del driver al enviar `Date` dentro de SQL crudo.

**Matices honestos (verificados):**

- **Unidades mezcladas en los contadores:** "En Mora" y "Próximos a Vencer" cuentan ALUMNOS (`count(distinct cliente_id)`), "Pendiente de Revisión" cuenta PAGOS y "Al Día" cuenta CUOTAS del periodo. No son magnitudes sumables entre sí, y el contador de "Al Día" puede repetir alumno si tiene dos planes cubiertos.
- **Pestaña "Próximos a Vencer" y mensaje manual:** esa pestaña ofrece Recordatorio / Registrar cobro / Ver ficha, pero NO "Ver Historial de Pagos" (§4.B lo lista). Además, el mensaje manual no incluye los datos bancarios del coach porque no están persistidos en el modelo; el compositor no los inventa (queda pendiente el modelo de datos).
- La "Próxima fecha de facturación" de la tabla §4.B no existe como dato persistido: la columna muestra el corte real del ciclo ya cubierto, sin inventar una fecha futura. (Desde `ee23aef` el dato existe en `perfiles_alumno.proximo_corte`; falta mostrarlo.)

### Cobro en sala con la suscripción (2026-10-09, `ee23aef`)
- `POST /finanzas/clientes/:clienteId/cobro-directo-inteligente` cobra la **cuota abierta más antigua**; sin cuota abierta, **adelanta la próxima** de la suscripción. Sin plan asignado → 400 *"Este alumno no tiene un plan asignado. Asígnale un plan en su ficha para registrar el cobro."* (ya no inventa una cuota con el override).
- Solo efectivo, validado antes de emitir nada; alumno archivado → 404; la fila del alumno se bloquea frente al barrido; un choque de cuota → 409.
- Header `x-idempotency-key`: un doble clic con la misma clave devuelve el mismo cobro.
- Evidencia: `rf005-rf009-m5l1-correcciones.spec.ts` (C6, C7), `rf011-rf012-alumnos-edge-cases.spec.ts`.

### Cobro en sala en la web (2026-10-10, `e0747e2`)
- **Ficha y Control de Cobros:** el cobro es solo en efectivo (el método sale de la moneda; se retiraron Pago Móvil, Zelle, transferencia y el campo de referencia) y lleva la fecha del día LOCAL (antes, de noche en Caracas salía el día siguiente).
- **Doble cobro:** cada alumno tiene una clave de idempotencia que se conserva hasta un cobro confirmado. Un reintento, o cerrar y reabrir el modal tras una respuesta perdida, no cobra dos veces.
- **Alumno sin plan:** se muestra el mensaje con "Asignar plan" (en la ficha lleva a la pestaña resumen con el foco en el selector; en Control de Cobros es un enlace a la ficha).
- **Modo demo:** el cobro de la ficha ya no llama al API.
- Evidencia: `apps/web/src/lib/cobro-sala.spec.ts`, `pages/entrenador/AlumnoDetallePage.cobro-sala.interaccion.spec.tsx`, `CarteraPage.cobro.interaccion.spec.tsx`, `CarteraPage.correcciones-1b.interaccion.spec.tsx`; web **1207**.

### Cartera y cobro en sala (2026-10-10, `68457a6`)
- La API de cartera envía `proximoCorte` (próximo vencimiento de la suscripción, o `null` sin plan) en las 4 pestañas. Las uniones con el perfil exigen además el mismo entrenador (defensa en profundidad, RNF-003).
- El cobro en sala y el historial usan la búsqueda única del alumno: otro coach o un alumno inexistente → 404 "Este alumno no está en tu lista." (antes 403). El coach sí ve el historial de un alumno archivado.

### Pendiente
- **Próximo vencimiento en Control de Cobros:** la API ya lo envía; falta mostrarlo en la tabla (lote web P2).
- PagosPage del alumno, conciliación (confirmación y reversión), saldo a favor y anulación de cuotas siguen pendientes del módulo 5.
