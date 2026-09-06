---
id: ADR-001
titulo: "ADR-001: Modelo Híbrido de Auditoría Antropométrica (Presencial vs. Remoto) y Máquina de Estados RBAC"
fecha: 2026-09-05
estado: aceptado
decisores:
  - "Arquitecto de Software"
  - "Equipo de Ingeniería"
tags:
  - decision
  - adr
  - arquitectura
  - seguridad
  - rbac
---

# ADR-001: Modelo Híbrido de Auditoría Antropométrica (Presencial vs. Remoto) y Máquina de Estados RBAC

## 1. Estado
`aceptado`

---

## 2. Contexto y Fuerzas en Juego
La plataforma **GUACHAFIT** opera bajo un modelo de entrenamiento híbrido donde conviven alumnos presenciales (atienden al gimnasio o box) y alumnos 100% online/remotos.

### Fuerzas en Conflicto
1. **Integridad y Veracidad de Datos vs. Flexibilidad Remota:** Las medidas antropométricas y de % de grasa fundamentan la toma de decisiones del entrenador. Si cualquier usuario puede modificar sus métricas sin restricción, se abre la puerta a sesgos cognitivos, fraude o mediciones erróneas con cinta métrica.
2. **Fricción Operativa del Entrenador:** Obligar al entrenador a transcribir manualmente los datos de alumnos remotos por chat colapsa su tiempo operativo.
3. **Seguridad y Auditoría:** Es imperativo conocer con certeza jurídica y técnica quién fue el autor de cada número registrado en la base de datos y bajo qué condiciones.

### Opciones Consideradas
1. **Opción A (Escritura Libre Global):** Cualquier usuario (entrenador o alumno) puede editar el historial antropométrico en cualquier momento.
   - *Descartada:* Genera pérdida total de rigor técnico y desconfianza en el historial de progreso.
2. **Opción B (Escritura Exclusiva del Entrenador):** Solo el entrenador tiene permisos de mutación sobre la entidad de antropometría.
   - *Descartada:* Inviable para el modelo de negocio online, ya que los clientes remotos no asisten físicamente al gimnasio.
3. **Opción C (RBAC Diferenciado por Modalidad + Máquina de Estados con Aprobación):** 
   - Presencial: Cliente en modo `Read-only`; Entrenador captura medidas en consulta directa (`Presencial Verificado`).
   - Remoto: Cliente en modo `Read-write` condicional a la ventana de check-in; el registro nace como `Pendiente de Aprobación` y requiere validación del entrenador antes de consolidarse en las gráficas oficiales.

---

## 3. Decisión
Elegimos la **Opción C**. 

Implementaremos una política estricta de control de acceso basada en roles (RBAC) a nivel de API y una máquina de estados para los registros antropométricos:

```
[Modalidad: Presencial] ──> Coach registra ──> [Estado: Aprobado / Verificado]
                                                         │
[Modalidad: Remoto]     ──> Alumno envía   ──> [Estado: Pendiente Aprobación]
                                                         │
                                               Coach revisa fotos/datos
                                                    ├── Aprobar ──> [Estado: Aprobado]
                                                    └── Rechazar ─> [Estado: Rechazado/Corrección]
```

### Detalles Técnicos de Implementación
- El backend verificará en middleware el campo `modalidad` del alumno antes de admitir mutaciones `POST/PUT /api/v1/antropometria`.
- Todo registro incluirá los metadatos inmutables: `registrado_por (UUID)`, `origen (Enum)` y `timestamp_utc`.
- Las consultas del dashboard analítico de evolución corporal (gráficos y comparadores) filtrarán estrictamente por `estado == 'Aprobado'`.

---

## 4. Consecuencias y Trade-offs

### Consecuencias Positivas (Beneficios)
- **Trazabilidad Absoluta:** Garantía técnica sobre qué datos fueron tomados con rigor profesional y cuáles son autoreportados.
- **Blindaje del Negocio Presencial:** Los clientes presenciales no pueden falsear medidas tomadas en el gimnasio.
- **Escalabilidad del Modelo Online:** Los clientes remotos se autogestionan, y el coach solo actúa como validador (reducción de carga operativa del 80%).

### Consecuencias Negativas (Trade-offs)
- **Complejidad en Backend:** Requiere lógica condicional en la capa de autorización y soporte para notificaciones de cambio de estado.
- **Latencia de Visualización para el Alumno Remoto:** El alumno remoto no verá reflejada su nueva medición en las curvas consolidadas hasta que el entrenador pulse el botón de aprobación.

---

## 5. Trazabilidad y Referencias
- Resuelve la problemática: [[PROB-001-adherencia-trazabilidad]]
- Requerimientos asociados:
  - [[RF-003-checkin-antropometrico-rbac-hibrido]]
  - [[RF-004-evolucion-corporal-comparador-fotografico]]
  - [[RNF-001-almacenamiento-seguridad-fotos-progreso]]
- Entidades de Dominio vinculadas: [[Entidad-ControlAntropometrico]]
