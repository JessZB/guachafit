---
id: RF-018
modulo: Cuenta
prioridad: alta
estado: aprobado
estado_implementacion: implementado
fecha_verificacion: 2026-10-08
problema_origen: "[[PROB-003-acceso-onboarding-dashboard-central]]"
fecha_creacion: 2026-10-06
version: 1.0
tags:
  - requerimiento
  - rf
  - sdd
  - cuenta
  - perfil
  - seguridad
  - ux
---

# RF-018: "Mi perfil" — Autogestión de la Cuenta para Todos los Roles

## 1. Contexto y Justificación
Hoy cada usuario depende de otra persona para corregir sus propios datos: el alumno no puede cambiar su teléfono ni su contraseña sin pasar por la recuperación, nadie puede cambiar su correo de acceso, y los ajustes personales están dispersos (las notificaciones en "Mis notificaciones" y la zona horaria del reporte de nutrición en la misma pantalla, solo para el alumno).

- **Objetivo:** una sección única **"Mi perfil"**, disponible para el alumno, el entrenador y el administrador, donde cada usuario consulta y edita sus datos básicos, su correo de acceso, su contraseña, sus notificaciones y (el alumno) su zona horaria.
- **Valor aportado:** menos fricción y menos peticiones al entrenador para datos triviales, correo de acceso verificado y ajustes personales en un solo lugar.
- **Trazabilidad:** amplía el acceso autogestionado de [[PROB-003-acceso-onboarding-dashboard-central]] y reubica la matriz de [[RF-015-matriz-preferencias-usuario-canales]] y la zona horaria de [[RF-002-nutricion-agil-reporte-rapido]] / [[ADR-019-zona-horaria-perfil-captura-relativa-nutricion]].

---

## 2. Actores Involucrados
- **Alumno:** edita nombres, apellidos y teléfono de WhatsApp; ve su documento de identidad y fecha de nacimiento; cambia correo, contraseña, notificaciones y zona horaria.
- **Entrenador:** edita nombres, apellidos, nombre comercial y teléfono de contacto; cambia correo, contraseña y notificaciones.
- **Administrador (superadmin):** cambia correo y contraseña (no tiene ficha con nombre ni teléfono).
- **Sistema:** valida, envía los correos de confirmación y de aviso (Brevo, [[ADR-018-proveedor-correo-transaccional-brevo]]) y protege la sesión.

---

## 3. Precondiciones
1. El usuario está autenticado.
2. Para cambiar el correo o la contraseña, conoce su contraseña actual.
3. Para confirmar un cambio de correo, tiene acceso al buzón del correo nuevo.

---

## 4. Reglas de Negocio (Business Rules)

### A. Datos editables por rol (decisión del dueño, 2026-10-06)

| Dato | Alumno | Entrenador | Administrador |
| :--- | :---: | :---: | :---: |
| Nombres y apellidos | Edita | Edita | — |
| Teléfono (WhatsApp del alumno / contacto del entrenador) | Edita | Edita | — |
| Nombre comercial | — | Edita | — |
| Documento de identidad | **Solo lectura** | — | — |
| Fecha de nacimiento | **Solo lectura** | — | — |
| Correo de acceso | Edita con confirmación (§B) | Edita con confirmación (§B) | Edita con confirmación (§B) |
| Contraseña | Edita (§C) | Edita (§C) | Edita (§C) |
| Notificaciones | Edita ([[RF-015-matriz-preferencias-usuario-canales]]) | Edita (RF-015) | — |
| Zona horaria | Edita ([[ADR-019-zona-horaria-perfil-captura-relativa-nutricion]]) | — | — |

- **RN-01 (Identidad del alumno):** el documento de identidad y la fecha de nacimiento se muestran pero no se editan desde Ajustes; la pantalla indica *"Si necesitas corregirlos, pídeselo a tu entrenador."* El entrenador los sigue editando desde la ficha del alumno, como hoy.
- **RN-02 (Validación):** nombres y apellidos de 2 a 100 caracteres; nombre comercial hasta 150; teléfono de 8 a 30 caracteres. Mismas reglas que los esquemas compartidos vigentes; un campo no permitido para el rol se rechaza con 400 y mensaje claro.

