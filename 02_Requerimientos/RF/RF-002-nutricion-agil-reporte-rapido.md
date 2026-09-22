---
id: RF-002
modulo: Nutricion
prioridad: alta
estado: parcial
version_implementada: v1.0.0
fecha_verificacion: 2026-09-22
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

---

## 7. Estado real de implementación

**Implementado y verificado (2026-09-22)** — commits `feat(nutricion): metas reales, tolerancia, ventana y diario de platos (RF-002)` y `feat(web): nutricion visible (metas, tolerancia, diario de platos y vista del coach)`. Suites en verde: **551 (web)** y **648 (API)**; smoke runtime 23/23 (compresión real, reporte, tolerancia, galería, "No reportado" y editor de metas).

> **Se mantiene `parcial`** aunque el flujo ya existe de punta a punta: dos comportamientos previstos en este documento no están implementados como se especifican (ver "Límites deliberados"). Todo el resto de §4, §5 y el primer caso borde de §6 está implementado.

### RN-01 — Metas del coach

- Persistidas por alumno (migración `0009`, tabla `metas_nutricionales`, una fila por alumno): calorías, proteína, carbohidratos, grasas y agua opcionales; `NULL` = "no configurado" (nunca un 0 fabricado).
- Endpoints: `PUT /nutricion/alumnos/:alumnoId/metas` (coach; crea o reemplaza con validación de tenancy) y su `GET` para el coach; `GET /nutricion/metas` para el alumno. Sin metas → **204** honesto (ni inventa ni falla).
- Recursos educativos: hasta 10 por alumno, persistidos como **enlace validado** (título + URL) y visibles para el alumno.
- UI: editor de metas en la ficha del coach; tarjeta "Tus objetivos nutricionales" en la vista del alumno, con estado honesto cuando no hay metas.

### RN-02 — Ventana del check-in (18:00–23:59 local)

- La ventana se evalúa con la **zona IANA del alumno** (`timezoneCliente`, por defecto `America/Caracas`); fuera de ventana o con fecha distinta al día local → **400** con mensaje claro.
- La UI evalúa la misma ventana con el reloj del dispositivo: muestra el banner "El check-in aún no está abierto" y no envía **ni encola** el reporte (el día quedará `No reportado`).

### RN-03 — Diario fotográfico (1–4 platos)

- Compresión **en el dispositivo** antes de pedir la URL: WebP 1920 px / calidad 0.85, con fallback JPEG si el navegador no lo soporta.
- Subida con presign `modulo: 'comidas'`; las claves viajan en `fotosPlatos`. Una subida fallida **no registra el día**: error visible y fotos conservadas para reintento manual.
- Lectura con `fotoUrl` firmado (TTL 900 s) tanto para el alumno como para el coach; galería con visor accesible (Escape cierra y devuelve el foco).

### RN-04 / Escenario 3 — Totales y tolerancia ±10 %

- Totales opcionales (calorías y proteína) comparados contra las **metas reales** del coach, con desvío por dimensión y clasificación verde / ámbar / rojo.
- Sin metas del coach, o sin el total de una dimensión, el resultado queda **sin evaluar** ("Sin evaluar" / "Pendiente de reportar"): nunca un falso OK.

### Escenario 1, §6 y vista del coach

- Semáforo 1-Tap con sus 3 estados; el guardado solo confirma con **2xx**. Un 409 refresca el día ya registrado sin encolarlo; la cola offline queda solo para fallos no concluyentes de red/5xx (`apps/web/src/lib/nutricion-checkin.ts`).
- `No reportado` **derivado** para los días cerrados sin check-in, presente en la vista del alumno y en el calendario del coach (30 días). La alerta semanal viaja en el resumen del coach solo si N > 0; como [[RF-015-matriz-preferencias-usuario-canales]] no tiene categoría NUTRICION, se usa la fila "Resumen Semanal" + la copia In-App universal.
- Pestaña `nutricion` de la ficha del coach (`?tab=nutricion`): calendario de 30 días, totales vs metas, semáforo de tolerancia, fotos y editor de metas.

### Límites deliberados y notas honestas

Los puntos 1 y 2 son desviaciones frente al texto vigente del RF: por eso el estado se mantiene en `parcial`. Los puntos 3 y 4 son límites de alcance ya declarados en la implementación.

1. **Encolado de fotos (§6, subida fallida):** el documento pide encolar las imágenes para reintento automático en segundo plano; la implementación **no encola reportes con fotos** (a propósito): prefiere declarar el error antes que perder evidencia en silencio. Los reportes **sin fotos** sí usan la cola offline existente.
2. **Recursos educativos (RN-01):** son enlaces validados; no existe pipeline de subida de PDFs.
3. **Listado de check-ins:** no es server-paginado; el calendario del coach usa la ventana de 30 días con paginación en cliente declarada.
4. **Smoke de R2:** la subida real se probó en el smoke de demo con bóveda simulada; falta repetirla contra el bucket real (MinIO/bucket remoto).
