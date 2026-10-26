---
id: GUIA-PRUEBAS
titulo: "Guía de Pruebas Manuales — GUACHAFIT"
fecha: 2026-10-05
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
> **Estado del código:** con pruebas automáticas en verde (**960** de la web + **1324** del API (1 omitida), más 1 E2E de bóveda que corre solo con MinIO arriba). Lo de abajo es lo que las pruebas automáticas **no pueden** ver: la vivencia real.

---

## 0. Cómo levantar todo (una sola vez por sesión)

1. **Docker Desktop abierto** (Postgres, Redis y MinIO deben estar corriendo).
2. **Base de datos al día** (solo si es la primera vez o hubo cambios de esquema):
   `pnpm --filter @guachafit/database db:migrate`
   → Desde 2026-10-04 hay dos migraciones nuevas: `0014` (indicaciones del coach en la sesión del alumno) y `0015` (recuperación de contraseña: 3 columnas opcionales en `usuarios`). El API revisa al arrancar que no falten migraciones: en desarrollo solo avisa en la consola; en producción no arranca.
3. **Datos de ejemplo** (⚠️ borra y recarga los datos):
   `pnpm --filter @guachafit/database db:seed`
   → Las credenciales de prueba están definidas en `packages/database/src/seed.ts`. Todos los usuarios usan la contraseña **`Password123!`**:

   | Rol | Correo | Para probar |
   |---|---|---|
   | Superadministrador | `admin@guachafit.com` | `/admin`: alta y lista de entrenadores, cuentas y licencias; `/admin/ajustes` (solo correo y contraseña) |
   | Entrenador | `entrenador@guachafit.com` | Carlos Silva, código de coach `GUACHA-COACH`: panel, alumnos, plantillas, cobros, cartera, conciliación y ajustes |
   | Alumno | `andres.perez@guachafit.com` | Al día (plan de $35 pagado por Zelle) y con una sesión completada: entrenamiento, progreso y nutrición |
   | Alumno | `mariana.gomez@guachafit.com` | Pago pendiente de revisión (Bs. 1.295 a tasa 37,00): conciliación desde el entrenador |
   | Alumno | `roberto.mendoza@guachafit.com` | Moroso, con una cuota de $40 vencida hace 5 días: cartera y recordatorios |
   | Alumno | `valeria.castillo@guachafit.com` | En onboarding, con el código `GUACHA-8821` |
   | Alumno | `diego.morales@guachafit.com` | Inactivo o pausado, con historial de mediciones: acceso por estado (RF-012) y antropometría |

   Los datos solo existen después de ejecutar el seed: si falta un usuario (por ejemplo, el superadministrador, añadido el 2026-10-18), vuelve a ejecutarlo.
4. **API**: `pnpm --filter @guachafit/api dev` → queda en `http://localhost:4000` (documentación en `/api/docs`).
5. **Web**: `pnpm --filter @guachafit/web dev` → abre `http://localhost:3000`.
6. **Modo demo** (sin tocar la base de datos, **solo en desarrollo**): en el login hay botones **"Modo Coach"** y **"Modo Alumno"**. Aparece un banner de "Modo demo — datos de ejemplo". Ideal para recorrer pantallas rápido.

> **Tip para probar en el teléfono por WiFi:** por defecto no es accesible (Vite escucha solo en tu PC). Para probar la PWA de verdad usa **USB** (`adb reverse tcp:3000 tcp:3000` y abre `http://localhost:3000` en el teléfono) o un **túnel HTTPS** (cloudflared/ngrok). Por HTTP de la red local, los service workers no se activan.

### 0.1. Validación de configuración de producción (deploy-05a `1e4d5d7`)

Estas comprobaciones no necesitan la web: se hacen en una terminal con el API.

- [ ] **Con valores de ejemplo, el API se niega a arrancar:** arranca el API con `NODE_ENV=production` y tu `.env` local de desarrollo (los mismos valores de `.env.example`: secretos JWT vacíos, `ENCRYPTION_KEY` de ejemplo, `STORAGE_*` de MinIO y `BULL_BOARD_PASS=cambia_esta_clave`; en PowerShell, `$env:NODE_ENV = "production"` en esa ventana antes del comando) → el API **no arranca** y muestra **un único error `[Configuración]`** que enumera **todos** los problemas, uno por línea (no solo el primero).
- [ ] **Con valores válidos, arranca:** secretos JWT propios (`openssl rand -base64 48`), `ENCRYPTION_KEY` nueva de 64 caracteres hexadecimales (`openssl rand -hex 32`), `STORAGE_*` reales de R2, `CORS_ORIGINS` con el dominio de la web (sin `*`) y `BULL_BOARD_PASS` de ≥12 caracteres → el API arranca (con Postgres y Redis de Docker arriba y las migraciones al día). Si ya había fichas cifradas, la `ENCRYPTION_KEY` debe ser **la misma** con la que se cifraron: cambiarla las deja ilegibles.
- [ ] **Swagger oculto en producción:** con `NODE_ENV=production`, `http://localhost:4000/api/docs` responde **404**; en desarrollo sigue disponible; con `SWAGGER_HABILITADO=true` en producción vuelve a verse.

### 0.2. Imagen Docker del API y migraciones de producción (deploy-05b `de2975b`)

Con Docker Desktop arriba; se hacen desde la raíz del repositorio.

- [ ] **Construir la imagen:** `docker build -f apps/api/Dockerfile -t guachafit-api .` → termina sin error y la guardia final imprime `runtime deps OK: bcryptjs, jsonwebtoken`. La imagen ronda los **484 MB** en disco (`docker images`; ~99 MB comprimida) y **no** lleva herramientas de desarrollo (`tsx`, `vitest`) ni `.env` dentro.
- [ ] **Arrancar con valores válidos → sano:** ejecuta el contenedor con `NODE_ENV=production` y valores reales (los del punto 0.1; Postgres y Redis accesibles desde el contenedor), publicando el puerto (`-p 4000:4000`) → tras ~20 s `docker ps` lo muestra **`(healthy)`**; `http://localhost:4000/api/v1/health` responde **200**; `http://localhost:4000/api/docs` responde **404**.
- [ ] **Con valores de ejemplo, el contenedor muere:** ejecútalo con los valores de `.env.example` → **termina con código 1** y `docker logs` muestra **un único error `[Configuración]`** con los **7 problemas** enumerados (uno por línea), igual que en el punto 0.1.
- [ ] **Migrar desde la imagen:** `docker run --rm -e DATABASE_URL_MIGRACIONES='postgres://USUARIO:CLAVE@HOST:5432/guachafit' guachafit-api node /app/node_modules/@guachafit/database/dist/migrate.js` → el log muestra la URL objetivo con la contraseña **enmascarada** (`****`, sin el valor real) y termina con `Todas las migraciones fueron aplicadas con éxito`. En Windows con Git Bash, antepón `MSYS_NO_PATHCONV=1` al comando (Git Bash reescribe las rutas `/app/...`).

### 0.3. Rol de aplicación restringido y su verificación (deploy-05c `bf1360e`)

Con Docker Desktop arriba; se hacen desde la raíz del repositorio. Usa un rol **desechable** (`guachafit_app_pruebas`): no toques el `guachafit_app` de desarrollo.

- [ ] **Aprovisionar el rol (idempotente):** define una contraseña desechable (en bash `export GUACHAFIT_APP_PASSWORD="prueba-desechable"`; en PowerShell `$env:GUACHAFIT_APP_PASSWORD = "prueba-desechable"`), copia el script al contenedor y ejecútalo:
  ```bash
  docker compose cp packages/database/scripts/crear-rol-app.sql postgres:/tmp/
  docker compose exec -T -e GUACHAFIT_APP_PASSWORD postgres \
    psql -U postgres -d guachafit -v ON_ERROR_STOP=1 -v owner_role=postgres \
    -v app_role=guachafit_app_pruebas -f /tmp/crear-rol-app.sql
  ```
  → la primera vez imprime `CREATE ROLE`; reejecuta el mismo comando y verás `ALTER ROLE` (sigue funcionando). Al final, la tabla del resumen muestra `rolcanlogin=t` con `rolsuper=f`, `rolreplication=f` y `rolbypassrls=f`.
- [ ] **Guardas (abortan sin tocar la base):** sin pasar `-e GUACHAFIT_APP_PASSWORD` → `Falta la variable de entorno GUACHAFIT_APP_PASSWORD…` (con la variable **vacía** → `… no pueden estar vacíos.`); con `-v owner_role=guachafit_app` (rol existente pero **no** dueño de las tablas) → error que **lista los dueños reales** (`postgres`); ejecutado **como el rol desechable** (`-h 127.0.0.1 -U guachafit_app_pruebas` y `PGPASSWORD` con su contraseña, además de `GUACHAFIT_APP_PASSWORD`) → `El usuario «guachafit_app_pruebas» no puede aprovisionar este rol…`. En todos los casos el rol queda igual.
- [ ] **Verificar como el rol (esperado PASS):** copia el verificador y ejecútalo **conectado como el rol desechable** (la contraseña va por `PGPASSWORD`):
  ```bash
  docker compose cp packages/database/scripts/verificar-rol-app.sql postgres:/tmp/
  docker compose exec -T -e PGPASSWORD="$GUACHAFIT_APP_PASSWORD" postgres \
    psql -h 127.0.0.1 -U guachafit_app_pruebas -d guachafit -v ON_ERROR_STOP=1 \
    -f /tmp/verificar-rol-app.sql
  ```
  → líneas `PASS`: no superusuario, sin `BYPASSRLS`, no dueño de ninguna tabla de `public`, no miembro de ningún dueño, CRUD en **las 23 tablas** y `USAGE`/`SELECT` en las secuencias, un `PASS` por cada tabla con RLS que tenga datos (**las 6**: `cuotas_membresia`, `perfiles_alumno`, `planes_membresia`, `plantillas_rutina`, `rutinas` y `transacciones_pago` devuelven 0 filas sin contexto) y `PASS · lectura de drizzle.__drizzle_migrations correcta`; un `AVISO` informativo lista las **17 tablas sin RLS** (por diseño); cierra `RESULTADO · PASS`.
