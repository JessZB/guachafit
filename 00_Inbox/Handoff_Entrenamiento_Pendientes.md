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

## Flujo (00_Reglas_Desarrollo_SDD.md §7, vigente desde 2026-10-18)
- Claude Code orquesta y valida; no escribe producción ni tests. Un subagente explorador (Haiku 5.5) mapea el código; un subagente escritor (Sonnet 5.5, `effort: high`) escribe la producción; los **agentes externos** (`agy` con Gemini flash, lanzados con la orquestación de Orca desde `.external-agents/lanzar.sh`) escriben los tests y hacen verificaciones y revisiones, con el JSON de Vitest como evidencia.
- Ciclo por lote: tests en rojo → implementación → verificación → revisión (un enfoque; los cuatro si hay riesgo alto) → corrección y validación → commit de código y commit `docs(vault)` → borrar prompts y reportes de `.external-agents/`.
- Un agente externo no puede llamar «ajeno» o «flaky» a una regresión sin repetirla y adjuntar el resultado, y debe declarar los fallos en su resumen: se contrasta siempre con el JSON.

## Antes de empezar
1. Engram: si hay otra sesión abierta en este repo, registra un id propio con `mem_session_start` y pásalo como `session_id` en cada escritura. Si no, las escrituras fallan con "multiple active runtime sessions".
2. Busca en memoria: `mem_search "guachafit entrenamiento E7 pendientes"`. Resumen de la sesión anterior: observación #4882.
3. Lee RF-001 §7.10–§7.16 y su "### Pendiente", y la "Pendiente" de RF-017 §6.
4. Escritura segura: valida antes de abrir un archivo para escribir, usa un temporal + `os.replace` y respeta CRLF. Nunca hagas `checkout`/`restore` de archivos completos: puede haber otra sesión en `main`. Commitea solo tus rutas y revisa `git diff --cached`.

