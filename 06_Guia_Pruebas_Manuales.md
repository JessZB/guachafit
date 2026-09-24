---
id: GUIA-PRUEBAS
titulo: "Guía de Pruebas Manuales — GUACHAFIT"
fecha: 2026-09-24
estado: activo
tags:
  - pruebas
  - manual
  - checklist
  - qa
---

# 🧪 Guía de Pruebas Manuales — GUACHAFIT

> **Para qué sirve:** probar a mano todo lo construido sin perder de vista ningún cambio. Cada punto dice **qué hacer** y **qué deberías ver**. Si algo no coincide, anótalo con el formato del final (y captura de pantalla).
>
> **Estado del código:** con pruebas automáticas en verde (**612** de la web + **818** del API, más 1 E2E de bóveda que corre solo con MinIO arriba). Lo de abajo es lo que las pruebas automáticas **no pueden** ver: la vivencia real.

---

## 0. Cómo levantar todo (una sola vez por sesión)

1. **Docker Desktop abierto** (Postgres, Redis y MinIO deben estar corriendo).
2. **Base de datos al día** (solo si es la primera vez o hubo cambios de esquema):
   `pnpm --filter @guachafit/database db:migrate`
3. **Datos de ejemplo** (⚠️ borra y recarga los datos):
   `pnpm --filter @guachafit/database db:seed`
   → Las credenciales de prueba están definidas en `packages/database/src/seed.ts`.
4. **API**: `pnpm --filter @guachafit/api dev` → queda en `http://localhost:4000` (documentación en `/api/docs`).
5. **Web**: `pnpm --filter @guachafit/web dev` → abre `http://localhost:3000`.
6. **Modo demo** (sin tocar la base de datos): en el login hay botones **"Modo Coach"** y **"Modo Alumno"**. Aparece un banner de "Modo demo — datos de ejemplo". Ideal para recorrer pantallas rápido.

> **Tip para probar en el teléfono por WiFi:** por defecto no es accesible (Vite escucha solo en tu PC). Para probar la PWA de verdad usa **USB** (`adb reverse tcp:3000 tcp:3000` y abre `http://localhost:3000` en el teléfono) o un **túnel HTTPS** (cloudflared/ngrok). Por HTTP de la red local, los service workers no se activan.

---

## 1. Entrenamiento del alumno (lo más usado en el gimnasio)

- [ ] **Pantalla angosta (360px, como un celular):** la fila de series se ve cómoda; puedes escribir repeticiones y peso en campos amplios, con botones +/− fáciles de tocar.
- [ ] **Iniciar:** pulsar "Comenzar a entrenar" pasa la sesión a "En Progreso" y guarda la hora (UTC) + tu zona horaria.
- [ ] **Descanso real:** al marcar una serie arranca el temporizador; al marcar la siguiente aparece **"Descanso real: X"** (medido de verdad). Si no marcaste inicio, muestra "—" (nunca un número inventado).
- [ ] **Cierre con sesión vacía:** pulsar "Finalizar" sin haber marcado nada pregunta **"¿descansado o incompleto?"**; en ninguno de los dos casos sube la racha.
- [ ] **Finalizar bien:** muestra duración y horas **en tu hora local**; si superaste el 70% del plan dice la racha real; si no, un mensaje honesto (no miente).
- [ ] **kg / lb:** cambia la unidad en el checklist; se recuerda aunque recargues.
- [ ] **Video de técnica:** si el ejercicio tiene enlace, aparece "Ver técnica" con reproductor (Escape cierra).
- [ ] **Navegar entre días de la semana:** consultar otro día **no borra** tu sesión planificada; "Entrenar este bloque hoy" crea/inicia la de ese bloque.
- [ ] **Repetir un bloque ya completado:** crea una sesión nueva sin borrar el historial anterior.
- [ ] **Sin conexión (modo avión):** sigues viendo la rutina guardada y puedes marcar series; aparece **"Sin conexión · datos guardados · actualizado hace X"**; al volver la red, se sincroniza solo. Si algo fue rechazado, el panel de sincronización lo explica y permite Reintentar/Descartar.

## 2. Seguimiento de Alumnos (entrenador)