- [ ] **Caso INCOMPLETO (sin datos):** si las tablas con RLS no tienen señal de datos, sus líneas pasan a `AVISO · … no tiene filas: el aislamiento no se pudo comprobar con datos` y el cierre es `RESULTADO · INCOMPLETO` (nada de PASS engañoso). Repite la verificación con datos reales; si esperabas datos, ejecuta `ANALYZE` como `postgres` para refrescar `n_live_tup` (p. ej. tras un reinicio).
- [ ] **Aislamiento por coach:** conectado como el rol de aplicación, sin contexto las tablas con RLS devuelven 0 filas; con `app.current_entrenador_id` puesto, solo se ven las filas de ese coach. En `psql`:
  ```sql
  BEGIN;
  SELECT set_config('app.current_entrenador_id', '<uuid-de-un-coach>', true);
  SELECT count(*) FROM public.rutinas;  -- solo las de ese coach
  ROLLBACK;
  ```
  Repite con el uuid de otro coach con datos: cada uno ve un conteo distinto (nunca el del otro).
- [ ] **Limpieza:** en una sesión de `psql` como `postgres` (p. ej. `docker compose exec -T postgres psql -U postgres -d guachafit`), elimina el rol desechable y sus permisos por defecto:
  ```sql
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM guachafit_app_pruebas;
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE USAGE, SELECT ON SEQUENCES FROM guachafit_app_pruebas;
  DROP OWNED BY guachafit_app_pruebas;
  DROP ROLE guachafit_app_pruebas;
  ```

---

## 1. Entrenamiento del alumno (lo más usado en el gimnasio)

- [x] **Pantalla angosta (360px, como un celular):** la fila de series se ve cómoda; puedes escribir repeticiones y peso en campos amplios, con botones +/− fáciles de tocar.
- [x] **Iniciar:** pulsar "Comenzar a entrenar" pasa la sesión a "En Progreso" y guarda la hora (UTC) + tu zona horaria.
- [x] **Descanso real:** al marcar una serie arranca el temporizador; al marcar la siguiente aparece **"Descanso real: X"** (medido de verdad). Si no marcaste inicio, muestra "—" (nunca un número inventado).
- [x] **Cierre con sesión vacía:** pulsar "Finalizar" sin haber marcado nada pregunta **"¿descansado o incompleto?"**; en ninguno de los dos casos sube la racha.
- [ ] **Finalizar bien:** muestra duración y horas **en tu hora local**; si superaste el 70% del plan dice la racha real; si no, un mensaje honesto (no miente).
- [x] **kg / lb:** cambia la unidad en el checklist; se recuerda aunque recargues.
- [ ] **Video de técnica:** si el ejercicio tiene enlace, aparece "Ver técnica" con reproductor (Escape cierra).
- [ ] **Navegar entre días de la semana:** consultar otro día **no borra** tu sesión planificada; "Entrenar este bloque hoy" crea/inicia la de ese bloque.
- [ ] **Repetir un bloque ya completado:** crea una sesión nueva sin borrar el historial anterior.
- [ ] **Sin conexión (modo avión):** sigues viendo la rutina guardada y puedes marcar series; aparece **"Sin conexión · datos guardados · actualizado hace X"**; al volver la red, se sincroniza solo. Si algo fue rechazado, el panel de sincronización lo explica y permite Reintentar/Descartar.
- [ ] **Entrenamiento completo sin red (alumno):** con red, abre "Hoy" para que se guarde la rutina; activa modo avión → pulsa **"Comenzar a entrenar"**, marca 2-3 series y pulsa **"Finalizar"**. Todo responde al instante y ves el aviso de **datos guardados sin conexión**. Quita el modo avión: los cambios suben **en orden** (primero comenzar, luego series, al final finalizar) y la sesión queda "Completada" con sus series; el panel no muestra rechazos.
- [ ] **Un solo toque:** "Hacer este entrenamiento hoy" inicia el entrenamiento con un único toque.
- [ ] **Sesión en curso tras medianoche:** comienza un entrenamiento antes de las 00:00 (o cambia la hora del teléfono) y vuelve a abrir "Hoy" después de medianoche → sigue apareciendo **la sesión en curso** (no una vacía del día nuevo). Si en el teléfono solo hay datos de otro día, verás "Tu último entrenamiento guardado es del …".
- [ ] **Serie rechazada con red:** si el servidor rechaza una serie, la casilla vuelve a su estado anterior y el error aparece **junto a esa serie**.
- [ ] **Cambio atascado:** si un cambio falla 8 veces por error del servidor pasa a "rechazado" y deja de frenar a los demás; desde el panel puedes **Descartarlo**. Los cortes de red no cuentan como fallo.
- [ ] **Indicaciones del coach:** si el coach puso notas técnicas o esfuerzo sugerido en la rutina/plantilla, el alumno ve **"Indicaciones de tu entrenador: …"** y el esfuerzo sugerido en el ejercicio (requiere la migración `0014`).
- [ ] **Lenguaje claro:** en la pantalla del alumno no aparecen "RPE", "RIR" ni siglas: dice **esfuerzo**, **repeticiones**, **semana**. Los botones del cronómetro y de las series se tocan con comodidad (44px).
- [ ] **Antes de iniciar no hay nada que marcar (desde 2026-10-11):** abre un entrenamiento sin empezar → ves **"Tu plan de hoy"** con una fila por ejercicio (series × repeticiones · peso · esfuerzo), sin campos ni casillas, y el botón **"Iniciar entrenamiento"** fijo abajo, visible sobre la barra del móvil (también en iPhone con la app instalada). Si un ejercicio tiene video, su botón de técnica funciona desde aquí. Con la red cortada o el servidor rechazando, el error sale **junto al botón**.
- [ ] **Pegar y recargar (desde 2026-10-12):** copia "60 kg" y pégalo en el peso de una serie → se escribe 60. En la lista completa pulsa **"Hacer ahora"** en el ejercicio 3 y recarga la página → el foco sigue en el ejercicio 3 desde el primer instante. En **Progreso → check-in**, el peso no deja escribir más de 300. En los ajustes de **"Cargar desde plantilla"**, pegar "60 kg" en Repeticiones no escribe nada.
- [ ] **Rechazo con edición en vuelo (desde 2026-10-12):** con el servidor rechazando series (p. ej. sesión cerrada en otra pestaña), marca una serie y cambia su peso antes de que llegue la respuesta → la serie vuelve a pendiente con el error junto a ella y **conserva el peso nuevo**.
- [ ] **Orden de los toques con red lenta (desde 2026-10-15, RF-001 §7.17):** en DevTools → Network pon **"Slow 3G"** (o "3G lento"). Marca una serie y **desmárcala enseguida** → el desmarcado se ve unos segundos como **"por enviar"** en el indicador de cola y luego se envía solo. Recarga la página → la serie sigue **sin marcar** (antes podía quedar marcada). Repite marcando dos series seguidas y pulsando **"Finalizar"** → la sesión se cierra con las dos series completadas, nunca vacía.
- [ ] **Rechazo de un toque ya corregido (desde 2026-10-15):** con red lenta y el servidor rechazando series, marca una serie y desmárcala antes de que llegue la respuesta → la serie queda **pendiente** y **no aparece ningún error** (el toque rechazado ya estaba corregido). Si solo la marcas y el servidor la rechaza, sí vuelve a pendiente con el error junto a ella. El porcentaje de progreso refleja las series que siguen completadas.
- [ ] **Red colgada (desde 2026-10-15):** con red muy lenta, si un envío tarda más de 15 s se pasa a la cola y se reintenta solo; la sesión no se queda atascada en "por enviar" hasta recargar. Límite conocido: con **dos pestañas** abiertas en la misma sesión, el orden no está garantizado.
- [ ] **Modo foco (desde 2026-10-11):** inicia un entrenamiento → ves **una sola serie**: arriba "Ejercicio 1 de N · Serie 1 de M" y "Quedan M series de este ejercicio", debajo "Siguiente: …". Marca la serie → el descanso arranca y el foco pasa a la serie 2; al terminar el ejercicio pasa al siguiente. Pulsa **"Ver entrenamiento completo"** → ves lo hecho (compacto) y lo pendiente; en otro ejercicio pulsa **"Hacer ahora"** → el foco va a él. **"Volver al enfoque"** regresa. Al terminar todo aparece "Completaste todas las series" y puedes finalizar. En un móvil de 360 px nada se sale de la pantalla y el cronómetro no tapa el botón de la lista.
- [ ] **Serie completada en una línea:** al marcar una serie se convierte en una fila con ✓ y su resumen ("Serie 2 · 60 kg × 10 · Esfuerzo 8"); tócala → vuelve la fila completa para corregir o desmarcar; al marcarla otra vez se compacta. Marca una serie **sin escribir peso** → se completa sin error. En un entrenamiento ya terminado las filas solo informan.
- [ ] **Solo datos válidos (desde 2026-10-11):** en una serie intenta escribir letras, `1000` kg (o `2203` lb), `201` repeticiones o un esfuerzo de `0`, `11` u `8.3` → **no se escriben**. `8,5` de esfuerzo y `60,5` kg sí. Vacía las repeticiones y sal del campo → vuelve el último valor (no aparece 0). Los botones +/− no pasan de 999 kg ni de 200 repeticiones.

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
- [ ] **Plan y tarifa:** asigna plan, "Precio acordado (USD)" (vacío = precio del plan; `0` = becado) y "Tasa especial (Bs por USD)"; guarda y verás el recuadro con la tarifa especial vigente. Puedes quitarla con "Quitar tarifa especial".
- [ ] **Suspender por pago** y **Reactivar**: verifica en el lado del alumno (sección 7).

