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

### Cobro en sala con fecha anterior (2026-10-12, `cea825b`)
- El modal de cobro de Control de Cobros y de la ficha pide "Fecha de la operación" (hoy por defecto y como máximo) y, en bolívares, muestra la tasa con la que se convertirá. La API rechaza fechas futuras. Reglas completas en [[RF-007-reporte-pagos-bandeja-conciliacion]] ("Pagos con fecha anterior").

### Cartera con estados honestos (`d777772`, 2026-10-29, lote UX-05)
- Mientras carga, la cartera muestra el esqueleto de los cuatro KPI y de las filas, sin cifras falsas.
- El aviso "Sin tasa de cambio configurada" solo aparece con el resumen ya cargado y en las pestañas con bolívares ("En Mora" y "Próximos a Vencer"). Antes aparecía a todos durante la carga.
- Error sin datos: bloque de error con "Reintentar", sin KPI viejos. Sin conexión: "Sin conexión y sin datos guardados".
- Recarga fallida con datos (por ejemplo, tras un cobro): la tabla, los KPI y las pestañas se conservan, con el aviso "No se pudo actualizar la cartera. Los datos mostrados pueden estar desactualizados." Sin conexión, en su lugar se ve el aviso de datos guardados.
- Evidencia: web **2561/2561**; typecheck y build en verde.

### Control de Cobros en el móvil y próximo vencimiento (`d1f90b4`, 2026-10-29, lote UX-07b)
- **Acciones por alumno (decisión D3 del dueño):**
  - **en el móvil** se ve solo la acción principal: "Registrar cobro" si hay saldo, "Recordatorio" si no, "Ver ficha" en "Al día" y "Revisar en bandeja" en revisión. El resto queda en el menú "Más acciones", que no aparece si no tendría ninguna opción utilizable;
  - **en la tabla de escritorio** siguen las tres acciones, de 36px desde 768px;
  - todos los botones miden 44px en el móvil y llevan el nombre del alumno en su nombre accesible, empezando por el texto visible ("Registrar cobro de X", "Recordatorio para X", "Ver ficha de X", "Revisar en bandeja el pago de X").
- **Pestañas:** control segmentado de 4 columnas con etiquetas cortas (Mora, Por vencer, Revisión, Al día) y su contador visible. El lector de pantalla oye "En mora, 3". Mientras carga el resumen no se muestra ningún contador (antes salía "0").
- **Buscador:** muestra "3 registros · En mora" (antes "Mostrando 3 de 3 registros en En Mora"), anunciado con `aria-live`. El campo mide 44px, con 16px en el móvil.
- **Filas:** el nombre del alumno ocupa hasta dos líneas en la tarjeta y los badges usan `ui/BadgeEstado`, sin partirse.
- **Próximo vencimiento (lote web P2 del módulo 5):** la pestaña "Al día" muestra "Próximo vencimiento" con la fecha de `proximoCorte`, en tabla y tarjeta. Sin dato, "Sin próximo corte".
- "Bandeja de validación" y el KPI "Pagos por Validar" tienen foco visible.
- Evidencia: web **2621/2621**; typecheck y build en verde. Hubo revisión 4R (diff de más de 400 líneas): 1 BLOCKER (un spec mal escrito) y 5 WARNING del lote, corregidos y validados.

### Pendiente
- Los KPI "Total en Mora" y "Próximos a Vencer" no llevan a su pestaña: `useCartera` lee `?pestana=` solo al montar. Necesita escuchar los cambios de la URL o recibir una función que cambie de pestaña.
- PagosPage del alumno sigue pendiente del módulo 5; conciliación (confirmación y reversión) resuelta el 2026-10-11 y anulación de cuotas en la API el 2026-10-12 (`7f46acc`, falta la web; ver [[RF-008-maquina-estados-cuota-recordatorios]]). Las cuotas anuladas no cuentan como mora ni en la meta del dashboard. Saldo a favor: resuelto el 2026-10-11 en la API (`afd3f7c`) y en la web (`b975905`: "A favor: X USD" en la tabla y la ficha; aviso del excedente al aprobar y tras cobrar en sala), ver [[RF-006-motor-bimonetario-liquidacion-abonos]].