### B. Cambio de correo de acceso (decisión del dueño, 2026-10-06)
- **RN-03 (Aviso previo):** antes de enviar, la pantalla avisa: *"Te enviaremos un correo de confirmación a la dirección nueva para comprobar que existe. Hasta que lo confirmes, seguirás entrando con tu correo actual."*
- **RN-04 (Solicitud):** el usuario escribe el correo nuevo y su **contraseña actual**. Si la contraseña no coincide → 400 claro, sin enviar nada. Si el correo ya pertenece a otra cuenta → 409 *"Ese correo ya está en uso."* (el usuario está autenticado y probó su contraseña).
- **RN-05 (Confirmación):** se envía un **enlace de un solo uso** al correo NUEVO, válido **24 horas**. El cambio se aplica solo al abrir el enlace. Una solicitud nueva reemplaza a la anterior. Mientras tanto, la pantalla muestra *"Pendiente de confirmar: <correo nuevo>"* con la opción de **reenviar** o **cancelar**.
- **RN-06 (Aviso al correo anterior):** al confirmarse, el correo ANTERIOR recibe *"Tu correo de acceso a GUACHAFIT cambió a <correo nuevo enmascarado>. Si no fuiste tú, contacta a tu entrenador."* Es una notificación de seguridad: obligatoria por correo ([[RF-015-matriz-preferencias-usuario-canales]] RN-01).
- **RN-07 (Sin proveedor de correo):** sin Brevo configurado (desarrollo), el API devuelve el enlace en la respuesta para poder probarlo, igual que la invitación y la recuperación de contraseña.

### C. Cambio de contraseña
- **RN-08:** exige la contraseña actual y una nueva que cumpla la misma política que la recuperación de contraseña. Al cambiarla se marca `passwordCambiadaEn`: las demás sesiones se cierran al vencer su token de acceso (el refresh las rechaza), y la sesión actual recibe tokens nuevos para no salir. Se envía un aviso de seguridad por correo: *"Tu contraseña de GUACHAFIT cambió."*

### D. Organización de la pantalla
- **RN-09 (decisión del dueño, 2026-10-06: todo en "Ajustes"):** los ajustes personales se unifican en una pantalla **"Ajustes"** por rol, en lugar de "Mis notificaciones", con pestañas:
  - **Alumno** (`/app/ajustes`): Perfil · Correo y contraseña · Notificaciones · Zona horaria.
  - **Entrenador** (`/coach/ajustes`, la pantalla existente): Perfil · Correo y contraseña · Notificaciones · Planes · Tasas de cambio (las dos últimas ya existían).
  - **Administrador** (`/admin/ajustes`): Correo y contraseña.
  - La pestaña activa vive en la URL (`?tab=…`). `/app/preferencias` redirige a `/app/ajustes?tab=notificaciones` para no romper enlaces (p. ej. "Configurar" de la campana). La confirmación del correo nuevo es una pantalla pública: `/confirmar-correo?token=…`.
- **RN-10 (Protección):** los endpoints de contraseña y de correo tienen límite de intentos (throttler) y nunca muestran texto técnico.

---

## 5. Criterios de Aceptación (Given-When-Then / Gherkin)

### Escenario 1: Alumno corrige su teléfono
```gherkin
Given un alumno autenticado en Ajustes > Perfil
When cambia su teléfono de WhatsApp a un número válido y guarda
Then el perfil queda con el teléfono nuevo
  And su entrenador lo ve en la ficha del alumno
  And el documento de identidad y la fecha de nacimiento siguen visibles y sin poder editarse
```

### Escenario 2: Cambio de correo con confirmación
```gherkin
Given un entrenador autenticado en Ajustes > Correo y contraseña
When escribe un correo nuevo libre y su contraseña actual correcta
Then ve el aviso de que se enviará un correo de confirmación al correo nuevo
  And el correo nuevo recibe un enlace válido 24 horas
  And sigue iniciando sesión con su correo actual hasta confirmar
When abre el enlace
Then su correo de acceso pasa a ser el nuevo
  And el correo anterior recibe un aviso de seguridad
```

### Escenario 3: Cambio de correo con contraseña incorrecta
```gherkin
Given un usuario autenticado
When pide cambiar su correo con una contraseña actual incorrecta
Then recibe un mensaje claro de contraseña incorrecta
  And no se envía ningún correo ni cambia nada
```

### Escenario 4: Cambio de contraseña
```gherkin
Given un usuario autenticado en dos dispositivos
When cambia su contraseña desde uno de ellos indicando la actual correcta
Then sigue con la sesión abierta en ese dispositivo
  And el otro dispositivo pierde la sesión al renovar su token
  And recibe un aviso de seguridad por correo
```