## 4. Cobros (entrenador)

- [ ] **Control de Cobros** (menú): 4 indicadores arriba (recaudado del mes, en mora con monto, por vencer, por validar).
- [ ] **Pestañas**: Mora (ordenada por atraso), Por Vencer, En Revisión, Al Día, con contadores.
- [ ] **Bolívares**: si no hay tasa configurada, muestra "—" con aviso hacia Ajustes (no inventa).
- [ ] **Enviar recordatorio** a un moroso: llega la notificación in-app; si lo repites enseguida, avisa que ya se envió hace poco (anti-spam).
- [ ] **Registrar cobro** desde la fila: al liquidar, el alumno sale de mora.
- [ ] **Recordatorios automáticos (por debajo):** asigna un plan con inicio hoy desde la ficha (se emite la cuota) y revisa `http://localhost:4000/admin/queues` (si configuraste `BULL_BOARD_USER`/`BULL_BOARD_PASS` en `apps/api/.env`): verás los 4 avisos agendados en la cola "cobranza"; al pagar todo, desaparecen.
- [ ] **Estado "Por Vencer"**: una cuota a ≤5 días del corte se pinta como preventiva y **no** cuenta como mora.
- [ ] **Asignar plan (ficha → Perfil → Plan y tarifa, 2026-10-10, `e0747e2`):** con un alumno "Sin plan", elige un plan → aparece "Fecha de inicio" con hoy. Escribe un precio acordado (p. ej. 35.00) y guarda → "Expediente, plan y tarifa actualizados con éxito." y "Próxima cuota: vence el …" (un mes después). En Control de Cobros la cuota de hoy sale por **35.00**, no por el precio del catálogo. Repite con 0.00 en otro alumno → la cuota nace Al Día (becado).
- [ ] **Cambiar y quitar el plan:** con plan vigente, elige otro plan y guarda → no pide fecha y la próxima cuota mantiene su día. "Quitar plan" → confirmación → "Sin plan". Vuelve a asignar con una fecha dentro del mes ya cobrado → aviso "Este alumno ya tiene cubierto hasta el …".
- [ ] **Alumnos que ya tenían precio acordado sin plan:** su ficha muestra "Sin plan"; guardar cualquier dato del expediente NO les asigna plan ni borra su precio.
- [ ] **Revertir un pago aprobado (API, 2026-10-11, `4878d7e`):** con un pago de $50 aprobado sobre una cuota de $40 (saldo a favor $10), llama `POST /finanzas/transacciones/:id/revertir` con `{"motivo": "Fondos no recibidos"}` como entrenador dueño → el pago queda `revertido`, la cuota vuelve a deber $40, el saldo a favor vuelve a $0 y al alumno le llega "Tu entrenador revirtió un pago". Sin motivo → 400. Si antes se emitió otra cuota que consumió ese saldo a favor → 409 "No se puede revertir este pago: el saldo a favor que generó ya se aplicó a otra cuota.". Tras revertir, el alumno puede reportar de nuevo el mismo comprobante (misma referencia) y el entrenador aprobarlo. En la web (`e16039d`): en la ficha del alumno → pestaña de pagos, el pago aprobado tiene **"Revertir pago"**; el diálogo muestra "Pago de 50.00 USD · … " y no deja confirmar sin motivo. Al revertir, el historial lo marca "Revertido" y el alumno ve en Pagos "Revertido" con "Motivo: …". En **Conciliación**, "Aprobar y Descontar Saldo" abre "¿Aprobar el pago de …?" y solo aprueba al pulsar "Aprobar pago".
- [ ] **Saldo a favor (API, 2026-10-11, `afd3f7c`):** con una cuota de $40 pendiente, cobra en sala $50 en efectivo → la cuota queda al día (abonado $40) y el alumno recibe "…40.00 USD se aplicaron a tu cuota y 10.00 USD quedaron como saldo a favor para tu próxima cuota.". Comprueba en `GET /finanzas/clientes/:id/historial` que `saldoAFavorUsd` es `10.00`. Al emitirse la siguiente cuota (barrido diario o asignando el plan), nace con `saldoAFavorAplicadoUsd: 10.00` y el saldo a favor vuelve a `0.00`. Con un saldo mayor que la cuota, la cuota nace al día y no llegan recordatorios. En la web (`b975905`): el alumno ve en **Pagos** "Saldo a favor: 10.00 USD (≈ Bs. …)" y "Se aplicará automáticamente a tu próxima cuota."; tras la emisión, la cuota dice "De esta cuota, 10.00 USD se cubrieron con tu saldo a favor.". El entrenador ve "A favor: 10.00 USD" en Control de Cobros y el saldo a favor en la ficha; el éxito del cobro termina con "10.00 USD quedaron como saldo a favor del alumno.". En **Conciliación**, un pago reportado por más de lo que debe la cuota muestra antes de aprobar "Este pago excede la deuda de la cuota en X USD; quedarán como saldo a favor del alumno." y al aprobar "Pago aprobado y descontado de la cuota. X USD quedaron como saldo a favor del alumno.".
- [ ] **Cobro en sala (ficha y Control de Cobros):** el modal solo pide monto, moneda (y notas en la ficha), sin método ni referencia. Con el alumno suscrito y todo pagado, el cobro adelanta y cobra la próxima cuota. Un alumno sin plan → "Este alumno no tiene un plan asignado…" con **Asignar plan**.
- [ ] **Alumno pausado sin avisos (2026-10-10, `68457a6`):** pausa a un alumno con cuota abierta; al llegar sus recordatorios, la cola "cobranza" los procesa sin enviar nada (motivo `alumno_inactivo`) y el alumno no recibe notificación. La deuda sigue en Control de Cobros.
- [ ] **Cobro con fecha anterior (2026-10-12, `cea825b`):** en Control de Cobros y en la ficha, el modal de cobro trae "Fecha de la operación" con hoy; el calendario no deja elegir mañana. Elige una fecha de la semana pasada y registra → el cobro queda con esa fecha en el historial, pero el **recaudado del mes** lo suma igual (cuenta por día de registro). En bolívares, el modal muestra "Se convertirá con la tasa vigente al registrar: 1 USD = X Bs." (con la tasa propia del alumno si la tiene). Escribe a mano una fecha futura (o llama al API con `fechaOperacion` de mañana+2) → "La fecha del pago no puede ser posterior a hoy."; al corregir la fecha, el mensaje desaparece sin reenviar. Como alumno, en **Pagos → Reportar pago**, a las 23:30 de Caracas la fecha propuesta es la de hoy (no la de mañana) y el reporte se envía sin tocarla.
- [ ] **Anular una cuota (API, 2026-10-12, `7f46acc`):** con una cuota sin pagos, llama `POST /finanzas/cuotas/:id/anular` con `{"motivo": "Emitida por error"}` como entrenador dueño → "Cuota anulada."; la cuota queda `anulada` sin deuda, sale de Control de Cobros y del saldo pendiente del alumno, y al alumno le llega "Tu entrenador anuló una cuota". Si la cuota nació con saldo a favor aplicado (p. ej. 10.00), el mensaje dice "10.00 USD volvieron al saldo a favor del alumno." y el saldo a favor sube. Repetir → 409 "Esta cuota ya está anulada.". Con un pago en revisión → 409 "Primero aprueba o rechaza el pago en revisión de esta cuota."; con un pago aprobado → 409 "No se puede anular una cuota con pagos aprobados.". Sin motivo → 400. Cuota de otro entrenador → 404. **Corregir una cuota mal emitida:** anula la cuota, quita el plan y reasígnalo (mismo plan) con la fecha correcta del mismo mes → se emite una cuota nueva de ese mes. La web aún no tiene el botón.
- [ ] **Doble cobro:** con DevTools → Network en "Offline" justo al pulsar "Registrar…", vuelve a "Online", cierra y reabre el modal y repite: en el historial hay **un solo** cobro (misma clave `X-Idempotency-Key` en las dos peticiones).
- [ ] **Dos cobros en efectivo el mismo día:** registra dos cobros en efectivo (a dos alumnos) el mismo día: ambos se guardan (antes el segundo fallaba).

## 5. Directorio de Alumnos

- [ ] Busca por nombre, apellido, correo o documento (filtrando en el servidor, no solo lo visible).
- [ ] **Cabecera "Mis alumnos" (desde 2026-10-19):** arriba solo están el título y los botones **"Invitar"** e **"Inscribir"**. Ya no hay tarjetas KPI ni el banner del enlace. En móvil el primer alumno aparece mucho antes.
- [ ] **Chips con conteo:** "Vigentes N" está marcado al entrar y **no** muestra archivados. "Archivados N" muestra solo las bajas, con "Restaurar". Si pulsas otra vez el chip activo, vuelves a "Vigentes". Recarga la página: mientras carga, los chips no muestran "0".
- [ ] **Invitar:** pulsa "Invitar". Se abre un diálogo con tu enlace de captación, "Copiar enlace" y "Compartir por WhatsApp". Esc lo cierra.
- [ ] **Ordenar por:** prueba las cuatro opciones.
  - "Nombre (A-Z)": orden alfabético.
  - "Sin entrenar primero": arriba los que nunca entrenaron y luego los que llevan más tiempo sin entrenar.
  - "Mayor racha": arriba las rachas más largas.
  - Cambiar el orden te devuelve a la página 1 y el orden se mantiene entre páginas.
