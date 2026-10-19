---
id: RF-012
modulo: Clientes
prioridad: alta
estado: parcial
version_implementada: v1.0.0
fecha_verificacion: 2026-10-19
problema_origen: "[[PROB-003-acceso-onboarding-dashboard-central]]"
fecha_creacion: 2026-09-06
version: 1.0
tags:
  - requerimiento
  - rf
  - sdd
  - clientes
  - ciclo-de-vida
  - soft-delete
---

# RF-012: Ciclo de Vida del Alumno (Estados de Activación) y Preservación Soft Delete

## 1. Contexto y Justificación
Permite al entrenador modular el acceso de los alumnos según su situación física, económica o personal sin recurrir a la eliminación destructiva de datos. Implementa una máquina de estados de activación y una política estricta de borrado lógico (*Soft Delete*) que salvaguarda la integridad de las métricas fisiológicas y el historial contable.

- **Objetivo:** Controlar las transiciones entre `Activo`, `Inactivo / Pausado` y `Suspendido por Pago`, garantizando la retención perpetua de datos ante pausas o reactivaciones.
- **Valor aportado:** Flexibilidad operativa para pausar clientes por lesión o viaje, presión controlada sobre la morosidad y conservación del historial biométrico de años anteriores.
- **Trazabilidad:** Resuelve la pérdida de datos y falta de control de accesos de [[PROB-003-acceso-onboarding-dashboard-central]].

---

## 2. Actores Involucrados
- **Entrenador:** Modifica el estado del cliente desde su perfil o dashboard.
- **Sistema (Motor de Morosidad):** Puede sugerir o aplicar suspensión automática ante impago prolongado.
- **Alumno:** Experimenta los permisos de visualización o restricción según su estado vigente.

---

## 3. Precondiciones
1. El alumno debe existir en la base de datos del entrenador.

---

## 4. Reglas de Negocio (Business Rules)

### A. Máquina de Estados de Activación del Alumno
- **`Activo`:**
  - **Permisos del Alumno:** Acceso total a rutinas del día, checklist, reporte nutricional, check-in antropométrico y pagos.
  - **Impacto en Negocio:** Se contabiliza en los KPIs de capacidad operativa del coach y en las emisiones automáticas de cuotas mensuales.
- **`Inactivo / Pausado`:**
  - **Permisos del Alumno:** Modo solo lectura de su historial pasado (o acceso suspendido según configuración). No puede iniciar nuevas sesiones de entrenamiento ni enviar reportes.
  - **Impacto en Negocio:** Se excluye de los cronogramas automáticos de cobro y no genera recordatorios de pago mientras esté en pausa (ej. caso de lesión, intervención quirúrgica o viaje prolongado).
- **`Suspendido por Pago`:**
  - **Permisos del Alumno:** Bloqueo de visualización de nuevas rutinas y checklist interactivo. La app presenta una pantalla de bloqueo informativo: *"Tu acceso a la planificación se encuentra pausado por mensualidad pendiente"*, con botón directo para reportar el pago.
  - **Impacto en Negocio:** Permanece visible y activo en el Tablero de Control de Cartera y listas de morosidad.

### B. Política de Integridad de Datos (Soft Delete Estricto)
- **RN-01 (Prohibición de Borrado Físico):** Queda terminantemente prohibido ejecutar sentencias `DELETE` sobre las tablas de `usuarios`, `alumnos`, `controles_antropometricos`, `sesiones_entrenamiento` y `transacciones_pago`.
- **RN-02 (Campo `deleted_at`):** Si el entrenador decide "dar de baja" a un alumno, el sistema sella un timestamp `deleted_at = now_utc()`. El cliente desaparece de las listas activas pero su información se conserva intacta en base de datos.
- **RN-03 (Reactivación Transparente):** Si un alumno inactivo o dado de baja regresa meses después, el coach puede reactivarlo con un solo clic: el sistema limpia el estado y el alumno recupera inmediatamente todo su histórico de peso, gráficos corporales y marcas de fuerza previas.
- **RN-04 (Endpoint de Restauración de Bajas Lógicas):** El backend expone `PATCH /alumnos/:id/restaurar`. Esta operación es idempotente:
  1. Verifica que el alumno pertenezca a la cartera del entrenador (aislamiento Tenancy `ADR-009`).
  2. Limpia `deleted_at_utc = NULL`.
  3. Establece `estadoActivacion = 'activo'`.
  4. Reactiva la cuenta de usuario vinculada (`usuarios.activo = true`).
  5. Emite `AlumnoRestauradoEvent`.