### Escenario 5: Enlace de confirmación vencido o reutilizado
```gherkin
Given un enlace de cambio de correo vencido, cancelado o ya usado
When el usuario lo abre
Then ve "El enlace no es válido o venció. Pide uno nuevo desde Ajustes."
  And el correo de acceso no cambia
```

---

## 6. Casos Borde y Excepciones
- **Correo nuevo igual al actual:** 400 *"Ese ya es tu correo de acceso."*
- **El correo nuevo lo toma otra cuenta antes de confirmar:** al abrir el enlace → 409 *"Ese correo ya está en uso."* y el cambio no se aplica.
- **Alumno archivado o cuenta deshabilitada:** no puede iniciar sesión, por lo tanto no accede a Ajustes; un enlace de confirmación pendiente no reactiva nada.
- **Sin conexión:** Ajustes no usa la cola offline; guardar sin red muestra un mensaje claro y no cambia nada.
- **Modo demo:** los guardados se simulan en pantalla y lo indican.

---

## 7. Estado real de implementación

### API (2026-10-06)
- Implementado (2026-10-06, unidad `68d9287`):
  - **Datos:** `GET /usuarios/me/perfil` devuelve `MiPerfilDTO` (correo, rol, correo pendiente y su vencimiento, ficha del alumno o del entrenador; nunca contraseñas ni hashes). `PATCH /usuarios/me/perfil` con contrato **estricto** (`nombres`, `apellidos`, `telefono`, `nombreComercial`): el alumno escribe con su contexto propio (RLS self de `perfiles_alumno`); `nombreComercial` en un alumno o cualquier campo en el superadmin → 400 *"Ese dato no se puede cambiar desde tu perfil."*; ficha ausente → 404.
  - **Contraseña:** `POST /usuarios/me/password` exige la actual y una nueva distinta (misma política que la recuperación); marca `passwordCambiadaEn`, devuelve tokens nuevos para la sesión actual y **anula** el enlace de recuperación y cualquier **cambio de correo pendiente** (quien rota la contraseña puede estar echando a un intruso que pidió el cambio a su buzón). Aviso de seguridad por correo.
  - **Correo:** `POST /usuarios/me/correo` exige la actual; correo ya en uso → 409 *"Ese correo ya está en uso."*; igual al actual → 400. Guarda el correo pendiente con el **hash SHA-256** de un enlace de un solo uso (24 h) y lo envía al correo NUEVO (`/confirmar-correo?token=…`). El enlace copiable solo se devuelve **fuera de producción** y si el correo no salió. `DELETE /usuarios/me/correo-pendiente` lo cancela (idempotente). `POST /auth/confirmar-cambio-correo` (público) aplica el cambio con un UPDATE condicionado al hash, exige la misma regla de acceso que los demás enlaces (cuenta deshabilitada, alumno archivado o coach sin licencia → enlace inválido), traduce una carrera por el índice único (23505) a 409, anula el enlace de recuperación del buzón anterior y avisa al correo ANTERIOR con el nuevo enmascarado.
  - **Protección:** 5 intentos por usuario cada 15 minutos en contraseña y correo (`LimitarIntentosCuenta`); la confirmación pública usa el límite de `restablecer-password`. Los avisos de seguridad sin enlace llevan un identificador propio en la cola (no se descartan por repetidos) y se marcan como críticos.
  - **Migración `0017_usuarios_cambio_correo.sql`:** `usuarios.correo_pendiente`, `token_cambio_correo_hash` y `token_cambio_correo_expira` (aditivas y opcionales; `usuarios` sin RLS y GRANT por tabla).
- **Límites (honestos):**
  - La migración `0017` **no se aplicó ni verificó** contra la BD de desarrollo (Docker apagado durante la validación); solo por lectura del SQL, el journal y el snapshot.
  - Cancelar un cambio de correo no pide la contraseña (solo reduce el riesgo).
  - Con Redis caído un aviso de seguridad se pierde (queda una advertencia en el log); el cambio ya se aplicó.
  - Los límites de intentos viven en memoria: con varias instancias del API cada una cuenta por separado.
  - Las sesiones de otros dispositivos siguen hasta 15 minutos tras cambiar la contraseña (el token de acceso emitido no se corta; deja de renovarse).
