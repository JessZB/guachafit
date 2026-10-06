---
id: ARCH-004
titulo: "Guía de Despliegue en VPS con Coolify (paso a paso)"
fecha: 2026-10-04
autor: "Tech Lead & Principal Software Architect"
estado: borrador
modulo: Arquitectura
tags:
  - arquitectura
  - despliegue
  - infraestructura
  - operaciones
  - guia
---

# Guía de Despliegue en VPS con Coolify

Esta guía lleva GUACHAFIT a producción en un VPS con Coolify, detrás de Cloudflare. Está escrita para alguien **sin experiencia en servidores**. Sigue los pasos en orden.

- **Decisión de fondo:** [[ADR-017-despliegue-vps-coolify]] (servidor) y [[ADR-018-proveedor-correo-transaccional-brevo]] (correo).
- **Convención:** ⚠️ **No verificado** marca lo que no se comprobó contra la documentación oficial o en un despliegue real. Compruébalo antes de confiar en ello.

---

## Ruta rápida

1. Crear el VPS y entrar por SSH con llave.
2. Instalar Coolify.
3. Crear Postgres y Redis en Coolify.
4. Conectar el repositorio, configurar el build con `apps/api/Dockerfile` (contexto: raíz del repositorio) y las variables del API.
5. Ejecutar las migraciones (`pnpm db:migrate:prod` o el migrador de la imagen) **antes** de iniciar el API.
6. Configurar Cloudflare (DNS, proxy, SSL *Full (strict)*).
7. Activar backups diarios de Postgres a R2 y **probar una restauración**.
8. Recorrer la checklist final.

---

## 1. Crear el VPS

1. Entra al panel del proveedor (preferido: Hetzner Cloud; vale cualquier proveedor).
2. Elige el plan:
   - **Solo GUACHAFIT:** 2 vCPU / 4 GB RAM (p. ej. Hetzner CX23, USD 7,09/mes al 2026-10-04).
   - **Varios proyectos:** 4 vCPU / 8 GB RAM (p. ej. Hetzner CX33, USD 10,59/mes).
   - Mínimo de Coolify: 2 CPU, 2 GB RAM, 10 GB de disco libre.
3. Sistema operativo: **Ubuntu LTS** (Coolify recomienda versiones LTS).
4. En "SSH keys", añade tu llave pública (ver paso 2). No uses contraseña.
5. Crea el servidor y anota su **IP pública**.

**Si no hay stock del plan** (el 2026-10-04 los planes *cost-optimized* de Hetzner figuraban "not available"):

1. Prueba otra ubicación (datacenter) del mismo proveedor.
2. Prueba la línea **CPX** de Hetzner con RAM equivalente.
3. Si nada está disponible, usa otro proveedor de VPS. Los pasos siguientes no cambian.

---

## 2. Acceso SSH con llave

1. En tu computadora, crea una llave (si no tienes una):
   ```bash
   ssh-keygen -t ed25519 -C "tu-correo"
   ```
2. Copia el contenido de `~/.ssh/id_ed25519.pub` en el panel del proveedor (paso 1.4).
3. Entra al servidor:
   ```bash
   ssh root@IP_DEL_VPS
   ```
4. Actualiza el sistema:
   ```bash
   apt update && apt upgrade -y
   ```

> Nunca compartas `id_ed25519` (la llave **privada**, sin `.pub`).

---

## 3. Instalar Coolify

