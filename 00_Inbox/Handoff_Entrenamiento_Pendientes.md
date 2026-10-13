---
id: HANDOFF-ENTRENAMIENTO-PENDIENTES
titulo: "Handoff — Pendientes del módulo de entrenamiento tras los lotes E1–E7"
fecha: 2026-10-12
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
3. ✅ Hecho en `f4bcda1` (RF-001 §7.16). Siguiente: el punto 4. **Extraer la fila de serie** (`renderFilaSerie` en `EntrenamientoPage.tsx`) a un componente `FilaSerieEdicion`, con props explícitas (valores mostrados, errores y handlers). Requisitos:
   - sin cambio de comportamiento: verificar con la comparación mecánica que se usó en E5/E6;
   - después, un spec de interacción del borrador de repeticiones (vaciar y salir, stepper, completar).
4. **Carrera de orden de los envíos** (RF-001 §7.10, lote E9). **En pausa tras la fase roja (2026-10-12).** Un envío directo en vuelo puede llegar después de un cambio encolado posterior de la misma sesión.
   - **Caso práctico:** con mala señal, el alumno marca la serie 2 y la desmarca. El desmarcado llega antes que el marcado, y el servidor se queda con la serie marcada.
   - **Decisión del dueño:** el orden se garantiza dentro del dispositivo. Con red lenta, el segundo cambio puede verse unos segundos como "por enviar". Las pestañas y los varios dispositivos quedan como límite documentado; el versionado en el servidor queda fuera.
   - **Diseño (opción B corregida + G).** Respaldado por dos Judgment Day, reportes `.opencode-prompts/reportes/35-E9-*` (no borrarlos):
     - nuevo `lib/envios-en-vuelo.ts`, que registra los envíos en vuelo por sesión;
     - `enviarOEncolar` encola si hay un envío en vuelo y reserva el vuelo de forma síncrona;
     - un directo que falla se re-encola con la hora de la acción (`queueOfflineMutation` con `creadoEnMs`);
     - la cola no envía nada de un grupo en vuelo y se procesa al liberarlo;
     - guarda G: un rechazo tardío no revierte un toque posterior, y el %/racha salen de `recalcularCumplimiento`.
   - **Fase roja hecha** (prompt `36-E9-tests`, reporte `36-E9-tests.reporte.md`): 10 rojos por la razón esperada; U8 y P4 en verde inesperado, explicados.
     - Los tests están en la rama local **`wip/e9-orden-envios-rojo`** (`a3310ef`), fuera de `main` para no dejar la suite en rojo.
     - Para retomar: `git checkout wip/e9-orden-envios-rojo -- apps/web/src/lib/envios-en-vuelo.spec.ts apps/web/src/pages/atleta/EntrenamientoPage.orden.interaccion.spec.tsx apps/web/src/lib/offline-db.spec.ts apps/web/src/lib/offline-sync.spec.ts apps/web/src/lib/sesion-estado.spec.ts`.
   - **Al retomar:**
     1. responder las 5 dudas del reporte 36: la pasada extra observable, contador global de `marcaDeAccionMs`, parámetro posicional de `getDueMutations`, distintivo "por enviar" y suscripción como efecto del import o con `init`;
     2. implementar;
     3. verificación y revisión. Toca la cola offline, así que van los cuatro enfoques o un Judgment Day;
     4. escribir el ADR: el número 022 ya lo usa la modularización de vistas.
   - **Coordinación:** la otra sesión (ODD de modularización, `odd/tasks/modularizacion-vistas-web.md`) tiene el M2 `entrenamiento` (prompt `52`) esperando a E9. Si M2 parte `EntrenamientoPage` antes, implementa E9 sobre la nueva estructura: los tests de página prueban comportamiento y deberían seguir valiendo.
   - Primero, un diseño con una decisión del dueño. Opción candidata: serializar por sesión todos los envíos, directos y de la cola, en `lib/offline-sync.ts` / `enviarOEncolar`.
   - Después, tests con escenarios de red lenta.
5. **Unificar `SelectorPlantillaAsignacion` y `AsignacionMasivaPlantilla`:** la duplicación viene del módulo 2. Se puede reutilizar el flujo en 3 pasos (`lib/asignacion-pasos.ts`) con un paso de elección de alumnos para la versión masiva. Requiere una decisión de producto sobre si la masiva admite ajustes.

## Estado de partida
- Lotes E1–E7 cerrados:
  - E1 `77c1990`; E2 `c6a0e34`/`05d42bd`; E3 `8af2673`/`c194caa`; E4 `e440587`/`bb42b55`;
  - E5 `dfc3e51`/`0194fcb` (ADR-021); E6 `9192fef`/`3c68eed`; E7 `63369d7`.
- Web 1575/1575, typecheck y build limpios (2026-10-12).
- Convenciones nuevas en 00_Reglas_Desarrollo_SDD.md: §6.12 (peso máximo 700) y §6.13 (entrada numérica filtrada).
```
