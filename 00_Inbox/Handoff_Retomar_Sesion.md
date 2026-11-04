---
id: HANDOFF-RETOMA
titulo: "Handoff: seguimientos abiertos tras la auditoría UX de las vistas del entrenador y del alumno"
fecha: 2026-11-04
estado: activo
tags:
  - handoff
  - retoma
  - ux
  - seguimientos
---

# 🔁 Seguimientos abiertos (UX-01 a UX-29, ZH-1, ZH-2, D11 a D17)

Los 29 lotes de la auditoría UX, la zona horaria del alumno (ZH-1 y ZH-2), el lote de pagos y los textos D12 están **cerrados y en `origin/main`**. El lote D16 (endurecimiento del reporte de pago: comprobante validado al escribir y al leer, monto con coma, `validarArchivoComprobante` en `lib/comprobante-pago.ts`) está **cerrado en local (`26153aa`), pendiente de push**. El lote D17 (ciclo de vida del enlace de captación del entrenador: código del servidor, rotación con corte inmediato, pausa, cupo, contador y página de enlace no válido) está **cerrado en local (`db2d68f`), pendiente de push**. El lote del cronómetro de descanso con tiempo absoluto y el borrador de series pendientes (RF-001 §7.21, [[ADR-027-cronometro-descanso-tiempo-absoluto-borrador-series]]) está **cerrado en local (`8bcfa95`), pendiente de push**. El botón flotante del cronómetro y las animaciones de entrada (`tw-animate-css`; RF-001 RN-06 y escenario 9, [[ADR-027-cronometro-descanso-tiempo-absoluto-borrador-series]] §8) están **cerrados en local (`24d506f` y `4a84375`), pendientes de push**. Suite web al último cierre: **3.372 tests**; API **2087 tests pasan** y las 5 suites e2e de concurrencia (52 tests) se omiten sin PostgreSQL local; contra PostgreSQL real con la migración 0025 pasan, junto al e2e nuevo de D17 (8 tests, `28ed17f`); typecheck y build con código 0. Detalle de cada lote en [[Auditoria_UX_Vistas_2026-10-28]]; decisiones en [[ADR-025-zona-horaria-alumno-precarga-dispositivo-aviso-discrepancia]].

Cómo trabajar: reglas en `00_Reglas_Desarrollo_SDD.md` §7 (Claude orquesta y valida; Haiku explora; Sonnet escribe producción; Antigravity escribe tests, verifica y revisa, lanzado con el id completo del modelo `gemini-3.8-flash-medium` o `-high`). El procedimiento detallado con Orca y las lecciones de cada lote están en la versión anterior de este archivo: `git show 7a612e0:00_Inbox/Handoff_Retomar_Sesion.md`.

Los ítems marcados **[verificar]** salen de la lectura de la auditoría y no se han comprobado contra el código actual.

## Decisiones del dueño sin resolver
1. **D10:** separar del texto de notas el valor de molestia (ENT-09c); UX-26 solo cerró ENT-09a y ENT-09b.
2. **D14:** botón Atrás del check-in con guard de router; la recomendación es no hacerlo ahora.
3. **D5 [verificar]:** lleva ✅, pero el texto dice «mantener Progreso en el Menú hasta decidir» frente a un cuarto destino en la barra del alumno.