- [ ] **Semáforo semanal** por alumno (rojo/amarillo/verde), "Sin plan" y "Al día — sin pendientes" cuando corresponde.
- [ ] **Buscador** por nombre y **chips de color clicables** (ver solo los rojos, por ejemplo).
- [ ] **Paginación** abajo (cambia "Filas por página" a 10 para ver la página 2 en demo).
- [ ] **Clic en un alumno** → ventana "Actividad" con sus últimas sesiones y el detalle por serie: peso y reps reales, descansos reales, notas del coach. Botón "Abrir ficha completa" que aterriza en la pestaña Entrenamiento.

## 3. Ficha del alumno (expediente)

- [ ] **El historial de sesiones está ARRIBA** en la pestaña "Entrenamiento" (ya no al fondo), con botones de salto "Último · Historial · Rutina".
- [ ] Cada sesión muestra **estado real** (Completada / Omitida con motivo: Descansado/Incompleto), horas locales, volumen, y por serie: prescrito vs real (peso, reps) y descansos.
- [ ] **"Cargar más" / paginación** del historial.
- [ ] **Antropometría en el móvil:** la tabla se convierte en tarjetas (sin scroll lateral).
- [ ] **Plan y tarifa:** asigna plan, "Precio Acordado" (vacío = precio del plan; `0` = becado) y "Tasa Especial"; guarda y verás el badge "Override activo". Puedes quitarlo.
- [ ] **Suspender por pago** y **Reactivar**: verifica en el lado del alumno (sección 7).

## 4. Cobros (entrenador)

- [ ] **Control de Cobros** (menú): 4 indicadores arriba (recaudado del mes, en mora con monto, por vencer, por validar).
- [ ] **Pestañas**: Mora (ordenada por atraso), Por Vencer, En Revisión, Al Día, con contadores.
- [ ] **Bolívares**: si no hay tasa configurada, muestra "—" con aviso hacia Ajustes (no inventa).
- [ ] **Enviar recordatorio** a un moroso: llega la notificación in-app; si lo repites enseguida, avisa que ya se envió hace poco (anti-spam).
- [ ] **Registrar cobro** desde la fila: al liquidar, el alumno sale de mora.
- [ ] **Recordatorios automáticos (por debajo):** emite una cuota desde la ficha y revisa `http://localhost:4000/admin/queues` (si configuraste `BULL_BOARD_USER`/`BULL_BOARD_PASS` en `apps/api/.env`): verás los 4 avisos agendados en la cola "cobranza"; al pagar todo, desaparecen.
- [ ] **Estado "Por Vencer"**: una cuota a ≤5 días del corte se pinta como preventiva y **no** cuenta como mora.

## 5. Directorio de Alumnos

- [ ] Busca por nombre, apellido, correo o documento (filtrando en el servidor, no solo lo visible).
- [ ] **Pestaña "En Mora"**: ahora coincide con el número del KPI (antes decía N y mostraba 0 filas).
- [ ] **Paginación numerada** con "Mostrando X de N" — ya no se pierden alumnos después del número 50.
- [ ] Las filas muestran el **plan real** o "Sin plan asignado" (ya no un "Plan Estándar" inventado).

## 6. Plantillas de ejercicios

- [ ] Crear, editar y desactivar plantillas (con días, series, reps, peso, RPE y notas).
- [ ] Buscador + filtro por nivel + estado.
- [ ] En la ficha del alumno: **"Cargar desde Plantilla"** → elegir plantilla, ajustar cargas antes de confirmar, elegir **Reemplazar** o **Fusionar**.

## 7. Altas, enlaces y accesos

