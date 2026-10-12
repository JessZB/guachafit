---
id: HANDOFF-RETOMA
titulo: "Handoff — Prompt para retomar el módulo 5 (Pagos y cartera)"
fecha: 2026-10-12
estado: activo
tags:
  - handoff
  - retoma
  - orquestador
  - metodologia
---

# 🔁 Prompt de retoma (copiar y pegar al inicio de la próxima sesión)

> Uso: abrir una sesión nueva en la bóveda GUACHAFIT y pegar el bloque de abajo tal cual. El módulo de Entrenamiento lo trabaja OTRA sesión en paralelo: ver [[Handoff_Modulo_Entrenamiento]].

```markdown
# Retomar: módulo 5 (Pagos y cartera) de GUACHAFIT, sesión nueva

Repo/vault: C:\Users\jesus\OneDrive\Documentos\Obsidian Vault\Trabajo\GUACHAFIT (rama main, sin push).

## Flujo de trabajo (Claude + OpenCode; reglas en 00_Reglas_Desarrollo_SDD.md §7 y ~/.claude/rules/opencode-director.md)
- Tú (Claude) diriges, escribes el código de producción y el doc-sync. NO escribes ni ejecutas tests y NO lanzas sub-agentes de revisión.
- Pruebas y revisiones van como prompts para OpenCode en `.opencode-prompts/<NN>-<lote>-<tipo>.md`; reportes en `.opencode-prompts/reportes/<mismo>.reporte.md`. Yo los ejecuto en la TUI de OpenCode pegando: `Lee y ejecuta exactamente el prompt .opencode-prompts/<archivo>.md y deja el reporte en la ruta que indica.` NUNCA ejecutes opencode ni des comandos `opencode run`.
- Ciclo por lote: tests (fase roja con contratos exactos) → implementas → verificación → revisión (1 enfoque si riesgo medio; 4 si dinero/datos/seguridad/migraciones o >400 líneas) → corrección → validación → commit de código + commit `docs(vault): ...` → borrar los prompts y reportes del lote.
- Verifica cada reporte contra `git status`/`git diff` (que OpenCode no haya tocado producción) antes de aceptarlo.
- Commits convencionales en español, SIN Co-Authored-By. No hacer push. Puedes editar `.env.example`; NUNCA leas ni edites `.env`. `.claude/settings.json` y `Notas del 09-10-2026.md` sin seguimiento no son parte del trabajo.
- Una pregunta a la vez; ante decisiones de producto, pregúntame con tu recomendación y su porqué.
- Para editar con comillas/backticks usa un script Python escrito con Write (los heredocs de Bash fallan) y ancla los patrones al salto de línea previo (un patrón con N espacios coincide dentro de una línea con más espacios).

## CONVIVENCIA CON LA OTRA SESIÓN (importante)
- Otra sesión trabaja en Entrenamiento en la MISMA rama y el MISMO árbol (EntrenamientoPage, components/atleta, modo-foco, SelectorPlantillaAsignacion, asignacion-pasos…, prompts `.opencode-prompts/1x-3x-e*`).
- Haz commit SIEMPRE nombrando tus archivos (`git add <lista>`), nunca `git add -A`. Antes de commitear revisa `git status` y que los archivos compartidos (p. ej. `packages/shared/src/*`) solo lleven tus cambios.
- Si necesitas editar un archivo que la otra sesión tiene modificado sin commit, espera a que lo commitee.
- En los prompts para OpenCode di qué archivos son ajenos y pide demostrar en aislamiento cualquier fallo ajeno. Los timeouts de 5 s en specs HTTP del API son por carga: se re-ejecutan en aislamiento.
- Engram puede fallar con "multiple active runtime sessions": avisa y sigue.

## Estado del módulo 5 (lo hecho en esta tanda)
- Saldo a favor (RF-006 RN-05): API `afd3f7c`/`cefec40`, web `b975905`/`1492ef3`. Migración 0019. Regla de bloqueos documentada en `acreditarSaldoAFavor` (aprobar/cobrar: cuota → perfil; ninguna ruta que bloquee el perfil toca después una cuota existente).
- Reversión de pagos aprobados (RF-007): API `4878d7e`/`613737b` (migraciones 0020 estado `revertido` y 0021 índice de referencias con `IN ('pendiente','aprobado')`; un pago revertido libera su referencia), web `e16039d`/`e7191ae` (confirmación al aprobar en Conciliación, "Revertir pago" en la ficha, estado "Revertido" en los historiales).

## EN CURSO: lote "pagos con fecha anterior" (RF-007/RF-009), SIN COMMIT
- Reglas del dueño (RF-007 "### Pagos con fecha anterior: reglas aprobadas"): cobro en sala con fecha (hoy por defecto y máximo); la API rechaza fechas futuras (cobro en sala y reporte del alumno); en Bs. la tasa vigente al registrar se muestra en el modal; el recaudado del mes cuenta por fecha de registro.
- Implementado y validado (prompt 03 en verde: web 1516, API 1690 +17 omitidas):
  - shared: `MENSAJE_FECHA_PAGO_FUTURA`; `CobroDirectoInteligenteSchema.fechaOperacion` opcional sin default UTC.
  - API (`finanzas.service.ts`): `esFechaPagoFutura` (compara con el día de `Pacific/Kiritimati`, UTC+14), 400 en `reportarPago`, `cobroDirecto` y cobro inteligente (antes de emitir); sin fecha, el cobro inteligente usa el día local del alumno.
  - web: `lib/cobro-sala.ts` (`validarFechaCobro`, `textoTasaCobro`); CarteraPage (max, validación, tasa, texto sin jerga); ficha (campo fecha, tasa con `/finanzas/tasas/vigente?clienteId=`, "Registrando cobro…"); PagosPage (max y validación). En ficha y PagosPage, `onInvalid` sustituye la burbuja nativa por nuestro mensaje (sin `noValidate`, para conservar la validación nativa del resto).
- **Siguiente paso:** el usuario va a ejecutar (o ya ejecutó) `.opencode-prompts/04-rf009-fecha-anterior-review-reliability.md`. Lee su reporte en `.opencode-prompts/reportes/04-rf009-fecha-anterior-review-reliability.reporte.md`, aplica correcciones si hace falta (+ validación), y cierra: commit de código nombrando estos archivos — `apps/api/src/modules/finanzas/finanzas.service.ts`, `apps/api/test/bdd/rf011-rf012-alumnos-edge-cases.spec.ts`, `apps/api/test/bdd/rf009-*.spec.ts` (3), `apps/web/src/lib/cobro-sala.ts`, `apps/web/src/lib/cobro-sala.fecha-anterior.spec.ts`, `apps/web/src/pages/atleta/PagosPage.tsx` + `PagosPage.fecha-anterior.interaccion.spec.tsx`, `apps/web/src/pages/entrenador/AlumnoDetallePage.tsx` + `AlumnoDetallePage.fecha-anterior.interaccion.spec.tsx`, `apps/web/src/pages/entrenador/CarteraPage.tsx` + `CarteraPage.fecha-anterior.interaccion.spec.tsx`, `packages/shared/src/schemas/index.ts` — y doc-sync (RF-007: pasar la sección de reglas a "implementado (fecha, sha)"; RF-009 si aplica; 06_Guia_Pruebas_Manuales.md). Luego borra los prompts/reportes `0[1-4]-rf009-fecha-anterior-*`.

## Pendiente del módulo 5 (orden propuesto)
1. Anulación de cuotas (necesita decisión de producto: quién, cuándo, qué pasa con pagos y saldo a favor).
2. PagosPage del alumno: idempotencia del reporte, recarga, modo demo (Pagos y Conciliación llaman al API en demo), comprobantes sin EXIF (como las fotos de antropometría), accesibilidad.
3. Lote web P2 de Control de Cobros: mostrar `proximoCorte`, precio residual tras reconciliar, éxito en modo demo, jerga, `htmlFor`, precarga de becados.
4. Seguimientos documentados: reconciliador de la invariante de saldo (RNF-002), `ReportarPagoSchema` sin tope de monto, mensajes de éxito que no se borran solos, mutaciones sin `tiempoLimiteMs`, e2e de RF-006 que usa el barrido global de emisión.
Después: módulo 6 (Dashboard del entrenador, RF-013), 7 (Notificaciones, RF-014..016, RNF-004), 8 (PWA offline transversal).

## Referencias
- Tests base (al 2026-10-12): web ~1516, API ~1690 (+17 omitidas). Docker: `guachafit-postgres` (migraciones con `pnpm db:migrate`; e2e con `E2E_DATABASE_URL`).
- Decisiones: ADR-020 (suscripción y emisión automática), ADR-015 (borrado best-effort en la bóveda), ADR-017/018 (hosting, correo).
- Piezas a reutilizar: `lib/saldo-a-favor.ts`, `lib/pagos-historial-filtros.ts`, `DialogoConfirmacion` (con `confirmarDeshabilitado`), `estadoCuotaTrasRetirarAbono`, `repartirAbono`, `api-client` (`tiempoLimiteMs`), `lib/imagen-comprimida.ts`.

Empieza revisando memoria (mem_search "guachafit módulo 5 fecha anterior") y el reporte 04 de la revisión de fiabilidad; si aún no existe, pídeme que ejecute ese prompt.
```
