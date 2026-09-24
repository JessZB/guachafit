---
id: HANDOFF-RETOMA
titulo: "Handoff — Prompt para retomar la sesión de desarrollo"
fecha: 2026-09-24
estado: activo
tags:
  - handoff
  - retoma
  - orquestador
  - metodologia
---

# 🔁 Prompt de retoma (copiar y pegar al inicio de la próxima sesión)

> Uso: abrir una sesión nueva del orquestador en la bóveda GUACHAFIT y pegar el bloque de abajo tal cual.

```text
Retomamos GUACHAFIT (cwd: la bóveda). Recupera contexto antes de actuar:
1) mem_current_project (proyecto guachafit) + mem_context; luego mem_search por: "olas/3", "rls-etapa-3", "audit/vivencia-pwa-mobile-desktop", "handoff/next-session" y lee la última session summary.
2) Lee 00_Reglas_Desarrollo_SDD.md (SSOT + convenciones §6) y 06_Guia_Pruebas_Manuales.md (estado real y checklist manual).
3) git log --oneline -5 y git status (último commit esperado: 6a33d2d; árbol limpio; ~68 commits de la sesión anterior; NO hay remote configurado).

ESTADO: Olas 1-4 completas — honestidad de datos, control de acceso por estado, RF-002/003/004/005/008/009/014/015/016, admin de entrenadores, RLS etapas 1-3 (RNF-003 implementado, 6 tablas) y vivencia PWA/móvil/accesibilidad. Suites: API 809 / web 612.

PENDIENTES (orden sugerido):
A) D2: yo cambio DATABASE_URL de apps/api/.env a guachafit_app (password dev guachafit_app_dev) y quiero que lo re-verifiques con el smoke restringido (login primero).
B) Mi QA manual con 06_Guia_Pruebas_Manuales.md; te iré pasando hallazgos para corregirlos con la metodología de siempre.
C) Follow-ups: DELETE de objetos R2 (huérfanos al quitar recurso), cascada del coach deshabilitado a sus alumnos, proveedores reales de email/push (te doy credenciales cuando toque), WebPush (VAPID local posible), y git remote/push.

METODOLOGÍA OBLIGATORIA (la de la sesión anterior):
- Tú orquestas y mantienes el contexto fino; el trabajo pesado va a subagentes (writer por work unit; explore para mapear 4+ archivos; validación independiente read-only tras cada bloque grande). No refactors grandes inline.
- Por unidad: alcance con evidencia archivo:línea, tests actualizados, y VERIFICACIÓN REAL cuando toque runtime (Docker: Postgres/Redis/MinIO; arrancar Docker Desktop si está apagado). Los mocks esconden bugs de serializers/RLS/pagos: los bloques de DB/pagos/notificaciones se prueban E2E contra servicios reales.
- UI: cargar .claude/skills/impeccable/SKILL.md + convenciones §6 (tokens claro/oscuro con AA, targets ≥44px, textos ≥11px, estados honestos, demo solo tras isDemoMode, paginación estándar) y, cuando aplique, medir con Edge headless a 360/430px como se hizo.
- Tras cada bloque: validación independiente (solo lectura: suites + código real + defectos con evidencia) → commits por work unit (convencional, español, SIN atribución AI) → doc-sync de la bóveda (RF/RNF/ADR, frontmatter, DDL/contratos, 06_Guia).
- Reglas duras: pnpm único; NO tocar archivos .env* (bloqueados por el runtime: solo yo los edito); no commitear sin que yo lo pida; rol DB dev guachafit_app (NOSUPERUSER NOBYPASSRLS) para verificar RLS; toda migración nueva con `when` de hora REAL en el journal (lección de 0012).
- Gotchas conocidos: Get-Content/Set-Content de PS 5.1 corrompe UTF-8 (usar herramientas de edición); `SET LOCAL x = $1` es inválido en Postgres (usar set_config); verificar inyección real de servicios con envs (caso R2StorageService); los mocks BDD no validan SQL ni serializers.

Empieza confirmándome el contexto recuperado y el plan de la primera unidad.
```

## Notas de retoma rápida

- **Leer primero**: este archivo → `06_Guia_Pruebas_Manuales.md` → memoria en Engram (tópicos arriba).
- **Docker**: si Desktop está apagado, los agentes lo encienden, pero conviene tenerlo listo.
- **Rol restringido**: `guachafit_app` ya existe en el Postgres local; su contraseña de dev está en ADR-011 (apéndice §6).