- [ ] **Alta manual**: al crear un alumno, la app te muestra un **enlace de activación copiable** ("Compártelo con tu alumno"). Ábrelo en una ventana de incógnito: crea la contraseña y entra. El enlace **sirve una sola vez**.
- [ ] **Link de inscripción del coach**: la web te muestra tu enlace real (`/onboarding?coach=TU-CODIGO`). Pruébalo con un código inventado (dice "no válido") y con el real (muestra tu nombre y permite registrarse). Al registrarse alguien, te llega una notificación.
- [ ] **Alumno suspendido/pausado**: al entrar, ve la pantalla de bloqueo con el mensaje correspondiente y botón **"Reportar pago"** (sus pagos y cuenta siguen accesibles).
- [ ] **Alumno dado de baja**: ya **no puede iniciar sesión** (mensaje claro).
- [ ] **Admin** (`/admin`, solo superadmin): crear entrenador y ver el enlace de activación; abajo verás la **lista de entrenadores** con su cuenta (activa/deshabilitada), su licencia (activa/suspendida), su `coach_code` y su fecha de alta.
- [ ] **Deshabilitar / Reactivar cuenta:** pulsa "Deshabilitar" en un coach de prueba → aparece una confirmación que explica el efecto; al confirmar, el aviso solo sale si el servidor aceptó. Luego entra con ese coach en una ventana de incógnito: verás **"Su cuenta se encuentra inactiva o bloqueada"**. Reactívalo desde el panel y podrá entrar de nuevo. Repite "Deshabilitar" dos veces: la segunda dice que ya estaba deshabilitado (sin error).
- [ ] **Suspender / Activar licencia:** suspende la licencia de un coach → su login queda bloqueado con el mensaje de licencia y su enlace público (`/onboarding?coach=CODIGO`) deja de resolver. Actívala y ambos vuelven.
- [ ] **Límite honesto de la sesión activa:** un coach que YA tenía sesión abierta sigue dentro hasta que la app vuelve a verificar (recarga o llamada a `/auth/me`); como máximo 15 minutos, porque el token de acceso es corto. No es un bug.
- [ ] **El superadmin sigue sin poder operar el negocio del coach** (recibe "no autorizado").

## 8. PWA, instalación y actualizaciones

- [ ] **Instalar en Android** (Chrome): aparece "Instalar app" en la cabecera.
- [ ] **Instalar en iPhone** (Safari): aparece el instructivo "Compartir → Añadir a pantalla de inicio".
- [ ] **Ya instalada**: se abre sin barra del navegador; el notch y la barra inferior no tapan nada.
- [ ] **Nueva versión**: al desplegar/compilar una versión nueva aparece "Nueva versión disponible · Actualizar" — **nunca se recarga sola**; tú decides cuándo.
- [ ] **Cerrar sesión con cambios sin subir**: pregunta si cancelar, sincronizar o cerrar igualmente.
- [ ] **Zoom con pinza** habilitado (antes estaba bloqueado).

## 9. Tema y accesibilidad

- [ ] **Tema claro**: todo legible (antes los estados eran ilegibles por contraste bajo). Alterna claro/oscuro/sistema.
- [ ] **Teclado (desktop)**: Tab recorre; los modales atrapan el foco; Escape cierra y devuelve el foco; pestañas se mueven con flechas; el botón de sincronización de la cabecera responde a teclado.

## 10. Notificaciones (campana, preferencias y resumen semanal)

- [ ] **Campana (cabecera, coach y alumno):** el icono de campana muestra un **badge** con las no leídas (muestra "9+" si hay más de 9); al pulsarlo se abre el **panel** con las notificaciones agrupadas en **Hoy / Ayer / Anteriores**.
- [ ] **Marcar leídas y navegar:** al hacer clic en una notificación se marca como leída y te lleva a su pantalla (p. ej. un pago aprobado lleva a Conciliación). Arriba está **"Marcar todas como leídas"**; si hay más de las visibles aparece **"Ver más"**. Con la bandeja vacía se ve **"Estás al día"**.
- [ ] **Preferencias del coach:** Ajustes → pestaña **Notificaciones** (o directo `http://localhost:3000/coach/ajustes?tab=notificaciones`). Cada categoría tiene switches **Push** y **Email**; en **Seguridad de Cuenta** el Email sale **bloqueado con candado** y la nota "Obligatorio por motivos de seguridad" (RN-01). "Guardar cambios" persiste y muestra confirmación.
- [ ] **Confirmación RN-02 (Finanzas):** apaga **Push y Email** de la fila de pagos/cobranzas y guarda: debe aparecer el modal **"¿Desactivar todos los avisos de pagos?"** con "Mantener canales activos" y "Sí, desactivar de todos modos"; solo el segundo confirma el guardado.
- [ ] **Preferencias del alumno:** menú del alumno → **"Mis Notificaciones"** (o directo `http://localhost:3000/app/preferencias`). Es la misma matriz del rol alumno, con su candado de Seguridad y su confirmación de Finanzas.
- [ ] **Resumen semanal del coach:** llega a la **campana in-app** (el digest se genera lunes 08:00 UTC; en modo demo se ve un ejemplo sin esperar). Opcional: si configuraste `BULL_BOARD_USER`/`BULL_BOARD_PASS`, entra a `http://localhost:4000/admin/queues` y busca la cola **`notificaciones-resumen-semanal`** (job repetible `notificaciones:resumen-semanal`) y su DLQ.
- [ ] **Modo demo:** con "Modo Coach"/"Modo Alumno" la campana y las preferencias usan datos de ejemplo; al guardar preferencias dice "Preferencias guardadas en esta sesión de demostración" (no finge persistencia).