- [ ] **Tarjeta:** muestra el estado (Activo/Pausado), la modalidad legible, "Entrenó hoy/ayer/hace N días" o **"Sin entrenar hace N días"** (en color de aviso y con icono, a partir de 7 días) y "Racha de N días" si la hay.
- [ ] **Flecha de la tarjeta (desde 2026-10-26):** pulsa la flecha `>` junto a WhatsApp **y también el hueco entre el badge de pago y WhatsApp**: abren el expediente del alumno, igual que cualquier otra zona de la tarjeta. WhatsApp sigue abriendo solo WhatsApp. En un alumno archivado, "Restaurar" restaura sin abrir el expediente. Prueba en una ventana de incógnito para no ver una versión vieja del Service Worker.
- [ ] **Teclado:**
  - Tab llega al nombre y Enter abre el expediente.
  - Tab llega a WhatsApp y Enter abre WhatsApp, **no** el expediente.
  - En la vista tabla, Tab llega al nombre de cada fila y Enter abre el expediente.
- [ ] **Tabla:** las columnas son Alumno, Estado, Modalidad, Plan, Último entreno, Racha, Pago y Acciones.
- [ ] **Badges en una línea (desde 2026-10-26):** "Cuota pendiente" y los demás badges se ven en una sola línea. A 360px de ancho, en una tarjeta archivada (con "Restaurar"), el badge y los botones no se salen de la tarjeta: si no caben, los botones bajan a otra línea alineados a la derecha. Revisa también, como alumno, la evaluación antropométrica, los pagos y el resumen de cuota.
- [ ] **Móvil, buscador y orden (360px):** el buscador y el selector de orden comparten una fila; el selector muestra un icono ↕ en lugar de "Ordenar por" y el buscador sigue siendo cómodo para escribir. Desde tablet se ve el texto "Ordenar por".
- [ ] **Sin conexión:** con la lista cargada, activa el modo avión (o "Offline" en DevTools) y recarga: arriba de la lista aparece "Sin conexión · datos guardados · actualizado hace N". Sin datos guardados de esa combinación de filtros aparece "Sin conexión y sin datos guardados" en lugar del error genérico. Al reconectar el aviso desaparece. En el modo demo nunca aparece.
- [ ] **Privacidad (vía API):** con el token del entrenador, `GET /alumnos` → ningún alumno trae `fichaSaludPrivada`. `GET /alumnos/:id` sí la trae.
- [ ] **Chip "En mora"**: el número del chip coincide con las filas que muestra.
- [ ] **Paginación numerada** con "Mostrando X de N" — ya no se pierden alumnos después del número 50.
- [ ] Las filas muestran el **plan real** o "Sin plan asignado" (ya no un "Plan Estándar" inventado).

## 6. Plantillas de ejercicios

- [ ] Crear, editar y desactivar plantillas (con días, series, reps, peso, RPE y notas).
- [ ] Buscador + filtro por nivel + estado.
- [ ] **Cargar desde plantilla en 3 pasos (desde 2026-10-11):** en la ficha del alumno pulsa **"Cargar desde Plantilla"** → **Paso 1:** busca y elige una plantilla (sin elegir, "Siguiente" no avanza y lo explica). **Paso 2:** solo un día abierto; cada ejercicio en una línea; pulsa **"Ajustar"** para cambiar peso, series o repeticiones (queda marcado "Ajustado"); "Atrás" conserva lo hecho. **Paso 3:** elige **Reemplazar** o **Añadir** tocando cualquier parte de la tarjeta, lee el resumen y pulsa **"Asignar rutina"** (Reemplazar pide confirmación). Escribe repeticiones `10-8` en un ajuste → al asignar vuelve al paso 2 con el error arriba; tócalo y te lleva al campo. En el móvil ocupa toda la pantalla y los botones quedan fijos abajo; ningún texto es diminuto.
- [ ] **Asignación masiva en 3 pasos (desde 2026-10-18, RF-017 RN-03):** en la tarjeta de una plantilla pulsa **"Asignar a alumnos"**.
  - **Paso 1 · Elegir alumnos:** busca por nombre (busca en el servidor, no solo en lo visible), usa **"Cargar más alumnos"** y marca varios (máximo 50). Sin ningún alumno, **"Siguiente"** no avanza.
  - **Paso 2 · Revisar y ajustar:** ves los días y ejercicios de la plantilla. Pulsa **"Ajustar"** en un ejercicio y cambia el peso; queda marcado "Ajustado". **"Atrás"** vuelve al paso 1 con tu selección intacta, y al avanzar otra vez el ajuste sigue ahí.
  - **Paso 3 · Confirmar:** "Añadir" viene marcado. Lee la frase de resumen (por ejemplo, "Se asignará «X» a 3 alumnos con 1 ajuste. Se añade a su rutina actual.") y pulsa **"Asignar a N alumnos"**. Verás el resultado **por alumno** (asignado, o el motivo claro si falló). Abre la ficha de dos de ellos: **los dos tienen el mismo ajuste**.
  - Con **Reemplazar**, antes de asignar pide confirmar que se sustituirá la rutina actual.
  - Escribe repeticiones `10-8` en un ajuste y asigna → vuelve al paso 2 con el error arriba y no asigna nada.
  - Con la red cortada al abrir el paso 2, aparece el error con **"Reintentar"** y "Siguiente" no avanza hasta que carga.
- [ ] **Reintento en modo Añadir (desde 2026-10-18):** corta la red justo al asignar en modo **Añadir** (DevTools → Network → Offline) → aparece un aviso de que **no se sabe si se completó**, junto con *"Para cambiar alumnos, ajustes o modo, cierra y comprueba primero si la asignación se aplicó."*. **"Atrás"** y los modos quedan deshabilitados. Vuelve a poner la red y pulsa **"Asignar a N alumnos"** → pide confirmar el reintento y, al aceptar, la rutina de cada alumno **no tiene los días duplicados**.
- [ ] **Tope de 7 días:** asigna en modo **Añadir** una plantilla a un alumno cuya rutina ya suma 7 días (o que los superaría) → se rechaza con *"La rutina de este alumno quedaría con más de 7 días. Usa «Reemplazar» o quita días antes de añadir."* y la rutina del alumno no cambia.
- [ ] **Ejercicio desactivado nombrado:** crea una plantilla con un ejercicio propio, desactiva ese ejercicio del catálogo e intenta guardar o asignar la plantilla → el error **nombra el ejercicio** (*"Press X ya no está en tu lista de ejercicios. Quítalo o cámbialo por otro y vuelve a guardar."*).
- [ ] **Campos del entrenador (desde 2026-10-11):** en el editor de plantillas, en la rutina semanal de la ficha y en los ajustes al asignar, el peso solo admite números hasta 999 o el interruptor **"Peso corporal"** (al desactivarlo vuelve el número anterior); las repeticiones admiten `10`, `8-10`, `8 - 10` o `45 s`, y el esfuerzo de 1 a 10 en pasos de 0,5. Una plantilla antigua con `'10-12 reps'` se puede borrar y corregir; si guardas con un dato inválido, el aviso **nombra el ejercicio**.
- [ ] **Editor seguro:** borrar un día o un ejercicio pide confirmación; cerrar la plantilla con cambios sin guardar avisa; sin conexión, "Guardar" queda deshabilitado con **"Necesitas internet para guardar"**; el lápiz de edición se ve siempre.

## 7. Altas, enlaces y accesos