1. Conectado por SSH como `root`, ejecuta el comando oficial (verificado en https://coolify.io/docs/get-started/installation el 2026-10-04):
   ```bash
   curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
   ```
2. Abre los puertos en el firewall del proveedor:

   | Puerto | Para qué |
   |---|---|
   | 22 | SSH |
   | 8000 | Panel de Coolify (solo durante la configuración inicial) |
   | 80, 443 | Tráfico web de las apps |

3. Abre `http://IP_DEL_VPS:8000` y crea la cuenta de administrador **de inmediato** (el primero que entra se queda con el panel).
4. Cuando el panel tenga dominio propio con HTTPS, cierra el puerto 8000. ⚠️ **No verificado:** el procedimiento exacto para servir el panel por dominio; consulta https://coolify.io/docs.

---

## 4. Postgres y Redis en Coolify

1. En Coolify, crea un **proyecto** "guachafit".
2. Añade un recurso **PostgreSQL 16** (la misma versión que `docker-compose.yml`).
   - Base de datos: `guachafit`.
   - Contraseña: larga y aleatoria (Coolify la genera).
   - **No** lo expongas a internet (sin puerto público).
3. Añade un recurso **Redis 7**. Tampoco lo expongas.
4. Anota las URLs **internas** que muestra Coolify para cada servicio. Las usarás en `DATABASE_URL`, `REDIS_HOST` y `REDIS_PORT`.

### 4.1. Rol de aplicación restringido (`guachafit_app`) — RLS (deploy-05c `bf1360e`)

El API debe conectarse con un rol **no dueño** (`NOSUPERUSER NOBYPASSRLS`, `guachafit_app` por defecto); con el rol dueño, las políticas RLS no se aplican. Ver [[02_Esquema_Base_de_Datos_PostgreSQL]] (nota D2) y [[ADR-011-aislamiento-multitenant-rls-progresivo-withtenant]] (§6). Orden de aprovisionamiento (el script es idempotente; todo corre en una sola transacción):

1. **Aplica las migraciones primero** (§6), con el rol **dueño** de las tablas en `DATABASE_URL_MIGRACIONES`. El aprovisionamiento aborta si todavía no hay tablas en `public` o si no existe `drizzle.__drizzle_migrations`.
2. **Crea (o actualiza) el rol** con `packages/database/scripts/crear-rol-app.sql`, ejecutado por un superusuario o un miembro del rol dueño. La contraseña se lee de la variable de entorno `GUACHAFIT_APP_PASSWORD` —**nunca** como argumento— y hace falta `psql` ≥ 15 (usa `\getenv`):

   ```bash
   export GUACHAFIT_APP_PASSWORD="$(cat <ruta-secretos>)"
   psql "postgresql://<admin>@<host>:5432/<base>" -v ON_ERROR_STOP=1 \
     -v owner_role=<rol-dueño> -v app_role=guachafit_app \
     -f packages/database/scripts/crear-rol-app.sql
   ```

   Si no sabes quién es el dueño: `SELECT DISTINCT tableowner FROM pg_tables WHERE schemaname IN ('public','drizzle');`. El script fuerza `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS LOGIN`; otorga CRUD en todas las tablas de `public`, `USAGE`/`SELECT` en sus secuencias, lectura de `drizzle.__drizzle_migrations` y privilegios por defecto para las tablas futuras del rol dueño. Aborta sin tocar nada si falta la contraseña, si quien lo ejecuta no puede aprovisionar, si `owner_role` no es el dueño real de las tablas (te dice cuáles son) o si las migraciones no están aplicadas. Intenta desactivar el registro de sentencias de su sesión; si no puede, avisa de que la contraseña podría quedar en el log del servidor.
3. **Verifica** con `packages/database/scripts/verificar-rol-app.sql`, conectado **como** el rol de aplicación (la contraseña va por `PGPASSWORD`, nunca en la URL):

   ```bash
   PGPASSWORD="$(cat <ruta-secretos>)" psql \
     "postgresql://guachafit_app@<host>:5432/<base>" -v ON_ERROR_STOP=1 \
     -f packages/database/scripts/verificar-rol-app.sql
   ```

   Debe terminar en `RESULTADO · PASS` (sin superusuario ni `BYPASSRLS`, sin ser dueño ni miembro de un dueño, CRUD en las 23 tablas y `USAGE`/`SELECT` en las secuencias, las 6 tablas con RLS devuelven 0 filas sin contexto teniendo datos y lectura de `drizzle.__drizzle_migrations`). El `AVISO` informativo de las 17 tablas sin RLS es el diseño del RLS progresivo ([[ADR-011-aislamiento-multitenant-rls-progresivo-withtenant]]). Sin datos en las tablas con RLS el resultado es `INCOMPLETO`: repite la verificación con datos reales (si esperabas datos, ejecuta `ANALYZE` como el rol dueño).
4. **Apunta `DATABASE_URL` del API** al rol de aplicación (`guachafit_app`) y reinicia. Las migraciones siguen corriendo con el rol dueño por `DATABASE_URL_MIGRACIONES` (§6).

> **Límite honesto:** en el desarrollo local, `DATABASE_URL` sigue apuntando al rol dueño (D2, pendiente y a decisión del dueño del proyecto) y las 17 tablas sin RLS dependen solo de los controles de autorización del API; una tabla futura creada por un rol distinto del dueño no recibe los GRANT por defecto. El API solo **avisa** —no bloquea— cuando su rol no puede leer `drizzle.__drizzle_migrations`.

---

## 5. Conectar el repositorio y desplegar el API

1. En el proyecto, añade un recurso **Application** desde tu repositorio Git (GitHub).
2. Rama: `main`.
3. **Cómo se construye la imagen (deploy-05b `de2975b`):** elige la construcción por **Dockerfile**, con la ruta `apps/api/Dockerfile` y el **contexto de build en la raíz del repositorio** (el Dockerfile copia el monorepo pnpm completo). Equivale a, desde la raíz:
   ```bash
   docker build -f apps/api/Dockerfile -t guachafit-api .
   ```
   La imagen usa `node:24-slim`, fija pnpm 11.6.0 por corepack, instala con `--frozen-lockfile`, compila shared → database → api y despliega solo el árbol de producción. Corre como usuario `node` (uid 1000), expone el puerto `4000` y trae un `HEALTHCHECK` cada 30 s contra `http://127.0.0.1:4000/api/v1/health` (o el `PORT` configurado, con 20 s de espera inicial). Incluye `packages/database/dist` **y** `drizzle/` (el API lee el journal de migraciones al arrancar) y **no** trae `tsx`, `vitest` ni `.env`. Tamaño verificado: ~484 MB en disco (~99 MB comprimida). ⚠️ **No verificado:** los rótulos exactos de estas opciones en el panel de Coolify; consulta https://coolify.io/docs.
4. Puerto del contenedor: el valor de `PORT` (por defecto el API escucha en `4000`; el healthcheck usa el mismo valor).
5. Comando de inicio: la imagen arranca sola con `node dist/main.js` (`CMD`); no hace falta configurarlo en Coolify.

### 5.1 Variables de entorno del API

Extraídas del código el 2026-10-04 (`apps/api/src`, `packages/database/src`).

**Obligatorias**

| Variable | Valor en producción | Qué pasa si falta |
|---|---|---|
| `NODE_ENV` | `production` | Se desactivan las protecciones de producción (secretos, migraciones). |
| `JWT_SECRET` | Secreto largo y aleatorio (`openssl rand -base64 48`). En `.env.example` queda **vacío**: en desarrollo el API usa secretos integrados. | El API **no arranca** en producción. Tampoco acepta los secretos de desarrollo integrados. |
| `JWT_REFRESH_SECRET` | Otro secreto propio, largo y aleatorio. | El API **no arranca** en producción. |
| `DATABASE_URL` | URL interna de Postgres (con el rol no dueño, ver §4) | Intenta `127.0.0.1` y falla. |
| `REDIS_HOST` | Host interno de Redis en Coolify | Intenta `127.0.0.1`; colas y notificaciones fallan. |
| `REDIS_PORT` | `6379` (o el que indique Coolify) | Usa `6379`. |
| `ENCRYPTION_KEY` | Exactamente 64 caracteres hexadecimales (`openssl rand -hex 32`). | El API **no arranca** en producción (es obligatoria); también rechaza la clave de ejemplo y las de un solo carácter repetido. Si ya hay fichas cifradas, mantén **la misma** clave con la que se cifraron (si la original tenía más de 64 caracteres, usa sus primeros 64): cambiarla deja ilegibles los registros existentes. |
| `TRUST_PROXY` | Número de saltos de proxy (ver nota) | Todos los usuarios comparten la IP del proxy y el límite de intentos los bloquea juntos. `true` se rechaza. |
| `CORS_ORIGINS` | Dominio de la web, p. ej. `https://app.tudominio.com` (varios separados por comas; cada uno debe empezar por `http://` o `https://` y `*` no se admite) | En producción el API **no arranca** (es obligatoria); fuera de producción se permite `http://localhost:3000`. |
| `PORT` | `4000` (o el que configures en Coolify) | Usa `4000`. |

> **En producción, todos los problemas se reportan juntos (deploy-05a `1e4d5d7`):** al arrancar, el API reúne en un único error `[Configuración]` los problemas de los secretos JWT, `ENCRYPTION_KEY`, almacenamiento, `CORS_ORIGINS` y la contraseña de Bull-Board, con una línea por problema: corrígelos todos de una vez. Fuera de producción solo deja un aviso resumen —excepto una `ENCRYPTION_KEY` presente pero mal formada (debe ser hexadecimal y tener al menos 64 caracteres), que detiene el arranque en **cualquier** entorno.

**Almacenamiento de fotos — Cloudflare R2** ([[ADR-007-almacenamiento-fotos-privadas-cloudflare-r2-presigned-urls]]) — obligatorias en producción

| Variable | Valor en producción | Qué pasa si falta |
|---|---|---|
| `STORAGE_ENDPOINT` | Endpoint S3 de tu cuenta R2 (`https://<account-id>.r2.cloudflarestorage.com`) | El API **no arranca**. |
| `STORAGE_BUCKET` | Nombre del bucket de fotos | El API **no arranca**; también rechaza el valor de ejemplo `guachafit-r2-local`. |
| `STORAGE_ACCESS_KEY_ID` | Access key del token de API de R2 | El API **no arranca**; también rechaza el ejemplo `minioadmin`. |
| `STORAGE_SECRET_ACCESS_KEY` | Secret del token de API de R2 | El API **no arranca**; también rechaza el ejemplo `minioadmin`. |
| `STORAGE_REGION` | `auto` | No se valida al arrancar. |

> Con los valores de ejemplo de MinIO (los de `.env.example`) o con la variable ausente, en producción el API **no arranca**. Fuera de producción, sin ninguna configurada, arranca con un endpoint de marcador (solo un aviso en el log) y las fotos no funcionan.

El código también acepta los nombres alternativos `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_BUCKET_NAME`, `STORAGE_FORCE_PATH_STYLE` y la familia histórica `R2_*`. Usa una sola familia.

**Opcionales**

| Variable | Uso | Por defecto |
|---|---|---|
| `BULL_BOARD_USER` / `BULL_BOARD_PASS` | Panel de colas en `/admin/queues` (Basic Auth). Si defines `BULL_BOARD_USER`, `BULL_BOARD_PASS` es obligatoria: al menos 12 caracteres y distinta del valor de ejemplo. | Sin ambas, la ruta responde 404. Déjalas vacías salvo que necesites el panel. |
| `COBRANZA_BARRIDO_CRON` | Barrido de cobranza ([[RF-008-maquina-estados-cuota-recordatorios]]) | `0 9 * * *` (09:00 UTC) |
| `RESUMEN_SEMANAL_CRON` | Resumen semanal del coach (RF-014) | `0 8 * * 1` (lunes 08:00 UTC) |
| `ANTROPOMETRIA_RECORDATORIO_CRON` | Recordatorio de check-in antropométrico | `*/15 * * * *` |
| `SWAGGER_HABILITADO` | `true` expone el Swagger UI en `/api/docs` en producción. | Fuera de producción el UI siempre está; en producción queda **oculto** (404) si falta. |

**Correo — Brevo** ([[ADR-018-proveedor-correo-transaccional-brevo]]; existen desde API-4 `79ba082`, `apps/api/src/common/config/correo.ts`)

| Variable | Uso | Qué pasa si falta |
|---|---|---|
| `BREVO_API_KEY` | API key de Brevo (cabecera `api-key`). | El worker de email queda en modo **simulado** (solo log): bienvenidas, recuperación de contraseña y avisos **no se envían**. En producción se registra como error al arrancar, sin bloquear el API. |
| `EMAIL_REMITENTE` | Correo remitente; debe ser un remitente o dominio **verificado en Brevo**. | Con clave pero sin remitente, también modo **simulado** (Brevo rechazaría todo con 400). |
| `EMAIL_REMITENTE_NOMBRE` | Nombre visible del remitente. | Usa `GUACHAFIT`. |
| `APP_URL` | URL pública de la web, p. ej. `https://app.tudominio.com` (base de los enlaces `/activar` y `/restablecer` de los correos). | Usa el primer origen de `CORS_ORIGINS` y, en último caso, `http://localhost:3000`. En producción se registra como error. |

> El plan gratuito de Brevo admite **300 correos/día**; al superarlo los envíos fallan y quedan en la DLQ de `notificaciones-email` (ADR-018, T3).

> **No uses en producción** `ENCRYPTION_KEY_HEX`: solo la lee el *seed* de datos de prueba (`packages/database/src/seed.ts`). No ejecutes el *seed* en producción.

> **Nota sobre `TRUST_PROXY`** — ⚠️ **No verificado.** La cadena es Cloudflare → proxy de Coolify → API, así que el valor esperado es `2`. Funciona solo si el proxy de Coolify conserva la cabecera `X-Forwarded-For` que envía Cloudflare. Compruébalo en la checklist final (§9).

### 5.2 Web (PWA)

1. La web es estática: `vite build` en `apps/web`.
2. Variable de build: `VITE_API_URL` = URL pública del API (p. ej. `https://api.tudominio.com/api/v1`). ⚠️ **No verificado:** el formato exacto esperado (con o sin `/api/v1`); revisa `apps/web/.env.example`.
3. **No** definas `VITE_DEMO` en producción ([[ADR-012-modo-demo-explicito-datos-sinteticos]]).
4. Publícala en Cloudflare Pages o como sitio estático en el mismo Coolify.

---

## 6. Migraciones antes de iniciar el API

Con `NODE_ENV=production`, el API **no arranca** si falta la última migración. El log dice:

> *Faltan migraciones de base de datos por aplicar (última esperada: …). Aplica las migraciones antes de iniciar el API: en producción, `pnpm db:migrate:prod` o, dentro de la imagen del API, `node /app/node_modules/@guachafit/database/dist/migrate.js` con `DATABASE_URL_MIGRACIONES` (rol propietario de las tablas); en desarrollo local, `pnpm db:migrate`.*

Orden obligatorio (deploy-05b `de2975b`): las migraciones se ejecutan **antes** de arrancar (o reiniciar) el contenedor del API con la versión nueva.

1. Pasa el rol **dueño** de las tablas en `DATABASE_URL_MIGRACIONES`; si no se define, el migrador usa `DATABASE_URL` como respaldo. En producción, sin ninguna de las dos **termina con error (código 1)** —nunca cae a la URL local `127.0.0.1`— y el log muestra la URL objetivo con la **contraseña enmascarada** (`****`), nunca el valor original.
2. Ejecuta la migración, por uno de estos dos caminos:

   **a) Desde la propia imagen** (no requiere Node ni dependencias de desarrollo en el VPS):
   ```bash
   docker run --rm -e DATABASE_URL_MIGRACIONES='postgres://USUARIO:CLAVE@HOST:5432/guachafit' guachafit-api \
     node /app/node_modules/@guachafit/database/dist/migrate.js
   ```
   > En **Windows con Git Bash**, antepón `MSYS_NO_PATHCONV=1` al comando: Git Bash reescribe las rutas `/app/...`.

   **b) Fuera de la imagen**, desde un clon del repositorio (requiere Node y compilar `packages/database`):
   ```bash
   pnpm --filter @guachafit/database build
   DATABASE_URL_MIGRACIONES='postgres://USUARIO:CLAVE@HOST:5432/guachafit' pnpm db:migrate:prod
   ```
