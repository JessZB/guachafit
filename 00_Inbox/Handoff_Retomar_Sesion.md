---
id: HANDOFF-RETOMA
titulo: "Handoff: seguimientos abiertos tras la auditoría UX de las vistas del entrenador y del alumno"
fecha: 2026-11-03
estado: activo
tags:
  - handoff
  - retoma
  - ux
  - seguimientos
---

# 🔁 Seguimientos abiertos (UX-01 a UX-29, ZH-1, ZH-2, D11 a D15)

Los 29 lotes de la auditoría UX, la zona horaria del alumno (ZH-1 y ZH-2), el lote de pagos y los textos D12 están **cerrados y en `origin/main`**. Suite web al último cierre: **3152 tests en 376 archivos**, typecheck y build con código 0. Detalle de cada lote en [[Auditoria_UX_Vistas_2026-10-28]]; decisiones en [[ADR-025-zona-horaria-alumno-precarga-dispositivo-aviso-discrepancia]].

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
22. **[verificar]** `pagoVESBloqueadoPorFaltaTasa` devuelve `false` si falla la tasa, y se puede enviar en VES con «$— USD» (UX-21).
23. API `reportar-pago`: acepta `comprobanteStorageKey` sin verificar el prefijo `comprobantes/<alumno>/` (WARNING, UX-22).
24. API: el registro de idempotencia vive en memoria, y el índice `uq_transaccion_referencia_entrenador` excluye `efectivo_usd` y `efectivo_ves` (WARNING, UX-22).
25. Selector de método con la opción «(VES)»; `validarArchivoComprobante` valida por nombre y encajaría en `lib/comprobante-pago.ts`.
26. Corrección de un pago: el monto precargado se muestra con punto (`75.00`) mientras el resto de la pantalla usa coma.
27. Rechazados en la revisión de D12 y ZH-2 (reabrir si se toca esa zona): guarda de `asegurarComprobanteSubido`, renombrar `onNuevoAbono` a `onReportarPago`, sustituir `querySelectorAll` por `getByLabelText` en specs antiguos.

## Zona horaria
28. La agrupación «Hoy/Ayer» de notificaciones (`lib/notificaciones-in-app.ts`), los gráficos de evolución (`lib/evolucion-graficos.ts`) y el `timezoneCliente` de nutrición siguen con la zona del dispositivo.
29. Los endpoints `?timezone=` del entrenamiento aceptan lo que envía el cliente (costo T3 del ADR-025).
30. `SelectorZonaHoraria`: la hora «en vivo» se calcula al renderizar y no se actualiza sola.

## Transversales y proceso
31. Accesibilidad de carga (UX-02): spinners sin texto ni `role="status"` (`SyncQueuePanel`, `ComparadorFotos`, `ComparadorAntropometrico`, `PestanaAntropometriaAlumno`); `EstadoCarga` con el texto solo en `sr-only`; botones cuyo icono gira sin cambiar el rótulo.
32. **[verificar]** Formato y formularios (UX-03): preferencia de formato numérico por usuario (futuro); `CampoAjustes` sin las props ampliadas (`required`, `maxLength`, `name`, `ref`); sufijo que repite la unidad en `ModalPlanComercial` y `FormularioTasa`; límites teóricos de `formatDecimal`.
33. `/admin` muestra dos «Cerrar sesión» y monta dos `DialogoLogoutPendientes` (preexistente, UX-04).
34. **[verificar]** Hallazgos de prioridad baja sin cierre explícito: COB-14, COB-31, SEG-11 y CFG-12.

## Fuera de la auditoría
35. Módulo 5: anulación de cuotas en la web, congelar membresía, condonar, `PagosPage`, P2 de Control de Cobros y RNF-002.
36. Pendientes de la ficha del alumno en RF-011.
37. Cierre del ciclo: consolidar la auditoría y borrar `.external-agents/auditoria-ux/`.