- [ ] **Alta manual**: al crear un alumno, la app te muestra un **enlace de activación copiable** (válido 48 horas). Ábrelo en una ventana de incógnito: crea la contraseña y entra. El enlace **sirve una sola vez**. (Los casos con y sin correo están en la sección 7.1.)
- [ ] **Link de inscripción del coach**: la web te muestra tu enlace real (`/onboarding?coach=TU-CODIGO`). Pruébalo con un código inventado (dice "no válido") y con el real (muestra tu nombre y permite registrarse). Al registrarse alguien, te llega una notificación.
- [ ] **Alumno suspendido/pausado**: al entrar, ve la pantalla de bloqueo con el mensaje correspondiente y botón **"Reportar pago"** (sus pagos y cuenta siguen accesibles).
- [ ] **Alumno dado de baja**: ya **no puede iniciar sesión**; con su contraseña correcta ve **"Tu cuenta está archivada. Contacta a tu entrenador."** (con una contraseña errónea solo ve "Correo o contraseña incorrectos.", que no revela si la cuenta existe).
- [ ] **Admin** (`/admin`, solo superadmin): crear entrenador y ver el enlace de activación; abajo verás la **lista de entrenadores** con su cuenta (activa/deshabilitada), su licencia (activa/suspendida), su `coach_code` y su fecha de alta.
- [ ] **Deshabilitar / Reactivar cuenta:** pulsa "Deshabilitar" en un coach de prueba → aparece una confirmación que explica el efecto; al confirmar, el aviso solo sale si el servidor aceptó. Luego entra con ese coach en una ventana de incógnito: verás **"Tu cuenta está desactivada. Contacta a tu entrenador."** (texto vigente desde 2026-10-04; antes "Su cuenta se encuentra inactiva o bloqueada"). Reactívalo desde el panel y podrá entrar de nuevo. Repite "Deshabilitar" dos veces: la segunda dice que ya estaba deshabilitado (sin error).
- [ ] **Suspender / Activar licencia:** suspende la licencia de un coach → su login queda bloqueado con el mensaje de licencia y su enlace público (`/onboarding?coach=CODIGO`) deja de resolver. Actívala y ambos vuelven.
- [ ] **Cascada al alumno — cuenta deshabilitada:** con un alumno de prueba vinculado al coach, deshabilita la cuenta del coach → **el alumno de ese coach no puede iniciar sesión** ("Tu entrenador no está disponible en este momento. Inténtalo de nuevo más tarde.") y el enlace público `/onboarding?coach=CODIGO` deja de resolver (mismo "no válido" que un código inventado). Reactiva la cuenta: el alumno vuelve a entrar y el enlace vuelve a resolver.
- [ ] **Cascada al alumno — licencia suspendida:** repite lo anterior suspendiendo la licencia → el alumno recibe **el mismo mensaje** (no revela cuál de los dos cambios fue) y su enlace público deja de resolver. Al activar la licencia, ambos vuelven.
- [ ] **Límite honesto de la sesión activa:** un coach (o un alumno de ese coach) que YA tenía sesión abierta sigue dentro hasta que la app vuelve a verificar (recarga, `/auth/me`, refresh o canje); como máximo 15 minutos, porque el token de acceso es corto. No es un bug.
- [ ] **El superadmin sigue sin poder operar el negocio del coach** (recibe "No tienes permiso para ver esta sección.").
- [ ] **Registro público con WhatsApp (prospecto):** abre el enlace del coach en incógnito → el formulario llega **vacío** (sin teléfono ni fecha de ejemplo). Sin WhatsApp no deja enviar; si escribes el número con el código de país avisa que lo quites porque ya va en el prefijo. La edad se calcula en vivo y la fecha no admite días futuros. Al terminar, botón **"Ir a iniciar sesión"**; con un correo ya registrado aparece el enlace para iniciar sesión.
- [ ] **Ruta `/registro`:** abre `http://localhost:3000/registro?coach_code=TU-CODIGO` → te lleva a `/onboarding` **con el código del coach ya cargado** (muestra su nombre).
- [ ] **Login con correo con espacios:** escribe tu correo con un espacio al inicio o al final → entra igual. El botón del ojo muestra/oculta la contraseña. Si ya tienes sesión y abres `/login`, te redirige a tu inicio.
- [ ] **Límite de intentos (429):** en incógnito, intenta 5 veces entrar con el mismo correo y una contraseña errónea; el **6.º intento** dentro del mismo minuto muestra **"Hiciste demasiados intentos. Espera un momento y vuelve a intentarlo."**. Pasado un minuto vuelve a dejar intentar.
- [ ] **Sesión que vence y se renueva (cualquier rol):** con sesión abierta, en DevTools → Application → Local Storage cambia `guachafit_token` por un texto cualquiera y navega a otra pantalla → la app **sigue funcionando** (renovó la sesión sola, sin pedir login). Ahora cambia también `guachafit_refresh_token` y navega → te lleva a `/login` con el aviso **"Tu sesión venció. Inicia sesión de nuevo."**. Sin red, la sesión **no** se cierra.
- [ ] **Pendientes offline al volver a entrar (alumno):** en modo avión marca series (quedan pendientes); deja vencer la sesión como en el paso anterior, recupera la red y entra **con el mismo alumno** → los pendientes se envían solos y el panel queda vacío.
- [ ] **Otro usuario en el mismo dispositivo:** cierra sesión como alumno A y entra como alumno B (o como coach) → **no ves nada de A** (ni rutina guardada, ni pendientes, ni datos en caché). Si la sesión de A había vencido con pendientes y entra B, esos pendientes se borran del dispositivo (no se envían con la cuenta de B).

## 7.1. Correos de bienvenida y recuperación de contraseña (Brevo)

> **Preparación:** sin `BREVO_API_KEY` (o sin `EMAIL_REMITENTE`) el API arranca en **modo simulado**: avisa en la consola con `[Configuración]` y los correos solo se escriben en el log (`[Correo simulado] Para …`), **sin el enlace**. Para recibir correos de verdad pon en `apps/api/.env` `BREVO_API_KEY`, `EMAIL_REMITENTE` (remitente verificado en Brevo), opcional `EMAIL_REMITENTE_NOMBRE`, y `APP_URL=http://localhost:3000`; reinicia el API. Usa buzones reales tuyos. El plan gratuito permite 300 correos al día.

**Entrenador (alta de alumno)**

- [ ] **Sin Brevo configurado:** crea un alumno → el mensaje dice **"Comparte este enlace con tu alumno para que cree su contraseña."** (no afirma que se envió un correo) y aparece el enlace copiable. En la consola del API sale la línea `[Correo simulado]`.
- [ ] **Con Brevo configurado:** crea un alumno con un correo tuyo → el mensaje dice **"Le enviamos un correo con el enlace. Si no le llega, compártele este enlace."** y el enlace copiable **sigue visible**. En el buzón llega *"Te damos la bienvenida a GUACHAFIT: crea tu contraseña"*; su botón abre `/activar` y permite crear la contraseña (una sola vez).
- [ ] **Redis caído (opcional):** con Brevo configurado, detén Redis y crea un alumno → el alta **se guarda igual** (puede tardar hasta unos 3 segundos más) y el mensaje vuelve a ser el de compartir el enlace.

**Superadmin (alta de entrenador, `/admin`)**

- [ ] **Sin Brevo:** crea un entrenador → *"Comparte este enlace con el entrenador para que cree su contraseña."* + enlace copiable (48 horas).
- [ ] **Con Brevo:** crea un entrenador con un correo tuyo → *"Le enviamos un correo con el enlace. Si no le llega, compártele este enlace."*; llega *"Tu cuenta de entrenador en GUACHAFIT está lista"* y su enlace activa la cuenta.

**Cualquier rol (alumno, entrenador) — "¿Olvidaste tu contraseña?"** (requiere Brevo: en modo simulado el enlace no aparece en ningún lado)

- [ ] **Enlace en el login:** junto a "Contraseña" aparece **"¿Olvidaste tu contraseña?"** → abre `/recuperar`. Con un correo mal escrito avisa *"Revisa tu correo: no tiene un formato válido."*.
- [ ] **Respuesta igual con correo inexistente:** pide el enlace con un correo que **no** existe y luego con uno que sí → ambas veces ves **la misma pantalla "Revisa tu correo"** con *"Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña."* y tarda lo mismo. Con una cuenta desactivada o archivada pasa igual (sin correo).
- [ ] **Correo recibido:** con tu correo real llega *"Restablece tu contraseña de GUACHAFIT"*; el botón abre `/restablecer?token=…`. Escribe la nueva contraseña dos veces → te lleva al login con el aviso **"Tu contraseña se actualizó. Ya puedes iniciar sesión."** y entras con la nueva.
- [ ] **Enlace usado dos veces:** abre de nuevo el mismo enlace e intenta guardar → **"Este enlace ya no sirve: venció o ya se usó. Pide uno nuevo."** con el botón "Pedir un enlace nuevo".
- [ ] **Enlace vencido:** pide un enlace y espera **más de 1 hora** antes de usarlo → mismo mensaje de enlace que ya no sirve.
- [ ] **Pedir dos veces en menos de 15 minutos:** pide el enlace, y antes de 15 minutos pídelo otra vez → la pantalla es la misma, pero **no llega un segundo correo** y el **primer enlace sigue sirviendo**. Pasados 15 minutos sí llega uno nuevo y el anterior deja de servir.
- [ ] **Límite de pedidos:** pide el enlace para el mismo correo más de 3 veces seguidas → al 4.º aparece **"Hiciste demasiados intentos. Espera un momento y vuelve a intentarlo."** (3 cada 15 min por red + correo y 3 por hora para el mismo correo desde cualquier red).
- [ ] **La otra sesión deja de renovarse:** abre sesión con la misma cuenta en otro navegador (B); en el navegador A restablece la contraseña. En B la app sigue funcionando **hasta 15 minutos** (límite conocido: el acceso ya emitido no se corta); cuando necesita renovar la sesión, te lleva a `/login` con **"Tu sesión venció. Inicia sesión de nuevo."**. Para no esperar: en B cambia `guachafit_token` en Local Storage por un texto cualquiera y navega → pide login.

**Ajustes en la web (RF-018, 2026-10-08, `d5f53ae`)** — alumno `http://localhost:3000/app/ajustes`, entrenador `/coach/ajustes`, administrador `/admin/ajustes`:

- [ ] **Entrar:** cada rol ve "Ajustes" en el menú. Alumno: Perfil · Correo y contraseña · Notificaciones · Zona horaria. Entrenador: Perfil · Correo y contraseña · Notificaciones · Planes · Tasas de cambio (abre en Perfil). Administrador: solo Correo y contraseña. Con el teclado, las flechas recorren las pestañas en el orden en que se ven.
- [ ] **Enlaces viejos:** `http://localhost:3000/app/preferencias` y "Configurar" de la campana llevan a la pestaña Notificaciones. En el menú del coach la tarjeta de planes abre Planes; en Cartera "Ajustes → Tasas" abre Tasas.
- [ ] **Perfil:** cambia el teléfono y pulsa "Guardar cambios" → *"Tus datos se guardaron."*. El alumno ve su documento como `V-…` y la fecha de nacimiento, con *"Si necesitas corregirlos, pídeselo a tu entrenador."*. Sin cambios → *"No hay cambios que guardar."*.
- [ ] **Cambiar el correo:** antes del botón aparece el aviso del correo de confirmación. Envía con la contraseña actual → aparece *"Pendiente de confirmar: …"* con "Reenviar correo" y "Cancelar cambio". Sin Brevo, en desarrollo, aparece "abrir el enlace de confirmación".
- [ ] **Confirmar:** abre el enlace → *"Tu correo de acceso ahora es …"* y la barra de direcciones queda en `/confirmar-correo` sin el token. Recarga → sigue mostrando el mismo resultado (no "enlace vencido"). Abre otra vez el enlace desde el correo → *"El enlace no es válido o venció. Pide uno nuevo desde Ajustes."*.
- [ ] **Confirmar sin red:** abre el enlace con la red cortada (DevTools → Offline) → mensaje de sin conexión con **"Reintentar"**; vuelve la red y pulsa Reintentar → se confirma.
- [ ] **Cambiar la contraseña:** con un cambio de correo pendiente, cambia la contraseña → *"Tu contraseña se cambió."*, sigues con la sesión abierta y el pendiente desaparece de la pantalla.
- [ ] **Sin conexión:** con la red cortada, guardar perfil, contraseña o correo → *"No hay conexión a internet: no se guardó nada…"* y lo escrito se conserva.
- [ ] **Red lenta (2026-10-08, `6b52187`):** en DevTools → Network, crea un perfil con mucha latencia (p. ej. 20 000 ms) y guarda el perfil → a los 15 s el botón se libera y aparece *"No pudimos confirmar si se guardó: la conexión tardó demasiado. Recarga antes de volver a intentarlo."*. En el cambio de contraseña el aviso dice qué hacer si la sesión se cierra después. Lo mismo en Zona horaria y Notificaciones.
- [ ] **Cambiar de pestaña mientras guarda:** con la red lenta, cambia la contraseña y pasa a Perfil antes de que responda; vuelve a Correo y contraseña → se ve el resultado. Las contraseñas que habías escrito ya no están (el correo nuevo sí).
- [ ] **Modo demo:** los guardados dicen que es una demostración (no fingen persistencia).

