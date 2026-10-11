---
id: HANDOFF-RETOMA
titulo: "Handoff — Prompt para retomar la validación por módulos"
fecha: 2026-10-09
estado: reemplazado
tags:
  - handoff
  - retoma
  - orquestador
  - metodologia
---

# 🔁 Prompt de retoma (copiar y pegar al inicio de la próxima sesión)

> Reemplazado el 2026-10-10 por [[Handoff_Modulo_Entrenamiento]] (el módulo 5 avanzó: ver ese handoff).

> Uso: abrir una sesión nueva en la bóveda GUACHAFIT y pegar el bloque de abajo tal cual.

```markdown
# Retomar: validación por módulos de GUACHAFIT (sesión nueva)

Repo/vault: C:\Users\jesus\OneDrive\Documentos\Obsidian Vault\Trabajo\GUACHAFIT (rama main, sin push; último commit 7686bb3).

## Flujo de trabajo (Claude + OpenCode; reglas en 00_Reglas_Desarrollo_SDD.md §7 y ~/.claude/rules/opencode-director.md)
- Tú (Claude) diriges, escribes el código de producción y el doc-sync. NO escribes ni ejecutas tests y NO lanzas sub-agentes de revisión.
- Todo lo de pruebas y revisión va como prompt para OpenCode en `.opencode-prompts/<NN>-<lote>-<tipo>.md` (tipos: tests, verificacion, review-risk, review-resilience, review-readability, review-reliability, validacion). Reportes en `.opencode-prompts/reportes/<mismo nombre>.reporte.md`.
- Yo ejecuto cada prompt en la TUI de OpenCode pegando: `Lee y ejecuta exactamente el prompt .opencode-prompts/<archivo>.md y deja el reporte en la ruta que indica.` NUNCA ejecutes opencode tú ni me des comandos `opencode run`.
- Ciclo por lote: tests (fase roja, con contratos exactos) → implementas → verificación → revisión (1 enfoque si el riesgo es medio; los 4 si toca auth/seguridad/permisos/datos/migraciones o pasa de 400 líneas; son de solo lectura y pueden correr en paralelo) → corrección → validación → commit de código + commit `docs(vault): ...` → borrar los prompts y reportes del lote.
- Verifica cada reporte contra `git status`/`git diff` antes de aceptarlo (que OpenCode no haya tocado producción) y revisa tú mismo lo crítico (p. ej. el `dist/sw.js`).
- Doc-sync por commit: RF/RNF con `fecha_verificacion` y bloque "### <tema> (fecha, `sha`)" con mecanismo, límites y evidencia (números de suites); sección "### Pendiente" actualizada; ADR si hay decisión; `06_Guia_Pruebas_Manuales.md`. Ejemplos recientes: affec1f/da1c0a7, 84643ef/7686bb3.
- Commits convencionales en español, SIN Co-Authored-By. No hacer push.
- Puedes editar `.env.example`; NUNCA leas ni edites `.env`.
- Una pregunta a la vez; ante decisiones de producto, pregúntame (con tu recomendación y su porqué).
- Para editar archivos con muchas comillas/backticks, escribe un script Python en el scratchpad y ejecútalo (los heredocs de Bash fallan con ese contenido).

## Objetivo
Validar, módulo por módulo, que se cumplan los RF/RNF de `02_Requerimientos/` desde los tres roles (administrador, entrenador, alumno), y corregir lo que falte. Por módulo:
1. Auditoría de solo lectura (tú, con CodeGraph primero): cumplimiento por criterio y por rol con archivo:línea y tests; textos con jerga o poco claros (actual → propuesto, español claro con tuteo); UX (carga/vacío/error, accesibilidad, 44px, confirmaciones); PWA offline. Ojo: un RF marcado "implementado" puede no serlo (en el módulo 4 la subida de fotos no existía en la web).
2. Informe corto y priorizado, separando front y API, y las decisiones de producto que necesites (una a la vez).
3. Correcciones por lotes con el ciclo de arriba.

## Módulos
- ✅ 1 Acceso y roles (RF-010, RF-011, RF-012, RNF-003)
- ✅ 2 Entrenamiento (RF-001, RF-017)
- ✅ Pendientes de API de los módulos 1-2 y lote de despliegue
- ✅ 3 Nutrición (RF-002): zona horaria del perfil, reportes tardíos, copia de metas
- ✅ Ajustes por rol (RF-018): perfil, correo con confirmación, contraseña; tiempo límite de guardados; pruebas de interacción con jsdom
- ✅ 4 Evolución corporal y fotos (RF-003, RF-004, RNF-001): fotos opcionales del check-in (decisión del dueño), claves de la bóveda validadas por alumno, privacidad (sin EXIF, caché sin enlaces firmados, Safari/iPhone)
- ⏳ 5 Pagos y cartera (RF-005, RF-006, RF-007, RF-008, RF-009, RNF-002) ← EMPEZAR AQUÍ (RF-005..008 y RNF-002 constan como parcial; RF-009 como implementado: verifícalo)
- ⏳ 6 Dashboard del entrenador (RF-013)
- ⏳ 7 Notificaciones y preferencias (RF-014, RF-015, RF-016, RNF-004)
- ⏳ 8 PWA offline (transversal: al cierre de todos los módulos)

## Estado y referencias
- Tests: API 1334 passed / 1 skipped; web 1134 (94 archivos). Algunos tests HTTP del API fallan de forma intermitente por timeout bajo carga: re-ejecutar antes de concluir.
- Web: vitest con entorno `node` por defecto; los specs de interacción `*.spec.tsx` declaran `// @vitest-environment jsdom` (jsdom + @testing-library/react como devDependencies).
- Docker local: Postgres `guachafit-postgres`, Redis y MinIO (`docker compose up -d`); migraciones con `pnpm db:migrate`.
- Decisiones: hosting VPS + Coolify (ADR-017), correo Brevo (ADR-018), borrado best-effort en la bóveda (ADR-015), guía de despliegue en 05_Arquitectura/04_Guia_Despliegue_VPS_Coolify.md.
- Convenciones para reutilizar: errores en apps/web/src/lib/mensajes-error.ts y apps/api/src/common/errores/ (parsearContrato, jerga.ts); mensajes de acceso en apps/api/src/common/mensajes-acceso.ts; códigos de error en packages/shared/src/codigos-error.ts; api-client con `tiempoLimiteMs`, `ErrorDeConexion`, `ErrorTiempoAgotado`; compresión `lib/imagen-comprimida.ts`; subida con reintentos `lib/antropometria-fotos.ts`; patrón de comprobantes `lib/comprobante-pago.ts`; DialogoConfirmacion, AvisoDatosOffline, useTabsAccesibles y la cola offline por sesión en apps/web.
- Trucos de entorno: en Git Bash, `docker run ... /app/...` necesita MSYS_NO_PATHCONV=1; `docker --env-file` no quita comillas de .env.example. Engram puede fallar con "multiple active runtime sessions": si pasa, avisa y sigue.
- `.claude/settings.json` sin seguimiento no es parte del trabajo: no lo commitees.

