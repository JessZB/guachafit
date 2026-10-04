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
4. Conectar el repositorio y configurar las variables del API.
5. Ejecutar las migraciones (`pnpm db:migrate`) **antes** de iniciar el API.
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

> **Aislamiento multi-tenant (RLS):** el API debe conectarse con un rol **no dueño** (`NOSUPERUSER NOBYPASSRLS`, p. ej. `guachafit_app`); con el rol dueño, las políticas RLS no se aplican. Las migraciones sí necesitan el rol dueño. Ver [[02_Esquema_Base_de_Datos_PostgreSQL]] (nota D2) y [[ADR-011-aislamiento-multitenant-rls-progresivo-withtenant]]. ⚠️ **No verificado:** cómo y dónde se crea `guachafit_app` en producción.

---

## 5. Conectar el repositorio y desplegar el API

1. En el proyecto, añade un recurso **Application** desde tu repositorio Git (GitHub).
2. Rama: `main`.
3. Puerto del contenedor: el valor de `PORT` (por defecto el API escucha en `4000`).
4. Comando de inicio en producción: `node dist/main` (script `start:prod` de `apps/api`).

> ⚠️ **No verificado — cómo se construye la imagen:** el repositorio **no tiene Dockerfile**. Es un monorepo pnpm (`apps/api` depende de `packages/database`). Antes del primer despliegue hay que decidir entre un Dockerfile propio o el *build pack* automático de Coolify, y comprobar que la imagen incluye `packages/database/drizzle` (el API lee el journal de migraciones al arrancar).

### 5.1 Variables de entorno del API

Extraídas del código el 2026-10-04 (`apps/api/src`, `packages/database/src`).

**Obligatorias**

| Variable | Valor en producción | Qué pasa si falta |
|---|---|---|
| `NODE_ENV` | `production` | Se desactivan las protecciones de producción (secretos, migraciones). |
| `JWT_SECRET` | Secreto largo y aleatorio (`openssl rand -base64 48`) | El API **no arranca**. Tampoco acepta el valor de ejemplo. |
| `JWT_REFRESH_SECRET` | Otro secreto distinto, igual de largo | El API **no arranca**. |
| `DATABASE_URL` | URL interna de Postgres (con el rol no dueño, ver §4) | Intenta `127.0.0.1` y falla. |
| `REDIS_HOST` | Host interno de Redis en Coolify | Intenta `127.0.0.1`; colas y notificaciones fallan. |
| `REDIS_PORT` | `6379` (o el que indique Coolify) | Usa `6379`. |
| `ENCRYPTION_KEY` | 64 caracteres hexadecimales aleatorios (`openssl rand -hex 32`) | ⚠️ Usa **en silencio** una clave de desarrollo conocida. Configúrala **antes** de guardar datos; cambiarla después deja ilegibles los datos ya cifrados. |
| `TRUST_PROXY` | Número de saltos de proxy (ver nota) | Todos los usuarios comparten la IP del proxy y el límite de intentos los bloquea juntos. `true` se rechaza. |
| `CORS_ORIGINS` | Dominio de la web, p. ej. `https://app.tudominio.com` (varios separados por comas) | Solo se permite `http://localhost:3000`: la web no puede llamar al API. |
| `PORT` | `4000` (o el que configures en Coolify) | Usa `4000`. |

**Almacenamiento de fotos — Cloudflare R2** ([[ADR-007-almacenamiento-fotos-privadas-cloudflare-r2-presigned-urls]])

| Variable | Valor |
|---|---|
| `STORAGE_ENDPOINT` | Endpoint S3 de tu cuenta R2 (`https://<account-id>.r2.cloudflarestorage.com`) |
| `STORAGE_BUCKET` | Nombre del bucket de fotos |
| `STORAGE_ACCESS_KEY_ID` | Access key del token de API de R2 |
| `STORAGE_SECRET_ACCESS_KEY` | Secret del token de API de R2 |
| `STORAGE_REGION` | `auto` |

> ⚠️ Si faltan todas, el API **arranca igual** con un endpoint de marcador (solo un aviso en el log) y las fotos no funcionan. Revisa el log tras el primer despliegue.

El código también acepta los nombres alternativos `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_BUCKET_NAME`, `STORAGE_FORCE_PATH_STYLE` y la familia histórica `R2_*`. Usa una sola familia.

**Opcionales**

| Variable | Uso | Por defecto |
|---|---|---|
| `BULL_BOARD_USER` / `BULL_BOARD_PASS` | Panel de colas en `/admin/queues` (Basic Auth) | Sin ambas, la ruta responde 404. Déjalas vacías salvo que necesites el panel. |
| `COBRANZA_BARRIDO_CRON` | Barrido de cobranza ([[RF-008-maquina-estados-cuota-recordatorios]]) | `0 9 * * *` (09:00 UTC) |
| `RESUMEN_SEMANAL_CRON` | Resumen semanal del coach (RF-014) | `0 8 * * 1` (lunes 08:00 UTC) |
| `ANTROPOMETRIA_RECORDATORIO_CRON` | Recordatorio de check-in antropométrico | `*/15 * * * *` |

**Correo — se añadirán en el lote 4** ([[ADR-018-proveedor-correo-transaccional-brevo]])

