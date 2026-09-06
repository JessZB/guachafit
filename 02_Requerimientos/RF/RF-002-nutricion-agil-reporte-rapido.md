---
id: RF-002
modulo: Nutricion
prioridad: alta
estado: aprobado
problema_origen: "[[PROB-001-adherencia-trazabilidad]]"
fecha_creacion: 2026-09-05
version: 1.0
tags:
  - requerimiento
  - rf
  - sdd
  - nutricion
---

# RF-002: Módulo de Nutrición Ágil y Reporte Rápido

## 1. Contexto y Justificación
Elimina la fricción cognitiva del registro gramo por gramo mediante un esquema ágil de reporte (Horizonte 2). Combina metas cuantitativas configuradas por el coach con tres mecanismos de micro-fricción para el alumno (1-Tap, foto de platos y totales manuales).

- **Objetivo:** Garantizar la adherencia del reporte nutricional a largo plazo sin fatiga del usuario.
- **Valor aportado:** Datos visuales y macroscópicos suficientes para que el coach evalúe el cumplimiento nutricional.
- **Trazabilidad:** Resuelve el abandono del reporte nutricional documentado en [[PROB-001-adherencia-trazabilidad]].

---

## 2. Actores Involucrados
- **Actor Primario:** Alumno / Cliente.
- **Actores Secundarios:** Entrenador / Nutricionista.

---

## 3. Precondiciones
1. El entrenador ha configurado los objetivos nutricionales del cliente (rango de calorías, macros o pauta general).
2. El cliente cuenta con acceso a la app móvil o web para subir fotografías o confirmar su día.

---

## 4. Reglas de Negocio (Business Rules)
- **RN-01 (Definición de Metas por el Coach):** El coach puede fijar objetivos de calorías diarias, gramos de proteína/carbohidratos/grasas y meta de agua (litros). Además, puede adjuntar recursos educativos (PDFs con listas de compras o distribución de comidas).
- **RN-02 (Semáforo Diario 1-Tap):** Cada día entre las 18:00 y las 23:59 (hora local del alumno), se habilita un check-in rápido de 1 solo toque con tres estados:
  - `Cumplido`: El alumno siguió su pauta al $\ge 90\%$.
  - `Parcial`: Cumplió parcialmente (ej. buena proteína, pero excedió calorías).
  - `No cumplido`: Día libre o desviación total.
- **RN-03 (Diario Fotográfico):** El alumno puede adjuntar entre 1 y 4 fotografías diarias correspondientes a sus comidas principales (desayuno, almuerzo, merienda, cena).
- **RN-04 (Input Opcional de Totales):** Si el alumno ya utiliza herramientas externas (MyFitnessPal, FatSecret, Cronometer), dispone de un campo simple para transcribir únicamente los totales del día (Calorías totales y Proteínas en gramos) sin desglosar alimentos individuales.

---

## 5. Criterios de Aceptación (Given-When-Then / Gherkin)

### Escenario 1: Reporte Nocturno Ágil (1-Tap)
```gherkin
Given que el alumno finaliza su jornada y abre la sección de Nutrición
When selecciona la opción "Cumplido" en el semáforo diario
Then el sistema debe registrar el estado nutricional del día como "Cumplido"
  And mostrar un feedback de confirmación instantáneo
  And reflejar dicho estado en el calendario nutricional del entrenador
```

### Escenario 2: Carga de Diario Fotográfico
```gherkin
Given que el alumno se encuentra en la pantalla de reporte diario
When captura o sube 2 imágenes correspondientes a su almuerzo y cena
Then el sistema debe optimizar/comprimir las imágenes en el dispositivo
  And subirlas asociadas al día actual del alumno
  And permitir al entrenador visualizar la galería cronológica de comidas
```

### Escenario 3: Ingreso Opcional de Totales Externos
```gherkin
Given que el alumno usa MyFitnessPal y conoce sus totales del día (2100 kcal, 155g proteína)
When digita dichos valores en el formulario de "Totales Rápidos" y presiona "Guardar"
Then el sistema debe persistir los totales numéricos asociados a la fecha
  And comparar automáticamente los valores reportados contra las metas del entrenador
  And marcar visualmente si el alumno estuvo dentro del margen de tolerancia ($\pm 10\%$)
```

---

## 6. Casos Borde y Excepciones
- **Omisión del reporte diario:** Si el alumno no registra el semáforo a las 23:59, el sistema marca el día como `No reportado` (gris) y no penaliza la racha de entrenamiento, pero alerta al entrenador en el resumen semanal.
- **Subida fallida de fotos:** Si la conexión a internet es inestable, las imágenes deben quedar encoladas para reintento automático en segundo plano.