## Pendientes, en este orden
1. ✅ **Revisión de fiabilidad del lote E7** y ✅ **test de la rama "no cerrar" del cronómetro**: hechos en `7ca9fcf`, con dos hallazgos corregidos (ver RF-001 §7.15). Siguiente: el punto 3.
2. ✅ Hecho en `f4bcda1` (RF-001 §7.16): `FilaSerieEdicion` extraída, con su spec de interacción.
4. ✅ **Carrera de orden de los envíos** (RF-001 §7.17, lote E9): hecha en `a4371fe`, con [[ADR-024-orden-envios-sesion-entrenamiento]]. Un envío directo en vuelo retiene lo posterior de su sesión; todo lo encolado lleva la hora de la acción; plazo de 15 s para el directo; un rechazo tardío de un toque ya superado no revierte ni avisa (opción A del dueño, 2026-10-15). Límite: orden garantizado dentro de la misma pestaña. La rama `wip/e9-orden-envios-rojo` ya no hace falta.
5. ✅ **Unificar `SelectorPlantillaAsignacion` y `AsignacionMasivaPlantilla`** (RF-017 RN-03, lote E10): hecho en `7817765`. Decisión del dueño, opción B: la masiva pasa a 3 pasos (elegir alumnos, revisar y ajustar, confirmar), con ajustes comunes a todos los alumnos y el paso de revisión compartido. Tras un fallo ambiguo el intento queda congelado (opción A). **No quedan pendientes en este handoff.**
6. ✅ **Cronómetro de descanso con tiempo absoluto y borrador de series** (RF-001 RN-06 a RN-08 y §7.21, [[ADR-027-cronometro-descanso-tiempo-absoluto-borrador-series]]): hecho en `8bcfa95` (2026-11-04). Estado del fin absoluto en `localStorage` por sesión, widget accesible, aviso que suena una vez, claves purgadas en logout y cambio de usuario, y lo tecleado en series pendientes se recupera al recargar.
7. ✅ **Botón flotante del cronómetro y animaciones de entrada** (RF-001 RN-06, escenario 9 y §7.21, [[ADR-027-cronometro-descanso-tiempo-absoluto-borrador-series]] §8): hecho en `24d506f` (dependencia `tw-animate-css@1.4.0` e `index.css`) y `4a84375` (botón flotante), 2026-11-04, local y pendiente de push. El acceso al cronómetro deja de ser el botón «Descanso» de la cabecera: es un botón flotante con tres estados (reposo, píldora y panel), visible solo con la sesión en curso y sin modal propio abierto. Efecto global: todos los modales y vistas con `animate-in` ahora se animan al entrar. Evidencia: lote 88/88, web **3.372/3.372**, typecheck y build sin errores; revisión de fiabilidad con 0 BLOCKER.
8. ✅ **Salida animada de los modales y ajustes de UI del entrenamiento** (RF-001 §7.22, [[ADR-027-cronometro-descanso-tiempo-absoluto-borrador-series]] §9): hecho en `41cca53` (2026-11-04, local y pendiente de push). `useSalidaModal` en los 27 modales (150 ms; síncrono con movimiento reducido o sin `matchMedia`), páginas con modales con entrada solo de opacidad, panel del cronómetro plegado al enfocar un campo, `interactive-widget`, «Restar 15 segundos» deshabilitado al terminar, aviso de pantalla bloqueada en la píldora, `enterKeyHint` y selección al enfocar, notas del cierre a 16 px. Evidencia: lote 99/99, web **3.471/3.471**, typecheck y build en 0. Rechazado: `aria-pressed` en «Listo».
9. ✅ **Escape animado en los 11 modales y precarga del peso con el plan** (RF-001 §7.23, [[ADR-027-cronometro-descanso-tiempo-absoluto-borrador-series]] §10): hecho en `b0f9042` (2026-11-04, local y pendiente de push). Evidencia: lote 74/74, web **3.545/3.545**, typecheck y build en 0, revisión sin BLOCKER ni WARNING, prueba en Chrome.
10. **Pendientes, a decidir con el dueño (sin empezar):**
   - **Probar en un móvil real y en un iPhone** (guía de pruebas, sección 1): modal abierto justo tras navegar, panel plegado con el teclado, movimiento, vibración, audio y pantalla bloqueada.
   - **Parpadeo de Escape** en `EditorMetasNutricion` con cambios (y `ModalPlantilla`, que no anima el cierre normal): exponer «hay cambios» al modal.
   - **De producto:** repeticiones prellenadas con el objetivo (hoy se envía `repsLogradas ?? repsObjetivo`); desmarcar una serie con deshacer.
   - **Deuda:** el segundo parámetro ignorado de `construirPayloadSerie`; desmarcar y volver a marcar una serie con peso del plan lo hereda a la siguiente (ADR-027 §10.2).
   - **Datos de prueba:** la sesión de `andres.perez` quedó en curso con series 1 y 2 pendientes con `pesoKg` `0.00` y `75.00`; para restaurar, volver a ejecutar el seed o reiniciar la sesión.
   - Auditoría de contraste de los controles nuevos (no medida). Descartado por YAGNI: sincronizar el cronómetro entre pestañas.

## Estado de partida
- Lotes E1–E7 cerrados:
  - E1 `77c1990`; E2 `c6a0e34`/`05d42bd`; E3 `8af2673`/`c194caa`; E4 `e440587`/`bb42b55`;
  - E5 `dfc3e51`/`0194fcb` (ADR-021); E6 `9192fef`/`3c68eed`; E7 `63369d7`.
- Web 1575/1575, typecheck y build limpios (2026-10-12). Tras el cronómetro (`8bcfa95`, 2026-11-04): web **3329/3329**, typecheck y build sin errores. Tras el botón flotante (`24d506f` y `4a84375`): web 3.372/3.372. Tras la salida animada de modales (`41cca53`): web 3.471/3.471. Tras el Escape animado y el peso del plan (`b0f9042`, 2026-11-04): web **3.545/3.545**, typecheck y build sin errores.
- Convenciones nuevas en 00_Reglas_Desarrollo_SDD.md: §6.12 (peso máximo 700) y §6.13 (entrada numérica filtrada).
```
