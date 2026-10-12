---
id: RF-017
modulo: Entrenamiento
prioridad: media
estado: implementado
version_implementada: v1.0.0
fecha_verificacion: 2026-10-11
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

---

## 6. Notas de Implementación (v1.0.0)

> Entrega verificada el 2026-09-20. Los criterios de aceptación Gherkin de la sección 5 permanecen sin cambios.

- **Modelo (migración `0003_noisy_young_avengers.sql`):** tabla `plantillas_rutina` con `bloques JSONB` tipado `BloqueDiaRutinaDTO[]` — el mismo contrato que `rutinas`, lo que garantiza que la asignación sea una copia profunda fiel (deep clone probado en ambos sentidos). Enum `enum_nivel_objetivo_plantilla` (`principiante`, `intermedio`, `avanzado`), soft delete vía `activa` e índice `idx_plantillas_entrenador_activa (entrenador_id, activa)`.
- **API tenant-scoped:** CRUD `GET/POST/GET :id/PATCH :id/DELETE :id` sobre `/plantillas` + `POST /plantillas/:id/asignar`; toda operación valida la pertenencia al tenant del coach (404 si es de otro entrenador).
- **Asignación múltiple con reporte parcial:** `POST /plantillas/:id/asignar` acepta hasta 50 `alumnoIds` y responde `exitosos / fallidos` con `resultados[]` por alumno (`ResultadoAsignacionAlumnoDTO`); el fallo de un alumno no aborta la operación del resto.
- **Modos de sobrescritura (RN-03):** `REEMPLAZAR` sustituye la rutina activa del alumno; `FUSIONAR` anexa los días de la plantilla a los bloques existentes.
- **Ajustes antes de confirmar:** `ajustes[]` (`AjusteEjercicioPlantillaSchema`) permite override de `pesoPrescritoKg`, `series`, `reps` y `rpe`, localizado por `diaId` + (`ejercicioId` o `nombre` del ejercicio).
- **UI:** página "Banco de Plantillas" (`/coach/plantillas`) y acción "Cargar desde Plantilla" en el Expediente 360°.
- **Tests:** 19 pruebas dedicadas (`rf017-plantillas.spec.ts` y suites asociadas).
- **Pendiente registrado (WU24–WU26):** la lista de plantillas aún no está paginada: `GET /plantillas` devuelve el catálogo completo del tenant y el filtro por nombre/nivel/estado es client-side. Se paginará cuando el volumen lo justifique (deuda declarada en [[03_Contratos_API_Especificacion]] §1.2).
- Implementado (2026-10-04, front `92936a9`) — **asignación masiva desde la tarjeta de plantilla** ("Asignar a alumnos", `apps/web/src/components/entrenador/AsignacionMasivaPlantilla.tsx`, `apps/web/src/lib/asignacion-masiva.ts`): selección múltiple (máx. 50) con **búsqueda en el servidor** y "Cargar más alumnos", resultado por alumno con mensajes claros y **confirmación al reemplazar** la rutina. Ante un fallo de conexión ambiguo avisa que no se sabe si se completó y pide confirmar antes de reintentar en modo **Añadir** (FUSIONAR).
- Implementado (2026-10-04, front `92936a9`) — editor más seguro: confirmación antes de borrar un día o un ejercicio, aviso de cambios sin guardar al cerrar la plantilla, edición bloqueada mientras se guarda, guardar deshabilitado sin conexión ("Necesitas internet para guardar") y aviso de datos guardados en la lista; lápiz de edición siempre visible, controles de 44px y textos sin jerga.
- Implementado (2026-10-04, LOTE API-3 `bc53864`) — integridad:
  - **Asignación idempotente:** `POST /plantillas/:id/asignar` acepta `X-Idempotency-Key`; misma clave + mismo cuerpo devuelve la respuesta original sin reaplicar (registro con TTL 24 h y dedupe de envíos simultáneos, ver [[RF-001-checklist-entrenamiento-diario]] §7.3).
  - **FUSIONAR ("Añadir a la rutina actual") con tope de 7 días:** si la rutina quedaría con más de 7 días se rechaza con *"La rutina de este alumno quedaría con más de 7 días. Usa «Reemplazar» o quita días antes de añadir."*; los días añadidos no repiten el día sugerido ya ocupado y la lectura + escritura de la rutina corren en una transacción con bloqueo.
  - **Precondición 1 aplicada:** rutinas, plantillas y sesiones solo aceptan ejercicios **globales o del propio coach**; el error **nombra** los ejercicios no disponibles (p. ej. *"Press X ya no está en tu lista de ejercicios. Quítalo o cámbialo por otro y vuelve a guardar."*).
  - Las **notas técnicas y el esfuerzo sugerido** (RN-01) llegan a la sesión del alumno (migración `0014`, **por aplicar** en los entornos).
