---
id: RF-011
modulo: Onboarding
prioridad: alta
estado: parcial
version_implementada: v1.0.0
fecha_verificacion: 2026-10-26
problema_origen: "[[PROB-003-acceso-onboarding-dashboard-central]]"
fecha_creacion: 2026-09-06
version: 1.0
tags:
  - requerimiento
  - rf
  - sdd
  - onboarding
  - clientes
  - ficha-salud
---

# RF-011: Onboarding Híbrido de Alumnos (Registro Manual y Enlace Único Deep Link)

## 1. Contexto y Justificación
Permite al entrenador captar e incorporar alumnos tanto en el entorno físico del gimnasio (mostrador) como en el canal digital a distancia. Combina la carga rápida de fichas completas por parte del coach con un mecanismo de autorregistro autónomo mediante enlaces personalizados.

- **Objetivo:** Estandarizar la recopilación de datos de identidad, contacto, cálculo dinámico de edad y antecedentes de salud, facilitando la entrega de credenciales.
- **Valor aportado:** Reducción del tiempo de alta a menos de 2 minutos, captura de factores de riesgo clínico y automatización en la vinculación del alumno con su coach.
- **Trazabilidad:** Resuelve la fricción y desorden en la captura de clientes de [[PROB-003-acceso-onboarding-dashboard-central]].

---

## 2. Actores Involucrados
- **Entrenador:** Introduce la ficha del cliente presencial o comparte su enlace de captación.
- **Alumno:** Completa su autorregistro online o activa sus credenciales mediante el correo de bienvenida.

---

## 3. Precondiciones
1. El entrenador debe tener una cuenta activa en la plataforma y contar con su `coach_code` generado.

---

## 4. Reglas de Negocio (Business Rules)

### Vía A: Registro Manual por el Entrenador
- **RN-01 (Documento de Identidad):** Selector obligatorio de tipo de documento:
  - `V-` (Cédula de Identidad Venezolana)
  - `E-` (Extranjero residente)
  - `Pasaporte / Otro` (Para clientes internacionales)
  - Número de documento (alfanumérico validado según tipo).
- **RN-02 (Cálculo Automático de Edad en Tiempo Real):** El formulario solicita la `fecha_nacimiento`. El sistema calcula y renderiza dinámicamente la edad exacta en años al lado del campo:
  $$\text{Edad} = \text{floor}\left(\frac{\text{now}() - \text{fecha\_nacimiento}}{365.25 \text{ días}}\right)$$
- **RN-03 (Datos de Contacto y Login):**
  - Nombres y Apellidos.
  - Teléfono / WhatsApp (con selector de código de país internacional, ej. `+58`, `+57`, `+1`).
  - Correo electrónico (único a nivel de sistema; actúa como *username* de inicio de sesión).
- **RN-04 (Ficha de Salud y Observaciones Privadas):** Campo de texto enriquecido / notas confidenciales visible **exclusivamente para el entrenador** (nunca visible para el alumno), destinado a registrar:
  - Lesiones previas, hernias discales, cirugías recientes.
  - Patologías cardíacas, hipertensión, diabetes.
  - Medicación actual o advertencias biomecánicas para la sesión física.
- **RN-05 (Entrega de Credenciales por Token):** Al guardar la ficha manual, el sistema dispara automáticamente un correo transaccional de bienvenida con un token seguro de un solo uso (TTL de 48 horas) para que el alumno cree su contraseña.