3. Espera el cierre `Todas las migraciones fueron aplicadas con éxito` y arranca (o reinicia) el API.
4. Para que el API pueda hacer esta comprobación, su rol necesita `USAGE` sobre el esquema `drizzle` y `SELECT` sobre `drizzle.__drizzle_migrations` (lo otorga `crear-rol-app.sql`, §4.1). Sin ese permiso el API solo **avisa** en el log —no bloquea— y dirige a ese script.
5. La migración más reciente es **`0016_nutricion_zona_captura_metas.sql`** (LOTE API-N2 `0555dfe`): añade `perfiles_alumno.zona_horaria` (`NOT NULL`, por defecto `'America/Caracas'`) y en `checkins_nutricionales` las columnas opcionales `capturado_en_utc` y `metas_vigentes` ([[ADR-019-zona-horaria-perfil-captura-relativa-nutricion]]). Es aditiva y no requiere volver a otorgar permisos al rol `guachafit_app` (los GRANT son por tabla); sin ella el API no arranca en producción. La anterior, **`0015_usuarios_recuperacion_password.sql`** (API-4 `79ba082`), añade 3 columnas opcionales a `usuarios` (`token_recuperacion_hash`, `token_recuperacion_expira`, `password_cambiada_en`) para la recuperación de contraseña.