| Variable (nombre propuesto) | Uso |
|---|---|
| `BREVO_API_KEY` | API key de Brevo. Sin ella, el worker de email sigue en modo **simulado**. |
| Remitente (nombre por definir) | Dirección y nombre del remitente verificado. |

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

> *Faltan migraciones de base de datos por aplicar (última esperada: …). Ejecuta pnpm db:migrate antes de iniciar el API.*

1. En cada despliegue con migraciones nuevas, ejecuta **primero**:
   ```bash
   pnpm db:migrate
   ```
   con `DATABASE_URL` apuntando al rol **dueño** de la base.
2. Después inicia (o reinicia) el API.
3. Para que el API pueda hacer esta comprobación, su rol necesita `SELECT` sobre el esquema `drizzle`. Sin ese permiso solo avisa en el log.

> ⚠️ **No verificado:** dónde ejecutar el comando en Coolify (p. ej. un comando previo al despliegue o una terminal del contenedor). `db:migrate` usa `tsx`, una dependencia de desarrollo: la imagen o el entorno donde se ejecute debe tenerla.

---

## 7. Cloudflare (DNS, proxy y SSL)

1. Añade tu dominio a Cloudflare y cambia los *nameservers* en tu registrador.
2. En **DNS**, crea registros `A` hacia la IP del VPS:
   - `api.tudominio.com` → IP del VPS, **proxy activado** (nube naranja).
   - `app.tudominio.com` → IP del VPS o Cloudflare Pages, según dónde publiques la web.
3. En **SSL/TLS**, elige el modo **Full (strict)**.
4. En Coolify, asigna el dominio `https://api.tudominio.com` a la aplicación para que emita su certificado.
5. Para el correo (lote 4), publica en el mismo DNS los registros **SPF, DKIM y DMARC** que indique Brevo.

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
- [ ] `NODE_ENV=production`, `JWT_SECRET`, `JWT_REFRESH_SECRET` y `ENCRYPTION_KEY` tienen valores propios y aleatorios.
- [ ] `pnpm db:migrate` se ejecutó y el API arrancó sin el error de migraciones.
- [ ] `https://api.tudominio.com/api/v1` responde con HTTPS válido.
- [ ] La web inicia sesión contra el API sin errores de CORS.
- [ ] Subir y ver una foto funciona (R2).
- [ ] **IP real:** varios intentos fallidos de login desde **otra red** no bloquean tu propia sesión. Si se bloquean juntos, `TRUST_PROXY` está mal.
- [ ] SSL de Cloudflare en **Full (strict)**.
- [ ] Backup diario activo y **una restauración probada** (§8.2).
- [ ] `/admin/queues` responde 404 o pide credenciales.

---

## 10. Qué hacer si algo falla

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| El API no arranca: *Falta la variable de entorno JWT_SECRET* | Falta un secreto o tiene el valor de ejemplo | Configura `JWT_SECRET` / `JWT_REFRESH_SECRET` en Coolify y redespliega. |
| El API no arranca: *Faltan migraciones…* | No se ejecutó `pnpm db:migrate` | Ejecuta las migraciones (§6) y reinicia el API. |
| El API no arranca: *TRUST_PROXY no es válido* | Valor `true` o no numérico | Usa un número de saltos (p. ej. `2`) o una lista de IPs/subredes. |
| Todos los usuarios quedan bloqueados a la vez tras intentos fallidos | `TRUST_PROXY` vacío o incorrecto | Ajusta `TRUST_PROXY` (§5.1) y repite la prueba de IP real. |
| La web muestra errores de CORS | `CORS_ORIGINS` no incluye el dominio de la web | Añade el dominio exacto (con `https://`) y reinicia. |
| Error 526 en Cloudflare | Certificado inválido en el servidor con *Full (strict)* | Revisa el certificado del dominio en Coolify (§7). |
| Las fotos no suben | Variables `STORAGE_*` incorrectas o token de R2 sin permisos | Revisa endpoint, bucket y token. |
| Los correos no llegan | Worker en modo simulado o dominio sin verificar | Revisa `BREVO_API_KEY` (lote 4) y SPF/DKIM/DMARC. |
| El disco se llena | Imágenes Docker viejas o backups locales | Limpia imágenes antiguas desde Coolify; desactiva los backups locales si ya suben a R2. |

Si no sabes la causa: abre los **logs** de la aplicación en Coolify. Los mensajes de configuración del API empiezan con `[Configuración]` y dicen qué variable corregir.

---

## Referencias

- Decisiones: [[ADR-005-arquitectura-backend-monolito-modular-nestjs]], [[ADR-007-almacenamiento-fotos-privadas-cloudflare-r2-presigned-urls]], [[ADR-008-motor-colas-background-workers-bullmq]], [[ADR-011-aislamiento-multitenant-rls-progresivo-withtenant]], [[ADR-017-despliegue-vps-coolify]], [[ADR-018-proveedor-correo-transaccional-brevo]].
- Código: `apps/api/src/main.ts`, `apps/api/src/common/config/` (`secretos-jwt.ts`, `trust-proxy.ts`, `verificar-migraciones.ts`), `apps/api/src/modules/antropometria/r2-storage.service.ts`, `apps/api/src/common/bull-board-auth.middleware.ts`, `apps/api/src/common/services/crypto.service.ts`.
- Coolify: instalación (https://coolify.io/docs/get-started/installation), backups (https://coolify.io/docs/databases/backups), documentación general (https://coolify.io/docs).