**"Mi perfil" vía API (RF-018, 2026-10-06, `68d9287`)** — con el token de la sesión (Swagger, Bruno o `curl`):

- [ ] **Ver mi perfil:** `GET /usuarios/me/perfil` → tu correo y tu ficha (el alumno ve documento y fecha de nacimiento); nunca contraseñas ni hashes.
- [ ] **Editar datos:** `PATCH /usuarios/me/perfil` con `{"telefono":"+584141112233"}` → 200 y el teléfono cambia (el entrenador lo ve en la ficha del alumno). Con `{"numeroDocumento":"1"}` → 400; un alumno con `{"nombreComercial":"x"}` → *"Ese dato no se puede cambiar desde tu perfil."*.
- [ ] **Cambiar la contraseña:** `POST /usuarios/me/password` con la actual mal → *"Tu contraseña actual no es correcta."*; con la nueva igual a la actual → *"La contraseña nueva debe ser distinta de la actual."*; bien → *"Tu contraseña se cambió."*, tokens nuevos y llega el correo *"Tu contraseña de GUACHAFIT cambió"*. Otra sesión abierta deja de renovarse.
- [ ] **Cambiar el correo:** `POST /usuarios/me/correo` con un correo libre y la contraseña actual → llega *"Confirma tu nuevo correo de GUACHAFIT"* al correo NUEVO (sin Brevo, en desarrollo, la respuesta trae `enlaceConfirmacion`). Antes de confirmar sigues entrando con el correo anterior. `POST /auth/confirmar-cambio-correo` con el `token` del enlace → *"Tu correo de acceso ahora es …"* y al correo ANTERIOR llega *"Tu correo de acceso a GUACHAFIT cambió"* con el nuevo enmascarado. El mismo enlace otra vez → *"El enlace no es válido o venció. Pide uno nuevo desde Ajustes."*.
- [ ] **Correo ocupado o igual:** con el correo de otra cuenta → *"Ese correo ya está en uso."*; con el tuyo → *"Ese ya es tu correo de acceso."*.
- [ ] **Cambio pendiente anulado por la contraseña:** pide un cambio de correo y, antes de confirmarlo, cambia la contraseña → el enlace ya no sirve.
- [ ] **Cancelar:** `DELETE /usuarios/me/correo-pendiente` → *"Cancelaste el cambio de correo."* y el enlace deja de servir.
- [ ] **Límite:** 6 intentos seguidos de cambio de contraseña (o de correo) en 15 minutos → el 6.º responde *"Hiciste demasiados intentos. Espera un momento y vuelve a intentarlo."*.
- [ ] **Migración `0017`:** con Docker arriba, `pnpm --filter @guachafit/database db:migrate` y comprueba en `psql` las columnas `correo_pendiente`, `token_cambio_correo_hash` y `token_cambio_correo_expira` de `usuarios` (pendiente de verificar).

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
- [ ] **Diálogos de confirmación propios:** las confirmaciones (borrar día, reemplazar rutina, acciones del admin…) son diálogos de la app, no la ventana gris del navegador; Escape los cierra y el foco vuelve al botón.
- [ ] **Peso de letra moderado (desde 2026-10-10):** en ninguna pantalla hay textos "ultranegros". Títulos, cifras y etiquetas se ven en negrita normal (700 como máximo), tanto en el tema claro como en el oscuro y en el móvil.

## 9.1. Errores y mensajes (todos los roles)

- [ ] **Datos inválidos → mensaje claro:** envía un formulario con un dato fuera de rango (p. ej. un peso negativo) → el mensaje **nombra el campo** en español y no muestra textos como "Zod", "uuid", "null" o "token".
- [ ] **Error 500 con referencia:** ante un fallo inesperado del servidor (p. ej. detén la base de datos y recarga una lista) el mensaje es **"Tuvimos un problema. Inténtalo de nuevo en unos minutos. (Ref. xxxxxxxx)"**; busca esa referencia en la consola del API: aparece junto al método y la ruta.
- [ ] **Pantalla que no se pudo abrir (desde 2026-10-19, lote ER1):** con la app abierta en una pantalla (por ejemplo, el login), reinicia el servidor de la web (`pnpm --filter @guachafit/web dev`) y, sin recargar, pulsa **"¿Olvidaste tu contraseña?"** → en lugar de la pantalla técnica ("Unexpected Application Error!") ves **"Hay una versión nueva de GUACHAFIT"** con el botón **"Recargar"**, que abre la pantalla al pulsarlo. Repite con DevTools → Network → **Offline** antes de pulsar → ves **"No se pudo abrir esta pantalla sin conexión"** con **"Reintentar"**. La app no recarga nunca sola.
- [ ] **Mensajes sin jerga y con tuteo:** recorre login, altas, plantillas, nutrición y pagos provocando errores: ningún mensaje trata de "usted" ni menciona tenant, JWT, token, refresh, roles en mayúsculas o identificadores internos.

## 10. Notificaciones (campana, preferencias y resumen semanal)

- [ ] **Campana (cabecera, coach y alumno):** el icono de campana muestra un **badge** con las no leídas (muestra "9+" si hay más de 9); al pulsarlo se abre el **panel** con las notificaciones agrupadas en **Hoy / Ayer / Anteriores**.
- [ ] **Marcar leídas y navegar:** al hacer clic en una notificación se marca como leída y te lleva a su pantalla (p. ej. un pago aprobado lleva a Conciliación). Arriba está **"Marcar todas como leídas"**; si hay más de las visibles aparece **"Ver más"**. Con la bandeja vacía se ve **"Estás al día"**.
- [ ] **Preferencias del coach:** Ajustes → pestaña **Notificaciones** (o directo `http://localhost:3000/coach/ajustes?tab=notificaciones`). Cada categoría tiene switches **Push** y **Email**; en **Seguridad de Cuenta** el Email sale **bloqueado con candado** y la nota "Obligatorio por motivos de seguridad" (RN-01). "Guardar cambios" persiste y muestra confirmación.
- [ ] **Confirmación RN-02 (Finanzas):** apaga **Push y Email** de la fila de pagos/cobranzas y guarda: debe aparecer el modal **"¿Desactivar todos los avisos de pagos?"** con "Mantener canales activos" y "Sí, desactivar de todos modos"; solo el segundo confirma el guardado.
- [ ] **Preferencias del alumno:** menú del alumno → **"Ajustes" → Notificaciones** (o directo `http://localhost:3000/app/ajustes?tab=notificaciones`; la ruta vieja `/app/preferencias` redirige ahí). Es la misma matriz del rol alumno, con su candado de Seguridad y su confirmación de Finanzas.
- [ ] **Resumen semanal del coach:** llega a la **campana in-app** (el digest se genera lunes 08:00 UTC; en modo demo se ve un ejemplo sin esperar). Opcional: si configuraste `BULL_BOARD_USER`/`BULL_BOARD_PASS`, entra a `http://localhost:4000/admin/queues` y busca la cola **`notificaciones-resumen-semanal`** (job repetible `notificaciones:resumen-semanal`) y su DLQ.
- [ ] **Modo demo:** con "Modo Coach"/"Modo Alumno" la campana y las preferencias usan datos de ejemplo; al guardar preferencias dice "Preferencias guardadas en esta sesión de demostración" (no finge persistencia).

## 11. Antropometría: check-in, evolución y fotos (RF-003 / RF-004)

**Check-in antropométrico (RF-003)**