- Evidencia: `apps/api/test/bdd/rf018-mi-perfil-datos.spec.ts`, `apps/api/test/bdd/rf018-mi-perfil-seguridad.spec.ts`, `apps/api/test/bdd/api4-correo-real.spec.ts` y `arranque-migraciones-pendientes.spec.ts`; API **1324** aprobados (1 omitida), web **960**; typecheck y build de API y web en verde. Revisado con los 4 enfoques (riesgo, fiabilidad, resiliencia, legibilidad) y validado tras las correcciones.

### Web (2026-10-08, `d5f53ae`)
- **Implementado:**
  - **Pantallas (RN-09):** Ajustes del alumno (`/app/ajustes`, reemplaza a "Mis notificaciones"; `/app/preferencias` redirige a `?tab=notificaciones`), del entrenador (`/coach/ajustes`, ahora abre en Perfil; el menú y Cartera enlazan a `?tab=planes` y `?tab=tasas`) y del administrador (`/admin/ajustes`, solo Correo y contraseña). "Ajustes" en la barra lateral, la barra inferior y los menús de todos los roles. Pestañas con el patrón accesible (flechas, Inicio/Fin) en el mismo orden que se ven.
  - **Perfil:** solo envía lo que cambió; el documento (`V-24123456`) y la fecha de nacimiento del alumno se ven como texto con el aviso de RN-01. Una recarga del perfil no borra lo que el usuario está escribiendo y los campos se bloquean mientras se guarda. Sin conexión se muestra el aviso de datos guardados (la copia puede no ser la última).
  - **Correo y contraseña:** aviso previo de RN-03; pendiente con reenviar (pide la contraseña actual) y cancelar, que no se cruzan entre sí. Al cambiar la contraseña la sesión del dispositivo guarda los tokens nuevos y, si había un cambio de correo pendiente, la pantalla lo quita (RN-08). El enlace copiable de desarrollo solo aparece si el API lo devuelve.
  - **`/confirmar-correo` (pública):** confirma una sola vez al abrirse, sin enviar la sesión abierta; quita el token de la URL (no queda en el historial ni en el Referer) y recuerda el resultado en la pestaña, así recargar no muestra un falso "enlace vencido". Ante un fallo de red o del servidor ofrece "Reintentar".
  - **Sesión con varias pestañas:** si una renovación con el refresh token viejo es rechazada cuando otra pestaña ya guardó tokens nuevos, no se cierra la sesión: la petición se reintenta con el token vigente.
  - **Modo demo:** los guardados se simulan y lo dicen.
- Evidencia: `apps/web/src/lib/ajustes.spec.ts`, `lib/mi-perfil.spec.ts`, `components/ajustes/PiezasAjustes.spec.ts`, `lib/api-client-sesion.spec.ts`, `lib/notificaciones-in-app.spec.ts`; web **1033** aprobados, API **1324** (1 omitida); typecheck y build en verde. Revisado con los 4 enfoques y validado tras las correcciones (17 de 17).

### Web · pendientes cerrados (2026-10-08, `6b52187`)
- **Migración `0017` verificada** contra la BD local (Docker): `usuarios.correo_pendiente` varchar(255), `token_cambio_correo_hash` varchar(64) y `token_cambio_correo_expira` timestamptz, todas opcionales, sin índices (igual que el SQL).
- **Tiempo límite de los guardados:** perfil, contraseña, correo (pedir y cancelar), zona horaria y notificaciones esperan como máximo 15 s (`OPCIONES_GUARDADO_AJUSTES`; opción `tiempoLimiteMs` del cliente de API). Al vencer se cancela la petición y se ve *"No pudimos confirmar si se guardó: la conexión tardó demasiado. Recarga antes de volver a intentarlo."* (no dice "no se guardó": el servidor pudo haberlo procesado). En el cambio de contraseña el aviso es propio, porque si el servidor sí la cambió este dispositivo no recibió los tokens nuevos (RN-08): *"…Si en unos minutos se cierra tu sesión, entra con la contraseña nueva; si no, sigue valiendo la anterior."*
- **Cambio de pestaña con un guardado en vuelo:** Perfil y Correo y contraseña quedan siempre montadas (la inactiva oculta); al volver se ve el resultado. Las contraseñas escritas se borran al ocultar la pestaña (el correo nuevo se conserva) y el aviso de datos guardados se muestra una sola vez.
- **Pruebas de interacción** (jsdom + Testing Library, solo desarrollo; los specs `*.spec.tsx` declaran `// @vitest-environment jsdom`): Ajustes del alumno, del entrenador y del superadministrador, `/confirmar-correo`, la redirección de `/app/preferencias`, zona horaria y matriz de notificaciones.
- Evidencia: `apps/web/src/lib/api-client-tiempo-limite.spec.ts`, `components/ajustes/PantallaAjustes.interaccion.spec.tsx`, `pages/entrenador/AjustesPage.interaccion.spec.tsx` y demás `*.interaccion.spec.tsx`; web **1068** aprobados (87 archivos), API **1324** (1 omitida); typecheck y build en verde. Revisado con los 4 enfoques y validado tras las correcciones (14 resueltos, 7 en seguimiento).

