---
id: RF-002
modulo: Nutricion
prioridad: alta
estado: implementado
version_implementada: v1.0.0
fecha_verificacion: 2026-10-05
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
  > **Aclaración (2026-10-05, decisión del dueño):** en la implementación el reporte diario se completa con **dos toques** (elegir color + "Guardar") y **ningún color viene preseleccionado**. Es una desviación consciente del "1 solo toque" literal de esta regla; ver [[#Accesibilidad del reporte y pendientes sin conexión (2026-10-05)]].
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

**Implementado y verificado (2026-09-22)** — commits `feat(nutricion): metas reales, tolerancia, ventana y diario de platos (RF-002)` y `feat(web): nutricion visible (metas, tolerancia, diario de platos y vista del coach)`. Suites en verde: **558 (web)** y **648 (API)**; smoke runtime 23/23 (compresión real, reporte, tolerancia, galería, "No reportado" y editor de metas) + smoke de la cola con fotos 25/25 (offline emulado, evidencia en IndexedDB, panel, fallo de red y reintento) y flujo online directo verificado.

> **Estado: `implementado` (2026-09-22).** El flujo existe de punta a punta; el único punto abierto es de **entorno, no de código**: la subida real quedó verificada E2E contra MinIO (S3-compatible) y falta repetirla contra Cloudflare R2 con credenciales reales. Ver "Límites deliberados".

### RN-01 — Metas del coach

- Persistidas por alumno (migración `0009`, tabla `metas_nutricionales`, una fila por alumno): calorías, proteína, carbohidratos, grasas y agua opcionales; `NULL` = "no configurado" (nunca un 0 fabricado).
- Endpoints: `PUT /nutricion/alumnos/:alumnoId/metas` (coach; crea o reemplaza con validación de tenancy) y su `GET` para el coach; `GET /nutricion/metas` para el alumno. Sin metas → **204** honesto (ni inventa ni falla).
- Recursos educativos: hasta 10 por alumno; cada recurso es un **enlace externo validado** o un **PDF subido a la bóveda** (`storageKey` validada por módulo/dueño y resuelta como URL firmada de 900 s). La subida desde el editor del coach valida tipo, firma `%PDF-` del contenido y tamaño ≤10 MB.
- UI: editor de metas en la ficha del coach; tarjeta "Tus objetivos nutricionales" en la vista del alumno, con estado honesto cuando no hay metas.

### RN-02 — Ventana del check-in (18:00–23:59 local)

- La ventana se evalúa con la **zona IANA del alumno** (`timezoneCliente`, por defecto `America/Caracas`); fuera de ventana o con fecha distinta al día local → **400** con mensaje claro. **Desde 2026-10-05 (`0555dfe`)** la zona que decide es la **del perfil del alumno** y `timezoneCliente` queda obsoleto y sin efecto; ver [[#Zona horaria del perfil, reportes tardíos y copia de metas (2026-10-05)]].
- La UI evalúa la misma ventana con el reloj del dispositivo: muestra el banner "El reporte aún no está abierto" (texto vigente desde 2026-10-04; antes "El check-in aún no está abierto") y no envía **ni encola** el reporte (el día quedará `No reportado`).

### RN-03 — Diario fotográfico (1–4 platos)

- Compresión **en el dispositivo** antes de pedir la URL: WebP 1920 px / calidad 0.85, con fallback JPEG si el navegador no lo soporta.
- Subida con presign `modulo: 'comidas'`; las claves viajan en `fotosPlatos`. Con conexión, una subida fallida **no registra el día** y conserva las fotos en el formulario; si el fallo es de red/5xx (o no hay conexión), el reporte **se encola completo** (datos + blobs comprimidos) y el sincronizador sube primero las fotos y después registra el check-in.
- Lectura con `fotoUrl` firmado (TTL 900 s) tanto para el alumno como para el coach; galería con visor accesible (Escape cierra y devuelve el foco).

### RN-04 / Escenario 3 — Totales y tolerancia ±10 %

- Totales opcionales (calorías y proteína) comparados contra las **metas reales** del coach, con desvío por dimensión y clasificación verde / ámbar / rojo.
- Sin metas del coach, o sin el total de una dimensión, el resultado queda **sin evaluar** ("Sin evaluar" / "Pendiente de reportar"): nunca un falso OK.

### Escenario 1, §6 y vista del coach

- Semáforo 1-Tap con sus 3 estados; el guardado solo confirma con **2xx**. Un 409 refresca el día ya registrado sin encolarlo; la cola offline queda solo para fallos no concluyentes de red/5xx (`apps/web/src/lib/nutricion-checkin.ts`).
- `No reportado` **derivado** para los días cerrados sin check-in, presente en la vista del alumno y en el calendario del coach (30 días). La alerta semanal viaja en el resumen del coach solo si N > 0; como [[RF-015-matriz-preferencias-usuario-canales]] no tiene categoría NUTRICION, se usa la fila "Resumen Semanal" + la copia In-App universal.
- Pestaña `nutricion` de la ficha del coach (`?tab=nutricion`): calendario de 30 días, totales vs metas, semáforo de tolerancia, fotos y editor de metas.

### Vocabulario y código de ventana (2026-10-04)

- Implementado (2026-10-04, LOTE API-2 `eeec4e0`): el vocabulario de nutrición se unificó en **"reporte"** en los mensajes del API y de la web (p. ej. *"Puedes enviar el reporte de hoy entre las 18:00 y las 23:59 (hora de tu teléfono). Fuera de ese horario el día queda como «No reportado»."*, *"Ya registraste tu reporte de hoy."*, banner *"El reporte se habilita a las 18:00 (hora local)…"*). El rechazo por ventana/día local (RN-02) viaja con el código estable **`CHECKIN_FUERA_DE_VENTANA`** (`@guachafit/shared`), que la web usa para clasificarlo (`esRechazoVentanaCheckin`), con respaldo por texto para servidores anteriores. Evidencia: API **916** y web **777** tras API-2.

### Accesibilidad del reporte y pendientes sin conexión (2026-10-05)

- Implementado (2026-10-05, unidad `f827282`):
  - **Decisión de producto (2026-10-05, del dueño):** el reporte diario mantiene **dos toques** (elegir color + "Guardar") y **ningún color viene preseleccionado**. Es una desviación consciente del "1-Tap" literal de RN-02 (aclarada en §4); se registra solo en este RF, sin ADR (es una decisión de producto/UX, no de arquitectura, y la carpeta de ADR no recoge decisiones de ese tipo).
  - **Semáforo accesible:** agrupado con `fieldset`/`legend` y `aria-pressed` en cada color; pulsar "Guardar" sin color muestra el aviso *"Elige cómo te fue hoy con tu plan."* y lleva el foco al semáforo. Etiquetas asociadas en agua, calorías, proteína y notas; los errores de validación se traducen **por campo** (p. ej. *"Calorías: escribe un número entre 0 y 15000."*), nunca el texto de Zod en inglés.
  - **Pendiente que sobrevive a la recarga:** la pantalla lee la cola offline **filtrada por el alumno actual**; el reporte pendiente se muestra como *"Guardado en tu dispositivo"* con el formulario bloqueado, pasa a un estado intermedio *"Comprobando si tu reporte quedó registrado…"* cuando sale de la cola y solo se declara registrado cuando el API lo confirma. Si el reporte no se pudo enviar, avisa: *"Tu reporte no se pudo enviar. Revisa tus cambios por enviar e inténtalo de nuevo."* ("Cambios por enviar").
  - **Carga del reporte de hoy:** un fallo al consultarlo (distinto de "aún no hay reporte") muestra *"No pudimos cargar tu reporte de hoy. Revisa tu conexión e inténtalo de nuevo."* con botón **Reintentar**; los valores **0** se conservan al recargar (antes se ocultaban). Confirmaciones con `role="status"` (los errores con `role="alert"`), textos de al menos 12 px y sin jerga (RN-xx, códigos HTTP, "servidor").
- **Límites (honestos):**
  - Los tests son de **render a texto en Node** (no hay jsdom ni Testing Library): el foco real, el anuncio del lector de pantalla y la recarga con IndexedDB **no están probados en navegador** (casos manuales en [[06_Guia_Pruebas_Manuales]] §12).
  - Si la cola offline es ilegible de forma persistente, el formulario queda bloqueado **sin mensaje específico**.
  - Un reporte rechazado reabre el formulario; un segundo envío de un reporte que en realidad ya quedó registrado terminaría en **409** (resuelto en `24609ba`: la cola compara con el reporte del servidor; ver [[#Integridad y seguridad del API (2026-10-05)]]).
- **Pendientes conocidos del módulo** (lote de API y panel del coach):
  - ~~El API acepta claves de fotos ajenas en `fotosPlatos`.~~ **Resuelto** (2026-10-05, `24609ba`; ver [[#Integridad y seguridad del API (2026-10-05)]]).
  - ~~Errores que hoy terminan en **500**: violación de unicidad (`23505`), agua ≥ 100 y fecha inválida.~~ **Resuelto** (2026-10-05, `24609ba`: 409 `CHECKIN_YA_REGISTRADO`, agua ≤ 20 L y fechas de calendario reales con 400 claro; ver [[#Integridad y seguridad del API (2026-10-05)]]).
  - ~~Enlaces de recursos con esquemas como `javascript:`.~~ **Resuelto** (2026-10-05, `24609ba`: solo `http`/`https`; ver [[#Integridad y seguridad del API (2026-10-05)]]).
  - ~~`timezoneCliente` es manipulable por el cliente.~~ **Resuelto** (2026-10-05, `0555dfe`: decide la zona del perfil del alumno y `timezoneCliente` no tiene efecto; ver [[#Zona horaria del perfil, reportes tardíos y copia de metas (2026-10-05)]]).
  - ~~Aceptar reportes capturados dentro de la ventana y sincronizados tarde (hasta el mediodía del día siguiente).~~ **Resuelto en el API** (2026-10-05, `0555dfe`; ver la misma sección). Sigue abierto en la UI: mostrar al coach la **hora de registro**.
  - ~~La tolerancia histórica se evalúa con las metas **actuales**: falta guardar una copia de las metas en cada reporte.~~ **Resuelto en el API** (2026-10-05, `0555dfe`: copia `metas_vigentes` por reporte; ver la misma sección). Sigue abierto en la UI: que el historial evalúe la tolerancia con las metas del día.
  - UI pendiente del lote de front: selector de zona horaria, meta del día y ventana local de la web calculada con la zona del perfil.
- Evidencia: `apps/web/src/lib/nutricion-checkin.spec.ts`, `apps/web/src/components/nutricion/*.spec.ts` y `apps/web/src/pages/atleta/NutricionPage.spec.ts`; suite web **843** en verde, typecheck y build OK.

### Editor de metas del entrenador (2026-10-05)

- Implementado (2026-10-05, unidad `2319dff`):
  - **Editar solo con metas cargadas:** el editor de metas no se puede abrir hasta que las metas del alumno carguen bien; el motivo se muestra junto al botón (*"Espera a que carguen las metas."* / *"No pudimos cargar las metas. Reintenta antes de editarlas."*). Así un guardado (PUT de reemplazo) no borra PDFs del alumno que no se conocían.
  - **Confirmaciones:** antes de borrar PDFs para siempre (*"¿Borrar este PDF para siempre?"*), antes de cerrar con cambios sin guardar (*"¿Salir sin guardar?"*) y espera si hay una subida en curso (*"Espera a que termine de subirse el PDF."*). En modo demostración no se pide confirmación de borrado.
  - **Formulario accesible:** etiquetas asociadas en metas y recursos; errores de validación traducidos **por campo**. Calorías y macros deben ser **enteros** (el contrato compartido usa `z.number().int()`): los decimales se rechazan con un mensaje claro en lugar de truncarse; el agua admite hasta 2 decimales; se acepta la coma decimal.
  - **Mensajes al guardar:** sin conexión → los cambios no se guardaron; rechazo 4xx → no se guardaron; 5xx, tiempo agotado u otros → *"No pudimos confirmar si se guardaron tus cambios. Recarga las metas antes de volver a intentarlo."* Avisos con `role="status"`/`role="alert"`, textos de al menos 12 px y sin jerga ("check-in", "bóveda", códigos HTTP).
  - **Decisiones del dueño (2026-10-05) sobre los pendientes del módulo** (por implementar en el lote de API):
    - Reportes capturados dentro de la ventana y sincronizados tarde: se aceptan **hasta las 12:00 (hora local) del día siguiente**; después del mediodía se rechazan con un mensaje claro y el día queda **"No reportado"**. Al entrenador se le muestra la **hora de registro**.
    - Tolerancia histórica: cada reporte guardará una **copia de las metas vigentes ese día**; los reportes anteriores a la migración se comparan con las metas actuales, indicándolo.
- **Límites (honestos):**
  - Sin jsdom no hay tests de interacción: clics, Escape con diálogos apilados y la transición de carga **no están probados en navegador** (casos manuales en [[06_Guia_Pruebas_Manuales]] §12).
  - `cargarMetas` no descarta respuestas obsoletas al cambiar de alumno con una carga en vuelo (preexistente, ventana estrecha).
  - El enlace externo de un recurso acepta esquemas como `javascript:` en el esquema compartido (preexistente; resuelto en `24609ba`, ver [[#Integridad y seguridad del API (2026-10-05)]]).
- Evidencia: `apps/web/src/lib/editor-metas-nutricion.spec.ts`, `apps/web/src/lib/recursos-pdf.spec.ts`, `apps/web/src/components/entrenador/PanelNutricionAlumno.spec.ts` y `apps/web/src/components/entrenador/EditorMetasPiezas.spec.ts`; suite web **888** en verde, typecheck y build OK.

### Integridad y seguridad del API (2026-10-05)

- Implementado (2026-10-05, unidad `24609ba`):
  - **Fotos de comidas solo del propio alumno:** cada `storageKey` de `fotosPlatos` debe tener estructura válida, estar bajo el prefijo `comidas/{alumnoId}/` del alumno autenticado y medir como máximo 255 caracteres. Si no, el API responde **400** *"No pudimos asociar la foto. Vuelve a subirla."*; la clave ajena **nunca se guarda** y por eso nunca se firma al leer el reporte.
  - **Doble envío concurrente:** la violación de unicidad (`23505`) del índice `uq_checkin_nutricional_diario` ya no es un 500: responde **409** con el código estable **`CHECKIN_YA_REGISTRADO`** (`@guachafit/shared`) y el texto *"Ya registraste tu reporte de hoy."*, igual que la verificación previa.
  - **Límites de datos:** agua del reporte y meta de agua del coach **≤ 20 L** (hasta 2 decimales); fechas de **calendario reales** (se rechaza p. ej. `2026-02-31`) en el POST del reporte y en las consultas; historial de reportes **≤ 92 días** cuando llegan `desde` y `hasta`, y un rango invertido se rechaza. Todos con 400 y mensaje claro, nunca 500.
  - **Enlaces de recursos:** solo `http://` o `https://` (`javascript:`, `data:`, `file:`… se rechazan con *"Usa un enlace que empiece por http:// o https://."*).
  - **Cola offline ante 409 `CHECKIN_YA_REGISTRADO`:** la web no da nada por enviado a ciegas; consulta el reporte de hoy y lo compara con el pendiente (semáforo, notas, calorías, proteína, agua y número de fotos). Si coincide → enviado (era un reintento cuyo éxito se perdió). Si difiere o no hay reporte → **no enviado**, visible en "Cambios por enviar" con *"Ya tenías un reporte de hoy registrado con otros datos; este no se envió."* y las fotos **se conservan** hasta que el alumno decida. Si la consulta falla (red, 5xx) → reintento con backoff. El aviso también se muestra al reabrir la pantalla.
  - **Tests de autorización:** el superadmin recibe **403** en metas, `checkin/hoy` y `checkin-diario`; el alumno A no puede listar los reportes del alumno B.
- **Límites (honestos):**
  - El guard no exige que la fecha contenida en la clave de la foto coincida con la del reporte.
  - Las filas antiguas con claves ajenas guardadas antes de este cambio **no se sanean**.
  - Una web anterior al LOTE API-2 mostraría el nuevo texto *"Tu teléfono ya cambió de día…"* como un rechazo genérico.
  - El tope de 92 días no aplica si falta `desde` o `hasta`.
- Evidencia: `apps/api/test/bdd/nutricion-service.spec.ts`, `apps/api/test/bdd/rf010-rbac-tenancy.spec.ts`, `apps/api/test/bdd/api2-errores-claros.spec.ts`, `apps/api/test/bdd/rf002-nutricion-semaforo.spec.ts`, `apps/web/src/lib/offline-sync-nutricion.spec.ts` y `apps/web/src/lib/nutricion-checkin.spec.ts`; API **1192** aprobados (1 omitida), web **904**; typecheck y build OK en shared, api y web.

### Zona horaria del perfil, reportes tardíos y copia de metas (2026-10-05)

- **Decisiones del dueño (2026-10-05):**
  - La ventana 18:00–23:59 se calcula con la **zona horaria del perfil del alumno** (por defecto `America/Caracas`), no con la del teléfono. El alumno la cambia con `PATCH /alumnos/me/zona-horaria` y su entrenador con `PATCH /alumnos/:id` (campo `zonaHoraria`). `timezoneCliente` queda **obsoleto y sin efecto** (se acepta solo porque la web publicada lo envía).
  - Un reporte **capturado dentro de la ventana** se acepta si llega **hasta las 12:00 del día siguiente** (inclusive); después se rechaza y el día queda **"No reportado"** (no se acepta marcándolo como "tardío").
  - Decisión de diseño y alternativas descartadas en [[ADR-019-zona-horaria-perfil-captura-relativa-nutricion]].
- Implementado (2026-10-05, unidad `0555dfe`):
  - **Migración `0016_nutricion_zona_captura_metas.sql` (aditiva):** `perfiles_alumno.zona_horaria` (`varchar(64)`, `NOT NULL`, por defecto `'America/Caracas'`) y en `checkins_nutricionales` las columnas `capturado_en_utc` y `metas_vigentes` (`jsonb`), ambas `NULL` en los reportes anteriores.
  - **Zona del perfil:** se valida como zona IANA real (*"Elige una zona horaria válida, por ejemplo America/Caracas."*). `GET /auth/me` la devuelve en `usuario.zonaHoraria` y la ficha del alumno (`GET`/`PATCH /alumnos/:id`) en `zonaHoraria`. El cambio propio identifica el perfil por el token (nunca por el cuerpo) y escribe solo esa columna con el contexto RLS propio (`rls_perfiles_alumno_self_update`).
  - **Hora de captura sin depender del reloj del teléfono:** la web guarda el instante del toque en "Guardar" y, **al enviar** (directo o desde la cola), manda `segundosDesdeCaptura` (entero, 0–48 h). El API calcula **captura = su hora de recepción − segundos** y la guarda en `capturado_en_utc`; sin el campo, cuenta la hora del servidor. Un teléfono con la hora adelantada o atrasada no cambia el resultado: solo mide una duración.
  - **Reglas (todas en la zona del perfil, `nutricion-tiempo.util.ts`):** la captura debe caer en 18:00–23:59 del día del reporte; la recepción debe llegar como máximo a las **12:00:00 del día siguiente**. Si no, **400** con código estable **`CHECKIN_FUERA_DE_PLAZO`** y el texto *"Este reporte llegó después del mediodía del día siguiente, así que ya no se puede registrar. El día quedó como «No reportado»."* La web lo trata como **rechazo definitivo**: visible en "Cambios por enviar" con ese texto y **sin reintento**.
  - **Mensajes de ventana:** *"Puedes enviar el reporte de hoy entre las 18:00 y las 23:59 (hora de la zona horaria de tu perfil). Fuera de ese horario el día queda como «No reportado»."* y, con el día cambiado, *"El día de tu reporte ya cambió según la zona horaria de tu perfil. Actualiza la pantalla para ver el reporte de hoy."* (ambos con `CHECKIN_FUERA_DE_VENTANA`).
  - **Copia de metas por reporte:** al registrar se copian las metas vigentes del alumno en `metas_vigentes` (`null` si no tenía metas) y la tolerancia se evalúa con esa copia. Las lecturas del reporte devuelven `capturadoEnUtc`, `metasVigentes` y `zonaHoraria`; los reportes anteriores traen `null`.
  - **Resumen semanal del coach:** los días "No reportado" se cuentan por alumno con **la zona de su perfil** (sus últimos 7 días cerrados); "ayer" cuenta como cerrado **solo pasado el mediodía local**, porque hasta entonces todavía puede llegar por la cola.
- **Límites (honestos):**
  - El servidor **confía en `segundosDesdeCaptura`**: un cliente podría declarar una captura anterior a la real. Como máximo gana unas **~18 h** de retraso (de las 18:00 al mediodía siguiente), que es el margen decidido.
  - Los **perfiles existentes quedan en Caracas**: un alumno en otra zona debe cambiarla (hoy vía API; el selector en la UI llega en el siguiente lote de front).
  - Un alumno **pausado** también puede cambiar su zona.
  - La web redondea a segundos: la captura puede moverse **hasta 0,5 s** en los bordes de la ventana o del plazo.
  - Quedan para el lote de front: la tolerancia del historial con las metas del día, y en la UI la hora de registro, la meta del día, el selector de zona y la ventana local de la web con la zona del perfil (hoy la web sigue evaluando la ventana con el reloj del dispositivo).
- Evidencia: `apps/api/test/bdd/nutricion-service.spec.ts`, `apps/api/test/bdd/lote-api-n2-zona-horaria.spec.ts`, `apps/api/test/bdd/rf014-resumen-semanal.spec.ts`, `apps/api/test/bdd/api2-errores-claros.spec.ts`, `apps/web/src/lib/nutricion-checkin.spec.ts` y `apps/web/src/lib/offline-sync-nutricion.spec.ts`; API **1244** aprobados (1 omitida), web **919**. Migración `0016` aplicada y verificada en la BD de desarrollo (columnas, valor por defecto, privilegios del rol `guachafit_app` y self-update por RLS).

### Límites deliberados y notas honestas

Tres de los cuatro puntos quedaron **resueltos**; el único abierto es de entorno (smoke contra Cloudflare R2 real). Por eso el estado pasa a `implementado`.

1. **Encolado de fotos (§6, subida fallida): RESUELTO.** Un check-in con fotos sin conexión (o con fallo de red/5xx en la subida) se encola completo —datos + blobs comprimidos en IndexedDB— como mutación `nutricion-checkin-fotos` y se sincroniza solo: primero cada foto (presign `comidas` + PUT) persistiendo su `storageKey` al instante para reanudar sin re-subir, y después el POST del check-in con las claves. Un 4xx del servidor (p. ej. ventana/día cerrado) deja la mutación rechazada con mensaje claro y la evidencia se conserva hasta descarte manual; el panel de sincronización muestra estado, razón y Reintentar/Descartar, y explica la evidencia retenida. Máximo 4 fotos (RN-03).
2. **Recursos educativos (RN-01): RESUELTO.** Enlaces externos o **PDFs subidos** (módulo `nutricion-recursos`, migración de contrato aplicada); `validarStorageKey` exige clave del módulo y del alumno (clave ajena → 400); al leer se resuelve con presigned GET (900 s). Verificado E2E contra MinIO real (PUT firmado 200, integridad SHA256, limpieza). **Borrado best-effort implementado y verificado (2026-09-24):** al guardar metas, los PDFs que dejaron de estar referenciados se eliminan de la bóveda **post-commit** (`eliminarObjeto` con `DeleteObject` idempotente; E2E MinIO: presign PUT → existe → borrar → 404 → limpieza); un fallo de storage o de la re-lectura anti-race no altera el 200 y solo deja warning. Queda **pendiente** la recolección de objetos **nunca referenciados** (PDFs subidos sin guardar y fotos de comidas descartadas offline con objetos ya subidos); ciclo de vida en [[ADR-015-borrado-best-effort-objetos-boveda]].
3. **Listado de check-ins:** no es server-paginado; el calendario del coach usa la ventana de 30 días con paginación en cliente declarada.
4. **Smoke de almacenamiento:** la subida real quedó verificada E2E contra **MinIO real** (presign no-mock, PUT con Content-Type firmado, descarga con integridad SHA256); falta repetirla contra **Cloudflare R2** cuando existan credenciales reales del bucket de producción.
