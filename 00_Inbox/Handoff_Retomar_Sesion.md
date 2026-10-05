---
id: HANDOFF-RETOMA
titulo: "Handoff — Prompt para retomar la validación por módulos"
fecha: 2026-10-05
estado: activo
tags:
  - handoff
  - retoma
  - orquestador
  - metodologia
---

# 🔁 Prompt de retoma (copiar y pegar al inicio de la próxima sesión)

> Uso: abrir una sesión nueva en la bóveda GUACHAFIT y pegar el bloque de abajo tal cual.

```markdown
# Retomar: validación por módulos de GUACHAFIT (sesión nueva)

Repo/vault: C:\Users\jesus\OneDrive\Documentos\Obsidian Vault\Trabajo\GUACHAFIT (rama main, sin push; último commit b4fbfc9).

## Instrucción de flujo para ESTA sesión (prevalece sobre la regla opencode-director)
- NO uses OpenCode. Te ordeno explícitamente que el código lo escriban sub-agentes de Claude (Agent tool, un solo escritor a la vez), con TDD estricto. Tú diriges y auditas: revisa el diff, vuelve a correr tests/typecheck/build tú mismo y no aceptes informes sin evidencia.
- Revisión antes de cada commit con los agentes review-risk / review-resilience / review-readability / review-reliability (1 enfoque si el riesgo es medio, los 4 si toca auth/seguridad/permisos/datos o pasa de 400 líneas). El recibo nativo de `gentle-ai review` NO funciona en Claude Code (los revisores no emiten subject_hash): sigue sin él, como se acordó.
- Cada commit de código va acompañado de su commit `docs(vault): ...` de doc-sync (RF/RNF con fecha_verificacion + bloque "Implementado (fecha, unidad `sha`)" con mecanismo, límites y evidencia; ADR si hay decisión; 06_Guia_Pruebas_Manuales.md). Convención de ejemplo: commits 4636d2c, 6f764a0, b4fbfc9.
- Commits convencionales en español, SIN Co-Authored-By. No hacer push.
- Puedes editar `.env.example`; NUNCA leas ni edites `.env`.
- Una pregunta a la vez; ante decisiones de producto, pregúntame.

## Objetivo
Validar, módulo por módulo, que se cumplan los RF/RNF de `02_Requerimientos/` desde los tres roles (administrador, entrenador, alumno), y corregir lo que falte. Hacerlo en este orden por módulo:
1. Auditoría de solo lectura (sub-agente): cumplimiento funcional por criterio y por rol, con archivo:línea y tests; textos con jerga técnica o poco entendibles (actual → propuesto, español claro con tuteo); UX (estados de carga/vacío/error, accesibilidad, objetivos táctiles de 44px, confirmaciones); PWA offline (qué funciona sin conexión, caché, cola de cambios, avisos de datos guardados).
2. Informe corto y priorizado, separando front y API.
3. Correcciones de front (usa la skill `ui-ux-pro-max` como guía UX) y luego de API, por lotes con revisión, commit y doc-sync.

## Módulos
- ✅ 1 Acceso y roles (RF-010, RF-011, RF-012, RNF-003)
- ✅ 2 Entrenamiento (RF-001, RF-017)
- ✅ Pendientes de API de los módulos 1-2 (lotes API-1 a API-4: seguridad de auth, errores claros, integridad de datos, correo con Brevo y recuperación de contraseña)
- ✅ Lote de despliegue (validación de config en producción, Dockerfile, migraciones en producción, rol `guachafit_app`)
- ⏳ 3 Nutrición (RF-002) ← EMPEZAR AQUÍ
- ⏳ 4 Evolución corporal y fotos (RF-003, RF-004, RNF-001)
- ⏳ 5 Pagos y cartera (RF-005, RF-006, RF-007, RF-008, RF-009, RNF-002)
- ⏳ 6 Dashboard del entrenador (RF-013)
- ⏳ 7 Notificaciones y preferencias (RF-014, RF-015, RF-016, RNF-004)
- ⏳ 8 PWA offline (transversal: revisar al cierre de todos los módulos)

## Estado y referencias
- Tests: API 1157 passed / 1 skipped; web 797. Algunos tests HTTP del API fallan de forma intermitente por timeout bajo carga: si fallan, re-ejecutar antes de concluir.
- Decisiones: hosting VPS + Coolify (ADR-017), correo Brevo (ADR-018), guía de despliegue en 05_Arquitectura/04_Guia_Despliegue_VPS_Coolify.md.
- Convenciones ya existentes que hay que reutilizar: traducción de errores en apps/web/src/lib/mensajes-error.ts; filtro global y parsearContrato en apps/api/src/common/errores/; mensajes de acceso en apps/api/src/common/mensajes-acceso.ts; códigos de error estables en packages/shared/src/codigos-error.ts; barrido de jerga en apps/api/src/common/errores/jerga.ts (test api2-errores-claros.spec.ts); DialogoConfirmacion, AvisoDatosOffline y la cola offline por sesión en apps/web.
- Trucos de entorno: en Git Bash, `docker run ... /app/...` necesita MSYS_NO_PATHCONV=1; `docker --env-file` no quita comillas de .env.example. Engram puede fallar con "multiple active runtime sessions": si pasa, avisa y sigue.
- `.claude/settings.json` sin seguimiento no es parte del trabajo: no lo commitees.

## Pendientes conocidos (no olvidar, documentados en el vault)
- D2: apuntar el DATABASE_URL de desarrollo a `guachafit_app` (decisión mía).
- Configuración real en Coolify sin verificar (no hay servidor aún); los planes económicos de Hetzner estaban sin stock.
- Carrera de orden con envíos en vuelo en EntrenamientoPage (preexistente).
- Auditoría de accesos entre coaches solo en alumnos.service (falta en entrenamiento y otros).
- El cliente de BD se crea al importar: un DATABASE_URL mal escrito da una traza en vez del error claro.
- Throttler e idempotencia en memoria (una sola instancia del API; con réplicas → Redis).
- Duplicación del diálogo de borrar día/ejercicio y de las opciones de modo entre SelectorPlantillaAsignacion y AsignacionMasivaPlantilla; AlumnoDetallePage con textos de 11px.

Empieza revisando memoria (mem_search "guachafit validación módulos") y luego lanza la auditoría de solo lectura del módulo 3 (Nutrición, RF-002).
```
