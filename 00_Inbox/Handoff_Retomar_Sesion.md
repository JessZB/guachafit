---
id: HANDOFF-RETOMA
titulo: "Handoff: retomar el trabajo con los lotes de la auditoría UX de las vistas del entrenador y del alumno"
fecha: 2026-11-02
estado: activo
tags:
  - handoff
  - retoma
  - orquestador
  - ux
  - metodologia
---

# 🔁 Prompt de retoma (copiar y pegar al inicio de la próxima sesión)

> Abre una sesión nueva en la bóveda GUACHAFIT, **dentro de una terminal de Orca**, y pega el bloque de abajo tal cual. Los hallazgos y el plan de lotes están en [[Auditoria_UX_Vistas_2026-10-28]].

```markdown
# Retomar: lotes de la auditoría UX/UI de GUACHAFIT, sesión nueva

Repo/vault: C:\Users\jesus\OneDrive\Documentos\Obsidian Vault\Trabajo\GUACHAFIT
Rama `main`, que sigue a `origin/main` en el repo PRIVADO https://github.com/JessZB/guachafit. No cambies la visibilidad.
Push solo cuando yo lo pida explícitamente.

## Qué hay que hacer
Todos los 29 lotes de la auditoría UX (UX-01…UX-29) están **completados y cerrados con éxito**:
- **Todos los lotes cerrados (UX-01 a UX-29):** Auditoría UX completada al 100%.
- **Revisión de calidad de UX-19 a UX-29 cerrada (`af33433`, 2026-11-03):** corregidos los defectos confirmados (pagos del alumno, check-in, aviso del cierre de sesión, menú, Plantillas). Las decisiones D11 y D15 ya están resueltas (ver el bloque siguiente). Queda D14 (botón Atrás en el check-in, recomendado no hacerlo ahora) en la sección 4 de la auditoría.
- **Lote de pagos del alumno cerrado (`4371639`, 2026-11-03):** D11 (moneda según método), D15 (motivo real del rechazo, con cambio de API), montos con formato común y referencia validada en el cliente. Web **3098 tests en 359 archivos** más P26, API 262/262, typecheck y build en verde.
- **ZH-1 (zona horaria) cerrado (`6111326`, 2026-11-03):** precarga única de la zona del dispositivo, aviso de discrepancia en el pie del layout del alumno y migración `0024`. Web **3112 tests en 364 archivos**, API 406/406, typecheck y build con código 0.
- **ZH-2 + D12 cerrados (`6da5794`, 2026-11-03):** el menú, «Hoy», la fecha de operación del pago y antropometría leen la zona del perfil con `useZonaPerfil()` (la antropometría prefiere la zona fresca de `/auth/me`; el modo demo conserva el reloj del dispositivo) y los textos de Progreso y Pagos del alumno quedan unificados (mayúscula solo en la primera palabra, «En revisión» incluido, sin jerga). Web **3152 tests en 376 archivos**, typecheck de shared, database, api y web y build web con código 0. Revisión de fiabilidad (ZH-2) y de legibilidad (D12) sin BLOCKER.
- **Siguiente trabajo acordado:** solo queda **D14** (botón Atrás del check-in; recomendado no hacerlo ahora) y estos seguimientos:
  1. La agrupación «Hoy/Ayer» de las notificaciones (`lib/notificaciones-in-app.ts`), los gráficos de evolución (`lib/evolucion-graficos.ts`) y `timezoneCliente` de nutrición siguen con la zona del dispositivo.
  2. Los endpoints `?timezone=` del entrenamiento aún aceptan lo que envía el cliente (costo T3 del ADR-025).
  3. Sidebar («Menú de Acciones», «Mi Comida», «Rendimiento Personal»), `BottomNav` («Ir a entrenar», «Pagos») y `ComparadorFotos` conservan Title Case e inconsistencias: quedaron fuera de D12.
  4. La opción «(VES)» del selector de método de pago; `validarArchivoComprobante` (valida por nombre) encajaría en `lib/comprobante-pago.ts`.
  5. Rechazados en la revisión: guarda de `asegurarComprobanteSubido`, renombrar `onNuevoAbono` a `onReportarPago` y reemplazar `querySelectorAll` por `getByLabelText` en specs antiguos.
- **Antigravity se queda sin créditos** hacia los 350k tokens de un worker y suele caer justo después de lanzar la suite completa: el JSON de Vitest aparece igual al terminar. Pedirle el reporte **antes** de lanzar la suite y repartir el trabajo en prompts cortos. Al lanzarlo, pasar el id completo del modelo (`gemini-3.8-flash-medium` o `-high`): solo `medium` o `high` cae al modelo por defecto, que puede no tener créditos.
- Siguiente paso: Consolidación final del ciclo de auditoría UX, borrado de `.external-agents/auditoria-ux/` y planificación de temas pendientes fuera de la auditoría (módulo 5: anulación de cuotas en la web, congelar membresía, condonar, PagosPage, P2 de Control de Cobros, RNF-002; y pendientes de la ficha en RF-011).

## Roles (reglas en 00_Reglas_Desarrollo_SDD.md §7)
- **Tú (Claude):** orquestas y validas.
  - Defines contratos exactos y revisas cada diff.
  - Contrastas cada reporte con el JSON de Vitest, `git status` y `git diff`.
  - Haces el doc-sync y los commits.
  - No escribes ni ejecutas tests. No escribes código de producción.
- **Sonnet (subagente escritor, desde 2026-10-31):** escribe la producción. Usa la herramienta Agent con `model: sonnet` y `effort: high`, con un prompt autocontenido.
  - Restricciones: solo producción, sin tests, specs, builds ni `.env`.
  - Pídele archivo:línea de cada contrato, desviaciones con su porqué, specs que se romperán y `git status`.
  - Para ajustes del mismo lote, reanúdalo con SendMessage. No lances otro.
- **Agente externo (Antigravity con Gemini vía Orca):** escribe los tests, verifica y revisa.
  - Los prompts van en `.external-agents/<NN>-<lote>-<tipo>.md`.
  - Los reportes van en `.external-agents/reportes/<mismo>.reporte.md`.
- **Mis preferencias:**
  - **Tests solo de comportamiento.** Nada de specs que solo comprueban textos, copy o estilos. Para nombres usa constantes únicas y ajusta los specs que ya los consultan.
  - Pruebo con `pnpm dev`. No me pidas build, preview ni incógnito.
  - Commits convencionales en español, SIN Co-Authored-By. Push solo si lo pido.

## Lanzar el agente externo con Orca
1. Comprueba que existe `ORCA_TERMINAL_HANDLE`. Aunque `orca status --json` no traiga `caller`, `run-create` funciona con el handle propio. Si `run-create` falla con `no_active_sender_terminal`, detente y avísame. Nunca uses el handle de otra terminal.
2. Crea un Run por lote: `orca orchestration run-create --objective "<lote>" --json`.
3. **Antigravity 1.4.12 rompe `worker-start --agent`** (`agent_not_in_foreground`): abre la terminal del agente con su modelo, pero Orca no le entrega el prompt. Usa el script que ya lo resuelve:
   ```bash
   bash .external-agents/lanzar.sh <NN>-<lote>-<tipo> <modelo>
   ```
   El script intenta `--agent` y, si falla, reutiliza con `--terminal <handle>` la terminal abierta. El modelo es el de esa terminal.
   - Modelos: `gemini-3.8-flash-medium` para `tests`, `verificacion` y `validacion`; `gemini-3.8-flash-high` para `review-*`.
   - Las revisiones de un lote van en paralelo. Una terminal liberada se cierra y no se puede reutilizar.
4. Espera en segundo plano (Bash con `run_in_background: true`), con `--timeout-ms 540000`:
   ```bash
   orca orchestration check --run <run> --wait --types "worker_done,escalation,question" --timeout-ms 540000 --json
   ```
   Un `timedOut` sin mensajes no es un fallo: mira si ya hay specs, JSON o reporte, y vuelve a esperar.
5. Los latidos (`heartbeat`) se confirman con `--ack <deliveryId>` y no se informan.
6. Tras cada `worker_done`, verifica el reporte. Después haz `worker-release --dispatch <id>` y luego `--ack`. Los despachos fallidos cuyas terminales reutilizaste quedan `retained`, y es normal.
7. Si un worker se cuelga (por ejemplo, Antigravity con "network issue"), usa `worker-stop`, porque `worker-release` solo vale para los que terminaron, y relánzalo. Para corregir un prompt a un worker en curso: `orca orchestration send --to <terminal> --subject … --body …`.

## Ciclo por lote
1. **Mapeo** con un agente Explore. Escribe cada **decisión** del dueño en la sección 4 de la auditoría.
2. **Fase roja** (prompt `tests`, con contratos exactos de API, props y textos copiados del código). Acéptala solo si:
   - cada rojo falla por el motivo esperado;
   - **cada archivo nuevo ejecuta sus tests** (un import en `vi.hoisted` escondió un spec entero en UX-16);
   - el número de archivos de la suite = el de antes + los nuevos;
   - los specs de caracterización solo cambian en lo autorizado.
3. **Sonnet implementa.** Revisa el diff y devuélvele las desviaciones que no aceptes: ceros falsos, estados en blanco, tarjetas dobles…
4. **Verificación + revisiones en paralelo.** Una revisión (el enfoque del riesgo dominante) si el riesgo es medio. Las cuatro (risk, reliability, resilience y readability) si el lote toca dinero, datos, seguridad o permisos, o si el diff de producción pasa de 400 líneas. Cuéntalo con `git add -N <nuevos>; git diff --numstat -- apps/web/src | grep -v spec`. En el prompt de revisión, nombra todos los consumidores de los componentes compartidos que toque el lote.
5. **Corrección con Sonnet** de los hallazgos válidos. Antes de aceptar un BLOCKER, comprueba que es alcanzable y si ya estaba en `HEAD`.
6. **Validación.** Añade tests de comportamiento para las correcciones y vuelve a pasar la suite completa, typecheck y build.
7. **Commit de código** (`git add -A apps/web/src`) y **commit `docs(vault)`**, que actualiza:
   - el RF afectado;
   - `06_Guia_Pruebas_Manuales.md`;
   - la auditoría (fila ✅ con commit, bloque «UX-NN cerrado» con seguimientos y proceso);
   - este handoff.
8. Borra los prompts y reportes del lote (`rm -f .external-agents/0*-uxNN-* .external-agents/reportes/0*-uxNN-*`) y guarda un resumen en Engram.

## Lecciones que aplicar siempre
- **La evidencia es el JSON de Vitest** y los `it(` del spec, nunca la tabla del reporte. Gemini ha inventado títulos, mensajes, suites fallidas y recuentos.
- **Suite completa una sola vez** por prompt, con `--maxWorkers=4 --reporter=json --outputFile=../../.external-agents/reportes/<NN>-<lote>-vitest.json`. Compara el número de archivos: una pasada perdió 6.
- **Textos de la UI:** se copian del código, nunca de un reporte. Un contrato con "Mostrando…" (texto inventado) dio un falso rojo.
- **Specs nuevos:**
  - `afterEach(() => cleanup())`, porque `globals: false`;
  - páginas con TanStack: `QueryClient` por test y `onlineManager.setOnline(true)` en `beforeEach` y `afterEach`;
  - páginas completas: `vi.setConfig({ testTimeout: 20000 })`;
  - nada de imports dentro de `vi.hoisted`;
  - sin `toBeDisabled` ni `toContainElement` (jest-dom no está registrado): usa `.disabled` y `contains`.
- **Accesibilidad:** el nombre accesible **contiene el texto visible** (WCAG 2.5.3). En UX-17 dejar nombres largos con etiquetas cortas fue un error. Botones de 44px, iconos con `aria-hidden` y foco visible.
- **Estados honestos:**
  - nunca ceros ni datos falsos mientras carga o tras un error;
  - carga con `EstadoCarga`;
  - error sin datos con `EstadoError` + Reintentar;
  - recarga fallida con datos: `AvisoErrorRecarga`, sin tapar la lista;
  - sin conexión: `AvisoDatosOffline` (`guardados` o `sin-datos`). Ojo: sin red, TanStack **pausa** la consulta y puede no llegar el error.
- **Formularios:**
  - validar antes de enviar, sin `alert()`;
  - errores de carga, guardado y acción por canales separados;
  - guarda síncrona contra el doble envío (también durante el mensaje de éxito);
  - aviso de cambios sin guardar (`DialogoConfirmacion`, patrón `ModalPlantilla`).
- **Montos:** siempre con `useFormatoNumero()`. Entrada decimal con `inputMode="decimal"`, `type="text"`, coma o punto, normalizada antes de enviar.
- **Componentes de layout con `useQuery`:** los specs que los montan necesitan `QueryClientProvider`. Las constantes que importan otros módulos no viven en un módulo que los specs mockean.
- **Guardián de tamaño** (`apps/web/src/tamano-archivos.spec.ts`): 400 líneas por archivo (cuenta `wc -l` + 1). Las páginas quedan en 300 o menos.
- **Scripts largos** (generar prompts, doc-sync): escríbelos con Write en el scratchpad y ejecútalos con `python -I`. Los heredocs de Bash fallan con las comillas.
- **Engram:** puede fallar con "multiple active runtime sessions". Avisa y sigue.

## Estado al 2026-11-01
- **Cerrados:** UX-01…UX-25, cada uno con su commit `feat`/`refactor` y su `docs(vault)`. Detalle y seguimientos en la sección 3 de la auditoría. Últimos lotes:
  - UX-11 `57606e8`: Dashboard con carga honesta.
  - UX-12 `97017b8`: hook `use-dashboard-comando`.
  - UX-13 `8a5c6f1`: D4 «qué atender hoy».
  - UX-14 `da5c851`: Monitor táctil.
  - UX-15 `8cfb73f`: Antropometría del entrenador en el móvil.
  - UX-16 `cf4bd84`: D5, nombres únicos e insignias de pendientes.
  - UX-17 `14c796e`: D6, Ajustes en una pantalla con barra segmentada.
  - UX-18 `e7851f3`: D7, el precio es el total de la duración y el formulario de planes arranca vacío.
  - UX-19 `ed28ed6`: Tasa de cambio sin jerga, resumen guardado, edición en `<details>`, validación previa y guarda contra doble envío.
  - UX-20 `1b364c4`: Plantillas con recarga honesta y desacoplamiento de cargandoInicial/recargando en `usePlantillasBanco`; banner `AvisoErrorRecarga` con tarjetas visibles; buscador táctil `min-h-11` (16px); contador "N plantillas" en `aria-live="polite"`; `BadgeEstado` unificado; motivo visible al asignar sin conexión; iconos `aria-hidden`; aclaración de copia independiente en `PasoRevisar` (CFG-26).
  - UX-21 `87c732d`: D8, formulario de pago del alumno con monto inicial vacío, validación decimal con coma/punto (<= 12 enteros y 2 decimales), `<label htmlFor>` y alertas por canal (`role="alert"`), subida de comprobante accesible por teclado y botón "Quitar comprobante", prellenado al pulsar "Corregir y Reenviar" en un pago rechazado y limpieza al abrir un abono nuevo.
  - UX-22 `3bfce29`: D8 / ALU-07, reutilización de `comprobanteStorageKey` en reintentos sin volver a subir a R2, `idempotencyKey` estable en reintentos y renovada al confirmar o editar datos, guarda síncrona `enVueloRef`, limpieza del temporizador de 1800 ms al desmontar o volver al Hub y mensaje honesto `MENSAJE_ERROR_RED_AMBIGUO_PAGO` en fallos ambiguos de red/pasarela.
  - UX-23 `6271cce`: Nutrición del alumno con zona del perfil en el botón fuera de ventana (`ALU-16`), enlace "Cambiar zona horaria" resiliente en SSR (`ALU-17`), lista de 7 días con fecha legible y estado sin truncar ni `title` (`ALU-18`), validación reactiva por campo en agua/calorías/proteína y contador vinculado en notas (`ALU-19`), e iconos Lucide con `pluralizar` en avisos (`ALU-21`); `NutricionPage.tsx` baja a 278 líneas.
  - UX-24 `48a3d1e`: Menú del alumno partido (`AtletaMenuPage.tsx` de 364 a 152 líneas con `use-resumen-menu`, `ChipRacha`, `TarjetaEntrenarHoy`, `TarjetaAccesoAlumno`), saludo con el nombre del perfil, estado honesto del entrenamiento, error con reintento y aviso offline, `BadgeEstado` en Pagos, `progressbar` accesible, `aria-label="Navegación principal"` y `EstadoCarga` en el `Suspense` del layout.
  - UX-25 `3d90202`: Chips de bloques de la semana con "Hoy" condicionado a `esSugeridoHoy` y `aria-current="true"` en el bloque consultado, `fechaVisible` visible en pendientes sin `title`, `flex-wrap` táctil y sin `✓` duplicado; steppers de peso y reps `w-11` constante (≥44px) en todos los viewports; Plan: [X] kg con `break-words`; `min-h-11` en `CLASES_INPUT_MEDIDA` del check-in antropométrico.
  - UX-26 `70cfe33`: Cierre de sesión seguro: resumen honesto de series en `ModalFinalizarSesion` (`ENT-02`), rejilla 1-10 sin etiquetas inductoras ("Ideal", "Bajo", "Máximo") y esfuerzo inicial `null` sin forzar RPE 8 (`ENT-09a,b`), CTA repetido al final de `ListaCompletaEjercicios` con variante parametrizable y `aria-label` diferenciado (`ENT-03`), botón con `type="button"` y `text-sm` (`ENT-10`), unificación de "coach" a "entrenador", `testTimeout` a 15s en `vitest.config.ts`.
  - UX-27 `253b69d`: Progreso con carga honesta (`PRO-01`: spinner solo si `!evolucion` y datos previos preservados en error), `aria-describedby` condicional e `id` en alerta de campos de medida (`PRO-03`), navegación sincronizada con searchParams `?vista=` y diálogo accesible de confirmación ante cambios sin guardar (`PRO-05`), unificación a "entrenador", `0%` de grasa fiel y peso con formato decimal (`PRO-06, 07`). `ProgresoPage.tsx` en 294 líneas (<= 300).
  - UX-28 `9c8c039`: D9, Check-in sin conexión: `FormularioCheckinAntropometrico` renderiza `AvisoDatosOffline` con variante "sin-datos" en cabecera y desactiva el botón de envío con motivo visible "Conéctate a internet para enviar tu evaluación", `AvisoDatosOffline` ampliado con prop `isOnline`, guarda síncrona en `useCheckinAntropometrico` ante intentos sin red y modo demo simulado localmente (`PRO-04`).
  - UX-29 `0ebda43`: Pulido del alumno: fechas locales con `formatFechaLocal` y fallback `'—'` (`ALU-12`, `ALU-13`), prevención de desbordes con `flex-wrap gap-3` y `break-words` (`ALU-14`, `ALU-15`), unificación de "coach" a "entrenador", tasa en "Bs." y erradicación de "VES" y "Cloudflare R2" (`ALU-11`), hora local en zona horaria con `textoHoraActualEnZona` y eliminación de cabecera duplicada en Ajustes (`ALU-26`).
- **Tests:** web **3057 tests en 344 archivos (1127 suites)**, typecheck y build en verde (al cierre de UX-29).
- **Commits locales sin push** desde `6abb291` (UX-11…UX-29, 19 lotes consecutivos).
- **Pausados o pendientes fuera de la auditoría:** módulo 5 (anulación de cuotas en la web, congelar membresía, condonar, PagosPage, P2 de Control de Cobros, RNF-002) y pendientes de la ficha en RF-011.

## Piezas a reutilizar
- **`components/ui/`:** `BotonTactil` (`primaria`, `secundaria`, `peligro`, `peligro-contorno`), `BadgeEstado`, `BarraTabsSegmentada` (con `indicador` `contador`), `ChipFiltro`, `EstadoCarga`, `EstadoError`, `EstadoVacio`, `InsigniaConteo`.
- **`components/common/`:** `AvisoErrorRecarga`, `AvisoDatosOffline` (+ `lib/use-frescura-offline`), `Paginacion` (props `etiqueta` y `anunciarEstado`), `DialogoConfirmacion`, `MetricCard` (prop `enlace`).
- **`components/ajustes/`:**
  - `PantallaAjustes`: props `renderPestana`, `conteos` y `ancho`;
  - `CampoAjustes`: `CampoAjustes`, `SelectAjustes`, `AvisosAjustes`, `BotonAjustes`, `TarjetaAjustes`.
- **`lib/`:**
  - `formato-monto` y `use-formato-numero`;
  - `use-tabs-accesibles`, `use-dialogo-accesible`, `pluralizar`, `date-format`, `adherencia` (`rutaExpedienteMonitor`), `zona-horaria` (`textoHoraActualEnZona`, `horaDeZona`);
  - `etiquetas-dominio` (`DESTINOS_ENTRENADOR`) y `ajustes` (`etiquetaCortaPestanaAjustes`);
  - `use-pendientes-navegacion` + `insignias-pendientes` (`CLAVE_PENDIENTES_NAVEGACION`, que se invalida tras conciliar o cobrar);
  - `dashboard-comando-demo`.
- **Patrones:**
  - enlace extendido de `TarjetaAlumnoDirectorio` y `TarjetaAlumnoMonitor`;
  - confirmación inline de `TarjetaPlantilla` y `TarjetaPlanComercial`;
  - cambios sin guardar de `ModalPlantilla` y `ModalPlanComercial`;
  - contador de generación de `use-dashboard-comando`.

Auditoría UX completada (UX-01 a UX-29). Los 29 lotes quedan cerrados y verificados.
```
