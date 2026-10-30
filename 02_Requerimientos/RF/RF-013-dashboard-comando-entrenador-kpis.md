---
id: RF-013
modulo: Dashboard
prioridad: alta
estado: aprobado
estado_implementacion: parcial
problema_origen: "[[PROB-003-acceso-onboarding-dashboard-central]]"
fecha_creacion: 2026-09-06
version: 1.0
tags:
  - requerimiento
  - rf
  - sdd
  - dashboard
  - kpis
  - comando
  - crm
---

# RF-013: Dashboard de Comando del Entrenador y Métricas de Capacidad

## 1. Contexto y Justificación
Actúa como la pantalla principal de bienvenida para el entrenador al iniciar su sesión diaria. Centraliza la visión macroeconómica y operativa de su negocio, unificando la capacidad de atención de alumnos, la recaudación del mes, la alerta de comprobantes por validar y el control de mora en una única interfaz sin fricciones.

- **Objetivo:** Ofrecer una cabecera ejecutiva con 4 KPIs macro y tres pestañas operativas de acción inmediata para gestionar cobros, conciliaciones y fichas médicas.
- **Valor aportado:** Eliminación de la ceguera operativa, priorización instantánea de tareas al comenzar el día y seguimiento de la rentabilidad del tiempo del coach.
- **Trazabilidad:** Resuelve la dispersión de datos y falta de cuadro de mando de [[PROB-003-acceso-onboarding-dashboard-central]].

---

## 2. Actores Involucrados
- **Entrenador:** Consulta su panel de inicio al autenticarse y ejecuta acciones desde las tres pestañas operativas.

---

## 3. Precondiciones
1. El entrenador debe tener una cuenta activa y haber configurado su `capacidad_maxima` deseada de alumnos (opcional, por defecto 50).

---

## 4. Reglas de Negocio (Business Rules)

### A. Bloque Superior de KPIs Principales (Tarjetas Ejecutivas)
- **KPI-01 (Alumnos Activos vs. Capacidad Máxima):**
  - Muestra la relación: `[Total Alumnos en Estado Activo] / [Capacidad Máxima Deseada]`.
  - Muestra un porcentaje de ocupación (ej. *38 / 50 alumnos - 76% de capacidad*).
  - Si la ocupación supera el 90%, el indicador alerta visualmente en color ámbar para prevenir saturación de la calidad del servicio.
- **KPI-02 (Ingresos del Mes):**
  - Muestra el total recaudado neto durante el mes calendario en curso.
  - Presenta la cifra en **USD** (moneda maestra) y su equivalente consolidado en **Bolívares (VES)** a la tasa vigente del coach.
- **KPI-03 (Pagos por Validar):**
  - Conteo en tiempo real de transacciones en estado `Pendiente de Verificación`.
  - Si el contador es $> 0$, muestra un badge numérico rojo pulsante para requerir atención inmediata.
- **KPI-04 (Clientes en Mora / Debiendo):**
  - Conteo consolidado de clientes con cuotas en estado `Vencida / En Mora` o con abonos parciales no finiquitados tras la fecha de corte.

### B. Bloque Operativo Inferior (3 Pestañas de Acción Rápida)
- **Pestaña 1: Morosidad y Vencimientos:**
  - Lista segmentada con semáforo visual:
    - 🔴 **En Mora:** Fecha de corte superada.
    - 🟡 **Por Vencer:** Vencimiento en $\le 5$ días.
    - 🟢 **Al Día:** Cuota cubierta.
  - Columnas: Nombre del alumno, días de atraso/vencimiento, Saldo en USD y Saldo en Bs.
  - Botones de acción en la fila: *"Registrar Cobro en Efectivo"* y *"Enviar Recordatorio"*.
- **Pestaña 2: Conciliación de Pagos:**
  - Acceso directo a la cola FIFO de comprobantes bancarios cargados por los alumnos.
  - Vista previa de miniatura con botones rápidos de *"Aprobar"* y *"Rechazar"*.
- **Pestaña 3: Alumnos Recientes y Fichas de Salud:**
  - Lista de los últimos alumnos incorporados o atendidos recientemente.
  - Muestra: Nombre, edad calculada, estado de activación y **botón directo para leer la Ficha de Salud / Notas Privadas** antes de iniciar su sesión física.

---

## 5. Criterios de Aceptación (Given-When-Then / Gherkin)