- **RN-05 (Consulta y Pestaña de Archivados):** El listado general soporta el filtro `?incluirArchivados=true` para permitir al coach auditar a clientes dados de baja en una pestaña dedicada `[Archivados]` con botón directo de restauración.

---

## 5. Criterios de Aceptación (Given-When-Then / Gherkin)

### Escenario 1: Pausa Temporal de Alumno por Lesión
```gherkin
Given que el alumno "Roberto Diaz" sufre un esguince y solicita pausar su plan por 30 días
When el entrenador accede al perfil de Roberto y selecciona estado "Inactivo / Pausado"
Then el sistema debe actualizar el estado a "Pausado"
  And excluir a Roberto del KPI de alumnos activos
  And suspender la generación de cuotas automáticas durante el periodo de pausa
  And permitir a Roberto consultar sus métricas anteriores en modo lectura
```

### Escenario 2: Bloqueo de Rutinas por Suspensión de Pago
```gherkin
Given que la cuota de un alumno supera los días de gracia permitidos
When el estado del alumno transiciona a "Suspendido por Pago"
  And el alumno abre la app móvil para entrenar
Then el sistema debe bloquear el checklist del día
  And mostrar un aviso: "Acceso a planificación temporalmente suspendido por cuota pendiente"
  And presentar un botón directo: "Reportar Pago Pendiente"
```

### Escenario 3: Reactivación sin Pérdida Histórica
```gherkin
Given que una alumna "Valeria Silva" estuvo en estado "Inactivo" durante 4 meses
When el entrenador pulsa "Reactivar Alumno" y asigna una nueva cuota
Then el estado debe cambiar a "Activo"
  And la alumna debe poder ver sus gráficos evolutivos con los datos tomados antes de su retiro
  And no debe haberse perdido ningún registro antropométrico ni comprobante anterior
```

### Escenario 4: Restauración de Alumno Dado de Baja (Soft Delete)
```gherkin
Given que el alumno "Fernando Castro" fue dado de baja lógica hace 6 meses (deleted_at_utc sellado)
When el entrenador filtra por "Archivados" y pulsa "Restaurar Alumno"
Then el sistema debe ejecutar PATCH /alumnos/:id/restaurar
  And limpiar deleted_at_utc a NULL
  And cambiar su estado de activación a "Activo"
  And reincorporar a Fernando en la lista activa con todas sus sesiones históricas y pagos intactos
```

---

## 6. Casos Borde y Excepciones
- **Transición Manual vs Automática:** El entrenador siempre tiene potestad de anular un bloqueo automático por pago si acuerda una prórroga de palabra con el alumno, manteniendo su estatus en `Activo` mediante una bandera de excepción temporal.
- **Intento de Restaurar Alumno No Dado de Baja:** Si se invoca la restauración sobre un alumno que no está en baja lógica (`deleted_at_utc IS NULL`), el sistema responde exitosamente de forma idempotente confirmando que el alumno ya está activo.

---

## 7. Estado real de implementación

- Estados de activación, baja lógica y restauración implementados (cobertura de tests parcial).
- Resuelto (2026-09-21): enforcement de acceso por estado implementado (`AlumnoHabilitadoGuard` + `@BloquearAlumnoEn`): la planificación responde 403 `ALUMNO_BLOQUEADO`, la app muestra la pantalla de bloqueo con acción "Reportar pago" y el coach puede suspender por pago.
- Resuelto (2026-09-21): el soft delete revoca login y refresh de la cuenta vinculada (`auth.service`).
- Siguen pendientes: motor automático de morosidad (crons) y las reglas finas de transición manual vs automática (§6).
- Implementado (2026-10-04, LOTE API-1 `5bd50df`): un alumno con baja lógica (archivado, RN-02) que intenta entrar o renovar su sesión recibe un mensaje propio y claro: *"Tu cuenta está archivada. Contacta a tu entrenador."* (401), distinto del de cuenta desactivada (*"Tu cuenta está desactivada. Contacta a tu entrenador."*). En el login, el estado solo se informa si la contraseña es correcta (no revela que la cuenta existe). Evidencia: API 867 tras API-1.
- Implementado (2026-10-19, lote "Mis alumnos" `26917bb`), RN-05:
  - El directorio arranca en el chip **"Vigentes"**, que no incluye archivados. Antes, "Todos" mezclaba las bajas con los alumnos vigentes.
  - Los archivados se consultan en su propio chip **"Archivados N"** (`soloArchivados=true`), con el botón Restaurar.
  - Si se pulsa otra vez el chip activo, la lista vuelve a "Vigentes".
  - La tarjeta y la tabla muestran el estado de activación con texto: Activo, Pausado o Archivado.
