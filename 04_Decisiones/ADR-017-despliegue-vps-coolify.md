---
id: ADR-017
titulo: "ADR-017: Despliegue en un VPS Administrado con Coolify (Docker) Detrás de Cloudflare"
fecha: 2026-10-04
estado: aceptado
decisores:
  - "Tech Lead"
  - "Principal Architect"
tags:
  - decision
  - adr
  - arquitectura
  - despliegue
  - infraestructura
  - operaciones
---

# ADR-017: Despliegue en un VPS Administrado con Coolify (Docker) Detrás de Cloudflare

## 1. Estado
`aceptado`

---

## 2. Contexto y Fuerzas en Juego
GUACHAFIT necesita un entorno de producción. El proyecto lo desarrolla y opera una sola persona, sin experiencia previa en operación de servidores. [[ADR-005-arquitectura-backend-monolito-modular-nestjs]] ya prevé **un único contenedor** del API detrás de Nginx / Cloudflare; [[ADR-008-motor-colas-background-workers-bullmq]] exige Redis para las colas; [[ADR-007-almacenamiento-fotos-privadas-cloudflare-r2-presigned-urls]] deja las fotos fuera del servidor, en Cloudflare R2.

- **Problema a resolver:** elegir dónde y cómo se ejecutan en producción el API NestJS, PostgreSQL y Redis, con un costo bajo y predecible y una operación que una sola persona pueda sostener.
- **Restricciones y Fuerzas:**
  - **Costo vs. comodidad:** los servicios gestionados reducen el trabajo de operación, pero el costo crece por cada servicio (API, Postgres, Redis) y es menos predecible.
  - **Simplicidad operativa vs. control:** un servidor sin panel da control total, pero exige saber Docker, proxy inverso, certificados y backups a mano.
  - **Datos sensibles:** el sistema guarda datos de salud y finanzas; perder la base de datos no es aceptable.
  - **Proveedor:** se prefiere no atarse a un proveedor concreto de VPS.