## 11. Antropometría: check-in, evolución y fotos (RF-003 / RF-004)

**Check-in antropométrico (RF-003)**

- [ ] **Alumno — campos nuevos (RN-02):** en `/app/progreso` el formulario incluye brazo relajado, brazo contraído, muslo medio y los 4 pliegues cutáneos (tríceps, subescapular, suprailíaco, abdominal), opcionales y con validación de rango; los controles viejos siguen viéndose (alias de brazo relajado y muslo medio).
- [ ] **Alumno — banner de ventana:** con calendario configurado, el alumno remoto ve si la ventana está **abierta** ("puedes registrar tu check-in hasta el …"), **próxima** ("tu ventana abre …") o **cerrada** (con la próxima fecha); con la ventana cerrada el botón de registro queda deshabilitado y el motivo visible. Sin calendario no hay banner ni bloqueo (registro libre).
- [ ] **Alumno — presencial en solo lectura:** con modalidad presencial, el formulario se muestra en modo lectura (sin edición); si se fuerza la mutación, el servidor responde 403 y la vista lo explica (nunca un error genérico). En modo demo, el selector "Escenario demo" permite alternar **Remoto en ventana / Remoto fuera de ventana / Presencial (solo lectura)**.
- [ ] **Coach — calendario (ficha del alumno → tab Antropometría):** fija la periodicidad (semanal / quincenal / mensual) + la fecha de inicio; al guardar se muestra la **próxima fecha programada** y el estado de la ventana (vigente / próxima / vencida), leídos del calendario guardado. Activar una periodicidad sin fecha de inicio se rechaza con 400 (no guarda un calendario inerte); "Sin calendario" desactiva la ventana y el alumno remoto vuelve al registro libre.
- [ ] **Coach — cola con fotos y rechazo con motivo (`/coach/antropometria`):** cada evaluación pendiente muestra sus fotos (visor a pantalla completa, **Escape** cierra); "Rechazar" exige un **motivo libre obligatorio** (sin motivo, el botón de confirmar no se habilita) y el alumno lo recibe como retroalimentación; "Aprobar" consolida el registro.
- [ ] **Coach — aviso al recibir un check-in remoto:** con el alumno remoto en ventana, envía su check-in; en la **campana del coach** debe llegar "Nuevo check-in pendiente de validación" con el cuerpo "{alumno} envió su check-in antropométrico; revísalo." y, al pulsarla, abrir la cola `/coach/antropometria`. El registro presencial del coach no genera este aviso.
- [ ] **Coach — aviso al expirar la ventana:** con un alumno remoto que no completó su medición en la ventana (última fecha programada ya vencida), en la campana del coach llega "Check-in antropométrico vencido" con "{alumno} no completó su medición del {fecha}; considera reprogramar." El aviso llega **una sola vez por fecha** aunque el barrido periódico corra varias veces; si el alumno registró su medición (o el coach la tomó) en/después de la ventana, no llega.

**Evolución y fotos (RF-004)**

