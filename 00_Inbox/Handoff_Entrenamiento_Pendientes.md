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
4. **Carrera de orden de los envíos** (RF-001 §7.10): un envío directo en vuelo puede llegar después de un cambio encolado posterior de la misma sesión.
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