### Vía B: Registro Autónomo mediante Enlace Único (Deep Link)
- **RN-06 (Estructura del Enlace):** Cada entrenador dispone de una URL personalizable:
  $$\text{https://app.guachafit.com/registro?coach\_code=XYZ}$$
- **RN-07 (Vinculación Automática al Tenant):** Cuando un usuario completa el formulario público a través de ese enlace, el backend:
  1. Valida que el `coach_code` exista y que su entrenador esté operativo (cuenta habilitada y licencia vigente); un código inexistente, una cuenta deshabilitada o una licencia suspendida responden con el mismo 404 uniforme.
  2. Crea la cuenta del alumno vinculada automáticamente al `entrenador_id` correspondiente.
  3. Establece la contraseña definida por el usuario en el formulario.
  4. Envía una notificación push y correo al coach: *"Nuevo alumno registrado: [Nombre Completo]"*.

### Vía C: Gestión Centralizada y Expediente Deportivo 360°
- **RN-08 (Directorio Dinámico con Toggle Cards / Tabla):** El listado principal de alumnos cuenta con un selector de visualización:
  - *Cards Compactas Densas:* Tarjetas escaneables de ~120px de altura con avatar circular, semáforo de pagos (`Al Día`, `Por Vencer`, `Moroso`), badges de modalidad y estado, botón directo de WhatsApp y navegación al expediente.
  - *Vista Tabla:* Filas ordenables de alta densidad operativa.
  - KPIs en cabecera con recuento de alumnos totales, activos, pausados, morosos y modalidades.
  - *Actualización 2026-10-19 (lote "Mis alumnos"):*
    - Los KPIs pasan a ser **chips de filtro con conteo**: Vigentes (por defecto, sin archivados), Activos, Pausados, En mora y Archivados.
    - Cada alumno muestra su **último entreno** (aviso a partir de 7 días sin entrenar) y su **racha efectiva**.
    - La lista se puede **ordenar** por alta más reciente (por defecto), nombre A-Z, sin entrenar primero o mayor racha. El orden se aplica en el servidor.
    - El enlace de captación se abre desde el botón **"Invitar"**.
- **RN-09 (Expediente Deportivo 360° - `/coach/alumnos/:id`):** Al seleccionar un alumno, se accede a una pantalla dedicada con cabecera fija de identidad y 5 pestañas de gestión operativa (nombres desde 2026-10-26; la URL conserva `?tab=resumen|finanzas|antropometria|entrenamiento|nutricion`):
  1. *Perfil:* Datos personales, "Salud y limitaciones" (texto cifrado con AES-256-GCM, hasta 2000 caracteres) y "Plan y tarifa" (`RF-005`) con precio acordado y tasa especial.
  2. *Pagos:* Resumen del mes actual, histórico acumulado de cobros y modal de Cobro Directo Inteligente en sala.
  3. *Medidas:* Métricas biométricas con deltas comparativos, histórico de check-ins y fotos evolutivas.
  4. *Entrenos:* Planificación semanal por bloques de días con series/reps y auditoría de última sesión con RPE y reporte de molestias.
  5. *Nutrición:* Metas nutricionales y calendario de reportes del alumno.

---

## 5. Criterios de Aceptación (Given-When-Then / Gherkin)

### Escenario 1: Alta Manual con Cálculo Dinámico de Edad
```gherkin
Given que el entrenador se encuentra en el formulario "Nuevo Alumno"
When selecciona tipo "V-", introduce "18456123", nombres "Marcos", apellidos "Perez"
  And selecciona fecha de nacimiento "1994-05-15"
Then la interfaz debe mostrar automáticamente la etiqueta "Edad: 32 años"
  And al guardar, debe enviar el correo de bienvenida con el token de creación de contraseña a Marcos
```

### Escenario 2: Autorregistro Autónomo vía Deep Link del Entrenador
```gherkin
Given que un prospecto accede a "https://app.guachafit.com/registro?coach_code=ALEXFIT"
When completa sus datos personales, email y crea su contraseña directamente
Then el sistema debe crear la cuenta en estado "Activo"
  And vincular al alumno inmediatamente bajo la cartera del entrenador "ALEXFIT"
  And disparar una notificación al entrenador: "Nuevo alumno registrado: [Nombre]"
```

### Escenario 3: Confidencialidad de la Ficha de Salud Privada
```gherkin
Given que el entrenador registró en la ficha de salud: "Hernia discal L4-L5, evitar sentadilla libre pesada"
When el alumno inicia sesión en su aplicación móvil y consulta su perfil
Then el alumno NO debe tener acceso ni visibilidad sobre este campo de notas privadas
  And el entrenador sí debe poder consultarlo rápidamente antes de cada entrenamiento
```

### Escenario 4: Navegación al Expediente 360° desde Tarjeta Compacta
```gherkin
Given que el entrenador está en el Directorio de Alumnos en vista de Cards Compactas
When hace clic sobre la tarjeta del alumno "Carlos Mendoza"
Then la aplicación debe navegar a "/coach/alumnos/al-001"
  And renderizar la cabecera fija con sus datos personales, estado y semáforo de pago
  And cargar las 4 pestañas 360° (Resumen, Finanzas, Antropometría, Rutinas)
```

---

## 6. Casos Borde y Excepciones
- **Enlace con Coach Code Inválido, Desactivado o Suspendido:** Si un usuario intenta registrarse con un `coach_code` que no existe, o cuyo entrenador tiene la cuenta deshabilitada o la licencia suspendida, el backend responde el mismo 404 uniforme que ante un código inexistente y el sistema muestra el mensaje amigable: *"El código de entrenador no es válido o no está disponible. Por favor contacta a tu coach."*
- **Correo Electrónico Duplicado:** Si el email ya existe en la base de datos de la plataforma, el sistema debe indicar: *"Este correo ya se encuentra registrado. Si eres tú, inicia sesión o recupera tu contraseña."* (Nota 2026-10-04: el texto sigue vigente y la web añade un enlace "Ir a iniciar sesión". Resuelto (2026-10-04, API-4 `79ba082`): la recuperación de contraseña que menciona **ya existe**: "¿Olvidaste tu contraseña?" en el login → `/recuperar` (pide el enlace) → `/restablecer?token=…` (nueva contraseña); detalle en [[RF-010-rbac-jerarquia-aislamiento-tenancy]] §7.)
- **Alumno Sin Cuotas Emitidas en el Semáforo:** Si un alumno recién registrado no posee aún ninguna cuota emitida, el semáforo se mostrará en gris neutro con etiqueta "Sin Cuota Emitida".

---

## 7. Estado real de implementación

- Resuelto (2026-09-21): deep link con `coachCode` REAL (perfil del coach + `construirLinkOnboarding`), validación de licencia activa (404 uniforme) y notificación al coach del nuevo registro (evento `ALUMNO_REGISTRADO`). Sin hardcodes.
- Resuelto (2026-09-21): el alta manual entrega credenciales con token de un solo uso (TTL 48 h) y enlace copiable a la página pública `/activar`; el canje establece la contraseña (RN-05). El envío automático por correo transaccional quedó resuelto el 2026-10-04 (ver API-4 abajo).
- Resuelto parcial (2026-09-21): "Sin cuota emitida" ya se rotula correctamente vía etiquetas centralizadas (`apps/web/src/lib/etiquetas-dominio.ts`). El estado de datos `Por Vencer` sigue sin existir.
- Implementado (2026-09-24, unidad CASCADA-COACH): la resolución pública del `coach_code` y el registro público exigen un entrenador **operable** (cuenta habilitada + licencia vigente): un código inexistente, una cuenta deshabilitada y una licencia suspendida comparten la misma respuesta 404 uniforme en ambos flujos ([[ADR-016-cascada-acceso-coach-alumnos-autenticacion]]).
- Implementado (2026-10-04, front módulos 1-2 `ea18172`) — registro público sin datos falsos:
  - El formulario de `/onboarding` ya **no precarga teléfono ni fecha**: el campo **WhatsApp es obligatorio** (`apps/web/src/components/common/CampoWhatsapp.tsx`), con prefijo de país editable y aviso si el número incluye el código de país; la fecha de nacimiento es obligatoria con tope en la fecha local y la edad se calcula en vivo (RN-02).
  - **Ruta `/registro`** (la de RN-06) redirige a `/onboarding` conservando el código del coach (`coach_code` → `coach`) (`apps/web/src/router.tsx`, `apps/web/src/lib/onboarding-links.ts`).
  - Activación y registro con botón "Ir a iniciar sesión" y enlace ante correo ya registrado; diálogo de confirmación accesible en lugar de `window.confirm`, copia de enlaces con aviso si falla, etiquetas asociadas, autocompletado correcto y objetivos táctiles de 44px.
- Implementado (2026-10-04, LOTE API-3 `bc53864`): el **alta manual y el registro público de alumno se crean en una sola transacción** (usuario + perfil): un fallo a mitad ya no deja cuentas a medias.
- Resuelto (2026-10-04): el **correo transaccional de bienvenida** (RN-05 / Escenario 1) y la recuperación de contraseña ya están implementados (API-4, bloque siguiente). El enlace copiable (`/activar`) se mantiene como respaldo.
- Evidencia: web 701 → **771** tras los módulos 1-2 del front; API **986** tras API-3.
- Implementado (2026-10-04, API-4 `79ba082`) — correo de bienvenida del alta manual (RN-05 / Escenario 1):
  - **Mecanismo real:** tras confirmar la transacción del alta, `alumnos.service` publica el evento `correo-cuenta.bienvenida-alumno` (EventEmitter2); el `NotificationDispatcherService` lo escucha (`correo-cuenta.**`), arma el correo (plantilla + `APP_URL` + enlace `/activar?token=…`) y lo encola en `notificaciones-email` (BullMQ); el worker de email lo entrega con el adaptador Brevo ([[ADR-018-proveedor-correo-transaccional-brevo]]). El servicio de negocio nunca envía el correo. Los correos de cuenta no pasan por la bandeja In-App ni por la matriz de preferencias (RF-015): se envían siempre.
  - **Respuesta honesta:** `POST` del alta devuelve `correoEnviado`; es `true` solo si la cola confirmó el job en ≤ 2,5 s **y** hay proveedor real configurado (`BREVO_API_KEY` + `EMAIL_REMITENTE`). Con `true` el mensaje dice *"Le enviamos un correo con el enlace… Si no le llega, compártele el enlace de activación."*; con `false` (Brevo sin configurar, Redis caído o cola lenta) dice *"Comparte el enlace de activación con tu alumno…"*. Un fallo del bus o de la cola **nunca tumba el alta**.
  - **Respaldo:** la web sigue mostrando el enlace copiable (válido 48 h, un solo uso) en ambos casos; la vigencia sale de una sola fuente (`packages/shared/src/cuenta.ts`).
  - **Límites honestos:** `correoEnviado: true` significa "encolado con proveedor real", **no** "entregado en el buzón" (un rechazo posterior de Brevo va a la DLQ sin avisar al coach); un `add` ya enviado a ioredis no se puede retirar, así que si Redis vuelve tras el límite el correo puede salir tarde (el enlace sigue sirviendo mientras no venza); el tope del plan gratuito de Brevo es de 300 correos/día (ADR-018).
  - Evidencia: API 986 → **1087** tests (1 skipped; `apps/api/test/bdd/api4-correo-real.spec.ts`, `api4-correo-garantias.spec.ts`, `rf011-wu-e-onboarding.spec.ts`); web 785 → **797**.
- Implementado (2026-10-19, lote "Mis alumnos" `26917bb`): directorio rediseñado para que el coach priorice (RN-08, Escenario 4).
  - **Privacidad:**
    - `GET /alumnos` ya no selecciona, descifra ni envía `fichaSaludPrivada` (`sanitizarPerfilDirectorio`).
    - La ficha de salud solo viaja en el detalle `GET /alumnos/:id` (Escenario 3).
  - **Señales por alumno** (`AlumnoDirectorioItemDTO`):
    - `ultimaSesionFecha` es el `MAX(fecha_fin_utc)` de las sesiones COMPLETADA. Lo calcula una subconsulta escalar correlacionada, acotada a las filas ya filtradas por `entrenador_id`, porque `sesiones_entrenamiento` no tiene RLS.
    - `rachaDias` es la racha **efectiva**: 0 si `rachaUltimaFecha` es anterior a ayer en el día local del alumno, con la misma regla que `calcularRachaEfectiva`.
    - `rachaUltimaFecha`.
  - **Orden** (RN-08, "filas ordenables"):
    - Parámetro `orden` = `alta_reciente` (por defecto) | `nombre` | `sin_entrenar` (los que nunca entrenaron, primero) | `mayor_racha`.
    - Se aplica en SQL antes de `limit`/`offset`, con desempate por `id` ([[ADR-013-paginacion-server-side-stack-listas]]).
    - En `mayor_racha`, el "ayer" de cada zona de la cartera se calcula en JS y llega como parámetro. Así una zona horaria inválida no provoca un 500 en el directorio y usa el mismo respaldo UTC que el mapeo del ítem.
  - **Rendimiento:** migración `0023` con el índice `idx_sesiones_alumno_estado_fin (alumno_id, estado, fecha_fin_utc)`.
  - **Web** (`/coach/alumnos`):
    - Título "Mis alumnos".
    - Chips con conteo como único filtro de estado. "Vigentes" va por defecto y ya no mezcla bajas.
    - Selector "Ordenar por".
    - Diálogo "Invitar" con el enlace de captación (`ModalEnlaceCaptacion`), en lugar del banner fijo.
    - Tarjeta con estado de activación, modalidad legible, último entreno ("Sin entrenar hace N días" con icono a partir de 7 días) y racha.
    - Tabla de 8 columnas: Alumno, Estado, Modalidad, Plan, Último entreno, Racha, Pago y Acciones.
    - Esqueleto de carga, sin "0" falsos en los chips.
    - Aviso con "Reintentar" si falla una recarga con la lista en pantalla.
  - **Accesibilidad:**
    - La tarjeta deja de ser un `role="button"` con controles anidados. El nombre es el botón principal y cubre la tarjeta ("stretched link"). WhatsApp y Restaurar son controles hermanos: Enter sobre ellos ya no abre el expediente.
    - Foco visible en el buscador y en `ChipFiltro`.
  - **Límites honestos:**
    - Si falla la petición de **otro** filtro, orden o página, se ve el error a pantalla completa. No se muestran filas de otro filtro como si fueran las actuales.
    - ~~La vista no indica la antigüedad de los datos servidos desde la caché offline.~~ Resuelto el 2026-10-26 (`0c75f50`, ver abajo).
    - En el modo demo la racha se cuenta con el día local del navegador.
  - **Seguimiento:** los tres puntos se cerraron el 2026-10-26 (bloque siguiente).
  - **Evidencia:**
    - web **2220/2220**;
    - API **1954** (53 saltados);
    - E2E contra Postgres `mis-alumnos-directorio-orden.e2e.spec.ts` **24/24**;
    - typecheck y build de shared, API y web en verde;
    - revisión 4R sin BLOCKER, con sus 13 hallazgos corregidos y validados.
- Implementado (2026-10-26, `0c75f50`): seguimiento del lote "Mis alumnos".
  - **Badges en una línea:** `ui/BadgeEstado` ya no parte su texto ni se encoge dentro de un flex (`whitespace-nowrap shrink-0`). "Cuota pendiente" se ve en una sola línea. Las filas donde un badge largo podía desbordar a 360px dejan bajarlo de línea (`flex-wrap` / `min-w-0`): tarjeta de "Mis alumnos" (pago y acciones), evaluación antropométrica, fila de pago y resumen de cuota del alumno.
  - **Frescura sin conexión ([[ADR-014-actualizaciones-guiadas-sw-frescura-offline]]):** fuera de demo y sin conexión, con lista visible se muestra `AvisoDatosOffline` ("Sin conexión · datos guardados · actualizado hace N"), datado con la URL exacta de la página consultada. Sin datos guardados, "Sin conexión y sin datos guardados" sustituye a la pantalla de error genérica. Sin conexión no se apila además el aviso de error de recarga. Al reconectar el aviso desaparece.
  - **Móvil:** buscador y "Ordenar por" en una sola fila; en móvil la etiqueta queda para lectores de pantalla y un icono la sustituye visualmente.
  - **Frontera de módulos ([[ADR-023-casos-de-uso-servicios-api]]):** `calcularRachaEfectiva` vive en `apps/api/src/common/racha.util.ts`; `reglas-racha.ts` la re-exporta (misma referencia) y `alumnos` ya no importa de `entrenamiento` (lo vigila `mis-alumnos-racha-comun.spec.ts`).
  - **Corrección posterior (`67399c2` y segundo arreglo):** la flecha decorativa `>` de la tarjeta estaba dentro del contenedor de acciones (`z-10`) e interceptaba el clic sin hacer nada. `pointer-events-none` solo en la flecha no bastó: el clic caía en el contenedor. Ahora el contenedor lleva `pointer-events-none` y solo WhatsApp y Restaurar llevan `pointer-events-auto`; la flecha y los huecos llegan al enlace extendido del nombre y abren el expediente (spec `TarjetaAlumnoDirectorio.interaccion.spec.tsx`, que fija clases porque jsdom no hace hit-testing; web **2244/2244**). La tabla no tiene el problema: su flecha es un botón real.
  - **Límite honesto:** si la conexión se pierde a mitad de sesión y se pide una combinación nueva de filtros, TanStack Query pausa la consulta y se ven los esqueletos hasta reconectar (comportamiento previo, sin aviso propio).
  - **Evidencia:** web **2236/2236**; API **2015** (1 saltado); typecheck y build de API y web en verde; revisión de fiabilidad sin BLOCKER, con H1–H3 y H5 corregidos y validados y H4 (ancho del buscador a 360px) llevado a la guía manual.
- Implementado (2026-10-26, `ad1788f`): rediseño de textos, badges y formularios de la ficha del alumno (`/coach/alumnos/:id`), solo web.
  - **Tabs:** Perfil · Pagos · Medidas · Entrenos · Nutrición. Las claves de `?tab=` no cambian, así que los enlaces desde cartera y actividad siguen válidos. El tab Pagos con deuda anuncia "Saldo pendiente N dólares" y muestra el saldo con dos decimales.
  - **"Salud y limitaciones":** sustituye a "Alerta Médica". La cabecera muestra el texto con 2 líneas (completo en el `title`) y "Ver detalle"; la tarjeta de edición tiene contador `N/2000`. No cambia ningún dato, DTO ni la API: sigue siendo el mismo campo cifrado de texto libre.
  - **Badges:** pago, activación y modalidad usan `ui/BadgeEstado`, que no parte su texto (`whitespace-nowrap shrink-0`). Las filas con badge junto a texto largo (cuota, transacción, ejercicio, historial) dejan bajar el badge de línea. El estado de una transacción es un badge, y el monto rechazado o revertido deja de verse en verde con "+".
  - **Formularios:** etiquetas asociadas a su campo (`useId`), campos de al menos 44px, `inputMode` numérico en importes y medidas, y una columna en móvil. "Override" y "(RF-005)" desaparecen del texto visible: se dice "Plan y tarifa", "Precio acordado (USD)" y "Tasa especial (Bs por USD)".
  - **Rutina de un alumno archivado:** los botones de editar y asignar rutina quedan deshabilitados, como ya lo estaba "Cargar desde plantilla".
  - **Evidencia:** web **2343/2343**; typecheck y build en verde; revisión de los cuatro enfoques sin BLOCKER, con los hallazgos introducidos por el lote corregidos y validados.
  - **Tabs segmentadas (`8b4504a`, 2026-10-26):** la barra de pestañas es un control segmentado de 5 columnas iguales sin scroll horizontal. En móvil el icono va sobre una etiqueta de 11px y el saldo de la deuda es un punto en la esquina de Pagos (el lector de pantalla anuncia "Saldo pendiente N dólares"); desde `sm`, icono y texto en línea y el importe visible. Web **2351/2351**; la revisión de fiabilidad no dio BLOCKER ni WARNING.
  - **Límite honesto:** con zoom de texto al 200% la etiqueta "Nutrición" puede cortarse con elipsis, y una sexta pestaña exigiría replantear la barra (cuadrícula fija de 5).
  - **Carga honesta y recarga silenciosa (`f22ba4c`, 2026-10-26/28):**
    - Tras confirmar un cobro, la ficha se actualiza en segundo plano: no vuelve el spinner a pantalla completa, se conservan el tab, el scroll y los modales, y no se pisa lo que el entrenador estaba escribiendo en los datos personales, la ficha de salud y el calendario de check-in.
    - Si la actualización falla, la ficha conserva lo que ya muestra y avisa en la cabecera: "No se pudo actualizar la ficha. Los datos mostrados pueden estar desactualizados."
    - Una respuesta de una carga antigua ya no sustituye a la de una más reciente (contador de generación).
    - Los fallos de carga tienen su propio canal (`avisoCarga`), separado del de guardado: se muestran en la cabecera de cualquier tab, se limpian al empezar la siguiente carga y el error de guardado de Perfil ya no aparece en Pagos o Entrenos.
    - Rutina: un fallo de red o 5xx se ve como "No se pudo cargar la rutina semanal" con "Reintentar" (un solo clic efectivo por petición), y ya no como "aún no tiene una rutina". La API responde 204 sin cuerpo cuando no hay rutina. El aviso se limpia al guardar una rutina con éxito.
    - También avisan, en lugar de fallar en silencio, el catálogo de planes y la última sesión (un 404 de última sesión significa "sin sesiones" y no avisa).
    - Evidencia: web **2371/2371**; typecheck, build y guardianes en verde (`use-expediente-alumno.ts` 375/400; `AlumnoDetallePage.tsx` 300/300). La revisión de fiabilidad dio 1 BLOCKER y 3 WARNING, corregidos y validados.
  - **Límites honestos de la carga:**
    - El borrador de "Plan y tarifa" (plan elegido, precio acordado, tasa especial y fecha de inicio) sí se rehidrata desde el servidor en cada recarga, también la silenciosa; si el entrenador lo edita sin guardar y luego cobra, se pierde.
    - La recarga vuelve a la página 1 de los historiales (lo deseable para ver el cobro nuevo, pero también reinicia la página que se miraba).
    - La carga sigue siendo una cascada de ~8 peticiones secuenciales; paralelizarla es un lote aparte por su riesgo.
    - En modo demo, el cobro no dispara la recarga.
  - **Reorganización por tab (`3535cde`, 2026-10-28):**
    - *Entrenos:* la rutina semanal asignada va primero, luego el último entrenamiento y al final el historial (revierte la decisión WU16 de historial arriba). Se quitan las píldoras de ancla; "Ver historial completo" sigue llevando al historial.
    - *Perfil:* orden datos personales → "Salud y limitaciones" → "Plan y tarifa" → "Guardar cambios" → "Zona horaria del alumno" (fuera del formulario, porque se guarda sola). Junto al botón aparece "Cambios sin guardar" cuando se modifican los datos personales o la ficha de salud (no lo activan el calendario de check-in, que se guarda en Medidas, ni los espacios sobrantes).
    - *Zona horaria:* se edita en Perfil y ya no en Nutrición, que muestra "La zona horaria del alumno se cambia en Perfil." El texto dice que la zona gobierna las fechas de cuotas y reportes de nutrición.
    - *Medidas:* "Medidas y evolución" con el botón "Registrar control"; primero las métricas, el gráfico y el historial de controles, y al final el calendario de check-in plegado (`<details>`), cuyo resumen muestra la periodicidad **guardada** o "Sin configurar".
    - Evidencia: web **2383/2383**; typecheck, build y guardianes en verde (`AlumnoDetallePage.tsx` baja a 284/300 al extraer `PestanaNutricionAlumno`). La revisión de fiabilidad no dio BLOCKER; sus 2 WARNING y 2 SUGGESTION se corrigieron y validaron.
  - **Límite honesto (preexistente, API):** hay dos columnas de zona horaria. La que edita el entrenador es `perfiles_alumno.zonaHoraria` (cuotas, planes y nutrición); el calendario de mediciones antropométricas y sus recordatorios usan `usuarios.timezone`, que este cambio no toca. Unificarlas es una decisión de API pendiente.
  - **Cabecera (`b6c2dc2`, 2026-10-28):**
    - *Menú "Más acciones":* WhatsApp queda visible y Pausar/Reactivar, Suspender por pago y Archivar pasan a un menú (Radix `DropdownMenu`, ya instalado). Cada acción abre la misma confirmación de siempre (RF-012). Con el alumno archivado solo se ve "Restaurar Alumno".
    - *Chip "Salud y limitaciones":* sustituye al aviso de dos líneas. Va plegado y el texto de salud no está en la página hasta que se abre; se elimina el `title` que lo exponía al pasar el puntero. Abierto muestra el texto completo (con altura máxima y desplazamiento accesible por teclado) y "Editar en Perfil". Escape lo pliega; se cierra al cambiar de alumno.
    - *Franja de datos clave:* bajo la cabecera, cuatro accesos a su tab: saldo pendiente ("Sin deuda" si no hay), próxima cuota, último entreno (mismo respaldo al historial que Entrenos; "Entrenamiento en curso" si hay una sesión abierta) y peso del control más reciente (independiente de la página que se mire en Medidas). Sin dato muestra "—". Usa solo datos que la ficha ya carga.
    - Evidencia: web **2427/2427**; typecheck, build y guardianes en verde (`AlumnoDetallePage.tsx` 289/300). Revisión de los cuatro enfoques más verificación: 1 BLOCKER (la próxima cuota siempre salía "—" porque la API envía la fecha ISO con hora) y 6 WARNING, todos corregidos y fijados con tests sobre el formato real de la API.
  - **Rediseño de la ficha del alumno cerrado** (L1–L7, 2026-10-26/28). Quedan como lotes posibles, no decididos: proteger el borrador de "Plan y tarifa" en la recarga, paralelizar la carga inicial, fusionar los KPI de Pagos y unificar las dos zonas horarias (API).
