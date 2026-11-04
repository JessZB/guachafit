---
id: HANDOFF-ENTRENAMIENTO-PENDIENTES
titulo: "Handoff — Pendientes del módulo de entrenamiento tras los lotes E1–E7"
fecha: 2026-11-04
estado: activo
tags:
  - handoff
  - retoma
  - entrenamiento
---

# 🏋️ Prompt para la próxima sesión del módulo de entrenamiento (copiar y pegar al inicio)

> Sustituye a [[Handoff_Modulo_Entrenamiento]]. Las reglas de trabajo siguen siendo las de [[00_Reglas_Desarrollo_SDD]] §7.

```markdown
# Sesión: pendientes del módulo de entrenamiento de GUACHAFIT

Repo/vault: C:\Users\jesus\OneDrive\Documentos\Obsidian Vault\Trabajo\GUACHAFIT (rama main, sin push).

## Flujo (00_Reglas_Desarrollo_SDD.md §7)
- Claude escribe la producción y el doc-sync. OpenCode escribe los tests y hace las revisiones, a partir de prompts en `.opencode-prompts/<NN>-<lote>-<tipo>.md`.
- Yo ejecuto cada prompt en la TUI de OpenCode.
- Ciclo por lote:
  1. tests en rojo;
  2. implementación;
  3. verificación;
  4. revisión (un enfoque; los cuatro si hay riesgo alto);
  5. corrección;
  6. validación;
  7. commit de código y commit `docs(vault)`;
  8. borrar los prompts del lote.

## Antes de empezar
1. Engram: si hay otra sesión abierta en este repo, registra un id propio con `mem_session_start` y pásalo como `session_id` en cada escritura. Si no, las escrituras fallan con "multiple active runtime sessions".
2. Busca en memoria: `mem_search "guachafit entrenamiento E7 pendientes"`. Resumen de la sesión anterior: observación #4882.
3. Lee RF-001 §7.10–§7.16 y su "### Pendiente", y la "Pendiente" de RF-017 §6.
4. Escritura segura: valida antes de abrir un archivo para escribir, usa un temporal + `os.replace` y respeta CRLF. Nunca hagas `checkout`/`restore` de archivos completos: puede haber otra sesión en `main`. Commitea solo tus rutas y revisa `git diff --cached`.

## Pendientes, en este orden
1. ✅ **Revisión de fiabilidad del lote E7** y ✅ **test de la rama "no cerrar" del cronómetro**: hechos en `7ca9fcf`, con dos hallazgos corregidos (ver RF-001 §7.15). Siguiente: el punto 3.
3. ✅ Hecho en `f4bcda1` (RF-001 §7.16): `FilaSerieEdicion` extraída, con su spec de interacción.
4. ✅ **Carrera de orden de los envíos** (RF-001 §7.17, lote E9): hecha en `a4371fe`, con [[ADR-024-orden-envios-sesion-entrenamiento]]. Un envío directo en vuelo retiene lo posterior de su sesión; todo lo encolado lleva la hora de la acción; plazo de 15 s para el directo; un rechazo tardío de un toque ya superado no revierte ni avisa (opción A del dueño, 2026-10-15). Límite: orden garantizado dentro de la misma pestaña. La rama `wip/e9-orden-envios-rojo` ya no hace falta.
5. ✅ **Unificar `SelectorPlantillaAsignacion` y `AsignacionMasivaPlantilla`** (RF-017 RN-03, lote E10): hecho en `7817765`. Decisión del dueño, opción B: la masiva pasa a 3 pasos (elegir alumnos, revisar y ajustar, confirmar), con ajustes comunes a todos los alumnos y el paso de revisión compartido. Tras un fallo ambiguo el intento queda congelado (opción A). **No quedan pendientes en este handoff.**
6. ✅ **Cronómetro de descanso con tiempo absoluto y borrador de series** (RF-001 RN-06 a RN-08 y §7.21, [[ADR-027-cronometro-descanso-tiempo-absoluto-borrador-series]]): hecho en `8bcfa95` (2026-11-04). Estado del fin absoluto en `localStorage` por sesión, widget accesible, aviso que suena una vez, claves purgadas en logout y cambio de usuario, y lo tecleado en series pendientes se recupera al recargar.
7. **Seguimientos del lote anterior (sin empezar, a decidir con el dueño):**
   - Precarga del peso con el plan; repeticiones prellenadas con el objetivo (se envía `repsLogradas ?? repsObjetivo`, un dato que parece real).
   - Desmarcar una serie sin confirmación ni deshacer.
   - `enterKeyHint` y seleccionar el contenido al enfocar los inputs de peso, repeticiones y esfuerzo.
   - Campo de notas del modal de cierre con `text-xs` (zoom en iOS) y etiquetas de 11 px.
   - `aria-pressed` en «Listo».
   - Deshabilitar «Restar 15 segundos» con el descanso ya terminado.
   - Avisar también en la píldora (no solo en el panel) que con la pantalla bloqueada no suena.
   - **Probar el cronómetro y el borrador en un iPhone real** (vibración inexistente, audio condicionado al gesto y al interruptor de silencio, JavaScript congelado con la pantalla bloqueada): hoy no está verificado. Pasos en la guía de pruebas, sección 1.
   - Auditoría de contraste de los controles nuevos (no medida).
   - Descartado por YAGNI: sincronizar el cronómetro entre pestañas.

## Estado de partida
- Lotes E1–E7 cerrados:
  - E1 `77c1990`; E2 `c6a0e34`/`05d42bd`; E3 `8af2673`/`c194caa`; E4 `e440587`/`bb42b55`;
  - E5 `dfc3e51`/`0194fcb` (ADR-021); E6 `9192fef`/`3c68eed`; E7 `63369d7`.
- Web 1575/1575, typecheck y build limpios (2026-10-12). Tras el cronómetro (`8bcfa95`, 2026-11-04): web **3329/3329**, typecheck y build sin errores.
- Convenciones nuevas en 00_Reglas_Desarrollo_SDD.md: §6.12 (peso máximo 700) y §6.13 (entrada numérica filtrada).
```
