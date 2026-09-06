---
id: RF-004
modulo: Antropometria
prioridad: media
estado: aprobado
problema_origen: "[[PROB-001-adherencia-trazabilidad]]"
fecha_creacion: 2026-09-05
version: 1.0
tags:
  - requerimiento
  - rf
  - sdd
  - antropometria
  - visualizacion
---

# RF-004: Visualización de Evolución Corporal y Comparador Fotográfico

## 1. Contexto y Justificación
Permite tanto al alumno como al entrenador visualizar el impacto acumulado del plan de entrenamiento y nutrición a lo largo del tiempo. Transforma números aislados en tendencias visuales comprensibles y comparativas físicas irrefutables.

- **Objetivo:** Ofrecer paneles gráficos interactivos de variables corporales y una herramienta de comparación fotográfica lado a lado (Semana A vs. Semana B).
- **Valor aportado:** Refuerzo psicológico positivo para la retención del alumno y herramienta analítica para el entrenador.
- **Trazabilidad:** Complementa a [[RF-003-checkin-antropometrico-rbac-hibrido]] resolviendo el dolor de [[PROB-001-adherencia-trazabilidad]].

---

## 2. Actores Involucrados
- **Alumno:** Consulta sus gráficos de tendencia y compara sus fotografías de progreso.
- **Entrenador:** Analiza curvas de correlación (ej. Peso vs. % Grasa) para ajustar periodización o planes calóricos.

---

## 3. Precondiciones
1. El alumno debe contar con al menos dos registros antropométricos aprobados en el historial.
2. Para la comparativa visual, deben existir fotografías cargadas en al menos dos fechas distintas.

---

## 4. Reglas de Negocio (Business Rules)
- **RN-01 (Gráficos Temporales Multieje):** El sistema debe graficar series de tiempo con filtros por rango de fechas (1M, 3M, 6M, 1A, Todo). Debe permitir cruzar variables clave en un mismo gráfico de doble eje Y (ejemplo: Eje Y1 = Peso en kg; Eje Y2 = % Grasa Corporal).
- **RN-02 (Comparador Fotográfico Slider / Lado a Lado):** El usuario puede seleccionar dos fechas arbitrarias del historial (Fecha A y Fecha B) y una vista angular (Frontal, Lateral o Posterior).
- **RN-03 (Privacidad Estricta de Fotos):** Las fotografías de progreso son consideradas datos de alta sensibilidad biométrica. Nunca deben exponerse en URLs públicas estáticas; su visualización requiere autenticación y URLs firmadas temporales.

---

## 5. Criterios de Aceptación (Given-When-Then / Gherkin)

### Escenario 1: Generación de Gráfico de Correlación Peso vs % Grasa
```gherkin
Given que el cliente tiene registros aprobados de los últimos 3 meses
When accede a la pestaña "Evolución Corporal"
Then el sistema debe renderizar un gráfico interactivo mostrando la curva de peso y la curva de grasa
  And calcular el cambio neto en kg y puntos porcentuales de grasa en el periodo seleccionado
```

### Escenario 2: Comparativa Fotográfica Semana A vs Semana B
```gherkin
Given que el usuario selecciona el comparador fotográfico
When elige "Semana 1 (10 Enero)" y "Semana 8 (05 Marzo)" con perspectiva "Lateral"
Then el sistema debe presentar ambas imágenes alineadas lado a lado o con slider interactivo
  And mostrar la fecha y el peso correspondiente a cada una de las dos tomas
```

---

## 6. Casos Borde y Excepciones
- **Registros incompletos:** Si en una fecha el alumno subió peso pero no subió foto lateral, el comparador debe inhabilitar esa perspectiva específica con un aviso: *"Foto no disponible para esta fecha"*.