- **Campos compartidos (`e071bf4`, 2026-10-28, lote UX-03):**
  - Los errores de campo de Perfil y Correo y contraseña se anuncian (`role="alert"`).
  - En el móvil, el texto de los campos mide 16px, para que iOS no amplíe la pantalla al tocarlos.
  - `CampoAjustes` admite sufijo de unidad en flujo, descripción, `placeholder` e `inputMode` decimal o numérico.
  - `SelectAjustes` es el selector equivalente, con las mismas reglas de accesibilidad.
  - Planes y Tasas los adoptan en UX-18 y UX-19.
  - Evidencia: web **2502/2502**; typecheck y build en verde. La revisión de fiabilidad no dio BLOCKER.
- **Menú "Cuenta" en la cabecera (`d482f4f`, 2026-10-29, lote UX-04):**
  - Ajustes, el tema (Claro, Oscuro, Sistema) y "Cerrar sesión" están en un menú "Cuenta", en todos los tamaños de pantalla. El menú muestra el correo completo y el rol legible ("Entrenador", "Alumno", "Administrador"); ya no se deriva un nombre del correo.
  - "Cerrar sesión" sigue pasando por el cierre seguro: con cambios sin enviar, pregunta antes.
  - Quedan visibles la campana, la sincronización, el aviso de cambios fallidos e "Instalar app", todos de 44px. La sincronización y los fallidos muestran su número también en el móvil. Sin conexión, el botón lo anuncia primero ("Sin conexión. La sincronización se reanudará al recuperar señal").
  - Con "Instalar app" disponible o con cambios fallidos, el nombre GUACHAFIT se oculta en el móvil (queda el logo) para que la fila quepa a 360px. Peor caso estimado: 338px.
  - Evidencia: web **2543/2543**; typecheck y build en verde. La revisión de fiabilidad dio 1 BLOCKER y 2 WARNING, corregidos y validados.

### Ajustes en una sola pantalla con barra segmentada (`14c796e`, 2026-10-31, lote UX-17, decisión D6)
- **Decisión del dueño (D6):** etiquetas cortas.
  - Entrenador: Perfil, Acceso, Avisos, Planes y Tasa.
  - Alumno: Perfil, Acceso, Avisos y Zona horaria.
  - Perfil sigue siendo la pestaña por defecto y las claves `?tab=` no cambian.
- Los tres roles usan `PantallaAjustes` con `BarraTabsSegmentada` (columnas iguales, sin scroll horizontal a 360px, 44px). La página del entrenador ya no duplica la lógica de URL y pestañas: pasa planes, tasas y avisos por `renderPestana`. Se borró `PestanasAjustes`.
- El nombre accesible de cada pestaña es su etiqueta visible (WCAG 2.5.3). La pestaña Planes muestra el número de planes y se anuncia "Planes: N planes", pero solo cuando la lista ya cargó. Mientras carga o con error no muestra cifra.
- "Nuevo plan comercial" pasa de la cabecera al panel de Planes, junto al contador. El subtítulo del entrenador es "Tu cuenta y tu negocio.". Avisos ya no tiene una tarjeta doble. El entrenador usa un ancho amplio (`max-w-5xl`) para la rejilla de Tasas.
- Evidencia: web **2836 tests en 310 archivos**; typecheck y build en verde. Revisión de fiabilidad sin BLOCKER. Su WARNING (nombre accesible distinto del visible) se corrigió y se validó.

### Pulido de Zona Horaria en Ajustes del Alumno (`0ebda43`, 2026-11-02, lote UX-29)
- **ALU-26:**
  - `SelectorZonaHoraria.tsx`: despliega la hora local actual calculada para la zona seleccionada (`textoHoraActualEnZona(valor)`) con formato en lenguaje natural `"Ahora son las HH:mm en hora de <Ciudad>"` con clase `text-xs text-muted-foreground mt-1` (respetando el piso tipográfico WCAG de 12px).
  - `AjustesAlumnoPage.tsx`: eliminada la cabecera `<h2>Tu zona horaria</h2>` duplicada frente al nombre de pestaña "Zona horaria", manteniendo `aria-label="Zona horaria"` en la tarjeta para preservar accesibilidad semántica.
