---
id: HANDOFF-ENTRENAMIENTO
titulo: "Handoff — Sesión de correcciones del módulo de entrenamiento"
fecha: 2026-10-10
estado: activo
tags:
  - handoff
  - retoma
  - entrenamiento
  - metodologia
---

# 🏋️ Prompt para la sesión del módulo de entrenamiento (copiar y pegar al inicio)

> Uso: abrir una sesión nueva en la bóveda GUACHAFIT, pegar el bloque de abajo y añadir al final tu lista de correcciones.
> Sustituye a [[Handoff_Retomar_Sesion]] para esta sesión.

```markdown
# Sesión: correcciones del módulo de entrenamiento de GUACHAFIT

Repo/vault: C:\Users\jesus\OneDrive\Documentos\Obsidian Vault\Trabajo\GUACHAFIT (rama main, sin push; último commit 91a2834).

## Flujo de trabajo (Claude + OpenCode; reglas en 00_Reglas_Desarrollo_SDD.md §7 y ~/.claude/rules/opencode-director.md)

**Roles**
- Tú (Claude) diriges, escribes el código de producción y el doc-sync. NO escribes ni ejecutas tests y NO lanzas sub-agentes de revisión.
- Todo lo de pruebas y revisión va como prompt para OpenCode en `.opencode-prompts/<NN>-<lote>-<tipo>.md`. Los tipos son tests, verificacion, review-risk, review-resilience, review-readability, review-reliability y validacion. Los reportes van en `.opencode-prompts/reportes/<mismo nombre>.reporte.md`.
- Yo ejecuto cada prompt en la TUI de OpenCode pegando: `Lee y ejecuta exactamente el prompt .opencode-prompts/<archivo>.md y deja el reporte en la ruta que indica.` NUNCA ejecutes opencode tú ni me des comandos `opencode run`.

**Ciclo por lote**
1. Tests (fase roja): contratos exactos, con nombres de funciones, firmas, valores y textos esperados.
2. Implementas.
3. Verificación: suites de API y web, typecheck y build, con números.
4. Revisión (de solo lectura; pueden correr en paralelo):
   - 1 enfoque si el riesgo es medio;
   - los 4 si toca auth, seguridad, permisos, datos, dinero, migraciones o pasa de 400 líneas.
5. Corrección.
6. Validación. Máximo 2 rondas sobre los mismos hallazgos; después, me escalas.
7. Commit de código y commit `docs(vault): ...`.
8. Borrar los prompts y reportes del lote.

**Criterios que mantuvimos en el módulo 5**
- Verifica cada reporte contra `git status`/`git diff` antes de aceptarlo: OpenCode no puede haber tocado producción. Antes de corregir, comprueba tú mismo cada hallazgo en el código. Si uno es falso, refútalo con el razonamiento y pide a OpenCode que busque un contraejemplo.
- Clasifica cada fallo de la verificación: defecto de producción (lo corriges tú) o defecto del test (lo ajusta OpenCode con autorización explícita y su antes y después).
- En los prompts de verificación y validación, la lista de ajustes de test autorizados es cerrada.
- La lógica va en módulos puros de `lib/` (web) o funciones puras (API), con tests de unidad. Las pantallas se prueban con specs de interacción (`*.interaccion.spec.tsx`, jsdom).
- Honestidad en la UI: nunca un éxito falso. Los avisos dicen exactamente qué se guardó y qué no. El modo demo nunca llama al API. Tras una escritura fallida, reconcilia con el servidor.
- Fechas: "hoy" es el día local (la zona del perfil del alumno cuando la API valida con ella), nunca `toISOString()`. Los tests de la web corren con `TZ=America/Caracas` (`apps/web/vitest.setup.ts`).
- Lo que no se corrige en el lote queda como pendiente documentado: nada se acumula sin registrar.

**Doc-sync por commit**
- RF/RNF con `fecha_verificacion` y un bloque "### <tema> (fecha, `sha`)" con mecanismo, límites y evidencia (números de suites).
- Sección "### Pendiente" actualizada.
- ADR si hay decisión de producto o de arquitectura.
- `06_Guia_Pruebas_Manuales.md` y, si cambia una operación, `03_Dominio/`.
- Ejemplos: ee23aef/b55250d, e0747e2/c5448df, 68457a6/91a2834.

**Reglas**
- Commits convencionales en español, SIN Co-Authored-By. No hacer push.
- Puedes editar `.env.example`; NUNCA leas ni edites `.env`.
- Una pregunta a la vez. En decisiones de producto, pregúntame con tu recomendación y su porqué, y espera.
- Para editar archivos con muchas comillas o backticks, escribe un script de Python en el scratchpad y ejecútalo, o usa un heredoc `<<'PYEOF'`. Nunca dejes un `cat >` esperando por la entrada estándar.
- `.claude/settings.json` y `Notas del 09-10-2026.md`, sin seguimiento, no son parte del trabajo: no los commitees.

## Objetivo de esta sesión
Aplicar mis correcciones al módulo de entrenamiento:
- RF-001, checklist de entrenamiento diario del alumno;
- RF-017, banco de plantillas de rutinas;
- la prescripción de la rutina semanal en la ficha del alumno.

Arranque:
1. Busca en memoria (`mem_search "guachafit entrenamiento RF-001 RF-017"`); el módulo 2 ya se auditó y corrigió en sesiones anteriores.
2. Lee RF-001, RF-017 y sus "### Pendiente".
3. Con CodeGraph, ubica el código que toca cada corrección de mi lista (abajo).
4. Dame un plan corto por lotes (front y API por separado), con las decisiones de producto que necesites, una a la vez.
5. Sigue el ciclo de arriba.

Superficie de referencia:
- API: `apps/api/src/modules/entrenamiento/`, `apps/api/src/modules/alumnos/` (rutina activa) y los esquemas de `packages/shared`.
- Web: `apps/web/src/pages/alumno/EntrenamientoPage*`, `apps/web/src/pages/entrenador/AlumnoDetallePage.tsx` (pestaña entrenamiento; archivo de más de 4000 líneas), `PlantillasPage`, `components/entrenador/SelectorPlantillaAsignacion`, `AsignacionMasivaPlantilla`, `lib/rutina-bloques.ts`, `lib/plantillas-*.ts`, `lib/offline-sync.ts` (cola offline por sesión) y `lib/sesion-*.ts`.

## Estado y referencias
- Tests: API 1491 passed / 6 skipped; web 1209 (101 archivos). Algunos tests HTTP del API fallan de forma intermitente por timeout bajo carga: vuelve a ejecutarlos antes de concluir.
- Docker local: Postgres `guachafit-postgres`, Redis y MinIO (`docker compose up -d`); migraciones con `pnpm db:migrate`. Los paquetes `@guachafit/shared` y `@guachafit/database` se resuelven desde `dist`: reconstrúyelos antes de `tsc`.
- Convenciones para reutilizar:
  - errores: `apps/web/src/lib/mensajes-error.ts` y `apps/api/src/common/errores/` (`parsearContrato`, `jerga.ts`; el test `api2-errores-claros` revisa la jerga, incluidas palabras en MAYÚSCULAS);
  - mensajes de acceso en `apps/api/src/common/mensajes-acceso.ts` (404 uniforme "Este alumno no está en tu lista.");
  - violaciones 23505 en `apps/api/src/common/violacion-unicidad.util.ts`;
  - `apiClient` con `put`, `idempotencyKey`, `tiempoLimiteMs`, `ErrorDeConexion` y `ErrorTiempoAgotado` (OJO: sin `idempotencyKey` explícito genera una clave nueva por llamada);
  - `esperarConLimite` para llamadas a Redis;
  - componentes `DialogoConfirmacion`, `AvisoDatosOffline`, `useTabsAccesibles` y `useDialogoAccesible`.
- Trucos de entorno: en Git Bash, `docker run ... /app/...` necesita `MSYS_NO_PATHCONV=1`. Engram puede fallar con "multiple active runtime sessions": si pasa, avisa y sigue.

## Pendientes conocidos del módulo 2 (en el vault)
- Carrera de orden con envíos en vuelo en `EntrenamientoPage`: un cambio encolado después puede llegar antes.
- Duplicaciones: el diálogo de borrar día o ejercicio, y `SelectorPlantillaAsignacion` frente a `AsignacionMasivaPlantilla`.
- `AlumnoDetallePage`: etiquetas sin `htmlFor`, textos de 11px y el estado `isGuardandoPlan` sin uso.

## Módulo 5 (pagos y cartera): queda para después
- Hecho: suscripción y emisión automática (ADR-020), web de la suscripción y cobro en sala idempotente, cierre de pendientes de la API.
- Falta:
  - lote web P2:
    - mostrar `proximoCorte` en Control de Cobros (la API ya lo envía) y la demo coherente;
    - el precio residual tras reconciliar;
    - el éxito en modo demo;
    - jerga, `htmlFor` y la precarga de becados;
  - PagosPage del alumno: idempotencia, recarga, modo demo, comprobantes sin EXIF y accesibilidad;
  - Conciliación: confirmación y reversión;
  - saldo a favor (RN-05) y anulación de cuotas.

## Correcciones del módulo de entrenamiento (las escribo yo aquí)
- ...
```
