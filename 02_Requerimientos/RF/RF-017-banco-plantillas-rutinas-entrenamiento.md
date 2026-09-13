---
id: RF-017
modulo: Entrenamiento
prioridad: media
estado: propuesto
problema_origen: "[[PROB-003-acceso-onboarding-dashboard-central]]"
fecha_creacion: 2026-09-13
version: 1.0
tags:
  - requerimiento
  - rf
  - sdd
  - entrenamiento
  - plantillas
  - rutinas
---

# RF-017: Banco de Plantillas Predefinidas de Entrenamiento y Prescripción Reutilizable

## 1. Contexto y Justificación
Permite al entrenador crear un catálogo de plantillas de entrenamiento reutilizables (ej. *Tren Superior Hipertrofia A*, *Fullbody 3 Días Principiante*, *Empuje-Tracción-Pierna*) para asignarlas masivamente o con un solo clic a la ficha de uno o múltiples alumnos, reduciendo drásticamente el tiempo de prescripción manual ejercicio por ejercicio.

- **Objetivo:** Agilizar la prescripción semanal mediante plantillas modulares prediseñadas con ejercicios del catálogo, rangos de series, repeticiones y descansos.
- **Valor aportado:** Prescripción de una semana de entrenamiento en menos de 30 segundos, manteniendo la consistencia metodológica del entrenador.

---

## 2. Actores Involucrados
- **Entrenador:** Diseña, edita y organiza plantillas de rutinas en su biblioteca personal.
- **Alumno:** Recibe la rutina asignada adaptada a sus objetivos y la ejecuta en su checklist diario (`RF-001`).

---

## 3. Precondiciones
1. Los ejercicios utilizados deben existir en el catálogo global o privado del coach (`CrearEjercicioCatalogoSchema`).

---

## 4. Reglas de Negocio (Business Rules)
- **RN-01 (Estructura de la Plantilla):** Cada plantilla contiene:
  - `Nombre`: (ej. *Torso Potencia - Fase 1*).
  - `Nivel Objetivo`: Principiante, Intermedio, Avanzado.
  - `Bloque / Día Sugerido`: (ej. Día 1, Día 2, o Día de la Semana).
  - `Lista de Ejercicios Ordenados`: Con series prescritas, repeticiones objetivo, % 1RM o RPE sugerido y notas técnicas.
- **RN-02 (Copia y Desacoplamiento al Asignar):** Al asignar una plantilla a un alumno, el sistema realiza una copia profunda (*deep clone*) de los ejercicios y series a la planificación específica del alumno. Modificaciones posteriores a la plantilla no afectan las semanas ya prescritas del alumno, y ajustes individuales sobre el alumno no alteran la plantilla base.
- **RN-03 (Sobrescritura Guiada):** El coach puede elegir entre:
  - *Reemplazar:* Sustituye la rutina actual del alumno por la plantilla.
  - *Fusionar / Agregar:* Añade los días de la plantilla a los bloques existentes.

---

## 5. Criterios de Aceptación (Gherkin)

### Escenario 1: Creación de Plantilla de Entrenamiento
```gherkin
Given que el entrenador accede a su biblioteca de plantillas
When crea la plantilla "Pierna Énfasis Isquios" con 4 ejercicios y sus series
Then el sistema debe guardar la plantilla en estado "Activa" asociada a su tenant
```

### Escenario 2: Asignación de Plantilla al Expediente 360° del Alumno
```gherkin
Given que el entrenador está en el Expediente 360° del alumno "Carlos Mendoza"
When pulsa "Cargar desde Plantilla" y selecciona "Pierna Énfasis Isquios"
Then el sistema debe clonar los 4 ejercicios a la rutina de Carlos
  And permitirle ajustar cargas particulares antes de confirmar la prescripción
```