### Escenario 1: Carga Exitosa de KPIs al Iniciar Sesión el Entrenador
```gherkin
Given que el entrenador tiene 42 alumnos activos de una capacidad de 50
  And ha recaudado $1,250.00 USD en el mes
  And existen 3 comprobantes bancarios subidos por alumnos sin verificar
  And 4 alumnos se encuentran en mora
When el entrenador inicia sesión y carga el dashboard principal
Then el sistema debe renderizar las tarjetas superiores con:
  | KPI                | Valor Visible                        |
  | Alumnos Activos    | "42 / 50 (84%)"                      |
  | Ingresos del Mes   | "$1,250.00 USD (Bs. 75,000.00)"      |
  | Pagos por Validar  | Badge con número "3"                 |
  | Clientes en Mora   | "4 alumnos"                          |
```

### Escenario 2: Consulta Rápida de Ficha de Salud desde la Pestaña de Alumnos Recientes
```gherkin
Given que el entrenador está por entrenar al alumno "Gabriel Ramos"
When hace clic en la pestaña "Alumnos Recientes" del dashboard
  And presiona el icono de ficha médica en la fila de Gabriel
Then el sistema debe desplegar un panel lateral con sus notas confidenciales:
  "Operación de menisco derecho en 2024. Calentar articulación con banda elástica previa."
  And la edad calculada del alumno
```

### Escenario 3: Acceso Directo a Conciliación sin Salir del Dashboard
```gherkin
Given que el KPI "Pagos por Validar" muestra "2 comprobantes"
When el entrenador selecciona la pestaña "Conciliación de Pagos"
Then debe ver la lista de comprobantes con sus datos bancarios
When pulsa "Aprobar" en el pago de $25.00 de Maria Lopez
Then el contador del KPI debe actualizarse de "2" a "1" instantáneamente sin recargar la página
  And los ingresos del mes deben incrementarse en +$25.00 USD
```

---

## 6. Casos Borde y Excepciones
- **Entrenador Nuevo sin Alumnos:** Si un coach recién creado ingresa al dashboard por primera vez, el sistema renderiza un estado vacío amigable (*empty state*) invitándolo a: *"1. Comparte tu link único de registro: app.guachafit.com/registro?coach_code=XYZ"* o *"2. Registra tu primer alumno manualmente"*.

---

## 7. Estado real de implementación

- KPIs base no financieros implementados y reales, con UX honesta.
- Falta la alerta visual de ocupación > 90 % (KPI-01).
- Las tres pestañas operativas (morosidad, conciliación, alumnos recientes) no existen.
- Sin empty state para el entrenador nuevo.
- Resuelto (2026-09-21): la meta de cobranza ya no se inventa; sin cuotas emitidas del periodo la API devuelve `null` y la UI muestra "Sin meta de cobranza configurada" (sin porcentaje).
- Resuelto (2026-09-21): el KPI financiero de ingresos del mes ya no suma el histórico; se delimita al mes UTC en curso (pagos aprobados por fecha efectiva de cobro, mismo criterio que [[RF-009-tablero-control-cartera-morosidad]]).

### Carga honesta del Dashboard (`57606e8`, 2026-10-30, lote UX-11)
- Mientras carga, la página muestra `EstadoCarga` ("Cargando el resumen") sin cifras ni listas. Las tarjetas de bandeja no pintan contador (`conteo: null`): ya no aparecen `0 pendientes` ni `0 por validar` falsos. Un cero real sí se muestra.
- Si falla la carga con conexión, `EstadoError` ("No pudimos cargar el resumen") con "Reintentar". Sin conexión y sin datos, `AvisoDatosOffline` en su variante "sin-datos"; con datos cargados y sin conexión, el aviso de frescura "Sin conexión · datos guardados". Los enlaces "Revisar pagos" y "Revisar evaluaciones" siguen visibles en todos los estados.
- Se elimina el badge fijo "Operación Activa". Modo demo sin estado de carga ni llamadas al API.
- La página pasa de 385 a 163 líneas: `KpisMacroDashboard`, `BandejaRapidaCard` y `ListasAlertaTemprana` viven en `components/entrenador/dashboard/`. Los enlaces de acción tienen área táctil de 44px (§6.8).
- Evidencia: web **2735/2735**; typecheck y build en verde. Revisión de fiabilidad: su BLOCKER (`setDashboard(null)` borra datos en una recarga fallida) no era alcanzable, porque `cargarDashboard` solo se llama al montar y desde "Reintentar", que existe únicamente sin datos, y la línea ya estaba así en `HEAD`; se pasó a seguimiento.
- Pendiente (UX-12): el efecto no tiene limpieza (una respuesta tardía puede pisar el estado si cambia `isDemoMode` o se desmonta); `setDashboard(null)` en el `catch` debe conservar los datos si se añade una recarga; no hay recarga automática al volver la conexión. El spec no cubre los casos borde de los componentes extraídos (adherencia nula, sin meta, más de 5 filas con "Ver todos", listas vacías).
