---
id: RF-012
modulo: Clientes
prioridad: alta
estado: implementado
version_implementada: v1.0.0
fecha_verificacion: 2026-09-06
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

---

## 6. Casos Borde y Excepciones
- **Transición Manual vs Automática:** El entrenador siempre tiene potestad de anular un bloqueo automático por pago si acuerda una prórroga de palabra con el alumno, manteniendo su estatus en `Activo` mediante una bandera de excepción temporal.
