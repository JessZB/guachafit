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

## Estado del módulo 5 (PAUSADO por decisión del dueño el 2026-10-12; no hay lote en curso)
- Saldo a favor (RF-006 RN-05): API `afd3f7c`/`cefec40`, web `b975905`/`1492ef3`. Migración 0019.
- Reversión de pagos aprobados (RF-007): API `4878d7e`/`613737b` (migraciones 0020 y 0021), web `e16039d`/`e7191ae`.
- Pagos con fecha anterior (RF-007/RF-009): `cea825b` + doc-sync `376bbdb`. Regla provisional de "hoy": la API compara con el día de `Pacific/Kiritimati` y la web usa el día del dispositivo.
- Anulación de cuotas (RF-008), **solo API**: `7f46acc` + doc-sync `ac976a5`. `POST /finanzas/cuotas/:id/anular` (motivo obligatorio; 409 con pagos en revisión o aprobados; devuelve el saldo a favor aplicado; aviso `CUOTA_ANULADA`). Migración 0022: motivo/fecha/autor e índice único parcial (`estado <> 'anulada'`). Una cuota anulada no ocupa su periodo: se corrige una cuota mal emitida anulando, quitando el plan y reasignándolo. Reglas completas en RF-008 §7.

## Pendientes del módulo 5 (orden propuesto)
1. **Web de la anulación de cuotas:** botón "Anular cuota" en la ficha (historial de cuotas) con diálogo de motivo obligatorio y los avisos aprobados ("este periodo no se cobrará aunque el alumno siga entrenando"; si tiene plan, "quítalo si dejó el gimnasio"); estado "Anulada" con el motivo en Pagos del alumno (hoy `lib/estado-cuota.ts` muestra "Sin cuota vigente"). No en demo.
2. **Congelar la membresía (lesión o viaje)** con la cuota ya pagada: correr el próximo vencimiento N días. Antes decidir con el dueño: máximo de días, si detiene recordatorios y cómo convive con la pausa de alumno existente.
3. **Condonar el resto de una cuota con abono** (cerrarla con lo abonado). Decisión de producto pendiente.
4. **Zona horaria del alumno:** guardar la zona del dispositivo al activar la cuenta, avisar si la del dispositivo difiere de la configurada y validar la fecha de pago con la zona del alumno (sustituye la regla provisional de Kiritimati).
5. **PagosPage del alumno:** idempotencia del reporte, recarga, modo demo (Pagos y Conciliación llaman al API en demo), comprobantes sin EXIF, accesibilidad.
6. **Lote web P2 de Control de Cobros:** mostrar `proximoCorte`, precio residual tras reconciliar, éxito en modo demo, jerga, `htmlFor`, precarga de becados.
7. **Seguimientos:** reconciliador de la invariante de saldo (RNF-002; las cuotas anuladas quedan fuera de la invariante), `ReportarPagoSchema` sin tope de monto, `fechaOperacion` solo valida formato (`2026-02-30` pasa), dos ventanas de "recaudado del mes" (UTC frente a hora del servidor), mensajes de éxito que no se borran solos, mutaciones sin `tiempoLimiteMs`, e2e de RF-006 que usa el barrido global de emisión, `obtenerCuotaPorId` no expone el motivo de anulación.
Después: módulo 6 (Dashboard del entrenador, RF-013), 7 (Notificaciones, RF-014..016, RNF-004), 8 (PWA offline transversal).

## Referencias
- Tests base (al 2026-10-12): web ~1622, API ~1735 (+29 omitidas). Docker: `guachafit-postgres` (migraciones con `pnpm db:migrate`; la base local ya está en la 0022).
- **e2e:** vitest del API no carga `.env`. Definir en la terminal de OpenCode `$env:E2E_DATABASE_URL='postgres://postgres:postgres@localhost:5432/guachafit'` (credenciales dev del compose) y aplicar antes las migraciones pendientes.
- Decisiones: ADR-020 (suscripción y emisión automática, índice parcial desde la 0022), ADR-015 (borrado best-effort en la bóveda), ADR-017/018 (hosting, correo).
- Piezas a reutilizar: `lib/saldo-a-favor.ts`, `lib/pagos-historial-filtros.ts`, `lib/cobro-sala.ts`, `DialogoConfirmacion` (con `confirmarDeshabilitado`), `estadoCuotaTrasRetirarAbono`, `repartirAbono`, `api-client` (`tiempoLimiteMs`), `lib/imagen-comprimida.ts`.
- Para cambiar contratos ya revisados, validar primero el paquete de reglas con un Día del Juicio (así se encontraron los críticos de la anulación).

Empieza revisando memoria (mem_search "guachafit módulo 5") y pregúntame qué pendiente retomar.
```