- [ ] **Alumno — gráfico (`/app/progreso` → "Ver mi antes y después"):** el panel "Evolución corporal" dibuja tus mediciones aprobadas. Cambia las métricas en los chips (hasta 3 a la vez; si intentas una cuarta o cruzar una tercera unidad, aparece el motivo) y cambia el rango **1M / 3M / 6M / 1A / Todo**: la curva, los deltas y la tabla se recalculan.
- [ ] **Tooltip y estados honestos:** pásale el cursor o toca el gráfico y verás la fecha con el valor de cada serie activa; con menos de dos mediciones en el rango, el panel explica por qué no puede graficar (no inventa una línea) y "Ver datos en tabla" muestra la misma serie en tabla.
- [ ] **Galería de fotos propias (alumno):** tus miniaturas por control se abren en un visor a pantalla completa; **Escape** lo cierra y devuelve el foco. Si el enlace temporal (15 min) venció, aparece "El enlace temporal venció" con **Reintentar**; al recargar la sección se piden enlaces nuevos.
- [ ] **Coach — comparador (`/coach/antropometria` → pestaña "Comparador"):** elige alumno y **dos tomas (A y B)**; las perspectivas solo se habilitan si la foto existe en ambas fechas — la que falte queda deshabilitada con "Foto no disponible para esta fecha".
- [ ] **Comparación real:** alterna **Lado a lado** y **Superposición**; en superposición arrastra el slider (también responde a clic y a las flechas del teclado) y verás el reparto "X% A / Y% B"; abajo, "Diferencias (B − A)" de peso y grasa (— si falta el dato, nunca un cero disfrazado). El panel recuerda que las fotos se sirven con enlaces firmados de 15 min.
- [ ] **Ficha del alumno:** en el tab **Antropometría** de la ficha del coach aparece el mismo gráfico, sobre la serie completa del alumno.
- [ ] **Modo demo:** con "Modo Coach"/"Modo Alumno" el gráfico y el comparador usan el fixture de 6 tomas; en sesión real salen de la API (solo controles aprobados).

## 12. Nutrición (RF-002)

**Alumno (`/app/nutricion`, "Mi Comida")**

- [ ] **Ventana del check-in:** abre la pantalla antes de las 18:00 (hora de tu dispositivo): verás el banner **"El check-in aún no está abierto"** y el formulario deshabilitado; no se envía ni se encola nada (el día quedará "No reportado"). Después de las 18:00 el reporte se puede guardar y se refleja en el calendario.
- [ ] **Metas visibles:** la tarjeta "Tus objetivos nutricionales" muestra las metas reales del coach (kcal, proteína, carbohidratos, grasas, agua) y sus recursos por enlace; si el coach no configuró metas, lo declara de forma honesta y puedes reportar igual.
- [ ] **Reporte con fotos:** adjunta de 1 a 4 fotos (JPG/PNG/WebP); se comprimen en el dispositivo (WebP 1920 px / 0.85, con fallback JPEG) antes de subirse. Tras guardar, abre una miniatura para ver el visor (**Escape** cierra y devuelve el foco).
- [ ] **Cola con fotos (sin conexión):** con fotos adjuntas y sin conexión, el reporte queda **guardado en el dispositivo** ("Guardado sin conexión · pendiente de envío (con fotos)"), el formulario se limpia y el día figura "Pendiente de sincronizar" (no se declara registrado). Al volver la red, el panel de sincronización (franja "1 cambio sin sincronizar" o campana del header) lo sube solo: primero las fotos y después el check-in. Si el envío falla por red, el panel lo muestra como **Reintentando** con la evidencia conservada ("conserva N foto(s)…"), y ofrece **Reintentar** y **Descartar**; al descartar se eliminan los blobs del dispositivo.
- [ ] **Tolerancia:** con metas y totales reportados (kcal/proteína) verás "Dentro del margen (±10 %)", "Parcialmente dentro" o "Fuera del margen"; sin metas o sin totales dice **"Sin evaluar"** (nunca un OK falso).
- [ ] **Fallos honestos:** un rechazo de negocio (4xx distinto de 409) se muestra tal cual sin encolar; si ya lo habías registrado hoy (409), refresca el reporte real del servidor en vez de encolarlo. Si el día/ventana cierra antes de que la cola suba las fotos, el rechazo dice "El día ya cerró: el reporte con fotos no pudo registrarse" y la evidencia permanece hasta que decidas descartarla.
- [ ] **Modo demo:** con "Modo Alumno" la ventana horaria no bloquea la simulación y el reporte, las metas y la tolerancia usan el fixture local.

**Coach (ficha del alumno → pestaña Nutrición, `?tab=nutricion`)**