- [ ] **Alumno — campos nuevos (RN-02):** en `/app/progreso` el formulario incluye brazo relajado, brazo contraído, muslo medio y los 4 pliegues cutáneos (tríceps, subescapular, suprailíaco, abdominal), opcionales y con validación de rango; los controles viejos siguen viéndose (alias de brazo relajado y muslo medio).
- [ ] **Alumno — banner de ventana:** con calendario configurado, el alumno remoto ve si la ventana está **abierta** ("puedes registrar tu check-in hasta el …"), **próxima** ("tu ventana abre …") o **cerrada** (con la próxima fecha); con la ventana cerrada el botón de registro queda deshabilitado y el motivo visible. Sin calendario no hay banner ni bloqueo (registro libre).
- [ ] **Alumno — presencial en solo lectura:** con modalidad presencial, el formulario se muestra en modo lectura (sin edición); si se fuerza la mutación, el servidor responde 403 y la vista lo explica (nunca un error genérico). En modo demo, el selector "Escenario demo" permite alternar **Remoto en ventana / Remoto fuera de ventana / Presencial (solo lectura)**.
- [ ] **Fotos del check-in (2026-10-08, `affec1f`):** en el check-in del alumno online aparecen las casillas **Frontal / Lateral / Posterior** ("Fotos de progreso (opcionales)"). Elige una foto → "Subiendo…" y luego la miniatura con "Quitar"; el aviso nombra las que faltan y dice que son opcionales. Envía con 0, 1 o 3 fotos: el check-in se registra igual. Con DevTools → Network en "Offline" al elegir una foto → error con **Reintentar**. Mientras una foto se sube, "Enviar Evaluación al Coach" queda deshabilitado; "Quitar" cancela la subida.
- [ ] **Fotos en iPhone (2026-10-09, `84643ef`):** desde Safari en iPhone, adjunta una foto al check-in (y una de plato o un comprobante): se sube como JPEG; antes Safari las rechazaba todas.
- [ ] **Evolución sin conexión sin enlaces:** con la evolución cargada, pasa a Offline (DevTools) y recarga `/app/progreso`: el gráfico se ve con el aviso de datos guardados y las fotos aparecen como "Sin imagen". En DevTools → Application → Cache Storage → `api-cache`, la respuesta de `/antropometria/evolucion/…` tiene `presignedGetUrl: ""`.
- [ ] **Modo demo del alumno:** en demo, envía el check-in → "¡Mediciones Guardadas!" con "En la demostración no se envía nada a tu entrenador." y ninguna petición al API en Network.
- [ ] **Fotos en el control en sala (coach):** en la ficha del alumno → "Registrar Control en Sala" aparecen las mismas casillas; las fotos guardadas se ven luego en la galería del alumno y en el comparador.
- [ ] **Ficha del alumno, tabs y textos (desde 2026-10-26):**
  - Los tabs se llaman **Perfil, Pagos, Medidas, Entrenos y Nutrición**. La URL conserva `?tab=resumen|finanzas|antropometria|entrenamiento|nutricion`, así que los enlaces antiguos siguen funcionando.
  - La barra es un control segmentado: en el móvil (360px) las 5 pestañas caben en una fila **sin deslizar**, con el icono sobre el nombre; la activa va rellena. Prueba también con el texto del sistema ampliado: "Nutrición" puede cortarse con puntos suspensivos.
  - Con deuda, el tab **Pagos** muestra un **punto rojo** en la esquina en el móvil y el saldo con dos decimales (por ejemplo `$40.00`) desde tablet.
  - Con las flechas del teclado (← →, Inicio, Fin) se mueve entre pestañas y cada una se activa al llegar.
  - A 360px de ancho ningún tab, badge ni formulario se sale de la pantalla ni parte su texto en dos líneas ("Cuota pendiente", "Sin cuota emitida", "Sin plan").
- [ ] **Salud y limitaciones (antes "Alerta Médica"):**
  - Si el alumno tiene texto de salud, la cabecera muestra **"Salud y limitaciones"** con hasta 2 líneas y el botón **"Ver detalle"**, que lleva al tab Perfil. Sin texto, el aviso no aparece.
  - En el tab Perfil, la tarjeta **"Salud y limitaciones"** tiene un contador `N/2000` y no deja escribir más de 2000 caracteres.
  - Solo la ve el entrenador.
- [ ] **Formularios de la ficha:** al tocar una etiqueta ("Nombres", "Precio acordado (USD)", "Peso"…) el cursor entra en su campo; en el móvil los campos numéricos abren el teclado numérico; los campos miden al menos 44px de alto; el botón es **"Guardar cambios"**, a todo el ancho en móvil.
- [ ] **Rutina de un alumno archivado:** en el tab Entrenos, "Editar rutina semanal", "Asignar rutina" y "Cargar desde plantilla" aparecen deshabilitados, con la ayuda "Restaura al alumno…".
- [ ] **Métricas de antropometría:** "Brazo" y "Pecho" son tarjetas separadas; en pantallas anchas se reparten sin dejar una tarjeta suelta.
- [ ] **Coach — calendario (ficha del alumno → tab Medidas):** fija la periodicidad (semanal / quincenal / mensual) + la fecha de inicio; al guardar se muestra la **próxima fecha programada** y el estado de la ventana (vigente / próxima / vencida), leídos del calendario guardado. Activar una periodicidad sin fecha de inicio se rechaza con 400 (no guarda un calendario inerte); "Sin calendario" desactiva la ventana y el alumno remoto vuelve al registro libre.
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

- [ ] **Ventana del check-in:** abre la pantalla antes de las 18:00 (hora de tu dispositivo): verás el banner **"El reporte aún no está abierto"** y el formulario deshabilitado; no se envía ni se encola nada (el día quedará "No reportado"). Después de las 18:00 el reporte se puede guardar y se refleja en el calendario.
- [ ] **Metas visibles:** la tarjeta "Tus objetivos nutricionales" muestra las metas reales del coach (kcal, proteína, carbohidratos, grasas, agua) y sus recursos por enlace; si el coach no configuró metas, lo declara de forma honesta y puedes reportar igual.
- [ ] **Reporte con fotos:** adjunta de 1 a 4 fotos (JPG/PNG/WebP); se comprimen en el dispositivo (WebP 1920 px / 0.85, con fallback JPEG) antes de subirse. Tras guardar, abre una miniatura para ver el visor (**Escape** cierra y devuelve el foco).
- [ ] **Cola con fotos (sin conexión):** con fotos adjuntas y sin conexión, el reporte queda **guardado en el dispositivo** ("Guardado sin conexión · pendiente de envío (con fotos)"), el formulario se limpia y el día figura "Pendiente de sincronizar" (no se declara registrado). Al volver la red, el panel de sincronización (franja "1 cambio sin sincronizar" o campana del header) lo sube solo: primero las fotos y después el check-in. Si el envío falla por red, el panel lo muestra como **Reintentando** con la evidencia conservada ("conserva N foto(s)…"), y ofrece **Reintentar** y **Descartar**; al descartar se eliminan los blobs del dispositivo.
- [ ] **Tolerancia:** con metas y totales reportados (kcal/proteína) verás "Dentro del margen (±10 %)", "Parcialmente dentro" o "Fuera del margen"; sin metas o sin totales dice **"Sin evaluar"** (nunca un OK falso).
- [ ] **Fallos honestos:** un rechazo de negocio (4xx distinto de 409) se muestra tal cual sin encolar; si ya lo habías registrado hoy (409), refresca el reporte real del servidor en vez de encolarlo. Si el día/ventana cierra antes de que la cola suba las fotos, el rechazo dice "El día ya cerró: el reporte con fotos no pudo registrarse" y la evidencia permanece hasta que decidas descartarla.
- [ ] **Sin color marcado (2026-10-05, `f827282`):** al abrir la pantalla dentro de la ventana, **ningún color** del semáforo viene marcado. El reporte se hace con **dos toques**: elegir color y pulsar **"Guardar"** (decisión del dueño).
- [ ] **Guardar sin color:** pulsa "Guardar" sin elegir color → aparece **"Elige cómo te fue hoy con tu plan."** y el foco salta al semáforo (con teclado, el siguiente Tab sigue desde ahí).
- [ ] **Pendiente que sobrevive a la recarga:** sin conexión (modo avión), elige un color y guarda → ves **"Guardado en tu dispositivo"**. Recarga la página (aún sin red): el aviso de pendiente **sigue ahí** y el formulario queda **bloqueado** (no deja enviar otro reporte del mismo día).
- [ ] **Paso a registrado:** recupera la red → el aviso cambia a **"Comprobando si tu reporte quedó registrado…"** y, cuando se confirma, a **"✓ Reporte registrado para hoy (…)"**. Nunca dice "registrado" antes de esa confirmación.
- [ ] **Reporte rechazado:** si el reporte encolado no se pudo enviar (p. ej. el día ya cerró al volver la red), verás **"Tu reporte no se pudo enviar. Revisa tus cambios por enviar e inténtalo de nuevo."** y el formulario se reabre; el detalle está en el panel de sincronización ("Cambios por enviar").
- [ ] **Lector de pantalla:** con TalkBack/VoiceOver/NVDA, recorre el semáforo → anuncia el grupo ("¿Cómo te fue hoy con tu plan?") y, al elegir un color, que ese botón está **presionado**; las confirmaciones se leen sin interrumpir. Los campos de agua, calorías, proteína y notas anuncian su etiqueta, y un dato inválido muestra el error **nombrando el campo** (p. ej. "Calorías: escribe un número entre 0 y 15000.").
- [ ] **Valores 0 tras recargar:** registra un reporte con agua, calorías o proteína en **0** y recarga → los ceros **se siguen viendo** (no quedan en blanco).
- [ ] **Error al cargar el reporte de hoy:** con el API detenido, abre la pantalla → verás **"No pudimos cargar tu reporte de hoy. Revisa tu conexión e inténtalo de nuevo."** con botón **Reintentar**; arranca el API y pulsa Reintentar.
- [ ] **Clave de foto ajena (2026-10-05, `24609ba`):** con una herramienta HTTP (Postman, curl…) y el token de un alumno, envía el reporte con una `storageKey` de otro alumno (o de otro módulo) en `fotosPlatos` → **400** *"No pudimos asociar la foto. Vuelve a subirla."* y no se guarda nada.
- [ ] **Doble toque rápido en Guardar:** pulsa "Guardar" dos veces muy rápido → queda **un solo reporte** y nunca aparece un error 500.
- [ ] **Agua fuera de rango:** escribe **25** en agua y guarda → mensaje claro de que el agua va entre 0 y 20 litros (no un 500).
- [ ] **Reporte offline con otros datos:** registra el reporte de hoy desde otro dispositivo; en este, sin conexión, guarda un reporte distinto (con fotos) y recupera la red → en "Cambios por enviar" aparece **"Ya tenías un reporte de hoy registrado con otros datos; este no se envió."**, las fotos se conservan y el aviso sigue al reabrir la pantalla. Si los datos coinciden, se da por enviado sin aviso.
- [ ] **Reporte offline aceptado a la mañana siguiente (2026-10-05, `0555dfe`):** sin conexión, guarda el reporte a las **23:50** (hora de la zona de tu perfil) y recupera la red a las **08:00** del día siguiente → el reporte **se acepta** con la fecha del día anterior.
- [ ] **Reporte offline después del mediodía:** igual que el anterior, pero recupera la red a las **12:30** → rechazo con **"Este reporte llegó después del mediodía del día siguiente, así que ya no se puede registrar. El día quedó como «No reportado»."**, visible en **"Cambios por enviar"** y sin reintentos automáticos.
- [ ] **Teléfono con la hora mal puesta:** adelanta o atrasa la hora del teléfono (desactiva la hora automática) y guarda un reporte → se acepta o rechaza según la **hora real** (la del servidor en la zona de tu perfil), no la del teléfono.
- [ ] **Cambiar la zona del perfil (vía API):** con el token del alumno, `PATCH /alumnos/me/zona-horaria` con `{"zonaHoraria":"Europe/Madrid"}` → 200 y `GET /auth/me` devuelve esa zona; envía el reporte y comprueba que la ventana 18:00–23:59 se cuenta en **esa** zona. Una zona inventada → 400 *"Elige una zona horaria válida, por ejemplo America/Caracas."*
- [ ] **Elegir tu zona en la app (2026-10-06, `58c5d2c`):** en **"Ajustes" → "Zona horaria"** elige "Hora de Madrid" y pulsa **"Guardar zona horaria"** → *"Zona horaria guardada."*; en Nutrición el aviso dice *"(hora de Madrid)"* y el reporte se abre a las 18:00 de Madrid. Sin conexión → *"No hay conexión a internet: la zona horaria no se guardó…"* y nada cambia.
- [ ] **Ventana correcta recién iniciada la sesión:** con un alumno cuya zona del perfil difiere de la del teléfono, cierra sesión, inicia sesión y entra a Nutrición sin recargar → la ventana y el texto ya usan la zona del perfil.
- [ ] **Metas del día conservadas (vía API):** registra un reporte, cambia las metas del alumno como coach y consulta los reportes → el reporte anterior conserva en `metasVigentes` las metas de su día (los reportes previos a la migración `0016` traen `null`).
- [ ] **Modo demo:** con "Modo Alumno" la ventana horaria no bloquea la simulación y el reporte, las metas y la tolerancia usan el fixture local.