## Entrenador
4. Modal de cobro en sala de la ficha: adoptar D1 y quitar el monto inicial fijo `40.00` (UX-08).
5. API de cobros: un reintento con la misma clave de idempotencia y distinto payload devuelve el cobro original con éxito; debería ser 409 (UX-08).
6. Cartera: los KPI «Total en mora» y «Próximos a vencer» no enlazan a su pestaña (`useCartera` lee `?pestana=` solo al montar) (UX-07b, UX-10).
7. Bandeja de cobros y Antropometría: la búsqueda es local a la página cargada, y un término de otra página da «Sin resultados». Requiere cambio en el API (UX-09b, UX-15).
8. Vista previa del recordatorio: falta una huella del mensaje entre la vista previa y el envío, y `obtenerTasaVigenteEnCaso` lee dos veces `perfiles_alumno` (UX-09a).
9. Dashboard: no recarga al volver la conexión (solo Reintentar); faltan tests de bordes de `KpisMacroDashboard` (adherencia y meta nulas, más de 5 filas, listas vacías); `recargar()` llama al API también en demo; el cumplimiento semanal muestra el decimal crudo (`84.50%`) y debe usar `formatDecimal` (UX-11, UX-12, UX-13).
10. Monitor: con 0 resultados tras una recarga fallida no se ve el estado vacío (guarda `!error`); en demo o sin conexión TanStack pausa la consulta y se muestra «sin datos» (haría falta `networkMode`); `ModalActividadAlumno.tsx:166` mantiene `animate-pulse` sin `motion-safe`; falta el test del clic en la paginación del pie (UX-14).
11. Antropometría del entrenador: el aviso de éxito sigue visible al pasar a «Comparar»; faltan tests de recarga fallida con datos y de grasa o cintura ausentes (UX-15).
12. Navegación: la `BottomNav` en tablet (768 a 1023 px) solo muestra 3 destinos (SEG-31); `useDashboardComando` y `usePendientesNavegacion` piden el mismo endpoint (dos peticiones); el cobro en sala de la ficha no invalida la insignia de mora y en demo las insignias no cambian al conciliar (UX-16).
13. Ajustes: `etiquetaPestanaAjustes` ya no se usa (código muerto); faltan tests de `etiquetaCortaPestanaAjustes` y de los bordes del conteo (UX-17).
14. Plantillas: la recarga con datos previos no tiene disparador visible (solo montaje y Reintentar); una petición en curso a `/plantillas` que responde tras cambiar `isDemoMode` no se aborta, falta `AbortController` (UX-20).
15. **[verificar]** `actionError` no se limpia al abrir un rechazo ni tras un éxito, y el `setTimeout` del éxito no se cancela al desmontar (UX-06).
16. **[verificar]** Conciliación: «pago movil» sin tilde en `etiquetaMetodoPago` y «Abrir original» sin aviso de pestaña nueva (UX-07a).
17. **[verificar]** Próximo vencimiento en la tabla de Cartera (RF-009, lote web P2 del módulo 5) (UX-05, UX-07b).

## Alumno
18. Check-in: tras un éxito las medidas no se limpian, y descartar con una subida de foto en curso puede dejar la subida huérfana.
19. Nutrición: al recargar sin conexión con un reporte encolado, el formulario no se rehidrata desde IndexedDB (WARNING, UX-23).
20. Menú (UX-24): `use-mi-perfil` conserva el perfil anterior tras cambiar de sesión; `ChipRacha` muestra «0 días» sin datos; el spec no restablece `navigator.onLine`; quedan `text-[11px]` en `BottomNav` y en el banner demo.
21. Title Case e inconsistencias fuera de D12: Sidebar («Menú de Acciones», «Mi Comida», «Rendimiento Personal»), `BottomNav` («Ir a entrenar», «Pagos» frente a «Pagos y cuotas») y `ComparadorFotos` (etiquetas «ANTES», «DESPUÉS» y «Comparativa Visual (Desliza el control central)»).

## Pagos
22. API: el registro de idempotencia vive en memoria, y el índice `uq_transaccion_referencia_entrenador` excluye `efectivo_usd` y `efectivo_ves` (WARNING, UX-22). Requiere migración; va junto con el ítem 5.
23. Selector de método con la opción «(VES)» pendiente de revisar.
24. Rechazados en la revisión de D12 y ZH-2 (reabrir si se toca esa zona): guarda de `asegurarComprobanteSubido`, renombrar `onNuevoAbono` a `onReportarPago`, sustituir `querySelectorAll` por `getByLabelText` en specs antiguos.
25. Seguimientos de D16: «Corregir y reenviar» descarta el comprobante previo y el alumno debe volver a adjuntarlo; `reportar-pago` firma dos veces la misma URL; la estructura de la clave admite un tercer segmento con fecha completa (sin riesgo de acceso ajeno); **antes de desplegar, contar las filas con claves que no cumplen ADR-007** (cada una deja un aviso por listado y su comprobante deja de verse; si son muchas, bajar el aviso a `debug`); las respuestas de conciliar y revertir traen la clave sin URL (la web no la usa hoy).

## Zona horaria
26. La agrupación «Hoy/Ayer» de notificaciones (`lib/notificaciones-in-app.ts`), los gráficos de evolución (`lib/evolucion-graficos.ts`) y el `timezoneCliente` de nutrición siguen con la zona del dispositivo.
27. Los endpoints `?timezone=` del entrenamiento aceptan lo que envía el cliente (costo T3 del ADR-025).
28. `SelectorZonaHoraria`: la hora «en vivo» se calcula al renderizar y no se actualiza sola.