- Límites honestos / pendientes (2026-10-04): la web envía una clave por intento (misma selección + mismo modo), pero el servidor la recuerda solo en memoria del proceso (se pierde al reiniciar y no se comparte entre réplicas), así que no es garantía: por eso la web sigue pidiendo confirmación antes de reintentar en modo Añadir tras un fallo ambiguo; sigue pendiente la paginación de `GET /plantillas`.
- Evidencia: web **771** tras el front y **785** tras API-3; API **986** tras API-3.
- Implementado (2026-10-11, `c6a0e34` y `05d42bd`) — **límites de los datos de la prescripción:** las plantillas, las rutinas y los ajustes al asignar aplican los mismos topes que el registro del alumno (peso de 0 a 999 kg, repeticiones hasta 200, esfuerzo de 1 a 10 en pasos de 0,5), con 400 y mensaje claro por campo. Detalle, coma decimal y límites en [[RF-001-checklist-entrenamiento-diario]] §7.11. Resuelto en la web (2026-10-11, `8af2673` y `c194caa`): el editor de plantillas, el modal de rutina de la ficha y los ajustes de asignación filtran al teclear, el peso es un número o "Peso corporal" y el aviso al guardar nombra el ejercicio ([[RF-001-checklist-entrenamiento-diario]] §7.12).
- Implementado (2026-10-11, `9192fef` y `3c68eed`) — **asignación de una plantilla al alumno en 3 pasos** (Escenario 2, "Cargar desde plantilla" en la ficha). Decisión del dueño: el formulario mostraba todo a la vez (16 contenedores tipo card con hasta 4 niveles, 27 textos de 11 px) y costaba saber qué era cada cosa. Criterios de la skill ui-ux-pro-max (*progressive disclosure*, *field grouping*, *progress indicators*, *focusable error summary*):
  - **Paso 1 · Elegir plantilla:** buscador y lista de filas con separadores ("Intermedio · 2 días · 8 ejercicios"); "Siguiente" se habilita al elegir y, mientras tanto, se indica "Elige una plantilla para continuar.".
  - **Paso 2 · Revisar y ajustar:** un día abierto a la vez; cada ejercicio en una línea (`4 × 10 · 60 kg · Esfuerzo 8 · 1 min 30 s` o "Peso corporal") con un botón **"Ajustar"** que muestra sus campos filtrados (lote E3) y la marca "Ajustado". Si al asignar hay un ajuste inválido, vuelve aquí con un **resumen de errores enfocado** cuyos ítems llevan a cada campo, el día abierto y el error enlazado a su input.
  - **Paso 3 · Confirmar:** "Reemplazar" o "Añadir" (toda la tarjeta es tocable), el resumen en una frase (*"Se asignará «Fuerza 4 días» a Ana Pérez con 2 ajustes. Reemplaza su rutina actual."*) y "Asignar rutina"; Reemplazar sigue pidiendo confirmación.
  - Textos de 14 px y 12 px para lo secundario, sin 11 px; pantalla completa en móvil con "Atrás"/"Siguiente" fijos abajo; cada paso se anuncia y recibe el foco. La lógica (carga, modo demo, ajustes, idempotencia, asignación) no cambió: verificada con una comparación mecánica. En modo demo no se llama a `onAsignada` (el refresco del padre consulta el API).
  - Evidencia: lote 152/152, web sin fallos del lote, typecheck y build limpios; revisión de legibilidad y UX sin bloqueos, sus hallazgos corregidos en `3c68eed`.
  - Nombres de las acciones en la ficha en minúscula inicial (2026-10-12, `63369d7`): "Cargar desde plantilla" (asignar una plantilla) y "Editar rutina semanal" (editor manual); "Asignar a alumnos" en Plantillas es la asignación masiva, otra acción. Pegar `'60 kg'` en los ajustes escribe el número.
  - Pendiente: extraer cada paso del modal a su propio componente si el formulario crece; unificar `SelectorPlantillaAsignacion` y `AsignacionMasivaPlantilla` (duplicación heredada del módulo 2).