**Coach (ficha del alumno → pestaña Nutrición, `?tab=nutricion`)**

- [ ] **Calendario de 30 días:** los días cerrados sin check-in se muestran como **No reportado** (derivado, en gris); los reportados, con su semáforo real.
- [ ] **Totales vs metas y semáforo:** el panel compara lo reportado contra las metas y clasifica la tolerancia; con datos faltantes dice "sin evaluar".
- [ ] **Hora de registro y meta del día (2026-10-06, `58c5d2c`):** cada día reportado muestra *"Registrado a las HH:mm"* en la zona del alumno (y *"· enviado al día siguiente"* si llegó tarde) y *"2100 de 2000 kcal"* con la meta de ese día; cambia las metas y comprueba que los días anteriores no cambian. Los reportes antiguos dicen *"Comparado con las metas actuales"*.
- [ ] **Zona horaria del alumno:** la sección "Zona horaria del alumno" muestra su zona; cámbiala → *"Zona horaria guardada."* y el alumno ve la nueva ventana. Guarda y navega enseguida a otro alumno: la zona del primero **no** aparece en el segundo.
- [ ] **Fotos del diario:** abre las miniaturas de cada día en el visor accesible (Escape cierra).
- [ ] **Editor de metas:** define kcal, macros, agua y hasta 10 recursos por enlace o PDF subido; al guardar, el alumno ve las metas. Un alumno sin metas no muestra ceros fabricados (204 honesto). Al quitar un PDF y guardar, el archivo se **elimina de la bóveda** (borrado best-effort del servidor; desde `2319dff` se pide confirmación antes, ver abajo) y el enlace firmado anterior deja de servirse; un recurso por enlace externo solo deja de listarse.
- [ ] **Editar metas solo con metas cargadas (2026-10-05, `2319dff`):** mientras cargan las metas, el botón de editar está **deshabilitado** y dice **"Espera a que carguen las metas."**; con el API detenido, tras el error sigue deshabilitado con **"No pudimos cargar las metas. Reintenta antes de editarlas."**
- [ ] **Quitar un PDF guardado:** quita un PDF ya guardado y pulsa Guardar → aparece **"¿Borrar este PDF para siempre?"** antes de guardar.
- [ ] **Reemplazar un PDF:** cambia un PDF guardado por otro y guarda → también pide la confirmación de borrado.
- [ ] **Cerrar con cambios sin guardar:** modifica algo y cierra con el fondo, la X, el botón Cerrar o Escape → aparece **"¿Salir sin guardar?"** en cada caso.
- [ ] **Escape con confirmación abierta:** con el diálogo de confirmación encima del editor, pulsa Escape → solo se cierra el diálogo; el editor sigue abierto con tus cambios.
- [ ] **Guardar con subida en curso:** pulsa Guardar mientras un PDF se está subiendo → verás **"Espera a que termine de subirse el PDF."**
- [ ] **Decimales en calorías:** escribe calorías con decimales (p. ej. 2000,5) → mensaje claro de que debe ser un número entero (no se trunca en silencio).
- [ ] **Guardar sin red:** sin conexión, pulsa Guardar → mensaje de que **no hay conexión y los cambios no se guardaron**.
- [ ] **Enlace `javascript:` en un recurso (2026-10-05, `24609ba`):** en el editor de metas, añade un recurso por enlace con `javascript:alert(1)` y guarda → se rechaza (solo enlaces `http://` o `https://`).
- [ ] **Zona del alumno desde el coach (2026-10-05, `0555dfe`, vía API):** con el token del entrenador, `PATCH /alumnos/:id` con `{"zonaHoraria":"America/Bogota"}` → 200 y la ficha devuelve la zona nueva; con el token de **otro** entrenador, el mismo PATCH → **403** y la zona no cambia.
- [ ] **Paginación declarada:** el calendario trabaja sobre la ventana de 30 días con paginación en cliente (no es un listado server-paginado).
- [ ] **Alerta semanal:** si hay días cerrados sin reporte, el resumen semanal del coach lo menciona (solo cuando el contador es mayor que 0; llega por la campana in-app — sección 10).

## 13. ⛔ Lo que AÚN NO existe (no lo reportes como error)

- **Notificaciones**: proveedor real de push (la entrega push sigue **simulada por log**; el **correo ya sale por Brevo** si está configurado, sección 7.1), cliente push del navegador (WebPush sin UI), recordatorio de check-in 06:00 con cron exacto por huso horario (el recordatorio **sí existe**: corre por barrido aproximado en UTC con cadencia de 15 min, que cae dentro de la hora local 6 para offsets de hora entera, media hora y 45 min; sin reemisión si el worker está caído toda la hora local 6) y alerta externa de colas/DLQ (Sentry/Datadog). La campana, las preferencias y el resumen semanal **ya existen** (sección 10).
- **Nutrición**: los recursos educativos del coach pueden ser **enlaces o PDFs subidos** (validados por tipo, firma `%PDF-` y tamaño; se sirven con enlace firmado). Los reportes **con fotos** sin conexión se **encolan completos** (primero las fotos, después el check-in), con la evidencia visible, reintentable y descartable en el panel. La subida real está verificada contra MinIO; falta repetirla contra Cloudflare R2 con credenciales reales. El **borrado al quitar un recurso guardado ya existe**: al guardar metas, los PDFs sin referencia se eliminan de la bóveda (best-effort, verificado contra MinIO). Siguen sin existir la recolección de objetos nunca referenciados (subir sin guardar) y la serialización por alumno del ciclo de metas (carrera residual, [[ADR-015-borrado-best-effort-objetos-boveda]]).
- **Antropometría**: los avisos al coach (check-in remoto recibido y ventana vencida) **ya existen** (sección 11); el único punto documentado es que `POST /antropometria/presigned-upload-url` no evalúa la ventana (la ventana se valida al registrar el check-in; el presencial sigue bloqueado al subir fotos).
- **Admin / accesos**: planes/facturación de la plataforma siguen pendientes. El **correo de bienvenida** (coach y alumno) y la **recuperación de contraseña** **ya existen** (sección 7.1, desde API-4); la gestión de cuentas (deshabilitar/reactivar) y de licencias (suspender/activar) también (sección 7). Límites conocidos: "Le enviamos un correo" significa que salió hacia Brevo, no que llegó al buzón; tras cambiar la contraseña, otra sesión abierta sigue hasta 15 minutos.
- **Una sola instancia del API**: el límite de intentos (429) y la protección contra envíos repetidos (idempotencia) viven en la memoria del proceso; si reinicias el API se reinician. No es un bug mientras haya un único servidor.
- **Orden de envío en la pantalla de entrenamiento**: si un cambio se está enviando con red y justo se corta, otro cambio encolado después puede llegar antes (carrera conocida, preexistente). Si ves un rechazo raro en ese caso, anótalo con la hora.
- **Auditoría de accesos entre coaches**: hoy solo queda registrada en la ficha de alumnos; otras pantallas aún no la registran.
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
