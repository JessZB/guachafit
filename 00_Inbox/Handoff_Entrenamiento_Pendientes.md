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
10. ✅ **Aviso «Serie N completada · Deshacer» y bloqueo de 600 ms de «Listo»** (RF-001 §7.24, [[ADR-027-cronometro-descanso-tiempo-absoluto-borrador-series]] §11): hecho en el commit de 2026-11-04 posterior a `b0f9042` (local y pendiente de push). Evidencia: lote 9/9, web **3.572/3.572**, typecheck y build en 0, revisión con 2 WARNING corregidos, prueba en Chrome.
11. ✅ **Fase 1 del plan de transiciones y carga: View Transitions entre módulos** ([[ADR-028-transiciones-entre-modulos-view-transitions]]): hecho en `4147202` (2026-11-05, local y pendiente de push). Evidencia: lote 112/112, web **3.612/3.612**, typecheck y build en 0, revisión de fiabilidad sin BLOCKER ni WARNING, prueba en Chrome.
12. ✅ **Fase 2 del plan: carga sin saltos** ([[ADR-028-transiciones-entre-modulos-view-transitions]] §9): hecha el 2026-11-05 (local y pendiente de push). Esqueletos con retardo de 150 ms en 13 vistas y en el formulario de Nutrición. Evidencia: lote 112/112, web **3.700/3.700**, typecheck y build en 0, revisión sin BLOCKER ni WARNING, prueba en Chrome con red lenta simulada.
13. **Plan de transiciones y carga, pendiente (aprobado el orden por el dueño):**
   - ✅ **Ronda 2b (hueco de la fase 2)** hecha el 2026-11-05: fallback de rutas y metas de Nutrición con esqueleto (ADR-028 §9.5; web **3.713/3.713**). El salto de Nutrición (0,076) no se reprodujo al medirlo el 2026-11-05 (ADR-028 §11.1); queda medir el contraste del esqueleto en modo oscuro.
   - ✅ **Fases 3 y 4 (juntas)** hechas el 2026-11-05 (ADR-028 §10): botones con estado de carga, `focus-visible` y transición globales, 5 botones de envío con spinner, «Reintentar» con `BotonTactil` y 5 menús con salida animada. Web **3.732/3.732**. Sin revisión aparte ni prueba en Chrome; **mirar en el navegador** el aspecto de la regla global de botones. Límite: el creador rápido de `PanelCatalogo` no anima su salida al guardar.
   - Límites de la fase 1 (ADR-028 §6): Atrás/Adelante vuelve al inicio; foco y anuncio del cambio de vista; sub-vistas internas de Pagos y Progreso sin fundido.
   - ✅ **Cascada de la ficha del alumno** resuelta el 2026-11-05 (opción A, ADR-028 §11): tras el perfil las demás peticiones salen en paralelo; el esqueleto dura lo que la más lenta. Spec nuevo `AlumnoDetallePage.carga-paralela`; no se midió en navegador con sesión de entrenador. Opción B (mostrar la ficha tras el perfil y cargar por pestaña) queda como mejora futura.
   - ✅ **Depuración de tests, nivel 1** (2026-11-06, regla nueva en `00_Reglas_Desarrollo_SDD.md` §9): se auditaron 119 specs (1.008 tests; Haiku clasificó, agy borró) y se eliminaron **148 tests** (141 web, 7 API) y 7 archivos que solo validaban estructura o duplicaban otro del mismo sujeto. Web: **3.594 tests**. Los reportes de la auditoría están en `.external-agents/auditoria-tests/` (carpeta ignorada por git).
   - **Nivel 2, pendiente de decisión del dueño:** (a) accesibilidad vigilada por clase (`min-h-11` / 44 px, `text-base` contra el zoom de iOS, `inputmode`/`autocomplete`), un solo test por requisito; (b) invariantes que solo se vigilan leyendo un archivo (`index-html.viewport`, `estilo-contraste-advertencia`, `estilo-tipografia`, bloque `reduce` único), un guardián por invariante o regla de lint; (c) guardianes de arquitectura de modales (`modales-escape-animado`, `modales-salida-animada`); (d) specs REVISAR: `FilaTransaccion.ux10`, `EstadoVacio.ux10`, `AlumnoDetallePage.reorganizacion`, `tamano-archivos` (web y API); (e) en `transiciones-vista.guardian` se borraron 4 de 5 tests (nombres de transición de cabecera/barra leyendo fuentes): recuperables desde git si se decide que protegían una invariante real.
   - Aviso: los veredictos de Haiku tuvieron tasa de error alta en los guardianes que leen fuentes (3 de 5 casos de la muestra); no se borra por veredicto sin verificar. Los ~350 specs web y ~113 de la API sin señales de guardián no se auditaron.
14. **Pendientes anteriores, a decidir con el dueño (sin empezar):**
   - **Probar en un móvil real y en un iPhone** (guía de pruebas, sección 1 y sección 9): toque doble real, franja y su anuncio, modal justo tras navegar, panel plegado con el teclado, movimiento, vibración, audio y pantalla bloqueada.
   - **Parpadeo de Escape** en `EditorMetasNutricion` con cambios (y `ModalPlantilla`): exponer «hay cambios» al modal.
   - **De producto:** repeticiones prellenadas con el objetivo (hoy se envía `repsLogradas ?? repsObjetivo`).
   - **Deuda:** el segundo parámetro ignorado de `construirPayloadSerie`; foco que cae al `body` tras «Deshacer»; la ref `avisoVigente` asignada en render (ADR-027 §10.2 y §11.3).
   - **Datos de prueba:** la sesión de `andres.perez` quedó en curso con las series pendientes (algunas con `pesoKg` `0.00` o `75.00`); para restaurar, volver a ejecutar el seed o reiniciar la sesión.
   - Auditoría de contraste de los controles nuevos. Descartado por YAGNI: sincronizar el cronómetro entre pestañas.

## Estado de partida
- Lotes E1–E7 cerrados:
  - E1 `77c1990`; E2 `c6a0e34`/`05d42bd`; E3 `8af2673`/`c194caa`; E4 `e440587`/`bb42b55`;
  - E5 `dfc3e51`/`0194fcb` (ADR-021); E6 `9192fef`/`3c68eed`; E7 `63369d7`.
- Web 1575/1575, typecheck y build limpios (2026-10-12). Tras el cronómetro (`8bcfa95`, 2026-11-04): web **3329/3329**, typecheck y build sin errores. Tras el botón flotante (`24d506f` y `4a84375`): web 3.372/3.372. Tras la salida animada de modales (`41cca53`): web 3.471/3.471. Tras el Escape animado y el peso del plan (`b0f9042`): web 3.545/3.545. Tras las View Transitions (`4147202`, 2026-11-05): web **3.612/3.612**, typecheck y build sin errores.
- Convenciones nuevas en 00_Reglas_Desarrollo_SDD.md: §6.12 (peso máximo 700) y §6.13 (entrada numérica filtrada).
```