- **Opciones consideradas:**
  1. *Opción A (VPS sin panel):* Docker Compose, proxy inverso y backups configurados a mano.
     - *Rechazada:* el costo es el más bajo, pero toda la operación (certificados, despliegues, backups, reinicios) recae en tareas manuales que el operador aún no domina.
  2. *Opción B (servicios gestionados por separado):* un PaaS para el API más Postgres y Redis gestionados.
     - *Rechazada:* costo estimado de **~USD 25-60/mes** al crecer (orden de magnitud, **no verificado** con cotizaciones), repartido entre varios proveedores.
  3. *Opción C (VPS + Coolify):* un VPS con [Coolify](https://coolify.io/docs) como panel web sobre Docker; Coolify gestiona despliegues desde Git, proxy con HTTPS, bases de datos y backups programados.
     - *Seleccionada.*

### Datos de referencia (verificados el 2026-10-04)

| Plan Hetzner Cloud | vCPU / RAM / Disco | Precio mensual |
|---|---|---|
| CX23 | 2 / 4 GB / 40 GB | USD 7,09 |
| CAX11 (ARM) | — | USD 7,59 |
| CX33 | 4 / 8 GB / 80 GB | USD 10,59 |
| CAX21 (ARM) | — | USD 13,09 |
| CX43 | 8 / 16 GB | USD 19,09 |

> **Disponibilidad:** el 2026-10-04 todos los planes *cost-optimized* figuraban como **"not available"** (falta de stock). Alternativa: la línea **CPX** de Hetzner u otro proveedor de VPS.

- **Requisitos mínimos de Coolify (documentación oficial):** 2 CPU, 2 GB de RAM, 10 GB de disco libre; arquitectura amd64 o arm64.
- **Dimensionamiento:** 4 GB de RAM alcanzan justo para GUACHAFIT solo (Coolify + API + Postgres + Redis); con 8 GB se pueden alojar otros proyectos en el mismo servidor.

---

## 3. Decisión
Elegimos la **Opción C: un VPS con Coolify como panel (Docker)**. El proveedor preferido es **Hetzner Cloud**, pero la decisión es **agnóstica al proveedor**: cualquier VPS que cumpla los requisitos de Coolify es válido.

### Detalles de la Implementación

```
Usuario (PWA)
   │
   ▼
Cloudflare (DNS · SSL "Full (strict)" · proxy)
   │
   ▼
VPS con Coolify
   ├── API NestJS (un solo contenedor)
   ├── PostgreSQL 16
   └── Redis 7 (BullMQ)

Fuera del VPS:
   ├── Web estática: Cloudflare Pages o el mismo VPS
   ├── Fotos: Cloudflare R2 (ADR-007)
   ├── Backups de Postgres: Cloudflare R2
   └── Correo transaccional: proveedor externo (ADR-018)
```

1. **Cloudflare delante de todo:** DNS, certificado y proxy. El modo SSL debe ser *Full (strict)*.
2. **Coolify en el VPS:** despliega el API desde el repositorio Git y ejecuta Postgres y Redis como servicios propios.
3. **Web:** la PWA es estática (`vite build`); puede servirse desde Cloudflare Pages o desde el mismo VPS.
4. **Fotos:** siguen en R2 con URLs firmadas ([[ADR-007-almacenamiento-fotos-privadas-cloudflare-r2-presigned-urls]]).
5. **Correo:** proveedor externo vía API HTTP ([[ADR-018-proveedor-correo-transaccional-brevo]]); el VPS no envía correo propio.
6. **Guía operativa:** los pasos concretos están en [[04_Guia_Despliegue_VPS_Coolify]].

---

## 4. Consecuencias y Trade-offs

### Consecuencias Positivas (Beneficios)
- **C1:** Costo bajo y predecible: un solo VPS (desde ~USD 7-11/mes) aloja API, Postgres y Redis.
- **C2:** Coolify cubre lo que el operador aún no domina: despliegue desde Git, HTTPS, reinicios y backups programados desde un panel web.
- **C3:** Coherente con [[ADR-005-arquitectura-backend-monolito-modular-nestjs]]: un único contenedor del API detrás de Cloudflare.
- **C4:** Sin dependencia de un proveedor: mover el VPS a otro proveedor es reinstalar Coolify y restaurar el backup.

### Consecuencias Negativas (Costos y Trade-offs)
- **T1 — El operador es responsable del servidor:** actualizaciones del sistema y de Coolify, monitoreo de disco/RAM y respuesta ante caídas.
- **T2 — Backups (innegociable):** backup automático **diario** de Postgres a R2 y una **restauración probada** antes de cargar datos reales. Son datos de salud y finanzas; un backup que nunca se restauró no cuenta como backup.
- **T3 — `TRUST_PROXY` obligatorio:** detrás de Cloudflare (y del proxy de Coolify) el límite de intentos usa `req.ip`. Sin `TRUST_PROXY`, todos los usuarios comparten la IP del proxy y se bloquean juntos (`apps/api/src/common/config/trust-proxy.ts`).
- **T4 — Migraciones antes de desplegar:** con `NODE_ENV=production` el API **no arranca** si falta la última migración; hay que ejecutar las migraciones (`pnpm db:migrate:prod` o el migrador de la imagen, con `DATABASE_URL_MIGRACIONES`) antes de iniciar la versión nueva (`apps/api/src/common/config/verificar-migraciones.ts`).
- **T5 — Una sola instancia del API:** el límite de intentos (Throttler) y el registro de idempotencia (`apps/api/src/common/idempotencia/registro-idempotencia.ts`) viven **en memoria**. Escalar horizontalmente exige moverlos antes a Redis.
- **T6 — Variables obligatorias:** `JWT_SECRET` y `JWT_REFRESH_SECRET` (el API no arranca sin ellas en producción), `DATABASE_URL`, `REDIS_HOST`/`REDIS_PORT`, `STORAGE_*`, `CORS_ORIGINS`, `ENCRYPTION_KEY` y `TRUST_PROXY`. Lista completa en [[04_Guia_Despliegue_VPS_Coolify]].
- **T7 — Punto único de falla:** si el VPS cae, cae todo el backend hasta restaurarlo.

### Riesgos Mitigados y Residuales
- **Riesgo Mitigado:** costo descontrolado por servicios gestionados; configuración manual de HTTPS y despliegues propensa a errores.
- **Riesgo Residual:** pérdida de datos si los backups no se configuran o no se prueban; falta de stock del plan elegido en el proveedor; caída total del backend ante una falla del VPS.

### Implementación (2026-10-04, deploy-05a `1e4d5d7`)
- **Validación de la configuración al arrancar:** el API reúne en un **único error `[Configuración]`** los problemas de la configuración crítica de producción —secretos JWT, `ENCRYPTION_KEY`, almacenamiento (`STORAGE_*`), `CORS_ORIGINS` y la contraseña de Bull-Board— y **no arranca** hasta corregirlos; fuera de producción deja un aviso resumen (una clave de cifrado mal formada falla en cualquier entorno). Detalle de reglas en [[04_Guia_Despliegue_VPS_Coolify]] §5.1.
- **Pendiente en este lote:** el **5b** (Dockerfile, healthcheck de `/health` y migraciones en producción) y el **5c** (script del rol `guachafit_app`).

### Implementación (2026-10-04, deploy-05b `de2975b`)
- **Imagen Docker de producción:** `apps/api/Dockerfile` multi-etapa sobre `node:24-slim`, pnpm 11.6.0 fijado por corepack e instalación con `--frozen-lockfile`; compila shared → database → api y despliega solo el árbol de producción. Corre como usuario `node` (uid 1000), expone el puerto `4000`, trae `HEALTHCHECK` cada 30 s contra `http://127.0.0.1:4000/api/v1/health` (o el `PORT` configurado; 20 s de espera inicial) y arranca con `node dist/main.js`. Verificado: ~484 MB en disco (~99 MB comprimida), sin `tsx`, `vitest` ni `.env` dentro. El build exige `bcryptjs` y `jsonwebtoken` como dependencias de ejecución: estaban en devDependencies y una instalación de producción las excluía (el API fallaba con `MODULE_NOT_FOUND`); ahora viven en `dependencies`.
- **Migraciones de producción:** `DATABASE_URL_MIGRACIONES` (rol **dueño** de las tablas) con respaldo en `DATABASE_URL`; en producción, sin ninguna de las dos, el migrador termina con error y **nunca** usa la URL local; el log enmascara la contraseña por completo. Se ejecutan desde la imagen (`node /app/node_modules/@guachafit/database/dist/migrate.js`) o fuera con `pnpm db:migrate:prod`, **siempre antes** de iniciar el contenedor nuevo del API (el API se niega a arrancar si falta la migración `0015`).
- **Cierra el 5b** que el bloque de deploy-05a dejó pendiente. **Pendiente (5c):** el script del rol restringido `guachafit_app`; hasta entonces el API se conecta con el rol que indique `DATABASE_URL` y, si es el dueño de las tablas, RLS no queda aplicado. ⚠️ **No verificado:** el lugar exacto del comando previo al despliegue en Coolify (https://coolify.io/docs).

---

## 5. Trazabilidad y Referencias
- Requerimientos asociados: [[RNF-001-almacenamiento-seguridad-fotos-progreso]], [[RNF-002-consistencia-financiera-idempotencia-pagos]], [[RNF-003-aislamiento-multitenant-seguridad-datos-salud]].
- Decisiones relacionadas: [[ADR-005-arquitectura-backend-monolito-modular-nestjs]], [[ADR-007-almacenamiento-fotos-privadas-cloudflare-r2-presigned-urls]], [[ADR-008-motor-colas-background-workers-bullmq]], [[ADR-010-arquitectura-event-driven-notificaciones-multicanal]], [[ADR-018-proveedor-correo-transaccional-brevo]].
- Guía operativa: [[04_Guia_Despliegue_VPS_Coolify]].
- Implementación: `apps/api/src/main.ts`, `apps/api/src/common/config/secretos-jwt.ts`, `apps/api/src/common/config/validar-configuracion-produccion.ts`, `apps/api/src/common/config/variables-almacenamiento.ts`, `apps/api/src/common/config/trust-proxy.ts`, `apps/api/src/common/config/verificar-migraciones.ts`; imagen: `apps/api/Dockerfile`, `.dockerignore`; migraciones: `packages/database/src/migrate.ts`, `packages/database/src/url-migraciones.ts`.
- Documentación externa: Coolify — instalación y requisitos (https://coolify.io/docs/get-started/installation), backups de bases de datos (https://coolify.io/docs/databases/backups); precios de Hetzner Cloud consultados el 2026-10-04.