- **Evidencia:** `apps/web/src/lib/zona-horaria.ux29.spec.ts` (4 tests); web **3057 tests en 344 archivos (1127 suites)**; typecheck y build en verde.

### Zona horaria del alumno: precarga única desde el dispositivo y aviso de discrepancia (`6111326`, 2026-11-03, lote ZH-1, [[ADR-025-zona-horaria-alumno-precarga-dispositivo-aviso-discrepancia]])
- **Precarga única:** al primer inicio de sesión o activación de cuenta, el cliente envía `zonaDispositivo` y el servidor la guarda solo si el perfil aún no tiene la zona definida (`zona_horaria_definida = false`), con un único `UPDATE` atómico. Desde entonces es libre: el alumno la cambia en Ajustes o el entrenador en la ficha, y ambas acciones la marcan como definida. Nunca se vuelve a cambiar sola, ni aunque el alumno viaje.
- **Alumnos existentes:** la migración `0024` los deja como definidos, así que conservan su zona (hoy `America/Caracas` salvo cambios explícitos) y ven el aviso si su dispositivo difiere.
- **Nunca bloquea el acceso:** una zona inválida o ausente se ignora, y un fallo del `UPDATE` se registra como advertencia y el login o la activación continúan.
- **Aviso discreto:** `AvisoZonaDiscrepante`, al final del contenido del layout del alumno (sobre la barra inferior en móvil), con «Zona de tu dispositivo» y «Zona de tu perfil», un enlace «Cambiar zona horaria» y el botón «Entendido». Compara por desfase UTC y no por nombre (Caracas y La Paz no avisan), se descarta por sesión y reaparece si cambia cualquiera de las dos zonas. No aparece para el entrenador, el administrador ni en el modo demo. Al guardar otra zona en Ajustes la sesión se actualiza y el aviso desaparece sin recargar.
- **Evidencia:** web **3112/3112** en 364 archivos; API **406/406** en los specs de auth y alumnos relacionados, con 15 tests propios del lote (`zh1-precarga-zona-dispositivo.spec.ts`); typecheck y build en verde.

### La zona del perfil gobierna los cálculos de fecha del alumno (`6da5794`, 2026-11-03, lote ZH-2, [[ADR-025-zona-horaria-alumno-precarga-dispositivo-aviso-discrepancia]])
- Con ZH-2 la zona que el alumno elige en Ajustes (o la precargada) es la que usan el menú, el «Hoy» del entrenamiento, la fecha de operación del pago y el check-in antropométrico (`useZonaPerfil()`). Si el alumno viaja y no la cambia, esas pantallas siguen en la hora de su perfil y el aviso de discrepancia se lo recuerda.
- Siguen con la zona del dispositivo la agrupación «Hoy/Ayer» de las notificaciones, los gráficos de evolución y `timezoneCliente` de nutrición.
- **Evidencia:** web **3152/3152** en 376 archivos; typecheck y build con código 0.

### Pendiente
- En `/admin`, la página del superadministrador conserva su propio botón "Cerrar sesión" y su diálogo de pendientes, además de los del menú "Cuenta" (preexistente, `CabeceraAdmin.tsx` y `AdminPage.tsx`). Retirarlos exige ajustar `AdminPage.caracterizacion.interaccion.spec.tsx:297`.
- En Notificaciones, Zona horaria, Planes y Tasas, si se cambia de pestaña con un guardado en vuelo el resultado no se muestra al volver (esas pestañas se desmontan).
- La carga del perfil (`GET /usuarios/me/perfil`) no tiene tiempo límite: con una red que no responde queda en "Cargando tu perfil…".
- `jsdom` 30 pide Node ≥ 22.22.2 y el repo no declara versión mínima de Node (solo afecta a las pruebas).
- Mantenibilidad: los specs de interacción de Ajustes repiten mocks y datos de prueba. (Resuelto en UX-17: la duplicación de paneles entre `PantallaAjustes` y la página del entrenador, y los paneles inexistentes de `aria-controls`.)
- (UX-17) `etiquetaPestanaAjustes` (nombres largos) ya no se usa en la UI; solo la exige `lib/ajustes.spec.ts`. Falta un test directo de `etiquetaCortaPestanaAjustes` y de los bordes del conteo de planes (error y 0 planes).