## Transversales y proceso
29. Accesibilidad de carga (UX-02): spinners sin texto ni `role="status"` (`SyncQueuePanel`, `ComparadorFotos`, `ComparadorAntropometrico`, `PestanaAntropometriaAlumno`); `EstadoCarga` con el texto solo en `sr-only`; botones cuyo icono gira sin cambiar el rótulo.
30. **[verificar]** Formato y formularios (UX-03): preferencia de formato numérico por usuario (futuro); `CampoAjustes` sin las props ampliadas (`required`, `maxLength`, `name`, `ref`); sufijo que repite la unidad en `ModalPlanComercial` y `FormularioTasa`; límites teóricos de `formatDecimal`.
31. `/admin` muestra dos «Cerrar sesión» y monta dos `DialogoLogoutPendientes` (preexistente, UX-04).
32. **[verificar]** Hallazgos de prioridad baja sin cierre explícito: COB-14, COB-31, SEG-11 y CFG-12.

## Fuera de la auditoría
33. Módulo 5: anulación de cuotas en la web, congelar membresía, condonar, `PagosPage`, P2 de Control de Cobros y RNF-002.
34. Pendientes de la ficha del alumno en RF-011.
35. Cierre del ciclo: consolidar la auditoría y borrar `.external-agents/auditoria-ux/`.

## Captación por enlace (D17)
36. **Antes de desplegar D17:** aplicar la migración `0025_captacion_enlace_coach` en cada entorno (ya se probó en una base desechable con las 26 migraciones y con el e2e `d17-captacion-concurrencia`, `28ed17f`). La base de desarrollo local sigue en la 0023 y necesita la 0024 y la 0025 para probar a mano. Los alumnos registrados por enlace antes del lote quedaron como `manual`: el contador no los cuenta.
37. Seguimientos de seguridad de D17 (ver [[ADR-026-ciclo-de-vida-enlace-captacion-coach]] §5): `CrearEntrenadorSchema.coachCode` sigue aceptando un código manual por API (quitarlo del schema o exigir 8 o más caracteres); no hay métrica ni log agregado de los 404 públicos; no hay caducidad ni tope de usos por enlace; la lectura del cupo trae las filas en lugar de `count(*)`.

## Cronómetro de descanso y borrador de series (`8bcfa95`)
38. **Probar en un iPhone real** el cronómetro y el borrador (vibración inexistente, audio condicionado al gesto y al interruptor de silencio, JavaScript congelado con la pantalla bloqueada). Hoy el comportamiento en iOS no está verificado; pasos en la guía de pruebas, sección 1. Auditoría de contraste de los controles nuevos: no medida.
39. Seguimientos de ergonomía del entrenamiento del alumno (detalle en [[Handoff_Entrenamiento_Pendientes]] punto 9 y RF-001 §7.21): precarga del peso con el plan; repeticiones prellenadas con el objetivo (se envía `repsLogradas ?? repsObjetivo`); desmarcar una serie sin confirmación ni deshacer; `enterKeyHint` y seleccionar al enfocar; notas del modal de cierre con `text-xs` y etiquetas de 11 px; `aria-pressed` en «Listo»; deshabilitar «Restar 15 segundos» con el descanso terminado; avisar en la píldora que con la pantalla bloqueada no suena.
40. Límite multi-dispositivo del borrador (ADR-027 §3.10): en una serie pendiente prevalece lo tecleado en este dispositivo; se descartó la regla por marcas de tiempo. Sincronizar el cronómetro entre pestañas: descartado por YAGNI.

## Botón flotante del cronómetro y animaciones (`24d506f` y `4a84375`)
41. **Probar en un móvil real** lo no verificado del botón flotante y de `tw-animate-css` (guía de pruebas, sección 1): (1) modales `fixed inset-0` sin portal confinados por el `transform` de `animate-in` si se abren en los ~300 ms posteriores a cargar `AlumnoDetallePage`, `AlumnosPage`, `PagosPage` o `ModalPlanComercial`; (2) el panel expandido (~300 px) tapando el input que se edita con el teclado abierto (`index.html` no declara `interactive-widget`); (3) el aspecto real del movimiento, iOS, la vibración y el audio.
42. Seguimientos del botón flotante (RF-001 §7.21, [[ADR-027-cronometro-descanso-tiempo-absoluto-borrador-series]] §8): plegar el panel al enfocar un input o declarar `interactive-widget`; portalizar los modales de las páginas con `animate-in` o evitar el `transform` de la entrada; `animate-out` y salida animada de los modales (hoy se desmontan de golpe); deshabilitar «Restar 15 segundos» con el descanso terminado y avisar de la pantalla bloqueada también en la píldora (ítem 39). Efecto global ya vigente: todos los modales con `animate-in` se animan al entrar.
