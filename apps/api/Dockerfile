# =============================================================================
# GUACHAFIT API — imagen de producción del API (deploy-05b, ADR-017).
#
# Contexto de construcción: la RAÍZ del monorepo.
#   docker build -f apps/api/Dockerfile -t guachafit-api:local .
#
# Base node:24-slim (Debian, glibc) en lugar de alpine: el grafo de dependencias
# trae binarios nativos precompilados para glibc (esbuild y el extractor de
# msgpackr; en Windows/CI se resuelven por plataforma). slim evita sorpresas de
# compatibilidad musl y mantiene la imagen razonablemente pequeña.
# =============================================================================

FROM node:24-slim AS builder
WORKDIR /app

# Corepack usa el pnpm fijado en "packageManager" (pnpm@11.6.0 de package.json).
# Sin el prompt, la descarga de pnpm no bloquea un build sin TTY.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# 1) Manifiestos primero: la capa de instalación solo se invalida cuando cambian
#    las dependencias del workspace (no con cada cambio de código).
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY packages/typescript-config/package.json packages/typescript-config/
COPY packages/shared/package.json packages/shared/
COPY packages/database/package.json packages/database/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

# 2) Instalación reproducible con el lockfile. Dev incluido: el build usa el CLI de
#    Nest y TypeScript. La instalación es completa (sin --filter) para que
#    `verifyDepsBeforeRun` de pnpm no intente reinstalar en el siguiente paso.
RUN pnpm install --frozen-lockfile

# 3) Fuentes y compilación en orden de dependencias: shared → database → api.
COPY . .
RUN pnpm --filter @guachafit/shared build \
 && pnpm --filter @guachafit/database build \
 && pnpm --filter @guachafit/api build

# 4) Árbol de producción autocontenido: solo dependencias de producción, con los
#    paquetes del workspace (dist de cada uno y drizzle/ con migraciones + journal).
#    El deploy moderno de pnpm 11 exige "inject-workspace-packages=true" en el
#    workspace; se usa --legacy porque no requiere cambiar la configuración del
#    repositorio y produce un node_modules aislado y portable.
RUN pnpm --filter @guachafit/api deploy --legacy --prod /opt/api \
 && rm -rf /opt/api/src /opt/api/test /opt/api/nest-cli.json /opt/api/tsconfig.json \
           /opt/api/tsconfig.tsbuildinfo /opt/api/vitest.config.ts /opt/api/.env.example

# Guardia de regresión: bcryptjs y jsonwebtoken son dependencias de runtime del API
# (CryptoService, guard y servicio de auth). El build falla aquí, y no al arrancar el
# contenedor, si alguna quedara fuera del deploy de producción (p. ej. si volvieran a
# devDependencies en apps/api/package.json).
RUN node -e "for (const m of ['bcryptjs','jsonwebtoken']) require(require.resolve(m,{paths:['/opt/api']})); console.log('runtime deps OK: bcryptjs, jsonwebtoken');"

# -----------------------------------------------------------------------------
FROM node:24-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production

# Solo el paquete desplegado: dist del API + node_modules de producción.
COPY --from=builder --chown=node:node /opt/api/ ./

# La imagen no trae curl: el healthcheck usa el fetch nativo de Node.
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "dist/main.js"]

# Migraciones (una vez por despliegue, con el rol propietario):
#   docker run --rm -e DATABASE_URL_MIGRACIONES=... guachafit-api:local \
#     node /app/node_modules/@guachafit/database/dist/migrate.js
# El paquete @guachafit/database desplegado incluye dist/ y drizzle/ (journal incluido),
# así que el migrador resuelve sus migraciones dentro de la imagen.