> ⚠️ **No verificado:** dónde se configura el comando previo al despliegue en Coolify (opción tipo *Pre-deployment Command*); consulta https://coolify.io/docs. Si no existe, ejecuta la migración a mano (paso 2) **antes** de iniciar el contenedor nuevo.

---

## 7. Cloudflare (DNS, proxy y SSL)

1. Añade tu dominio a Cloudflare y cambia los *nameservers* en tu registrador.
2. En **DNS**, crea registros `A` hacia la IP del VPS:
   - `api.tudominio.com` → IP del VPS, **proxy activado** (nube naranja).
   - `app.tudominio.com` → IP del VPS o Cloudflare Pages, según dónde publiques la web.
3. En **SSL/TLS**, elige el modo **Full (strict)**.
4. En Coolify, asigna el dominio `https://api.tudominio.com` a la aplicación para que emita su certificado.
5. Para el correo, publica en el mismo DNS los registros **SPF, DKIM y DMARC** que indique Brevo al verificar el dominio del remitente (`EMAIL_REMITENTE`).

> ⚠️ **No verificado:** si el certificado de Coolify (Let's Encrypt) se emite correctamente con el proxy de Cloudflare activado. Si falla, desactiva el proxy temporalmente o usa un *Origin Certificate* de Cloudflare.

---

## 8. Backups de Postgres a R2 (innegociable)

GUACHAFIT guarda datos de salud y finanzas. **Sin backup diario y una restauración probada, no se cargan datos reales.**

### 8.1 Configurar

1. En Cloudflare R2, crea un bucket **separado** para backups (no el de fotos) y un token de API con acceso solo a ese bucket.
2. En Coolify, registra el bucket en **S3 Storages** (R2 es compatible con S3) y valida la conexión.
3. En el recurso Postgres, abre **Backups** y crea una programación **diaria** (p. ej. `0 3 * * *`).
4. Activa la subida a **S3** y elige el almacenamiento de R2.
5. Ejecuta un backup manual y confirma que el archivo aparece en el bucket.

### 8.2 Probar una restauración

Coolify advierte que un backup exitoso solo prueba que se creó un archivo. Hay que restaurarlo.

1. Crea en Coolify una base Postgres **desechable** (nunca la de producción).
2. Restaura en ella el último backup desde R2 (función de restauración de Coolify).
3. Comprueba que hay datos, p. ej.:
   ```sql
   select count(*) from usuarios;
   ```
4. Anota la fecha de la prueba y elimina la base desechable.
5. Repite la prueba periódicamente (sugerido: una vez al mes).

---

## 9. Checklist final

- [ ] El panel de Coolify tiene cuenta de administrador y el puerto 8000 está cerrado.
- [ ] Postgres y Redis **no** tienen puertos públicos.
- [ ] `NODE_ENV=production`, `JWT_SECRET`, `JWT_REFRESH_SECRET` y `ENCRYPTION_KEY` (64 hex exactos) tienen valores propios y aleatorios, **no** de ejemplo.
- [ ] `STORAGE_ENDPOINT`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID` y `STORAGE_SECRET_ACCESS_KEY` son los reales de Cloudflare R2 (no los de ejemplo de MinIO); `CORS_ORIGINS` lista los dominios reales de la web (con `http(s)://`, sin `*`); si hay panel de colas, `BULL_BOARD_PASS` tiene ≥12 caracteres y no es el valor de ejemplo.
- [ ] El API arranca sin el error bloqueante `[Configuración] El API no puede arrancar…`.
- [ ] Swagger: `/api/docs` responde **404** en producción (salvo `SWAGGER_HABILITADO=true`).
- [ ] La imagen se construyó con `apps/api/Dockerfile` y contexto en la raíz; el contenedor queda **`healthy`** (healthcheck contra `/api/v1/health`).
- [ ] Las migraciones se ejecutaron **antes** de iniciar el contenedor nuevo (con `DATABASE_URL_MIGRACIONES`, rol dueño, §6) y el API arrancó sin el error de migraciones.
- [ ] El rol de aplicación se provisionó con `packages/database/scripts/crear-rol-app.sql` **después** de migrar (contraseña por `GUACHAFIT_APP_PASSWORD`, psql ≥ 15) y `verificar-rol-app.sql`, ejecutado **como** ese rol, cerró en `RESULTADO · PASS` (§4.1).
- [ ] `DATABASE_URL` del API apunta al rol de aplicación (no al dueño); el log de arranque no muestra el aviso de que no puede leer `drizzle.__drizzle_migrations`.
- [ ] `https://api.tudominio.com/api/v1` responde con HTTPS válido.
- [ ] La web inicia sesión contra el API sin errores de CORS.
- [ ] Subir y ver una foto funciona (R2).
- [ ] **IP real:** varios intentos fallidos de login desde **otra red** no bloquean tu propia sesión. Si se bloquean juntos, `TRUST_PROXY` está mal.
- [ ] SSL de Cloudflare en **Full (strict)**.
- [ ] Backup diario activo y **una restauración probada** (§8.2).
- [ ] `/admin/queues` responde 404 o pide credenciales.
- [ ] **Correo:** remitente y dominio **verificados en Brevo**, con SPF, DKIM y DMARC publicados en Cloudflare (§7); `BREVO_API_KEY`, `EMAIL_REMITENTE` y `APP_URL` configuradas y el log de arranque **sin** avisos `[Configuración]` de correo.
- [ ] **Recuperación de contraseña de punta a punta:** "¿Olvidaste tu contraseña?" con un correo real → llega el correo (no a spam) → el enlace abre `/restablecer` en el dominio de la web → la nueva contraseña permite iniciar sesión.

---

## 10. Qué hacer si algo falla

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| El API no arranca: `[Configuración] El API no puede arrancar: se encontraron N problemas…` | Configuración crítica ausente, mal formada o de ejemplo (JWT, `ENCRYPTION_KEY`, `STORAGE_*`, `CORS_ORIGINS`, Bull-Board) | El error enumera **cada** problema en una línea; corrige todos y reinicia el API. |
| El API no arranca: *Faltan migraciones…* | No se ejecutaron las migraciones antes del contenedor nuevo | Ejecuta §6 (`DATABASE_URL_MIGRACIONES` con el rol dueño; migrador de la imagen o `pnpm db:migrate:prod`) y reinicia el API. |
| El API avisa *"El rol de base de datos del API no puede leer drizzle.__drizzle_migrations"* y continúa (no bloquea) | El rol de `DATABASE_URL` no tiene `SELECT` sobre la tabla del registro de migraciones | Ejecuta §4.1 (provisiona con `crear-rol-app.sql` tras migrar y verifica con `verificar-rol-app.sql`). Es solo un aviso: el API arranca igual. |
| El contenedor queda `unhealthy` (o reinicia en bucle) | El healthcheck no obtiene 200 en `/api/v1/health`: configuración, migraciones, Postgres o Redis | Mira los logs del contenedor y corrige el error de arranque; el healthcheck consulta `PORT` (o 4000). |
| El API no arranca: *TRUST_PROXY no es válido* | Valor `true` o no numérico | Usa un número de saltos (p. ej. `2`) o una lista de IPs/subredes. |
| Todos los usuarios quedan bloqueados a la vez tras intentos fallidos | `TRUST_PROXY` vacío o incorrecto | Ajusta `TRUST_PROXY` (§5.1) y repite la prueba de IP real. |
| La web muestra errores de CORS | `CORS_ORIGINS` no incluye el dominio de la web | Añade el dominio exacto (con `https://`) y reinicia. |
| Error 526 en Cloudflare | Certificado inválido en el servidor con *Full (strict)* | Revisa el certificado del dominio en Coolify (§7). |
| Las fotos no suben | Variables `STORAGE_*` incorrectas o token de R2 sin permisos | Revisa endpoint, bucket y token. |
| Los correos no llegan | Worker en modo simulado o dominio sin verificar | Revisa `BREVO_API_KEY`, `EMAIL_REMITENTE` y SPF/DKIM/DMARC; busca en el log `[Configuración]` y `[Worker Email] Fallo PERMANENTE` (clave, IP autorizada o remitente). Revisa también la DLQ `notificaciones-email-dead-letter` y el tope diario de 300 del plan gratuito. |
| El disco se llena | Imágenes Docker viejas o backups locales | Limpia imágenes antiguas desde Coolify; desactiva los backups locales si ya suben a R2. |

Si no sabes la causa: abre los **logs** de la aplicación en Coolify. Los mensajes de configuración del API empiezan con `[Configuración]` y dicen qué variable corregir.

---

## Referencias

- Decisiones: [[ADR-005-arquitectura-backend-monolito-modular-nestjs]], [[ADR-007-almacenamiento-fotos-privadas-cloudflare-r2-presigned-urls]], [[ADR-008-motor-colas-background-workers-bullmq]], [[ADR-011-aislamiento-multitenant-rls-progresivo-withtenant]], [[ADR-017-despliegue-vps-coolify]], [[ADR-018-proveedor-correo-transaccional-brevo]].
- Código: `apps/api/src/main.ts`, `apps/api/src/common/config/` (`secretos-jwt.ts`, `validar-configuracion-produccion.ts`, `variables-almacenamiento.ts`, `trust-proxy.ts`, `verificar-migraciones.ts`, `correo.ts`), `apps/api/src/modules/notificaciones/correo/`, `apps/api/src/modules/antropometria/r2-storage.service.ts`, `apps/api/src/common/bull-board-auth.middleware.ts`, `apps/api/src/common/services/crypto.service.ts`; imagen: `apps/api/Dockerfile`, `.dockerignore`; migraciones: `packages/database/src/migrate.ts`, `packages/database/src/url-migraciones.ts`; scripts del rol: `packages/database/scripts/crear-rol-app.sql`, `packages/database/scripts/verificar-rol-app.sql`.
- Coolify: instalación (https://coolify.io/docs/get-started/installation), backups (https://coolify.io/docs/databases/backups), documentación general (https://coolify.io/docs).