## Pendientes conocidos (documentados en el vault)
- Módulo 5, ya detectados en el módulo 4: los comprobantes de pago no rechazan el original sin recodificar (EXIF); en modo demo, Pagos y Nutrición del alumno llaman al API; `comprobante-pago.ts` duplica la mecánica presign + PUT sin reintentos ni plazo.
- RNF-001: fotos huérfanas en la bóveda (falta barrido, patrón ADR-015); pruebas de carga k6; menores (Reintentar inútil tras "no pudo preparar la foto", clave `__proto__`, bordes del plugin de caché).
- RF-018: en Notificaciones/Zona horaria/Planes/Tasas se pierde el resultado al cambiar de pestaña con un guardado en vuelo; el GET del perfil sin tiempo límite; `aria-controls` colgante en pestañas del entrenador; jsdom 30 pide Node ≥ 22.22.2 sin piso declarado.
- D2: apuntar el DATABASE_URL de desarrollo a `guachafit_app` (decisión mía).
- Configuración real en Coolify sin verificar (no hay servidor aún).
- Carrera de orden con envíos en vuelo en EntrenamientoPage; auditoría de accesos entre coaches solo en alumnos.service; el cliente de BD se crea al importar; throttler e idempotencia en memoria (con réplicas → Redis).
- Duplicaciones: diálogo de borrar día/ejercicio, SelectorPlantillaAsignacion/AsignacionMasivaPlantilla, paneles Perfil/Seguridad entre PantallaAjustes y AjustesPage del entrenador; AlumnoDetallePage (4000+ líneas) con etiquetas sin `htmlFor` y textos de 11px.

Empieza revisando memoria (mem_search "guachafit módulo 5 pagos cartera") y luego haz la auditoría de solo lectura del módulo 5 (RF-005..RF-009, RNF-002) con CodeGraph, y dame el informe priorizado.
```