- [ ] **Calendario de 30 días:** los días cerrados sin check-in se muestran como **No reportado** (derivado, en gris); los reportados, con su semáforo real.
- [ ] **Totales vs metas y semáforo:** el panel compara lo reportado contra las metas y clasifica la tolerancia; con datos faltantes dice "sin evaluar".
- [ ] **Fotos del diario:** abre las miniaturas de cada día en el visor accesible (Escape cierra).
- [ ] **Editor de metas:** define kcal, macros, agua y hasta 10 recursos por enlace o PDF subido; al guardar, el alumno ve las metas. Un alumno sin metas no muestra ceros fabricados (204 honesto). Al quitar un PDF y guardar, el archivo se **elimina de la bóveda** (borrado best-effort del servidor, sin aviso nuevo en la UI) y el enlace firmado anterior deja de servirse; un recurso por enlace externo solo deja de listarse.
- [ ] **Paginación declarada:** el calendario trabaja sobre la ventana de 30 días con paginación en cliente (no es un listado server-paginado).
- [ ] **Alerta semanal:** si hay días cerrados sin reporte, el resumen semanal del coach lo menciona (solo cuando el contador es mayor que 0; llega por la campana in-app — sección 10).

## 13. ⛔ Lo que AÚN NO existe (no lo reportes como error)

- **Notificaciones**: proveedores reales de push/email (la entrega sigue **simulada por log**), cliente push del navegador (WebPush sin UI), recordatorio de check-in 06:00 con cron exacto por huso horario (el recordatorio **sí existe**: corre por barrido aproximado en UTC con cadencia de 15 min, que cae dentro de la hora local 6 para offsets de hora entera, media hora y 45 min; sin reemisión si el worker está caído toda la hora local 6) y alerta externa de colas/DLQ (Sentry/Datadog). La campana, las preferencias y el resumen semanal **ya existen** (sección 10).
- **Nutrición**: los recursos educativos del coach pueden ser **enlaces o PDFs subidos** (validados por tipo, firma `%PDF-` y tamaño; se sirven con enlace firmado). Los reportes **con fotos** sin conexión se **encolan completos** (primero las fotos, después el check-in), con la evidencia visible, reintentable y descartable en el panel. La subida real está verificada contra MinIO; falta repetirla contra Cloudflare R2 con credenciales reales. El **borrado al quitar un recurso guardado ya existe**: al guardar metas, los PDFs sin referencia se eliminan de la bóveda (best-effort, verificado contra MinIO). Siguen sin existir la recolección de objetos nunca referenciados (subir sin guardar) y la serialización por alumno del ciclo de metas (carrera residual, [[ADR-015-borrado-best-effort-objetos-boveda]]).
- **Antropometría**: los avisos al coach (check-in remoto recibido y ventana vencida) **ya existen** (sección 11); el único punto documentado es que `POST /antropometria/presigned-upload-url` no evalúa la ventana (la ventana se valida al registrar el check-in; el presencial sigue bloqueado al subir fotos).
- **Admin**: planes/facturación de la plataforma y correo automático de bienvenida pendientes. La gestión de cuentas (deshabilitar/reactivar) y de licencias (suspender/activar) **ya existe** (sección 7).
- **Listas**: los filtros de Conciliación/Evaluaciones/Pagos filtran solo la página visible (la UI lo dice); Plantillas no está paginada.
- **Seguridad**: RLS **ya activo en las 6 tablas** — `rutinas`/`plantillas` (etapa 1), finanzas `planes_membresia`/`cuotas_membresia`/`transacciones_pago` (etapa 2, migración `0012`) y `perfiles_alumno` (etapa 3, migración `0013`), verificado E2E con el rol no-dueño `guachafit_app` (52/52 en la etapa 3, cero errores RLS). Lo único pendiente es el **rol de conexión (D2)**: en dev `DATABASE_URL` sigue apuntando al rol dueño, así que el blindaje no está activo en el entorno normal. Verificación disponible: arranca el API con `DATABASE_URL` del rol `guachafit_app` (así se validó la etapa 3: login, altas, directorio, entrenamiento, antropometría, nutrición y finanzas). Push del navegador no implementado.
- **Extras**: iconos provisionales (mancuerna generada) — si hay logo oficial, se reemplazan; instalación real en dispositivo físico pendiente de tu prueba.

## 14. Cómo reportar un hallazgo

Copia esta plantilla en `00_Inbox/` (o al final de este documento):

```
- Pantalla: (ej. /app/hoy)
- Qué hice: (pasos)
- Qué esperaba: 
- Qué pasó: 
- Captura: (adjuntar)
- ¿Modo demo o sesión real?: 
```
