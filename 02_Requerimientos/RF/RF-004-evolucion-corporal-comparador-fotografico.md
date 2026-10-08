---
id: RF-004
modulo: Antropometria
prioridad: media
estado: implementado
version_implementada: v1.0.0
fecha_verificacion: 2026-10-08
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

---

## 7. Estado real de implementación

**Implementado y verificado en UI real (2026-09-22)** — commit `feat(web): graficos de evolucion y comparador fotografico real`. Suites en verde: **551 (web)** y **648 (API)**, con BDD de este RF.

### RN-01 — Gráficos multieje con filtros

- Componente SVG propio (sin dependencias nuevas) sobre la serie real de controles **aprobados**.
- 8 métricas: peso, % grasa, cintura, brazo, pecho, muslo, cadera y cuello; hasta **3 activas** y **2 unidades** por gráfico (doble eje Y con la unidad rotulada en cada eje).
- Filtros **1M / 3M / 6M / 1A / Todo**; tooltip del punto activo; deltas del rango por métrica activa (Escenario 1: cambio neto en kg y en puntos de grasa; con una sola medición muestra "sin delta", nunca un valor inventado).
- Accesible: `role="img"` con resumen textual, tabla alternativa "Ver datos en tabla" y controles operables por teclado.
- Alumno en `/app/progreso`; el mismo gráfico vive en el tab **Antropometría** de la ficha del coach.

### RN-02 — Comparador fotográfico A/B

- Coach en `/coach/antropometria` (pestaña Comparador): selector de alumno y de **dos controles** (A/B mutuamente excluyentes); las opciones muestran fecha y peso de cada toma (Escenario 2).
- Perspectivas habilitadas solo si la foto existe en **ambas** fechas; la faltante queda deshabilitada con "Foto no disponible para esta fecha" (caso borde §6). Si ninguna perspectiva coincide, el panel lo declara y sugiere otras tomas.
- Vistas **lado a lado** y **superposición** con slider (clic, arrastre y flechas del teclado); resumen de diferencias **B − A** de peso y grasa.
- Endpoint real: `GET /antropometria/comparador/:alumnoId?controlIdA&controlIdB&angulo`; en modo demo la comparativa se arma con el fixture local.

### RN-03 — Privacidad y experiencia del alumno

- Galería de fotos propias por control en `/app/progreso`, con visor accesible (Escape cierra y devuelve el foco; trampa de Tab).
- URLs presignadas de 15 minutos del endpoint real; si el enlace vence, la UI lo declara ("El enlace temporal venció") con botón **Reintentar** en vez de dejar una imagen rota.
- Demo conservado estrictamente tras `isDemoMode` (fixture ampliado a 6 tomas).

### Notas honestas (límites conocidos y deliberados)

1. El filtrado de rango es **client-side** sobre la serie completa; el parámetro `?periodo=` del backend existe pero queda sin usar a propósito (el gráfico y los deltas usan la copia local filtrada).
2. `fotoDisponible` no forma parte del tipo compartido (`packages/shared`); el cliente lo normaliza al construir la comparativa.
3. El fixture demo se amplió a 6 tomas relativas a "ahora" para que todos los rangos tengan datos; solo se consume con `isDemoMode`.
4. **(2026-10-08, `affec1f`)** Hasta este lote no había forma de subir fotos desde la web, así que la galería y el comparador solo mostraban fotos de demostración o de datos sembrados. Ahora el alumno online y el entrenador las adjuntan en el check-in ([[RF-003-checkin-antropometrico-rbac-hibrido]], fotos opcionales). RN-03: el detalle, la evolución y el comparador no firman fotos cuya clave no pertenezca al alumno; en el comparador esa perspectiva queda como "Foto no disponible para esta fecha".
