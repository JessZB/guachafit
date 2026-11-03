---
id: AUDITORIA-UX-2026-10-28
titulo: "Auditoría UX/UI de las vistas del entrenador y del alumno"
fecha: 2026-10-28
estado: activo
tags:
  - auditoria
  - ux
  - ui
  - accesibilidad
  - lotes
---

# Auditoría UX/UI de las vistas del entrenador y del alumno

Base: commit `541254e`, rama `main`. Reglas aplicadas: [[00_Reglas_Desarrollo_SDD]] §6 y [[ADR-022-estructura-componentes-atomicos-web]]. Cinco auditores leyeron el código sin ejecutar la app. **Todo lo que se dice de anchos a 360px está inferido por clases CSS, no medido.** Los números de línea de los componentes hijos son aproximados (±3) donde el reporte lo indicaba.

## 1. Resumen ejecutivo

141 hallazgos: 41 ALTA, 74 MEDIA, 26 BAJA, repartidos en cinco áreas:

| Área (prefijo de ID) | Vistas | ALTA | MEDIA | BAJA | Total |
|---|---|---|---|---|---|
| COB | Cobros del entrenador: Conciliación y Cartera | 8 | 17 | 6 | 31 |
| SEG | Dashboard, Monitor, Antropometría, Menú y navegación del entrenador | 11 | 16 | 5 | 32 |
| CFG | Plantillas y Ajustes del entrenador (Planes, Tasas) | 10 | 13 | 4 | 27 |
| ENT, NAV, PRO, MEN | Entrenamiento, Progreso, Menú y barra inferior del alumno | 5 | 16 | 3 | 24 |
| ALU | Nutrición, Pagos y Ajustes del alumno | 7 | 12 | 8 | 27 |
| **Total** | | **41** | **74** | **26** | **141** |

`CFG-27` es un hallazgo positivo (no tocar) contado como BAJA en el reporte.

### Los hallazgos más graves

| # | ID | Qué pasa |
|---|---|---|
| 1 | COB-18 | Al pasar el cobro en efectivo de USD a Bs., el monto precargado no se convierte: "50" USD queda como 50 Bs. y se puede registrar un cobro equivocado. |
| 2 | COB-03 | El motivo de rechazo no se limpia al cancelar: llega precargado al rechazo del pago de otro alumno. |
| 3 | ALU-01 | El formulario de pago del alumno arranca con `'1300.00'` (`use-reporte-pago.ts:73`): se puede enviar un monto inventado. |
| 4 | COB-01, COB-17 | Conciliación muestra "Bandeja al día" durante la carga inicial (`ConciliacionPage.tsx:37-41`); Cartera muestra "Sin tasa de cambio" a todos mientras carga. Vacíos falsos. |
| 5 | SEG-01 | Dashboard pinta "0 pendientes" mientras carga y también cuando la carga falla. |
| 6 | COB-02 | Si el rechazo falla, el error queda tapado por el modal que sigue abierto, y no hay estado "procesando" (doble envío). |
| 7 | CFG-10 | "Desactivar" un plan se ejecuta al primer clic, sin confirmación y sin bloqueo de doble clic. |
| 8 | ALU-05 | Adjuntar el comprobante de pago es un `div onClick` sin teclado ni rol: un usuario de teclado o lector no puede completar el flujo. |

Menciones siguientes: MEN-02 ("Listo para iniciar" es el valor por defecto, `AtletaMenuPage.tsx:242`), ENT-02 (finalizar sesión irreversible sin resumen de series), SEG-12 (tarjeta del Monitor con `onClick` sin foco), CFG-15 (código `ADR-003` visible, `ConversorTasas.tsx:76`, y chip "Vigente" sin tasa).

### Qué está bien (no tocar)

- Fechas: cada área usa el helper correcto (`formatFechaCalendario` para `YYYY-MM-DD`, `formatFechaLocal` para ISO); el único dudoso es ALU-12.
- Cobros: `Paginacion` ya cumple 44px; `ModalCobroCartera` es el patrón de error dentro del modal; todos los archivos de cobros caben en los límites.
- Ajustes: Perfil y "Correo y contraseña" (`components/ajustes/*`) tienen labels con `htmlFor`, `aria-describedby`, `role="alert"`, 44px y cambios sin guardar protegidos.
- Plantillas: estados vacíos que distinguen "sin resultados", "no hay plantillas" y error con Reintentar; confirmación inline y reversible al desactivar (CFG-27).
- Monitor: los chips del semáforo usan texto y número, no solo color.
- Entrenamiento del alumno: el spinner de `/app/hoy` solo aparece sin datos; el error de carga está separado del vacío con Reintentar; hay `AvisoDatosOffline`; los modales usan `useDialogoAccesible`; `ModoFoco` tiene región viva; los badges de medición usan `BadgeEstado`.
- Nutrición: el modo sin conexión y el error de carga son honestos (`ErrorCargaReporteHoy`, ALU-22); `SelectorSemaforo` usa icono, texto y `aria-pressed`; `inputMode` correcto; `DiarioFotografico` es el modelo de botón de adjuntar accesible.
- Pagos: los badges de estado ya usan `BadgeEstado`.

### Correcciones del orquestador a los reportes

- `DashboardPage.tsx` (386 líneas) y `AtletaMenuPage.tsx` (365) **pasan** el guardián `tamano-archivos.spec.ts` (tope 400 por archivo; las listas de excepciones están vacías). El tope de 300 por página es la regla de §6 y ADR-022, que el guardián solo impone a los contenedores ya trabajados: es **deuda frente a la regla, no un test rojo** (corrige SEG-03 y MEN-01).
- Verificados en código: `use-reporte-pago.ts:73` precarga `'1300.00'`; `ConciliacionPage.tsx:37-41` muestra la bandeja vacía con `total === 0` también en la carga inicial; `AtletaMenuPage.tsx:242` "Listo para iniciar" es el valor por defecto; `ConversorTasas.tsx:76` muestra "ADR-003" en texto visible.

## 2. Hallazgos transversales

**T1 · Vacíos falsos durante la carga y errores disfrazados.** COB-01, COB-17, SEG-01, SEG-02, MEN-02, CFG-13, ALU-22 (falta la variante `sin-datos` en Pagos). Corrección común: rama de carga antes de la de vacío (`ui/EstadoCarga` o esqueleto), contadores en "—" hasta tener datos, y error con `ui/EstadoError` + Reintentar en un canal separado del error de guardado.

**T2 · Recargas que tapan con spinner o pisan lo que hay.** CFG-20 (`use-plantillas-banco.ts:42-45`), PRO-01 (`use-evolucion-progreso.ts:24-26,47`), COB-24 (KPIs viejos con error), SEG-17 (por verificar), MEN-03 (el efecto no cancela). Corrección: distinguir `cargandoInicial` de `recargando`; con datos y fallo de recarga, aviso propio sobre la lista previa (patrón `AvisoErrorDirectorio`).

**T3 · `AvisoDatosOffline` / `use-frescura-offline` ausente.** COB-16, SEG-02, SEG-18, SEG-23, CFG-13, MEN-03, PRO-04. Reutilizar tal cual.

**T4 · Labels sin `htmlFor` / sin `useId`; errores sin `role="alert"` ni `aria-describedby`.** COB-06, CFG-07, CFG-14, CFG-18, ALU-02, ALU-05, ALU-27, PRO-03. Pieza común: ampliar `CampoAjustes` (ya resuelve id, `aria-invalid`, `aria-describedby`, `min-h-11`) con `inputMode='decimal'`, `select`, sufijo de unidad y `role="alert"`; usarlo en Planes, Tasa, Conversor y Pago del alumno.

**T5 · Objetivos táctiles menores de 44px y texto de 12px en inputs (zoom en iOS).** COB-05, COB-10, COB-12, COB-19, COB-23, SEG-12, SEG-13, SEG-21, SEG-23, SEG-30, CFG-07, CFG-10, CFG-21, ENT-01, ENT-07, PRO-02, ALU-03, ALU-06, ALU-08, ALU-10. Corrección: `BotonTactil` / `min-h-11`, inputs `text-base sm:text-sm`. En COB-19 el dueño puede aceptar `md:min-h-9` en escritorio (decisión del dueño, ver D3).

**T6 · Tabs con scroll horizontal o apretadas: tres copias de la barra y tres candidatos.** Copias: `PestanasFichaAlumno`, `PantallaAjustes.tsx:99-117` (CFG-02, ALU-23), `ajustes-entrenador/PestanasAjustes.tsx` (CFG-01, ALU-25). Candidatos: `PestanasCartera` (COB-22), `EncabezadoAntropometria` (SEG-20) y, si PRO-05 pasa a URL, las vistas de Progreso. Se extrae `ui/BarraTabsSegmentada` (lote UX-01):

```ts
export interface ItemTab<K extends string> {
  clave: K;
  etiqueta: string;          // corta, 11px en móvil
  icono: LucideIcon;
  ariaLabel?: string;        // nombre accesible largo (p. ej. "Correo y contraseña")
  indicador?: { texto: string; ariaLabel: string } | null; // punto en móvil, texto desde sm
}
interface BarraTabsSegmentadaProps<K extends string> {
  items: readonly ItemTab<K>[];
  activa: K;
  propsTablist: PropsTablist;       // de useTabsAccesibles
  propsTab: (clave: K) => PropsTab;
  ariaLabel: string;                // "Pestañas de la ficha del alumno" / "Secciones de ajustes"
}
```

- Columnas con mapa fijo (Tailwind v4 no admite clases dinámicas): `{2,3,4,5,6}`; el `2` sirve a Antropometría (SEG-20), el `4` a Cartera, el `5` a la ficha y Ajustes del entrenador.
- El DOM no cambia: los hijos directos del tablist siguen siendo `<button role="tab">`, con `role="img"` + `aria-label` en el indicador y `svg[aria-hidden="true"]`, porque el spec consulta rol, nombre y estructura (`PestanasFichaAlumno.interaccion.spec.tsx:133,148,178,195,247`).
- `PestanasFichaAlumno` queda como wrapper delgado (~30 líneas): arma `items` (Perfil, Pagos, Medidas, Entrenos, Nutrición, iconos actuales) y el `indicador` de deuda (`saldoDeudaUsd > 0` → `{texto:'$40.00', ariaLabel:'Saldo pendiente 40.00 dólares'}`), con `ariaLabel="Pestañas de la ficha del alumno"`. Correr ese spec antes y después.
- El conteo de `Planes (N)` y el contador de Cartera usan el mismo slot `indicador`; decidir al implementar si un contador numérico se muestra como número también en móvil (el punto está pensado para deuda).
- Etiquetas cortas de Ajustes (las claves `?tab=` no cambian): Perfil, Acceso (`ariaLabel` "Correo y contraseña"), Avisos, Planes, Tasa; alumno: Perfil, Acceso, Avisos, Horario (icono `Clock`, no `BellRing`). Los specs de Ajustes buscan `tab` "Correo y contraseña" (`AjustesPage.interaccion.spec.tsx:126,147`).

**T7 · `motion-reduce` ausente.** ENT-06 (`CtaFinalizarSesion.tsx:14`, `ResumenMetricasSesion.tsx:23`, `AtletaMenuPage.tsx:235`, `AppLayout.tsx:35`, `ProgresoPage.tsx:107,171,208`, `HubProgreso.tsx:35`, `ModalFinalizarSesion.tsx:44`, `BottomNav.tsx:59,62`, `IndicadorColaOffline.tsx:34`), SEG-15 (`animate-pulse` en el chip rojo), MEN-02. No hay regla global (el grep del auditor no halló `prefers-reduced-motion` en los `*.css` de `src`); solo `BadgeEstadoPagoAlumno.tsx:20` usa `motion-reduce`. Propuesta (lote UX-02): una regla global única en el CSS base que anule animaciones y transiciones bajo `@media (prefers-reduced-motion: reduce)` (duración mínima, una sola iteración, `scroll-behavior: auto`) más un spec que la verifique; así los `motion-reduce:` sueltos pasan a ser opcionales.

**T8 · Jerga y códigos internos visibles; etiquetas largas o con Title Case.** CFG-15 (chip "ADR-003 Vigente", `ConversorTasas.tsx:76`), COB-08b ("Presigned URL… TTL 15 min, ADR-007", "R2 no configurado"), SEG-25 (cinco nombres para el mismo destino), CFG-03, CFG-11, COB-13, COB-23 (bug "en En Mora"), COB-30, ALU-11, ALU-24, PRO-06, MEN-06, ENT-10 ("coach" vs "entrenador"). Referencias: [[ADR-003-deuda-maestra-usd-liquidacion-multitasa]], [[ADR-007-almacenamiento-fotos-privadas-cloudflare-r2-presigned-urls]].

**T9 · Valores precargados o afirmados sin datos.** ALU-01 (pago `1300.00`), ENT-09b (esfuerzo 8 enviado sin tocarlo), CFG-09 (plan nuevo con precio `40.00` y dos beneficios de ejemplo), COB-18 (monto USD que pasa a Bs.), COB-04 ("comprobante verificado"), SEG-06 ("Operación Activa"), MEN-02, CFG-15 ("Vigente" sin tasa), SEG-28/MEN-05 (nombre inventado desde el correo), SEG-24 (posible "undefined kg"), COB-17.

**T10 · Feedback de error o éxito lejos del punto de acción o sin anuncio.** `alert()` nativo: CFG-06 (`use-planes-comerciales.ts:75,110`). Error tapado o arriba de la página: COB-02, COB-11, ALU-04, SEG-22b, CFG-16. Corrección: error dentro del modal o junto al campo con `role="alert"`, éxito con `role="status"` y cierre manual, sin `setTimeout` sin limpiar (COB-11, SEG-22b, ALU-07b).

**T11 · Acciones irreversibles o difíciles de deshacer sin confirmación o sin resumen.** CFG-10 (desactivar plan), ENT-02 (finalizar sesión), COB-26 y COB-18 (cobro en efectivo "aprobado al instante"), COB-27 (el recordatorio sale antes de verse), CFG-08 y PRO-05 (se pierde lo escrito al cerrar), COB-02. Reutilizar `DialogoConfirmacion` (`variante="peligro"`, `confirmarDeshabilitado`) o el patrón de resumen previo, no un segundo diálogo cuando basta una línea.

**T12 · Páginas por encima de 300 líneas.** `DashboardPage.tsx` 386 (SEG-03) y `AtletaMenuPage.tsx` 365 (MEN-01): deuda frente a la regla, el guardián no falla (ver correcciones). Cerca del límite: `AjustesPage.tsx` 258 (baja a ~120 con UX-17), `CoachMenuPage.tsx` 287, `ModalPlanComercial.tsx` 245 (se reduce con `CampoAjustes`).

**T13 · Otros patrones repetidos.** Badges propios sin `whitespace-nowrap shrink-0` y `truncate` sobre datos clave: COB-09, COB-21, SEG-08, SEG-15, SEG-16, CFG-11, CFG-23, ENT-08, MEN-04, ALU-06, ALU-18 → `ui/BadgeEstado` y `line-clamp-2 break-words`. Paginación solo arriba de la lista: COB-12, SEG-17. Estados de carga/error/vacío duplicados de `ui/`: COB-01, COB-14, COB-24, SEG-18, SEG-23, CFG-13. Tarjeta clicable sin patrón de enlace extendido: SEG-04, SEG-07, SEG-12 (decisión 10, `pointer-events-none`). Modales a mano con el mismo armazón: COB-02, COB-26, COB-27, COB-08 → `common/ModalAccesible` (overlay, título, cierre 44px, `max-h-[90vh] overflow-y-auto`, `error`, `procesando`).

## 3. Plan de lotes unificado

Orden: fundaciones transversales (UX-01 a UX-04), luego Entrenador, luego Alumno. ⛔ = depende de una decisión pendiente (sección 4). "API" indica si toca API o datos (requiere decisión del dueño). Todos son sin API salvo donde se indica.

| ID | Lote | Vistas | Resuelve | Reutiliza / crea | Riesgo | API | Dependencia |
|---|---|---|---|---|---|---|---|
| UX-01 ✅ `8cc2a89` | Extraer `ui/BarraTabsSegmentada` | Ficha del alumno (wrapper) | base de CFG-01, ALU-23, ALU-25, COB-22, SEG-20 | `PestanasFichaAlumno`, `use-tabs-accesibles`; spec nuevo | bajo-medio (spec de la ficha) | no | ninguna |
| UX-02 ✅ `a670b4b` | Regla global `motion-reduce` | Toda la app | ENT-06, SEG-15 (parte) | CSS base | bajo | no | ninguna |
| UX-03 ✅ `e071bf4` | Piezas compartidas de formulario y formato | `components/ajustes/CampoAjustes`, `lib/` | ALU-27, base de CFG-07, CFG-14, CFG-18, ALU-02; COB-15, SEG-09 | `CampoAjustes` + `inputMode`/sufijo/`select`/`role="alert"`; helper `formatMonto` | bajo | no | ninguna |
| UX-04 ✅ `d482f4f` | Cabecera: sincronización táctil y menú "Cuenta" | Header (todos los roles) | ENT-01, SEG-30 | `MenuAccionesAlumno` (Radix), `BotonTactil`, `IndicadorColaOffline` | medio (compartido con alumno) | no | ninguna |
| UX-05 ✅ `d777772` | Cobros: carga y datos honestos | Conciliación, Cartera | COB-01, COB-04, COB-16, COB-17, COB-24 | `EstadoCarga/Error/Vacio`, `AvisoDatosOffline`, `EsqueletoDirectorio`; borra `ErrorBandejaConciliacion` | bajo | no | ninguna |
| UX-06 ✅ `87fe4df` | Cobros: rechazo seguro | Conciliación | COB-02, COB-03, COB-06 | `DialogoConfirmacion` peligro o `ModalAccesible`, `BotonTactil` | medio (specs de interacción) | no | ninguna |
| UX-07 ✅ (a `bc64170`, b `d1f90b4`) | Cobros: táctil, badges y tabs en móvil | Conciliación, Cartera | COB-05, 07, 08(a,c,d), 09, 10, 12, 19, 20, 21, 22, 23, 25 | `ChipFiltro`, `BotonTactil`, `BadgeEstado`, `BarraTabsSegmentada`, `MenuAccionesAlumno` | medio | no | UX-01; ⛔ D3 (menú "Más" en COB-20) |
| UX-08 ✅ `feacbed` | Cobros: modal de cobro y feedback | Cartera | COB-18, COB-26, COB-11 | `useId`, `inputMode`, `role="status"`, línea resumen previa | medio | no (salvo conversión con tasa del servidor) | ⛔ D1; UX-03 |
| UX-09 ✅ (a `3784301` API, b `16577b9` web) | Cobros: recordatorio y enlace a la bandeja | Cartera → Conciliación | COB-27, COB-28 | `?q=` en `useFiltrosConciliacion`, `onError` de miniatura | medio | **sí** para la vista previa del mensaje | ⛔ D2 |
| UX-10 ✅ `f078d15` | Cobros: copy y pulido | Conciliación, Cartera | COB-13, 14, 15, 29, 30, 31, 08b, 16 (resto) | `EstadoVacio`, `formatMonto` | bajo | no | UX-03 |
| UX-11 ✅ `57606e8` | Dashboard: carga honesta | Dashboard | SEG-01, SEG-02, SEG-06 | `EstadoCarga/Error`, `AvisoDatosOffline`, `use-frescura-offline` | bajo | no | ninguna |
| UX-12 ✅ `97017b8` | Dashboard: partir la página (<300) | Dashboard | SEG-03, SEG-10 | `use-dashboard-comando`, `GridKpisDashboard`, `BandejaPagos`, `ListaRiesgoDashboard`, fixture demo | medio (specs) | no | UX-11 |
| UX-13 ✅ `8a5c6f1` | Dashboard: KPI y filas accionables | Dashboard | SEG-04, 05, 07, 08, 09, 11 | enlace extendido, `FranjaDatosClaveAlumno`, `BadgeEstado`, `formatMonto` | medio | no (rutas existentes) | UX-12, UX-03; ⛔ D4 (SEG-05) |
| UX-14 ✅ `da5c851` | Monitor: táctil y estados | Monitor | SEG-12, 13, 14, 15, 16, 17, 18, 19 | `ChipFiltro` con conteo, enlace extendido, `BotonTactil`, `Paginacion` al pie | medio (spec C15 caracteriza el defecto actual) | no | UX-02 |
| UX-15 ✅ `8cfb73f` | Antropometría del entrenador en móvil | Antropometría | SEG-20, 21, 22, 23, 24 | `BarraTabsSegmentada` (2 columnas), `BotonTactil`, `BadgeEstado`, `EstadoError` | medio | no (búsqueda en servidor sí: aparte) | UX-01 |
| UX-16 ✅ `cf4bd84` | Navegación y menú del entrenador | Menú, BottomNav, Sidebar | SEG-25, 26, 27, 28, 29, 31, 32 | tabla única en `lib/etiquetas-dominio`, `FranjaDatosClaveAlumno`, insignias con conteo | medio-alto (specs por nombre, p. ej. `Sidebar.spec.tsx`) | no con `dashboard-comando`; endpoint ligero sí | ⛔ D4, D5; UX-04 |
| UX-17 ✅ `14c796e` | Ajustes: una pantalla y tabs segmentadas | Ajustes (entrenador y alumno) | CFG-01, 02, 03, 04, 05; ALU-23, 24, 25 | `BarraTabsSegmentada`, `PantallaAjustes` con `renderPestana`; se elimina `PestanasAjustes` | medio-alto (specs de `AjustesPage` y `PantallaAjustes`) | no | UX-01; ⛔ D6 |
| UX-18 ✅ `e7851f3` | Planes comerciales | Ajustes > Planes | CFG-06, 07, 08, 09, 10, 11, 12, 13 | `CampoAjustes`, `DialogoConfirmacion`/confirmación inline de `TarjetaPlantilla`, `BadgeEstado`, `EstadoCarga` | medio | no | UX-03, UX-17; ⛔ D7 (CFG-09, CFG-11) |
| UX-19 ✅ `ed28ed6` | Tasa de cambio sin jerga y accesible | Ajustes > Tasa | CFG-14, 15, 16, 17, 18, 19 | `CampoAjustes`, `<details>` con resumen guardado (patrón `PestanaAntropometriaAlumno`), `AvisosAjustes` | bajo-medio (specs de textos de tasa) | no | UX-03, UX-17 |
| UX-20 ✅ `1b364c4` | Plantillas: recarga honesta y táctil | Plantillas | CFG-20, 21, 22, 23, 24, 25, 26 | `BadgeEstado`, patrón `AvisoErrorDirectorio` | bajo | no | ninguna |
| UX-21 ✅ `87c732d` | Pago del alumno: formulario honesto y accesible | Pagos > Reportar pago | ALU-01, 02, 03, 04, 05, 06, 08, 09, 10 | `CampoAjustes`, `AvisosAjustes`, modelo `DiarioFotografico`, `BotonTactil` | medio (specs con `1300.00` y localización por `parentElement`) | no | UX-03; ⛔ D8 |
| UX-22 ✅ `3bfce29` | Pago del alumno: idempotencia | Pagos | ALU-07 | reutilizar `storageKey` en el reintento; clave de idempotencia | medio | **sí** (ya existía en API) | UX-21; ⛔ D8 |
| UX-23 ✅ `6271cce` | Nutrición: ventana, calendario y campos | Nutrición | ALU-16, 17, 18, 19, 21 | `horaDeZona`, `HORA_INICIO_VENTANA_CHECKIN_NUTRICIONAL`, `rutaAjustes`, `validarCamposOpcionalesCheckin`, `pluralizar` | bajo-medio | no | UX-03 |
| UX-24 ✅ `48a3d1e` | Menú y navegación del alumno: honesto y partido | Menú, BottomNav | MEN-01 a MEN-06, NAV-01 | `use-resumen-menu`, `TarjetaEntrenarHoy`, `TarjetaAccesoAlumno`, `ChipRacha`, `BadgeEstado`, `EstadoError`; `aria-label` en la barra | medio (el cuarto destino es aparte) | no | UX-02; ⛔ D5 solo para el cuarto destino |
| UX-25 ✅ `3d90202` | Sesión de entrenamiento: táctil y chips | `/app/hoy` | ENT-04, 05, 07, 08, PRO-02 | `BotonTactil`, `BadgeEstado`, `CampoMedidaCheckin` | bajo | no | UX-02 |
| UX-26 ✅ `70cfe33` | Cierre de sesión seguro | `ModalFinalizarSesion` | ENT-02, 03, 09(a,b), 10; ENT-09(c) | `DialogoConfirmacion`/`ModalCierreVacio`, `CtaFinalizarSesion` parametrizable | medio | no; ENT-09(c) toca el formato de `notas` | ⛔ D10 solo para (c) |
| UX-27 ✅ `253b69d` | Progreso: carga y formulario | Progreso | PRO-01, 03, 05, 06, 07 | `EstadoCarga`, `AvisoErrorEvolucion`, `?vista=` en URL, aviso "Cambios sin guardar" | medio | no | UX-05 como referencia de patrón |
| UX-28 | ✅ `9c8c039` | Check-in sin conexión | Progreso > Check-in | PRO-04 | `AvisoDatosOffline` con `isOnline`, `use-frescura-offline`, guarda síncrona en `useCheckinAntropometrico` | bajo (D9: avisar y bloquear) | no | UX-27; ✅ D9 |
| UX-29 | ✅ `0ebda43` | Pulido del alumno: fechas, copy y zona horaria | Pagos, Ajustes alumno | ALU-11, 12, 13, 14, 15, 26 | `formatFechaLocal`, `horaDeZona`, `textoHoraActualEnZona`, `flex-wrap`, unificación a entrenador y Bs. | bajo | no | UX-17 |

Cobertura: los hallazgos BAJA no listados se resuelven con el lote de su área al pasar por el archivo.

**Seguimientos de UX-01 (revisión de fiabilidad, 2026-10-28), a resolver al ampliar el átomo en UX-17 / UX-07:**
- `icono` debe pasar a opcional: `PantallaAjustes` y `PestanasCartera` no usan icono.
- El slot `indicador` hoy es solo de alerta (`bg-danger-strong`, punto en móvil). "Planes (N)" y los contadores de Cartera necesitan una variante neutra visible también en móvil, con fondo según tab activo o inactivo (`bg-primary-foreground/20` / `bg-background/60`).
- `ariaLabel: ""` en un item deja el tab sin nombre accesible: usar `aria-label={ariaLabel || undefined}` (`BarraTabsSegmentada.tsx:80`).
- Con 1 item la barra usa `grid-cols-2` (columna vacía): documentar que el átomo exige 2 o más.
- Menor: `toBeTruthy()` redundante sobre `getBy*` en `BarraTabsSegmentada.interaccion.spec.tsx:254,256-258,316`.

**Seguimientos de UX-02 (revisión de fiabilidad, 2026-10-28), a resolver con el lote de cada área:**
- Spinners sin texto ni `role="status"`, quietos con movimiento reducido: `SyncQueuePanel.tsx:182`, `ComparadorFotos.tsx:235`, `ComparadorAntropometrico.tsx:220,289,339`, `PestanaAntropometriaAlumno.tsx:86`. Corrección: texto visible o `ui/EstadoCarga`.
- `ui/EstadoCarga` (`EstadoCarga.tsx:28`) solo tiene el texto en `sr-only`: con movimiento reducido, quien ve la pantalla solo ve un círculo quieto. Valorar texto visible.
- Botones cuyo icono gira pero el rótulo no cambia (p. ej. `DialogoConfirmacion.tsx:93`, `SyncQueuePanel.tsx:261,321`, `CabeceraMonitor.tsx:78`): valorar un rótulo en gerundio mientras procesan.

**Seguimientos de UX-03 (revisión de fiabilidad, 2026-10-28):**
- **Decisión del dueño:** formato venezolano por defecto (`$1.900,00`); en el futuro, preferencia por usuario (coma o punto decimal). El primer lote que use `formatMonto` en una vista (UX-08, UX-10 o UX-13) crea `useFormatoNumero()` y las vistas consumen el hook (regla §6.17).
- Al adoptar `CampoAjustes` (UX-18, UX-19, UX-21), ampliar según lo necesite cada lote: `required`, `maxLength`, `onBlur`, `name`, `autoFocus`, `ref` y una variante `font-mono` para cifras. `SelectAjustes` solo admite valores `string` (la duración del plan es numérica: convertir en el consumidor).
- Con `sufijo`, quitar la unidad entre paréntesis de la etiqueta (`ModalPlanComercial.tsx:137`, `FormularioTasa.tsx:149,161`): si no, el lector de pantalla la anuncia dos veces.
- Límites teóricos de `formatDecimal` (`toFixed`): `1.005` → `1,00`, `decimales` fuera de 0–100 lanza `RangeError` y los enteros por encima de 2^53 pierden precisión. Con los datos del API (`numeric(10,2)` y tasas de 4 decimales) no se dan.
- Menor: el spec de `CampoAjustes` fija clases de Tailwind (`flex`, `text-base`) por falta de alternativa en jsdom.

**Seguimientos de UX-04 (revisión de fiabilidad, 2026-10-29):**
- **Decisión del dueño:** "Instalar app" visible (44px) fuera del menú; tema, Ajustes y cierre de sesión en "Cuenta" en todos los tamaños.
- `/admin` muestra dos "Cerrar sesión" y monta dos `DialogoLogoutPendientes` (`CabeceraAdmin.tsx:32-41`, `AdminPage.tsx:91,141-149`); preexistente. Retirar los de la página exige ajustar `AdminPage.caracterizacion.interaccion.spec.tsx:297`.
- `Header.interaccion.spec.tsx` simula `InstalarAppPrompt` con un doble: falta un test de integración con el componente real (eventos `beforeinstallprompt`).
- El ancho a 360px está calculado (338px en el peor caso) y no medido: confirmarlo en el navegador. Con el texto del sistema ampliado puede desbordar.

**Seguimientos de UX-05 (revisión de resiliencia, 2026-10-29):**
- **UX-07 suma el lote web P2 del módulo 5:** mostrar el próximo vencimiento en la tabla de Cartera (RF-009, la API ya lo envía).
- `common/AvisoErrorRecarga` es la pieza común para recargas fallidas con datos visibles. `alumnos/AvisoErrorDirectorio` queda como reexport; migrar sus usos y borrarlo cuando se toque "Mis alumnos".
- ~~`use-bandeja-conciliacion.ts` sigue exponiendo `enCargaInicial`~~: retirado en UX-06.

**Seguimientos de UX-06 (revisión de fiabilidad, 2026-10-29), para UX-08 (feedback de acciones, COB-11):**
- `actionError` de una aprobación fallida no se limpia al abrir un rechazo ni tras un rechazo correcto: pueden convivir el error viejo y el éxito nuevo (`use-acciones-conciliacion.ts:109-121`).
- El `setTimeout` del mensaje de éxito no se cancela al desmontar (`use-acciones-conciliacion.ts:113`, preexistente).
- Menor: el test 5 de `ConciliacionPage.rechazo-seguro.interaccion.spec.tsx:331` no espera la promesa que resuelve al final.
- `useFormatoNumero()` ya existe (`lib/use-formato-numero.ts`): los lotes que muestren montos (UX-08, UX-10, UX-13) lo usan.

**Decisión D3 (dueño, 2026-10-29):** en Control de Cobros, en el móvil se ve solo "Registrar cobro" y un menú "Más acciones" con Recordatorio y Ver ficha (patrón `MenuAccionesAlumno`). Los botones miden 44px en el móvil; en la tabla de escritorio pueden compactarse a 36px desde `md` (`md:min-h-9`).

**UX-07 se partió en dos:** UX-07a (Conciliación: COB-05, 07, 08, 09, 10 y 12) ✅ `bc64170`, y UX-07b (Cartera: COB-19, 20, 21, 22, 23 y 25, más el lote web P2 del módulo 5, el próximo vencimiento en la tabla).

**Seguimientos de UX-07a (revisión de legibilidad, 2026-10-29), para UX-10:**
- **"pago movil" sin tilde:** `etiquetaMetodoPago` (`lib/conciliacion-filtros.ts:24`) solo cambia `_` por espacio. Hacen falta un mapa de etiquetas en español ("Pago móvil", "Transferencia bancaria", "Efectivo"…) y el ajuste de los ~10 specs que esperan "movil". El selector de A1 en `FiltrosConciliacion.interaccion.spec.tsx:52` acepta hoy ambas formas (`/pago m[oó]vil/i`), una excepción aceptada en la verificación.
- Title Case en tarjeta y visor: "Ver Comprobante", "Fecha Operación", "Abono en Dólares", "Monto Declarado", "Equivalente USD". Al cambiar "Ver Comprobante", darle nombre accesible por alumno.
- `alt="Comprobante Bancario"` → "Comprobante de pago" (`VisorComprobanteConciliacion.tsx:112,120`).
- "Abrir original" (`target="_blank"`) no anuncia que abre una pestaña nueva.
- Modal de rechazo: "Rechazar Transacción" y "Confirmar Rechazo" → "Rechazar pago" y "Confirmar rechazo".
- Montos de la tarjeta y del visor sin `useFormatoNumero` (`+$${…} USD` crudo): COB-15.
- Proceso: la verificación editó un spec nuevo del lote sin autorización. Reforzar en los prompts que **cualquier** cambio no autorizado se reporta y no se aplica.

**Seguimientos de UX-07b (revisión 4R, 2026-10-29):**
- **COB-25 restante:** los KPI "Total en Mora" y "Próximos a Vencer" no enlazan a su pestaña, porque `useCartera` lee `?pestana=` solo al montar. Para UX-13 (KPI accionables) o UX-10.
- **Modales de cobro y de recordatorio de COB-19** (botones de 36-40px, cierres de unos 28px): van con UX-08 y UX-09, que rehacen esos modales.
- **UX-10:** los KPI de `ResumenCartera` siguen en Title Case ("Recaudado del Mes", "Total en Mora", "Próximos a Vencer", "Pagos por Validar") frente a las pestañas en *sentence case*.
- `MenuAccionesFilaCartera` repite la estructura de `MenuAccionesAlumno`. Si aparece un tercer menú de acciones por fila, extraer un `common/MenuAcciones`.
- La lógica de qué acción se ve (`AccionesFilaCartera.tsx`) vive en el componente. Si crece, pasarla a `lib/acciones-cartera.ts` con su test.
- `BarraTabsSegmentada` ya tiene la variante `contador` del indicador (seguimiento de UX-01 resuelto). Sigue pendiente el icono opcional (lo necesitan `PantallaAjustes` y UX-17).
- Proceso: tercer falso rojo (E2 pulsaba dos opciones de un menú Radix que se cierra tras la primera). Al revisar un rojo de interacción, comprobar que el test **podría** pasar con un código correcto.

**Decisión D1 (dueño, 2026-10-29):** al cambiar la moneda de un cobro en efectivo, el monto se vacía y antes del botón se muestra "Se registrarán … (≈ $… USD)".

**Seguimientos de UX-08 (revisión 4R, 2026-10-30):**
- **API:** rechazar con 409 un reintento con la misma clave de idempotencia y un payload distinto (por ejemplo, otra moneda tras una respuesta perdida). Hoy devuelve el cobro original y el cliente informa de un éxito.
- **Ficha del alumno:** `ModalCobroSala` / `use-cobro-sala.ts` debe adoptar D1 (`normalizarMontoCobro` y `resumenDeCobro` de `lib/cobro-sala.ts`) y quitar el monto inicial fijo `'40.00'` (dato fabricado, T9).
- **UX-10:** las etiquetas "Moneda" y "Fecha" del modal de cobro (`text-foreground`) no coinciden con "Monto" de `CampoAjustes` (`text-muted-foreground`). `SelectAjustes` no admite deshabilitar una opción. El aviso de saldo a favor de la bandeja no nombra al alumno.
- Proceso: dos falsos verdes en la fase roja (el temporizador sin vaciar el render de React 19 y el aviso "unmounted" que React 19 ya no emite). Un rojo con tests que **pasan** con el código defectuoso también se revisa.

**Decisión D2 (dueño, 2026-10-30):** vista previa del recordatorio con un endpoint de solo lectura en el API. UX-09 se partió en UX-09a (API) ✅ `3784301` y UX-09b (web).

**Para UX-09b (revisión 4R de UX-09a):**
- Pedir la vista previa **solo al abrir el modal** del alumno, nunca por fila de la tabla (riesgo de N+1).
- Mostrar el `cuerpo` exacto. Si `puedeEnviar` es `false`, mostrar el `mensaje` (motivo) y deshabilitar el envío. Tras enviar, mostrar el `mensajeSugerido` real.
- Sigue en UX-09b lo de la web: `?q=` a la bandeja ("Revisar en bandeja"), `onError` de la miniatura y los botones, `role="status"` y "Copiado" del modal de recordatorio (COB-19, COB-26, COB-28).
- **Seguimientos del API:** la consulta del cooldown (`notificaciones_in_app`) va fuera de `withTenant`, pero solo se ejecuta tras comprobar el perfil dentro de él (preexistente, sin fuga). Hay una lectura duplicada de `perfiles_alumno` en `obtenerTasaVigenteEnCaso`. Falta una huella del mensaje entre la vista previa y el envío. El montaje de mocks está duplicado entre los specs `rf009-cartera-*`.
- COB-16 parcial: las tarjetas siguen siendo `div` sin `article`/`aria-labelledby` y los `h3` de los estados no tienen jerarquía respecto al `h1`. Va con UX-10.
**UX-09b cerrado (`16577b9`):** modal con vista previa, `?q=` de un solo uso a la bandeja y miniatura con `onError`. Seguimientos:
- **UX-10:** la tarjeta móvil de "Pendiente de Revisión" no muestra la miniatura (reutilizar `MiniaturaComprobante` de `TablaEscritorioCartera.tsx`). El texto demo del recordatorio usa `$X.XX USD` sin `formatMonto`.
- **API:** la búsqueda de la bandeja es local a la página cargada; un `?q=` cuyo pago está en otra página da "Sin resultados". Aceptar `busqueda` en el endpoint de la bandeja lo resolvería.
- **Tests:** falta cubrir el rechazo de `navigator.clipboard.writeText` (mensaje de copia manual).
- Proceso: en la fase roja dos specs nuevos rompían `tsc` (props nuevas sin pasar y un enum inexistente) aunque vitest pasaba. La verificación debe incluir siempre el typecheck. Un filtro de mock por `includes('/recordatorio')` capturó también el GET nuevo: al añadir un endpoint con prefijo común, revisar los filtros de los specs existentes.
**UX-10 cerrado (`f078d15`):** vocabulario "Cobros" / "Control de cobros" / "Pagos por validar", copy en *sentence case*, montos con `useFormatoNumero`, `article` y `caption`, miniatura en el móvil. Seguimientos:
- `MetricCard` duplica `BadgeEstado` (mapa de variantes propio, `danger` con `destructive`): unificar cuando se toque el Dashboard (UX-11/12).
- Lado del alumno: "Ver Comprobante Subido", "Captura del Comprobante Bancario" y `alt="Comprobante bancario"` siguen en Title Case (UX de Pagos del alumno). `lib/saldo-a-favor.ts` sigue con montos `toFixed(2)`.
- `textoSaldoBs` con un dato no numérico pinta `—` sin ayuda accesible.
- Los KPI "Total en mora" y "Próximos a vencer" siguen sin enlazar a su pestaña (para UX-13).
- Proceso: primer lote con el agente externo lanzado por Claude (§7.6). Un reporte reescribió prefijos de rutas; la evidencia pasa a ser el JSON de vitest. Un falso verde (regex sin anclar `/\$25,00/`) lo detectó la revisión de fiabilidad: en los contratos de texto, pedir `getByText` exacto.
- Proceso: en la fase roja de UX-05, C2 falló por un selector equivocado ("Pagos por Validar" en lugar de "Pendiente de Revisión") y el reporte lo dio por bueno. Al revisar un rojo, comprobar el **mensaje** de cada fallo, no solo que falle.

**UX-11 cerrado (`57606e8`):** `EstadoCarga`, `EstadoError` y `AvisoDatosOffline` en el Dashboard; sin ceros falsos ni badge "Operación Activa"; página de 385 a 163 líneas con tres componentes en `components/entrenador/dashboard/`. Web 2735/2735. Seguimientos (van con UX-12, que parte la página y crea `use-dashboard-comando`):
- El efecto de carga no tiene limpieza ni contador de generación: una respuesta tardía puede pisar el estado si cambia `isDemoMode` o se desmonta. `setDashboard(null)` del `catch` debe conservar los datos si se añade una recarga (hoy no es alcanzable).
- No hay recarga automática al volver la conexión: queda el "Reintentar" manual.
- El spec no cubre adherencia nula (`—` y "Sin dato"), meta de cobranza nula, más de 5 filas con "Ver todos (N)" ni las listas vacías.
- `MetricCard` sigue duplicando `BadgeEstado` (SEG-03, para UX-12).
- Proceso: primer lote entero con la orquestación de Orca (`00_Reglas_Desarrollo_SDD.md` §7.6 actualizada). La revisión de fiabilidad declaró un BLOCKER que no era alcanzable: antes de aceptar un BLOCKER, buscar quién llama a la función y si la línea ya estaba en `HEAD`. El resumen del worker dijo "983 archivos" (son 286 archivos y 983 suites): la cifra sale del JSON.

**UX-12 cerrado (`97017b8`):** hook `use-dashboard-comando` con contador de generación, conservación de datos en recargas fallidas y sin datos demo al salir del modo demo; fixture en `lib/dashboard-comando-demo.ts`; `ListaRiesgoDashboard` única; `MetricCard` sobre `BadgeEstado` (badges en mayúsculas y token `danger`); página de 163 a 83 líneas. Web 2754/2754. Resuelve los seguimientos de UX-11, salvo estos:
- Sin recarga automática al volver la conexión (queda el "Reintentar" manual).
- Sin tests de los casos borde de `KpisMacroDashboard` (adherencia nula, meta nula).
- `recargar()` llama al API también en modo demo (inalcanzable desde la UI).
- SEG-10: los nombres "Panel administrativo" y "Resumen del Negocio" siguen distintos del Sidebar; van con las etiquetas únicas (SEG-25).
- Proceso: el reporte de la fase roja inventó títulos de tests, mensajes con clases inexistentes y una "suite preexistente fallida"; los specs eran correctos. La tabla del reporte no es evidencia: se contrasta con el JSON y con los `it(` del spec. En la verificación, L3 y L4 fallaron por falta de `cleanup` (con `globals: false`, Testing Library no limpia el DOM entre tests): todo spec nuevo de componentes importa `cleanup` y lo llama en `afterEach`.

**UX-13 cerrado (`8a5c6f1`, decisión D4 «qué atender hoy»):** la franja «Requiere tu atención» (`FranjaAtencionDashboard`) va arriba; las filas de riesgo enlazan a la ficha; «Contexto del negocio» tiene los KPI enlazados (`MetricCard` con `enlace`, sin `hover` falso) y los montos con `useFormatoNumero`; sin emoji ni badge "Montos en USD"; `p-4 sm:p-6`. Web 2772/2772. Seguimientos:
- Cumplimiento semanal con el decimal crudo (`84.50%`): usar `formatDecimal`.
- Sin recarga automática al volver la conexión.
- SEG-10 (nombres de la pantalla) va con SEG-25 en UX-16. Las insignias de pendientes en la navegación (SEG-26/27) pueden reutilizar los conteos de la franja.
- "Ver todos" solo aparece con más de 5 filas (SEG-07 pedía también con 1 a 5): se mantuvo el tope, porque cada fila ya enlaza a la ficha.
- Proceso: la revisión encontró una regresión visual fuera del Dashboard (Control de cobros perdía el `hover` al condicionarlo en `MetricCard`). Al cambiar un componente de `common/`, el prompt de revisión debe nombrar todos sus usos.

**UX-14 cerrado (`da5c851`):** tarjeta del Monitor con enlace extendido (el nombre abre la actividad; el chevron va a la ficha; 44px), `BadgeEstado` con `motion-safe:`, nombres en dos líneas, "Última sesión:" y racha solo si es mayor que 0. Chips `ChipFiltro` con etiquetas cortas, `BotonTactil`, buscador de 16px en el móvil, paginación al pie (`Paginacion` con `etiqueta` y `anunciarEstado`), recarga fallida sin tapar la lista ni los filtros, avisos sin conexión y estados sobre `ui/`. Web 2793 tests en 299 archivos. Seguimientos:
- El estado vacío de filtros sigue con la guarda `!error` (ya estaba en `HEAD`): tras una recarga fallida con 0 resultados no se ve el vacío.
- En modo demo y sin conexión se muestra "sin datos": TanStack pausa también la consulta demo (haría falta `networkMode: 'always'` en demo).
- Falta un test del clic en la paginación del pie. `ModalActividadAlumno.tsx:166` mantiene `animate-pulse` sin `motion-safe`.
- Proceso: Antigravity cortó una revisión con "network issue": se canceló con `orca orchestration worker-stop` (un worker sin terminar no se puede liberar) y se relanzó. Una pasada de la suite completa perdió 6 archivos (293 de 299): cada validación debe comparar el número de archivos con el de la fase roja. El contrato MP6 citaba el texto "Mostrando…", tomado de un reporte sin comprobarlo en el código. Los textos de la UI se copian del código, nunca de un reporte. Un mensaje de `orchestration send` al worker en curso corrigió el contrato sin relanzarlo. Los specs de páginas con TanStack restauran `onlineManager.setOnline(true)` en `beforeEach` y `afterEach`.

**UX-15 cerrado (`8cfb73f`):** pestañas con `BarraTabsSegmentada` ("Por revisar" con contador y "Comparar") y paneles `tabpanel`; tarjeta con el alumno como `h3`, `BadgeEstado`, `BotonTactil` apilados y "—" sin peso; éxito con `role="status"` y cierre manual; `EstadoError` solo en "Por revisar"; `EstadoCarga`, avisos sin conexión y `AvisoErrorRecarga`; vacíos con `EstadoVacio`; buscador táctil "Buscar en esta página…". Web 2811 tests en 303 archivos. Revisión sin BLOCKER ni WARNING. Seguimientos:
- El aviso de éxito sigue visible al pasar a "Comparar" (se puede limpiar en `onCambiarPestana`).
- Faltan tests de la recarga fallida con datos y de grasa o cintura ausentes.
- La búsqueda sigue siendo local a la página (búsqueda en servidor: toca API).
- `EstadoVacio` no admite icono en su acción: "Limpiar búsqueda" perdió el icono `RotateCcw`.
- `useTabsAccesibles` se llama en el encabezado y en la página con el mismo `idBase`. Si alguna vez gestiona el foco con estado propio, conviene pasar `propsTab` y `propsPanel` desde una sola llamada.

**UX-16 cerrado (`cf4bd84`, decisión D5):**
- `DESTINOS_ENTRENADOR` es la fuente única de los nombres. Se aplican "Panel", "Seguimiento", "Evaluaciones" y "Mis alumnos", y se mantienen "Control de cobros" y "Pagos por validar".
- Insignias de pendientes (`usePendientesNavegacion` + `InsigniaConteo`) en el Sidebar, la BottomNav y el menú. Se invalidan al conciliar una evaluación o un pago y al cobrar en efectivo.
- Saludo con el nombre real del perfil y sin badges decorativos.
- Foco visible e iconos `aria-hidden`; sin doble relleno inferior.
- Web 2827 tests en 308 archivos. Revisión 4R sin BLOCKER.

Seguimientos:
- SEG-31: tablet (768-1023px) con solo tres destinos en la BottomNav; no se tocó.
- El cobro en sala de la ficha (`alumno-detalle/use-cobro-sala.ts`) no invalida la insignia de mora. En demo las insignias no cambian al conciliar.
- Faltan tests de conteo 0 en Sidebar y BottomNav y de las tarjetas secundarias del menú con insignia.
- `useDashboardComando` (Panel) y `usePendientesNavegacion` piden el mismo endpoint por separado: en el Panel hay dos peticiones. Migrar el hook del Panel a TanStack con la misma clave las unificaría.

Proceso:
- Por preferencia del dueño, el lote no añadió specs que solo comprueban textos de navegación: la constante única evita la deriva.
- Un spec usaba un import dentro de `vi.hoisted`. En la fase roja no se vio porque el archivo ya fallaba al importar el módulo inexistente. La verificación debe confirmar que **cada archivo de spec nuevo ejecuta sus tests**, no solo que no hay fallos.
- Al pasar la navegación a TanStack, los specs que la montan necesitaron un `QueryClientProvider` en el arnés.

**UX-17 cerrado (`14c796e`, decisión D6):**
- Los tres roles usan `PantallaAjustes` con `BarraTabsSegmentada`. El entrenador pasa sus paneles por `renderPestana` y se borró `PestanasAjustes`.
- Etiquetas cortas, iguales al nombre accesible (WCAG 2.5.3).
- Conteo de planes honesto; "Nuevo plan comercial" en su panel; Avisos sin tarjeta doble; ancho amplio en el entrenador.
- Web 2836 tests en 310 archivos. Revisión de fiabilidad sin BLOCKER.

Seguimientos:
- `etiquetaPestanaAjustes` (nombres largos) ya no se usa en la UI.
- Faltan tests de `etiquetaCortaPestanaAjustes` y de los bordes del conteo.

Proceso:
- Mantener los nombres accesibles largos para no tocar specs fue un error de diseño del coordinador: incumplía WCAG 2.5.3 y lo detectó la revisión. **El nombre accesible siempre contiene el texto visible**, aunque eso obligue a ajustar selectores.
- Antigravity 1.4.12 falla en `worker-start --agent` con `agent_not_in_foreground`. Se esquiva reutilizando con `--terminal` la terminal que ese intento deja abierta; el modelo es el de esa terminal.

**UX-18 cerrado (`e7851f3`, decisión D7):**
- El precio es el total de la duración: "al mes" o "cada N meses".
- El formulario arranca vacío. Valida el precio (mayor que 0, hasta 7 enteros y 2 decimales) y que haya beneficios, sin `alert()`.
- Avisa de cambios sin guardar.
- No hay doble envío: guarda síncrona y bloqueo durante el éxito.
- Desactivar pide confirmación con el efecto real sobre los alumnos.
- Errores de carga, guardado y activación separados. `EstadoCarga`.
- Web 2857 tests en 314 archivos. Revisión 4R (toca dinero) sin BLOCKER; se corrigieron 7 puntos.

Seguimientos:
- La precarga del precio al editar usa `replace('.', ',')`: si el API devolviera separador de miles, habría que revisarla.
- Al reactivar un plan, la tarjeta usa la variante primaria (no hay variante de éxito en `BotonTactil`).

Proceso:
- El generador de prompts con heredoc de Bash falló por las comillas. Los scripts largos se escriben con Write en el scratchpad y se ejecutan desde ahí.
- `lanzar.sh` (scratchpad de la sesión) automatiza el arranque con reserva por `--terminal`.

**UX-19 cerrado (`ed28ed6`):**
- Sin jerga en la UI: fuera "Motor de Tasa", "ADR-003", "VES" y badges falsos. Títulos claros ("Tasa de cambio", "Tasa guardada", "Editar tasa", "Calculadora", "Guardar tasa") y sufijos legibles ("Bs/USD", "Bs").
- Resumen guardado arriba (`ResumenTasa`) y edición en `<details>` no controlado plegable; si no hay tasa guardada, muestra aviso honesto y el `<details>` arranca abierto.
- Campos accesibles (`CampoAjustes`, `inputMode="decimal"`) con soporte de coma y punto decimal (`38,50`). Errores en `role="alert"`, sin `alert()`.
- Selector de fuente en `role="radiogroup"` (Oficial BCV, Paralelo, Personalizada). Si se elige Paralelo, su campo es obligatorio. Al teclear en activa pasa a Personalizada; al restaurar el valor restaura la fuente base recordada (`fuenteBaseRef`).
- Detección precisa de cambios (`hayCambiosTasa`) comparando valores numéricos y fuente; aviso "Cambios sin guardar".
- No hay doble envío: guarda síncrona `guardandoRef` y formulario deshabilitado durante el guardado.
- Calculadora desacoplada que opera contra la tasa guardada (no el borrador) y no se muestra sin tasa configurada o con tasa en 0.
- Web 2908 tests en 316 archivos, typecheck y build en verde. Revisión 4R (toca dinero: riesgo, fiabilidad, resiliencia, legibilidad) sin BLOCKER; se corrigieron 4 observaciones (paralelo elegido vacío, guarda ante tasa guardada 0, respuesta nula del API y limpieza de error obsoleto al editar).

Seguimientos:
- Respaldo en `cambiarMontoVes` mediante fallback de string: `calcularUsdDesdeVes` retorna `usdActual` si la tasa no es válida; con coma, `aTextoEntrada` devuelve `''` y `|| usdPrevio` rescata el valor previo (`use-tasas-cambio.ts:251-253`). En una futura iteración distinguir si el cálculo se realizó o se omitió.
- Redundancia entre etiqueta y sufijo en la calculadora: `etiqueta="Monto en USD"` con `sufijo="USD"` y `etiqueta="Monto en bolívares"` con `sufijo="Bs"` (`ConversorTasas.tsx:33-46`), mantenida por el contrato del spec de interacción (`findByLabelText('Monto en USD')`).

Proceso:
- 4 revisiones (risk, reliability, resilience, readability) porque toca dinero (conversión monetaria e integridad de saldos). 4 reportes en paralelo.
- Subconjunto de pruebas de tasas: 58 tests en 3 archivos (`ajustes-entrenador-tasas.spec.ts`, `ajustes-entrenador-tasas.ux19.spec.ts` y `AjustesPage.tasa.ux19.interaccion.spec.tsx`).
- 2908 tests en 316 archivos, typecheck y build en verde.

**UX-20 cerrado (`1b364c4`):**
- Hook `usePlantillasBanco`: desacopla `cargandoInicial` y `recargando`, erradicando `isLoading`. Preserva la lista en memoria ante fallos de recarga y solo entra en error inicial si no hay datos previos.
- Recarga honesta en `PlantillasPage`: si la recarga falla con datos en memoria, las tarjetas no desaparecen ni se ocultan; se muestra arriba `AvisoErrorRecarga` (`role="alert"`) con botón "Reintentar".
- Buscador y selector de nivel táctiles en móvil (`FiltrosPlantillas`): altura accesible `min-h-11` (44px) y tamaño `text-base sm:text-sm` (16px) que evita el zoom involuntario de iOS Safari.
- Contador accesible (`FiltrosPlantillas`): sustituye el formato técnico por `<p aria-live="polite">` con `{N} plantilla` / `{N} plantillas`. Oculto en carga inicial y error sin datos; visible con datos cargados o filtros activos.
- Tarjeta de plantilla (`TarjetaPlantilla`): estado unificado con `<BadgeEstado>` ("Activa" / "Desactivada").
- Asignar sin conexión: al estar offline, el botón "Asignar a alumnos" muestra el motivo de forma visible en el DOM ("Necesitas internet para asignar") enlazado mediante `aria-describedby`, eliminando el `title` inaccesible en táctil.
- Iconos SVG con `aria-hidden="true"` en todas las acciones de la tarjeta.
- Decisión CFG-26 del dueño: la aclaración *"Cada asignación es una copia independiente: editar la plantilla no altera lo ya prescrito."* se retiró de `CabeceraPlantillas` y se movió al paso de revisión de la asignación (`PasoRevisar`), donde se toma la decisión de prescripción, apareciendo exactamente una vez en los flujos individual y masivo.
- Hallazgo arquitectónico: hoy `cargarPlantillas` solo se llama al montar el componente y desde el botón "Reintentar", por lo que la recarga con datos previos no tiene disparador visible en la UI todavía (quedando la arquitectura lista para refresco automático o pull-to-refresh).

Seguimientos:
- SUGGESTION de la revisión de fiabilidad: carrera preexistente al cambiar `isDemoMode` sin `AbortController` (si una petición previa en curso a `/plantillas` responde tras conmutar dinámicamente a demo). En la práctica la conmutación ocurre casi exclusivamente vía login/logout al desmontar.
- SUGGESTION menor: comentario JSDoc de cabecera en `FiltrosPlantillas.tsx` hacía referencia a "Mostrando N de M".

Proceso:
- 1 revisión de fiabilidad por riesgo bajo (`04-ux20-review-reliability.reporte.md`), sin BLOCKER ni WARNING funcional.
- 18 tests en 4 specs nuevos (`*.ux20.spec.*`), 6 aserciones de contador actualizadas en `PlantillasPage.caracterizacion.interaccion.spec.tsx`.
- 2926 tests en 320 archivos, typecheck y build en verde.

**UX-21 cerrado (`87c732d`, decisión D8):**
- `pagos-montos.ts`: incorpora `validarMontoPago` y `normalizarMontoPago` (acepta coma o punto, hasta 12 dígitos enteros y 2 decimales, `> 0`, y devuelve formato canónico `XX.YY`).
- `use-reporte-pago.ts`: el formulario arranca con `montoOriginal: ''` (se retira el `'1300.00'` precargado); separa canales de error (`errorMonto`, `errorFechaOperacion`, `errorArchivo`, `formError`); bloquea el envío mientras exista `errorArchivo` y descarta cualquier comprobante válido previo si el usuario selecciona luego un archivo inválido; limpia `formError` al escribir en monto o iniciar un envío; expone `iniciarCorreccionPago(tx)` para prellenar un pago rechazado (`metodoPago`, `monedaOriginal`, `montoOriginal`, `referenciaBancaria`, `fechaOperacion`) e `iniciarNuevoPago()` para abrir un abono limpio desde el Hub o el historial, además de resetear los campos tras un envío exitoso.
- `FormularioReportePago.tsx`: asocia todas las etiquetas `<label>` con `htmlFor`/`id` (`useId`), cambia el monto a `type="text"` con `inputMode="decimal"`, añade `aria-invalid`, `aria-describedby` y mensajes `role="alert"` por campo, envuelve los botones de método en `role="group"` con `aria-pressed`, marca iconos decorativos con `aria-hidden="true"` y eleva los blancos táctiles a `min-h-11`.
- `SubidaComprobantePago.tsx`: reemplaza el contenedor `<div>` por `<button type="button">` accesible por teclado con `min-h-11`, añade el botón `"Quitar comprobante"` y muestra `errorArchivo` con `role="alert"`.
- `FilaTransaccionPago.tsx`, `PestanaHistorialPagos.tsx`, `SelectorAccionesPagos.tsx` y `PagosPage.tsx`: conectan `"Corregir y Reenviar"` con `iniciarCorreccionPago(tx)` y `"Nuevo Abono"` / `"Reportar un nuevo abono o pago"` con `iniciarNuevoPago()`.

Seguimientos:
- WARNING preexistente de la revisión de resiliencia (respaldado por `pagos-montos.spec.ts:33`): `pagoVesBloqueadoPorFaltaTasa` devuelve `false` cuando `huboErrorDeTasa = true`, permitiendo enviar un reporte en `VES` con `$— USD` cuando falló el `GET /finanzas/tasas-cambio/activa`.
- SUGGESTION de la revisión de fiabilidad: el `<button>` principal de `SubidaComprobantePago.tsx` no marca `aria-invalid="true"` cuando hay `errorArchivo` (aunque el `<p role="alert">` anuncia el error).
- SUGGESTION de la revisión de riesgo: `handleReportarPago` confía en el `disabled={isSubmitting || pagoVesSinTasa}` del botón de submit sin repetir un `if (pagoVesSinTasa) return;` dentro del manejador.

Proceso:
- 4 revisiones en paralelo por tocar flujos de dinero (`04-ux21-review-risk`, `05-ux21-review-reliability`, `06-ux21-review-resilience`, `07-ux21-review-readability`), de las que se aplicaron y validaron 5 correcciones (`F1..F5`).
- 39 tests en 5 specs nuevos (`*.ux21.spec.*` / `*.ux21.interaccion.spec.tsx`) y 3 tests actualizados en `PagosPage.fecha-anterior.interaccion.spec.tsx`.
- 2965 tests en 325 archivos, typecheck y build en verde.

**UX-22 cerrado (`3bfce29`, decisión D8):**
- `pagos-montos.ts`: exporta `MENSAJE_ERROR_RED_AMBIGUO_PAGO` (*"No se pudo confirmar el envío; revisa tu historial antes de repetirlo."*), `generarClaveIdempotenciaPago()` y `esErrorEnvioPagoAmbiguo(err)` (detecta `TypeError`, `ErrorDeConexion`, `ErrorTiempoAgotado`, `AbortError`, `TimeoutError` y respuestas de pasarela HTTP `502`/`503`/`504`).
- `use-reporte-pago.ts`:
  - **C1 (`ALU-07a`):** guarda la clave del recibo subido a R2 en `comprobanteSubidoKeyRef` y la reutiliza si falla el `POST` y el alumno reintenta con el mismo archivo; la invalida al cambiar o quitar el archivo, tras el éxito o al invocar `iniciarNuevoPago` / `iniciarCorreccionPago`. Valida `if (!cuota)` antes de comprimir o subir a R2 (`F4`).
  - **C2 (`ALU-07` + `D8`):** mantiene `idempotencyKeyRef` estable en reintentos del mismo payload (enviada en `options.idempotencyKey` para `X-Idempotency-Key` y en el JSON `body`) y la renueva al confirmar el pago, al iniciar un flujo nuevo o corrección, o cuando el alumno edita los campos del formulario (`F3`). Añade cerrojo síncrono `enVueloRef` contra doble clic/Enter concurrente (`F1`).
  - **C3 (`ALU-07b`):** gestiona el `setTimeout` de 1800 ms en `temporizadorExitoRef` con control de montaje (`montadoRef`), limpiándolo al desmontar o al reiniciar el flujo.
  - **C4 (`ALU-07c`):** distingue errores ambiguos de red/timeout en el `POST` (`MENSAJE_ERROR_RED_AMBIGUO_PAGO`) frente a rechazos HTTP deterministas del servidor y frente a fallos previos en la subida del comprobante.
- `PagosPage.tsx`: al pulsar `"Volver a opciones de pago"` (`onVolver`), invoca `iniciarNuevoPago()` antes de volver al Hub para cancelar el temporizador de 1800 ms y evitar redirecciones huérfanas al historial (`F2`).

Seguimientos:
- WARNING preexistente de riesgo en API (`reportar-pago.ts:192`): el backend acepta `dto.comprobanteStorageKey` sin verificar que empiece por `comprobantes/${alumnoUserId}/`.
- WARNING preexistente de riesgo en API/BD (`registro-idempotencia.ts` / `schema/index.ts:776`): el registro de idempotencia vive en RAM del proceso y el índice único `uq_transaccion_referencia_entrenador` excluye `efectivo_usd` y `efectivo_ves`.
- SUGGESTION de resiliencia preexistente (`comprobante-pago.ts:98`): el `PUT` directo a la presigned URL de R2 no define `AbortSignal.timeout`.
- WARNING de legibilidad: `generarClaveIdempotenciaPago` y `esErrorEnvioPagoAmbiguo` viven en `pagos-montos.ts` para no acoplar los mocks unitarios de `api-client.ts`.

Proceso:
- 4 revisiones en paralelo por tocar flujos de dinero (`04-ux22-review-risk`, `05-ux22-review-reliability`, `06-ux22-review-resilience`, `07-ux22-review-readability`), de las que se aplicaron y validaron 5 correcciones (`F1..F5`).
- 21 tests en 2 specs nuevos (`use-reporte-pago.ux22.spec.ts` y `PagosPage.ux22.interaccion.spec.tsx`).
- 2986 tests en 327 archivos, typecheck y build en verde.

**UX-23 cerrado (`6271cce`):**
- `nutricion-checkin.ts`: exporta `textoBotonFueraDeVentanaCheckin(zonaHoraria)` (`Disponible a partir de las 18:00 (hora de <Ciudad>)`) y `validarCamposOpcionalesCheckin({ aguaLitros, calorias, proteina })`, compartiendo la validación de enteros sin decimales con `enteroOpcional` (`F3`).
- `AccionesGuardarReporte.tsx` y `NutricionPage.tsx` (`ALU-16`): recibe `zonaPerfil` y muestra la zona horaria del perfil en el botón deshabilitado fuera de ventana; `NutricionPage.tsx` baja de 298 a **278 líneas** (`<= 300`).
- `AvisoVentanaReporte.tsx` (`ALU-17`): añade el enlace **"Cambiar zona horaria"** hacia `/app/ajustes?tab=zona-horaria` (`rutaAjustes(Rol.ALUMNO, 'zona-horaria')`), usando `useInRouterContext()` para degradar a `<a href>` cuando se renderiza en SSR sin `<Router>` (`F2`).
- `CalendarioUltimos7Dias.tsx` (`ALU-18`): reemplaza la grilla de 7 columnas con `title` y `.truncate` por una lista vertical `<ul className="divide-y divide-border/60">` que muestra la fecha larga formateada (`first-letter:uppercase`, sanitizando `dia.fecha.slice(0, 10)`, `F4`) y el chip de estado completo sin truncar.
- `FormularioDatosReporte.tsx` (`ALU-19`): conserva los IDs exactos (`nutricion-agua`, `nutricion-calorias`, `nutricion-proteina`, `nutricion-notas`), añade `autoComplete="off"`, `enterKeyHint="next"` / `"done"`, enlaza el contador `#nutricion-notas-limite` con `aria-describedby` y expone errores reactivos por campo (`aria-invalid`, `aria-describedby="nutricion-<campo>-error"`, `<p role="alert">`).
- `AvisosReporteNutricional.tsx` (`ALU-21`): sustituye los emojis de texto `✓` y `⏳` por iconos Lucide `Check` y `Clock` (`aria-hidden="true"`) hermanos anteriores al `<p role="status">` y pluraliza las fotos encoladas con `pluralizar(fotosEncoladas, 'foto', 'fotos')`.

Seguimientos:
- WARNING preexistente de resiliencia (`use-reporte-hoy.ts` / `nutricion-checkin.ts:470`): al recargar la página sin conexión con un reporte encolado (`queued`), `buscarCheckinNutricionalPendiente` solo devuelve `{ tipo: 'pendiente', fotos }` y no rehidrata los valores del formulario desde el payload en IndexedDB.
- SUGGESTION de accesibilidad (`FormularioDatosReporte.tsx`): valorar `readOnly` en vez de `disabled:opacity-60` cuando el reporte ya quedó registrado para preservar mayor contraste en modo lectura.

Proceso:
- 4 revisiones en paralelo (`04-ux23-review-risk`, `05-ux23-review-resilience`, `06-ux23-review-readability`, `07-ux23-review-reliability`), que detectaron un fetch innecesario a `/nutricion/resumen` introducido para el mock inicial, un riesgo de caída en SSR sin `<Router>` en `AvisoVentanaReporte` y fechas `new Date(y, m, d, h)` sensibles a `TZ=UTC`; se corrigieron en `08-ux23-correccion` (`F1..F4`) y `09-ux23-validacion` (`V1..V4`).

**UX-24 cerrado (`48a3d1e`):**
- `AtletaMenuPage.tsx` (`MEN-01`, `MEN-03`, `MEN-05`): baja de 364 a **152 líneas** (`<= 300`); consume `useMiPerfil` y `useResumenMenu`; saluda con `saludoAlumnoDesdePerfil` (`Hola, <primer nombre>` o `Hola`, sin email ni emoji); si falla la semana y no hay bloqueo, muestra `EstadoError` con reintento y `AvisoDatosOffline` cuando no hay conexión.
- Nuevos `components/atleta/menu/`: `use-resumen-menu.ts` (hook con contador de solicitudes y guarda de desmontaje, más las funciones puras `saludoAlumnoDesdePerfil` y `derivarEstadoEntrenamientoHoy`), `ChipRacha.tsx` (`—` mientras carga o sin datos, `text-xs`), `TarjetaEntrenarHoy.tsx` (`MEN-02`, `MEN-06`: estado honesto sin `animate-pulse`, `role="progressbar"` con `aria-label="Cumplimiento semanal"`, `100% completado` sin emoji) y `TarjetaAccesoAlumno.tsx` (`MEN-04`: `BadgeEstado` canónico con `whitespace-nowrap shrink-0`).
- `BottomNav.tsx` (`NAV-01`): `aria-label="Navegación principal"`. `AppLayout.tsx`: el `Suspense` usa `EstadoCarga` (`Cargando contenido…`).
- Correcciones de las 4 revisiones aplicadas desde el hilo principal por cuota agotada de las terminales externas: el resumen financiero se descarta al cambiar de usuario o de modo demo (`RSK-01`/`RES-01`), `bloques` se lee de forma defensiva (`RSK-03`), semana sin bloques da `Sin entrenamiento asignado` (`REL-01`), sesión iniciada da `Entrenamiento en progreso` (`REL-02`), y se eliminan `text-[11px]` y `uppercase` en las tarjetas y la ceja (`REA-01..03`).

Seguimientos:
- SUGGESTION (`use-mi-perfil.ts:61-76`, `RSK-02`): el hook conserva el perfil del usuario anterior mientras recarga tras un cambio de sesión; valorar `setPerfil(null)` al cambiar `usuarioId` (hook compartido con Ajustes).
- SUGGESTION (`AtletaMenuPage.tsx:65-69`, `REL-03`): con `semanaProgreso === null` sin error, `ChipRacha` muestra `0 días` mientras la tarjeta dice `Sin datos`; valorar pasar `rachaNoDisponible` también en ese caso.
- SUGGESTION (`AtletaMenuPage.ux24.interaccion.spec.tsx`, `REL-04`): restablecer `navigator.onLine = true` en `beforeEach`.
- Preexistentes en layout: `text-[11px]` en las etiquetas de `BottomNav.tsx` y en el banner demo de `AppLayout.tsx` (sin `aria-hidden` en su icono).

Proceso:
- 4 revisiones en paralelo (`04-ux24-review-risk`, `05-ux24-review-resilience`, `06-ux24-review-readability`, `07-ux24-review-reliability`) y verificación independiente que no llegó a escribir su reporte por cuota agotada (la suite completa quedó verificada con el JSON de Vitest). Durante la implementación se autorizaron dos ajustes de specs: matcher plano en `NavegacionAlumno.ux24.interaccion.spec.tsx:93` y campos obligatorios del DTO en el mock de `AtletaMenuPage.ux24.interaccion.spec.tsx`.
- 8 tests nuevos en 2 specs (`AtletaMenuPage.ux24.interaccion.spec.tsx` y `NavegacionAlumno.ux24.interaccion.spec.tsx`).
- 3006 tests en 331 archivos y typecheck en verde.

**Lote ZH-2 + D12 cerrado (`6da5794`, 2026-11-03; decisiones D13 y D12, [[ADR-025-zona-horaria-alumno-precarga-dispositivo-aviso-discrepancia]]):**
- **Qué hace:**
  - ZH-2: `useZonaPerfil()` y `fechaCalendarioEnZona(zona, ahora?)` (zona nula o inválida → `America/Caracas`). El menú, el «Hoy» del entrenamiento (y de ahí la semana, la carga de sesión, las acciones y la caché offline de la rutina de hoy), la fecha de operación del pago (estado inicial, `iniciarNuevoPago`, validación y `max` del campo; `FormularioReportePago` recibe `hoyLocal`) y la antropometría (ventana del check-in y fecha enviada) usan la zona del perfil. La antropometría prefiere la zona fresca de `/auth/me` y, si no, la del login; en el modo demo el «hoy» sigue siendo el reloj del dispositivo. El lado del entrenador no cambia.
  - D12: textos de Progreso y Pagos del alumno con mayúscula solo en la primera palabra y un único nombre por acción («Mi progreso», «Reportar pago», «Historial», «Tus medidas», «Ver evolución», «Enviar a mi entrenador», «Pagos y cuotas», «Saldo pendiente», «Corregir y reenviar», «Método de pago», «Monto pagado», «Fecha de operación», «Referencia bancaria», «Enviar comprobante de pago», «Historial de medidas», «¡Medidas guardadas!»). La etiqueta «En revisión» (`etiquetaEstadoTransaccion`) pasa a sentence case y también la ve el entrenador. Se retiraron textos con jerga (enlaces temporales, almacenamiento R2, auditoría).
  - Refactor: `use-comprobante-pago.ts` se extrae de `use-reporte-pago.ts` (de 401 a 349 líneas).
- **Revisión:** fiabilidad (ZH-2) y legibilidad (D12) sin BLOCKER.
  - Se aceptaron 2 WARNING de fiabilidad (zona fresca de `/auth/me` en antropometría; modo demo con el reloj del dispositivo) y 1 SUGGESTION (recalcular la fecha en `iniciarNuevoPago`).
  - De legibilidad se aceptaron el Title Case residual, dos textos con jerga y comentarios desactualizados.
  - Se rechazaron, como seguimiento: la guarda de `asegurarComprobanteSubido`, renombrar `onNuevoAbono` a `onReportarPago` y reemplazar `querySelectorAll` por `getByLabelText` en specs antiguos.
- **Seguimientos:**
  - La agrupación «Hoy/Ayer» de las notificaciones (`lib/notificaciones-in-app.ts`), los gráficos de evolución (`lib/evolucion-graficos.ts`) y `timezoneCliente` de nutrición siguen con la zona del dispositivo.
  - Los endpoints `?timezone=` del entrenamiento aún aceptan lo que envía el cliente (costo T3 del ADR).
  - Fuera de D12 quedaron el Sidebar («Menú de Acciones», «Mi Comida», «Rendimiento Personal»), la `BottomNav` («Ir a entrenar», «Pagos») y `ComparadorFotos`, con Title Case e inconsistencias.
  - La opción «(VES)» del selector de método; `validarArchivoComprobante` (valida por nombre) encajaría en `lib/comprobante-pago.ts`.
- **Proceso:**
  - Al lanzar workers de Antigravity hay que pasar el id completo del modelo (`gemini-3.8-flash-medium` o `gemini-3.8-flash-high`): pasar solo `medium` o `high` cae al modelo por defecto, que puede no tener créditos.
  - Un lote no se cierra sin ver el typecheck y el build con código 0 sobre el código final: en este lote el build web no se había visto en 0 hasta el cierre, y las correcciones de la revisión llegaron después de la primera pasada verde.
  - El hook del pago superó el tope de 400 líneas del guardián de tamaño y se extrajo `use-comprobante-pago.ts`.
- **Evidencia:** web **3152/3152** en 376 archivos; typecheck de shared, database, api y web y build web con código 0.

**ZH-1 cerrado: zona horaria del alumno (`6111326`, 2026-11-03; decisión D13, [[ADR-025-zona-horaria-alumno-precarga-dispositivo-aviso-discrepancia]]):**
- **Qué hace:** precarga única de la zona del dispositivo en el primer acceso, libre después, y aviso discreto al final del layout del alumno cuando el desfase UTC del dispositivo y el del perfil difieren. Migración `0024` con los alumnos existentes como definidos. Detalle en RF-018.
- **Revisión 4R:**
  - Riesgo y fiabilidad sin hallazgos.
  - Resiliencia dio un WARNING real, corregido: un fallo del `UPDATE` de la precarga habría devuelto un 500 a un alumno con credenciales correctas. Ahora se registra una advertencia y el acceso continúa.
  - Legibilidad dio una mejora de copy, aplicada («Zona de tu dispositivo: Hora de Madrid. Zona de tu perfil: Hora de Caracas.»).
  - Se descartaron tres sugerencias: un `.max()` en el esquema Zod (convertiría un valor largo en un 400 que bloquea un acceso válido), `IF NOT EXISTS` en el `ALTER` y extraer el bloque de precarga repetido dos veces.
- **Seguimientos:**
  - ZH-2 resuelto en `6da5794`: menú, «Hoy», fecha de operación del pago y antropometría leen la zona del perfil (ver el bloque anterior).
  - Los endpoints `?timezone=` del entrenamiento siguen aceptando lo que envíe el cliente (costo T3 del ADR).
  - W5 y W6 pasaban en la fase roja por ser casos negativos: son guardas útiles solo con el componente presente.
- **Proceso:**
  - La verificación del lote se quedó sin créditos antes de ejecutar el typecheck y el build, y al correrlos aparecieron dos errores `TS18048` en specs de la fase roja (`auth-context.zh1.spec.tsx:106` y `ActivacionPage.zh1.interaccion.spec.tsx:73`). Se corrigieron con un acceso opcional. Un lote no se cierra sin ver el typecheck y el build con código 0.
  - Antigravity cae por créditos tras ~350k tokens de un worker; el JSON de Vitest aparece igual al terminar.
- **Evidencia:** web **3112/3112** en 364 archivos; API **406/406**; 28 tests nuevos (15 del API, 13 de la web); typecheck y build con código 0.


**Lote de pagos del alumno cerrado (`4371639`, 2026-11-03; decisiones D11 y D15 y dos seguimientos de la revisión):**
- **D11:** `monedaSugeridaPorMetodo`, `avisoMonedaMetodo` y el ajuste en `setMetodoPago` (`lib/pagos-montos.ts`, `use-reporte-pago.ts`); aviso enlazado al selector de moneda en `FormularioReportePago.tsx`.
- **D15 de punta a punta:** `historial-cliente.ts` (API), `packages/shared/src/types/finanzas.ts`, `lib/pagos-adaptadores.ts`, `FilaTransaccionPago.tsx` y `PestanaReportePago.tsx`. Se descubrió que el API nunca enviaba `motivoRechazo` y que la fila mostraba un motivo inventado; ahora, sin texto, dice `TEXTO_RECHAZO_SIN_MOTIVO`.
- **Seguimientos resueltos:** montos con `useFormatoNumero()` en `TarjetaResumenCuota`, `CabeceraPagos`, `FilaTransaccionPago`, `AvisoSaldoAFavor` y el contravalor; validación de la referencia (`validarReferenciaPago`) antes de la subida; etiqueta de la referencia coherente con el API.
- **Seguimientos nuevos:**
  - SUGGESTION (legibilidad): `use-reporte-pago.ts` quedó en 396 de 400 líneas; el siguiente cambio obligará a extraer la orquestación de la subida del comprobante (`lib/comprobante-pago.ts`).
  - SUGGESTION: `validarArchivoComprobante` vive en `lib/pagos-montos.ts`; por nombre encajaría mejor en `lib/comprobante-pago.ts`.
  - SUGGESTION: el campo del monto sigue mostrando el valor precargado de una corrección con punto decimal (`75.00`) mientras el resto de la pantalla usa coma.
- **Proceso:**
  - Fase roja con 25 tests (P1 a P25) en Antigravity; el test del API se rehízo porque su mock fallaba por una causa ajena. Sonnet implementó, Antigravity actualizó 9 specs existentes y verificó, y cuatro revisiones 4R no dieron BLOCKER ni WARNING.
  - Se aceptaron dos sugerencias (limpiar el error de referencia al cambiar de método, con su test P26, y `aria-hidden` en dos iconos). El único hallazgo de fiabilidad (que `setMoneda` no renovaba la clave de idempotencia) quedó refutado: sí la renueva desde antes.
  - Los reportes de fiabilidad y de riesgo citaron líneas inexistentes, por lo que se verificó cada afirmación de seguridad directamente en el código.
- **Evidencia:** web **3098/3098** en 359 archivos más P26; API **262/262**; typecheck y build en verde.


**Revisión de calidad de UX-19 a UX-29 cerrada (`af33433`, 2026-11-03):**
- **Proceso:**
  - 4 revisiones UX de solo lectura en paralelo (Antigravity, `gemini-3.8-flash-high`; prompts `10` a `13`), una por grupo de lotes: Ajustes y Plantillas, Pagos del alumno, Nutrición/menú/sesión y Cierre/Progreso/pulido.
  - Un advisor (Opus) contrastó cada hallazgo con el código y el contrato del API: confirmó casi todos, bajó la gravedad de varios (el «BLOCKER» de pagos es real pero no bloqueante) y encontró dos defectos que los revisores no vieron.
  - 7 correcciones (G1a a G6) con agentes Haiku; tests y verificación en Antigravity (`14` y `15`). El primer intento de validación se quedó sin créditos y se repitió con un prompt reducido.
- **Corregido:**
  - Pagos del alumno (`PagosPage.tsx`, `use-reporte-pago.ts`, formulario y comprobante): refresco de historial y saldo tras reportar, clave de idempotencia por comprobante, formulario bloqueado durante el envío, contravalor vacío con «—», `role="status"` en el éxito, textos con «entrenador».
  - Check-in (`use-medidas-checkin.ts`, `use-checkin-antropometrico.ts`, `ProgresoPage.tsx`): la medición precargada no cuenta como cambio y «Descartar» vacía medidas y fotos (defecto de UX-27 que ningún revisor vio); el botón de enviar usa su texto visible como nombre; fotos deshabilitadas sin conexión.
  - Cierre de sesión (`ModalFinalizarSesion.tsx`, UX-26): el aviso de series pendientes era ilegible en ambos temas (`text-warning-foreground`); guardián `estilo-contraste-advertencia.spec.ts`.
  - Menú (`use-resumen-menu.ts`, UX-24): «Completado hoy» falso con la semana completa.
  - Plantillas (`FiltrosPlantillas.tsx`, UX-20): contadores «0» durante la carga; iconos decorativos con `aria-hidden` y `autoComplete="off"` en los campos de tasa.
- **Seguimientos (fuera de esta tanda):**
  - ~~Montos de Pagos del alumno sin `useFormatoNumero`/`formatMonto`~~ ✅ resuelto en el lote de pagos del alumno (`4371639`).
  - ~~La referencia bancaria no se valida en el cliente~~ ✅ resuelto en el lote de pagos del alumno (`4371639`).
  - Tras un check-in exitoso las medidas no se limpian; descartar con una subida de foto en curso puede dejar la subida huérfana.
  - `SelectorZonaHoraria.tsx`: la hora «en vivo» se calcula al renderizar y no se actualiza sola.
  - Tests débiles: R5 pasa por vacío hoy (falla si se reintroduce una etiqueta huérfana), R15 y R16 son guardas de regresión.
  - Pendiente de decisión: D11 a D15 (sección 4).
- **Evidencia:** 17 tests nuevos en 7 specs (`*.revux.spec.*` y el guardián de contraste); web **3074/3074** en 351 archivos; typecheck y build en verde.


**UX-29 cerrado (`0ebda43`):**
- **Pagos del alumno (`ALU-11` a `ALU-15`):**
  - `TarjetaResumenCuota.tsx` (`ALU-12`, `ALU-15`): `fechaCorteUtc` formateada con `formatFechaLocal` y fallback `'—'`; contenedor de saldo y total cuota con `flex-wrap gap-3` para pantallas estrechas; conserva `"Saldo Pendiente"`. 89 líneas (`<= 400`).
  - `FilaTransaccionPago.tsx` (`ALU-11`, `ALU-13`, `ALU-14`): referencia bancaria con `min-w-0 break-words`; método de pago sin CSS `capitalize`; fallback seguro `'—'` en fecha de operación; unificación a `"Motivo del entrenador: "` y botón `"Ver comprobante"`. 122 líneas (`<= 400`).
  - `CabeceraPagos.tsx` (`ALU-11`): título `"Pagos y cuotas"`, ceja `"Pagos"`, `"Tasa del día"` y tasa `"1 USD = ${tasaEfectiva} Bs."` (erradicando "VES"). 48 líneas (`<= 400`).
  - `FormularioReportePago.tsx`, `ModalComprobantePago.tsx`, `SubidaComprobantePago.tsx`, `PagosPage.tsx` (`ALU-11`): `"Monto en USD acreditado a tu cuota:"` (eliminando "Contravalor"), `"Enviando al entrenador..."`, `"Almacenamiento seguro"` (sin mención a "Cloudflare R2"), `"Captura del comprobante"` y `"Tu entrenador aún no ha emitido una cuota..."`.
- **Ajustes y Zona Horaria (`ALU-26`):**
  - `lib/zona-horaria.ts`: exportada función pura `textoHoraActualEnZona(zona, fecha)`. 119 líneas.
  - `SelectorZonaHoraria.tsx`: muestra `"Ahora son las HH:mm en hora de <Ciudad>"` con clase `text-xs text-muted-foreground mt-1` (respetando piso WCAG de 12px). 79 líneas (`<= 400`).
  - `AjustesAlumnoPage.tsx`: removido `<h2>Tu zona horaria</h2>` redundante, manteniendo `aria-label="Zona horaria"`. 72 líneas (`<= 300`).
- **Seguimientos:**
  - SUGGESTION (`ModalComprobantePago.tsx:108`): actualizar el texto preexistente de fallback que aún menciona `"... almacenamiento R2 no configurado"`.
- **Proceso:**
  - 13 tests nuevos en 2 specs (`PagosPage.ux29.pulido.spec.tsx` y `zona-horaria.ux29.spec.ts`).
  - Subagente escritor (`1360f679-9c37-4305-82d7-017833046e6e`, Gemini 3.8 Flash high) aplicó los cambios y resolvió en verde.
  - Verificación independiente (`UX-29 Verifier`, Gemini 3.8 Flash medium): 3057 tests pasados en 344 archivos (1127 suites), typecheck y build en verde.
  - Revisión de legibilidad (`review-readability`, Gemini 3.8 Flash high): APROBADA (0 blockers, 0 warnings de producción).

**UX-28 cerrado (`9c8c039`):**
- `AvisoDatosOffline.tsx`: añadida la prop opcional `isOnline?: boolean` a `AvisoDatosOfflineProps`; si se provee, tiene precedencia sobre `useFrescuraOffline` sin romper retrocompatibilidad con los consumidores existentes (`ContenidoConPerfil`, `ProgresoPage`, `PantallaAjustes`, etc.); 88 líneas (`<= 400`).
- `FormularioCheckinAntropometrico.tsx` (`PRO-04`):
  - Añadida prop `isOnline?: boolean` a `FormularioCheckinAntropometricoProps`.
  - Cuando `estaOffline` (`!isDemoMode && !isOnlineEfectivo`), renderiza `<AvisoDatosOffline variante="sin-datos" isOnline={...} className="mb-2" />` en la cabecera.
  - El botón de envío se desactiva (`disabled={... || estaOffline}`) y se muestra el motivo `<p className="text-[11px] text-muted-foreground text-center">Conéctate a internet para enviar tu evaluación</p>`.
  - En modo demo (`isDemoMode: true`), omite la restricción de red y permite simular el check-in localmente. 205 líneas (`<= 400`).
- `use-checkin-antropometrico.ts` (`PRO-04`, `D9`):
  - Guarda síncrona en `handleSubmitCheckin`: si `typeof navigator !== 'undefined' && !navigator.onLine && !isDemoMode`, interrumpe el flujo y setea el error "Conéctate a internet para enviar tu evaluación." sin invocar la API ni encolar offline. 211 líneas (`<= 400`).
- `ProgresoPage.tsx`: se mantiene intacto en 294 líneas (`<= 300`).

Seguimientos:
- SUGGESTION (`use-checkin-antropometrico.ts:30-52`): admitir opcionalmente `isOnline?: boolean` en las opciones del hook para simetría con `FormularioCheckinAntropometricoProps`.

Proceso:
- Decisión D9 confirmada por el dueño: avisar y bloquear el envío sin tocar datos ni encolar offline.
- Subagente escritor (`ca6d23ef-ee22-42be-8996-bfdc93b74c91`, Gemini 3.8 Flash high): implementó la solución limpia con soporte de `isOnline` en `AvisoDatosOffline`.
- Verificación independiente (`UX-28 Verifier`, Gemini 3.8 Flash medium): 3044 tests pasados en 342 archivos (1118 suites), typecheck y build en verde.
- Revisión de resiliencia (`review-resilience`, Gemini 3.8 Flash high): APROBADA (0 blockers, 0 warnings).

**UX-26 cerrado (`70cfe33`):**
- `ModalFinalizarSesion.tsx` (`ENT-02`, `ENT-09a`, `ENT-09b`, `ENT-10`):
  - `ENT-02`: Resumen honesto de series completadas y pendientes con `role="status"` ("Completaste todas las series (N de N)" o "Hiciste X de Y series. Las otras Z quedarán sin completar" / singular con 1).
  - `ENT-09a`: Rejilla de esfuerzo (1 a 10) muestra solo números limpios, eliminando etiquetas inductoras dentro de los botones ("1 (Bajo)", "8 (Ideal)", "10 (Máximo)"); la leyenda orienta sin sesgos.
  - `ENT-09b`: Esfuerzo arranca en `null` ("Sin seleccionar (opcional)"), sin forzar un 8 por defecto; si el alumno no selecciona esfuerzo, no se inventa `[RPE: ...]` en las notas enviadas.
  - `ENT-10`: Botón de confirmación con `type="button"` y jerarquía `text-sm`; unificación de comentarios y textos a "entrenador".
  - Componente pasa a 239 líneas (`<= 400`).
- `CtaFinalizarSesion.tsx` (`ENT-03`, `ENT-06`):
  - Añadida prop `variante?: 'hero' | 'final-lista'` para reutilización parametrizable.
  - Variante `'final-lista'` renderiza botón accesible con `aria-label="Finalizar entrenamiento al final de la lista"` sin el reloj informativo superior.
  - Añadida clase `motion-reduce:animate-none` al pulso del reloj.
- `ListaCompletaEjercicios.tsx` (`ENT-03`):
  - Acepta `onFinalizar?: () => void`. Si `enProgreso && onFinalizar`, renderiza `<CtaFinalizarSesion variante="final-lista" />` al pie de la lista para evitar desplazarse arriba tras la última serie. 65 líneas (`<= 400`).
- `use-cierre-sesion.ts` (`ENT-09b`):
  - `rpeSesion` inicializa en `null`. En `confirmFinishSession`, `[RPE: ${rpeSesion}/10]` solo se concatena si el usuario seleccionó un valor explícito. 213 líneas (`<= 400`).
- `EntrenamientoPage.tsx` (`ENT-03`, `OBS-01`):
  - Pasa `onFinalizar={handleOpenFinishModal}` a `ListaCompletaEjercicios`.
  - Eliminado comentario legacy sobre scroll horizontal con degradado (OBS-01).
  - Se mantiene en 262 líneas (`<= 300`).
- `FormularioCheckinAntropometrico.tsx` (`ENT-10`):
  - Unificadas menciones visibles "Revisión de tu coach" a "Revisión de tu entrenador".
- `apps/web/vitest.config.ts`:
  - Configurado `testTimeout: 15000` para proteger la ejecución en Windows frente a contención de CPU en suites completas con jsdom.

Proceso:
- Modo rápido aplicado: 14 tests nuevos en 4 specs (`ModalFinalizarSesion.ux26.interaccion.spec.tsx`, `CtaFinalizarSesion.ux26.interaccion.spec.tsx`, `ListaCompletaEjercicios.ux26.interaccion.spec.tsx`, `use-cierre-sesion.ux26.interaccion.spec.tsx`).
- 3030 tests en 338 archivos, typecheck en verde.

**UX-25 cerrado (`3d90202`):**
- `ChipsBloquesSemana.tsx` (`ENT-04`, `ENT-05`): "Hoy" restringido al bloque sugerido de hoy (`b.esSugeridoHoy`), el bloque consultado (`bloqueActivoId`) recibe `aria-current="true"` y no dice "Hoy"; eliminación del `✓` duplicado en completados; `fechaVisible` visible para bloques pendientes en lugar de solo en `title`; contenedor con `role="group"`, `aria-label="Entrenamientos de la semana"` y envoltura flexible `flex-wrap gap-2` para pantallas táctiles sin scroll horizontal rígido; baja de 124 a 110 líneas.
- `FilaSerieEdicion.tsx` (`ENT-07`, `ENT-08`): eliminadas las clases `sm:w-9` (peso) y `sm:w-8` (repeticiones), garantizando ancho táctil `w-11` (≥44px) constante en todos los anchos; sustituido `truncate` por `break-words` en la prescripción planificada "Plan: [X] kg"; baja de 278 a 269 líneas.
- `CampoMedidaCheckin.tsx` (`PRO-02`): añadida la clase `min-h-11` a `CLASES_INPUT_MEDIDA` para asegurar altura táctil mínima de 44px en los campos de medición antropométrica.
- `EntrenamientoPage.tsx`: se mantiene intacto en 262 líneas (`<= 300`).

Seguimientos:
- SUGGESTION (`EntrenamientoPage.tsx:114`, `OBS-01`): actualizar el comentario legacy que menciona `scroll horizontal con degradado + chevron` en una futura pasada de limpieza documental.

Proceso:
- Revisión enfocada de confiabilidad (`04-ux25-review-reliability`) y verificación independiente (`03-ux25-verificacion`): 0 CRITICAL, 0 WARNING, 0 hallazgos en verificación.
- 10 tests nuevos en 3 specs (`ChipsBloquesSemana.ux25.interaccion.spec.tsx`, `FilaSerieEdicion.ux25.interaccion.spec.tsx` y `CampoMedidaCheckin.ux25.interaccion.spec.tsx`).
- 3016 tests en 334 archivos, typecheck y build en verde.
- 12 tests en 2 specs nuevos (`nutricion-checkin.ux23.spec.ts` y `NutricionPage.ux23.interaccion.spec.tsx`).
- 2998 tests en 329 archivos, typecheck y build en verde.

## 4. Decisiones pendientes del dueño

Deduplicadas de las 15 preguntas de los reportes (cada una con la recomendación del auditor).

| # | Decisión | Recomendación y porqué | Bloquea |
|---|---|---|---|
| D1 | Al cambiar el cobro en efectivo de USD a Bs., ¿convertir el monto con la tasa vigente, limpiarlo o dejarlo con una línea de confirmación? | Limpiar al cambiar de moneda y mostrar antes del botón "Se registrarán X Bs. (≈ $Y USD)": convertir en silencio inventaría un monto (COB-18). | UX-08 |
| D2 | ¿Ver el texto del recordatorio antes de enviarlo? Obliga al API a entregar el mensaje en una consulta previa. | Sí: hoy el entrenador envía sin ver qué se manda (COB-27). Sin respuesta, se hace solo el `?q=` y el `onError` de la miniatura. | UX-09 (parte) |
| D3 | En móvil, ¿"Recordatorio" y "Ver ficha" a un menú "Más", dejando visible solo "Registrar cobro"? ¿Se acepta `md:min-h-9` en escritorio? | Sí al menú, igual que la ficha (decisión 7 del brief): hoy son tres botones de 28px que envuelven (COB-19, COB-20). | UX-07 (COB-20) |
| D4 ✅ | ¿El Dashboard es "qué atender hoy" (franja de pendientes arriba) o un tablero de negocio? ¿Los conteos salen del endpoint `dashboard-comando` o de uno ligero (toca API)? | "Qué atender hoy" con `dashboard-comando`, sin API nueva: el dato `bandejasRapidas` ya existe (SEG-05, SEG-26, SEG-27). **Decidido por el dueño (2026-10-30): "qué atender hoy"**, con la franja arriba, las listas después y las cifras de negocio al final como contexto. | UX-13 (SEG-05), UX-16 |
| D5 ✅ (2026-10-30: se unifican "Panel", "Seguimiento", "Evaluaciones" y "Mis alumnos" desde una constante única. Las dos pantallas de cobros conservan los nombres de UX-10, "Control de cobros" y "Pagos por validar", porque ya eran coherentes y no existe un destino "Pagos". No se escriben specs nuevos solo para los nombres: se ajustan los que ya los consultan) | ¿Unificar los nombres de navegación (Panel, Seguimiento, Evaluaciones, Cobros, Pagos) aunque cambien textos que algunos tests consultan? ¿Un cuarto destino "Progreso" en la barra del alumno? | Sí a unificar (SEG-25: cinco nombres para un destino). Progreso: mantenerlo en el Menú hasta decidir; el auditor lo considera aceptable para el flujo de gimnasio (NAV-01). | UX-16 (SEG-25), UX-24 (cuarto destino) |
| D6 ✅ (2026-10-31: etiquetas cortas Perfil, Acceso, Avisos, Planes y Tasa; Perfil sigue siendo la pestaña inicial) | Ajustes del entrenador: etiquetas cortas (Acceso, Avisos, Planes, Tasa) y ¿qué tab abre por defecto? | Etiquetas cortas sí: sin ellas las tabs no caben a 360px (inferido). Dejar Perfil primero para no cambiar `?tab=` por defecto, salvo que se prefiera abrir en Planes o Tasa. | UX-17 |
| D7 ✅ (2026-10-31: el precio es el total de la duración del plan, que es lo que ya hace el API: una cuota por ciclo de `duracionMeses`; la tarjeta deja de decir "USD / mes". El formulario de creación arranca vacío: sin el precio 40.00 ni beneficios precargados) | Planes: ¿el precio es por mes o por toda la duración? ¿Se quitan el precio `40.00` y los dos beneficios precargados? | Quitar la precarga (CFG-09: datos no elegidos) y aclarar la semántica del precio: hoy dice "USD / mes" aunque el plan dure N meses (CFG-11). | UX-18 |
| CFG-26 ✅ (2026-11-01: la aclaración de copia independiente se movió al paso de revisión de la asignación PasoRevisar en lugar de saturar la cabecera del catálogo) | Plantillas: ¿dónde ubicar la aclaración de que cada asignación es una copia independiente? | Retirar de CabeceraPlantillas y moverla al paso de revisión de la asignación (PasoRevisar), donde se toma la decisión de prescripción, renderizándose una sola vez en flujos individual y masivo (CFG-26). | UX-20 |
| D8 ✅ (2026-11-01: el formulario de pago arranca con monto vacío `''`, valida > 0 antes de enviar, asocia cada `<label>` con `htmlFor`/`id` (`useId`) y se actualizan los 3 tests de `PagosPage.fecha-anterior.interaccion.spec.tsx`; en ALU-10 "Corregir y Reenviar" prellena el formulario con método, moneda, monto, referencia y fecha del pago rechazado. Verificado en código que el API ya soporta `X-Idempotency-Key` / `idempotencyKey` en `ReportarPagoSchema` y el índice `uq_transaccion_referencia_entrenador`, por lo que en UX-22 el cliente enviará `idempotencyKey` y reutilizará `storageKey`) | Reporte de pago: ¿empieza vacío (se actualizan los specs que usan `1300.00` y localizan por `parentElement`)? ¿El API acepta clave de idempotencia o rechaza duplicados por referencia+monto+fecha? | Sí a vaciar (ALU-01 es ALTA). Sin idempotencia en el API solo hay mitigación en el cliente (ALU-07). | UX-21, UX-22 |
| D9 ✅ (2026-11-02: avisar y bloquear el envío sin tocar datos; se muestra AvisoDatosOffline con variante "sin-datos", botón de envío deshabilitado con indicación visible y guarda síncrona en useCheckinAntropometrico; en demo se simula en local) | Check-in antropométrico con fotos sin conexión: ¿encolar o avisar y bloquear el envío? | Avisar y bloquear: no toca datos. Encolar es riesgo alto y requiere diseño de cola offline (PRO-04). | UX-28 |
| D10 | Esfuerzo de la sesión: ¿arrancar sin valor? ¿Separar el valor de "molestia" del texto con emoji dentro de `notas`? | Sí al esfuerzo sin valor inicial (ENT-09b). Separar `notas` va aparte porque cambia el formato de los datos (ENT-09c). | UX-26 (ENT-09c) |
| D11 ✅ (2026-11-03: la moneda se propone según el método y se puede cambiar a mano; aviso discreto en combinaciones poco habituales. Implementado en `4371639`) | Reporte de pago del alumno: ¿la moneda se elige según el método (Zelle, Binance, Efectivo USD → USD; Pago Móvil, Transferencia, Efectivo VES → VES) y se puede cambiar a mano? | Sí: hoy queda en VES por defecto incluso con «Zelle (USD)» y la API no cruza método y moneda; un alumno puede reportar 30 Bs creyendo que son 30 $. | lote de pagos del alumno |
| D12 ✅ (2026-11-03: textos de Progreso y Pagos del alumno con mayúscula solo en la primera palabra y un único nombre por acción; sin jerga. Implementado en `6da5794`, junto con ZH-2) | ¿Se aprueban los textos nuevos de Progreso y Pagos («Mi progreso», «Tus medidas», «Ver evolución», «Reportar pago», «Historial») y se quitan los restos de Title Case (PRO-06, ALU-11)? | Sí, en un lote de textos con los specs actualizados: rompen specs de Pagos y de Progreso que consultan los nombres actuales. | lote de textos |
| D13 ✅ (2026-11-03: se precarga la zona del dispositivo una sola vez al primer inicio de sesión o activación y después queda libre; los cálculos usan siempre la zona del perfil; aviso discreto de discrepancia en el pie del layout del alumno, comparado por desfase horario y descartable por sesión. Diseño en [[ADR-025-zona-horaria-alumno-precarga-dispositivo-aviso-discrepancia]]) | ¿La semana de entrenamiento se consulta con la zona horaria del perfil (`zonaPerfilEfectiva`) y no con la del dispositivo? | Sí, en un lote aparte: afecta a `use-resumen-menu.ts` y a `use-entrenamiento.tsx`, que hoy son coherentes entre sí; arreglar uno solo los desalinearía. | lote de zona horaria |
| D14 | ¿Proteger el botón Atrás del navegador en el check-in con un guard de router? | Aceptarlo por ahora: las medidas sobreviven a Atrás/Adelante y solo se pierden las fotos; antes de UX-27 Atrás sacaba de Progreso y se perdía todo. | — |
| D15 ✅ (2026-11-03: el formulario de corrección muestra el motivo; además el historial del API ahora envía `motivoRechazo` y la fila ya no inventa un motivo. Implementado en `4371639`) | ¿Mostrar el motivo del rechazo arriba al corregir un pago rechazado? | Sí: es pequeño, el motivo ya viene en la transacción. | lote de pagos del alumno |

## 5. Hallazgos por área

Prioridad: A = ALTA, M = MEDIA. Los BAJA van en una línea por área al final de cada tabla.

### COB · Cobros del entrenador

| ID | P | Vista | Archivo:línea | Problema | Corrección |
|---|---|---|---|---|---|
| COB-01 | A | Conciliación | `ConciliacionPage.tsx:37-41`, `use-bandeja-conciliacion.ts:84` | En la carga inicial `total` es 0 y se muestra "Bandeja al día" | Rama `enCargaInicial` con `EstadoCarga`; error con `EstadoError` |
| COB-02 | A | Conciliación | `ModalRechazoConciliacion.tsx:73-87`, `use-acciones-conciliacion.ts:44,76-93` | Error del rechazo tapado por el modal; sin `procesando`; Escape cierra en vuelo | Error con `role="alert"` dentro del modal; `DialogoConfirmacion` peligro |
| COB-03 | A | Conciliación | `use-acciones-conciliacion.ts:115,121-124` | El motivo de rechazo no se limpia y llega al alumno equivocado | Limpiar al abrir y al cerrar |
| COB-04 | A | Conciliación | `TarjetaTransaccionConciliacion.tsx:85-88` | "Comprobante verificado" fijo, incluso con "Sin captura digital" | Quitar o mostrar dato real "Con/Sin comprobante" |
| COB-05 | A | Conciliación | `FiltrosConciliacion.tsx:44-70` | Chips sin `aria-pressed`, ~28px | `ui/ChipFiltro` |
| COB-17 | A | Cartera | `CarteraPage.tsx:81,115`, `BuscadorCartera.tsx:51-67` | `sinTasa` es `true` mientras carga el resumen; aviso falso | `sinTasa = resumen !== null && !hayTasaProyectable(resumen)`; solo en mora/por vencer |
| COB-18 | A | Cartera | `useCobroCartera.ts:86-87`, `ModalCobroCartera.tsx:124-137` | Monto USD pasa a Bs. sin convertir; el campo no indica unidad | Sufijo de unidad, limpiar al cambiar, línea resumen previa (D1) |
| COB-19 | A | Cartera | `BotonAccionCartera.tsx:33`, `ModalCobro:63-70,169-185`, `ModalRecordatorio:62-69,135-173`, `CabeceraCartera:26-31` | Acciones y modales de ~28-40px | `BotonTactil`/`min-h-11`, cierres de 44px |
| COB-06 | M | Conciliación | `ModalRechazoConciliacion.tsx:62` | `<label>` sin `htmlFor`; cierre ~28px; botones sin `type` | `useId`, `min-h-11`, `BotonTactil` |
| COB-07 | M | Conciliación | `VisorComprobanteConciliacion.tsx:106` | `bg-black/50` color crudo | `bg-secondary/40` o `bg-foreground/10` |
| COB-08 | M | Conciliación | `VisorComprobanteConciliacion.tsx:47,106,133,152-156` | Botones fuera de vista en pantallas bajas (no verificado); jerga "Presigned URL… ADR-007"; "Abrir original" tapa la imagen; título largo | `overflow-y-auto`; textos en español claro; "Comprobante de pago" |
| COB-09 | M | Conciliación | `TarjetaTransaccionConciliacion.tsx:30-37,40` | Nombre y chip sin `flex-wrap`/`min-w-0`; método en mayúsculas | `BadgeEstado`, `line-clamp-2 break-words`, `break-all` en referencia |
| COB-10 | M | Conciliación | `TarjetaTransaccionConciliacion.tsx:48,91-103` | Botones de ~32px y etiquetas largas | `BotonTactil`, "Aprobar"/"Rechazar", `flex-col sm:flex-row` |
| COB-11 | M | Conciliación | `use-acciones-conciliacion.ts:72-73,99-100`, `AvisosAccionConciliacion.tsx:16-21` | Éxito desaparece a 3 s, sin `role="status"`, lejos de la tarjeta | `role="status"`, 6-8 s con cierre, limpiar timer |
| COB-12 | M | Conciliación | `FiltrosConciliacion.tsx:76-83`, `ConciliacionPage.tsx:43-65` | Buscador de 36px y 12px; paginación solo arriba | `min-h-11`, `autoComplete="off"`, `Paginacion` bajo la lista |
| COB-13 | M | Conciliación | `Encabezado:22,29`, `FiltrosConciliacion:89-91` | Conteo duplicado; Title Case; nombres distintos al de Cartera | Sentence case, "Pagos por validar"; quitar `font-mono` del texto |
| COB-20 | M | Cartera | `AccionesFilaCartera.tsx` | Botones idénticos sin nombre del alumno; tres botones que envuelven | `aria-label` con nombre; menú "Más" en móvil (D3) |
| COB-21 | M | Cartera | `CeldaAlumnoCartera.tsx:24`, `BadgeCartera.tsx:28` | `truncate` sobre el nombre; badge sin `whitespace-nowrap` | `line-clamp-2 break-words`; `ui/BadgeEstado` |
| COB-22 | M | Cartera | `PestanasCartera.tsx:38-69` | Cuatro tabs con `flex-wrap` que ocupan 2-3 filas (inferido) | `BarraTabsSegmentada` de 4 columnas: Mora, Por vencer, Revisión, Al día |
| COB-23 | M | Cartera | `BuscadorCartera.tsx:44-48` | "Mostrando 3 de 3 registros en En Mora"; sin `aria-live`; buscador de 36px | "3 registros · En mora", `aria-live="polite"`, `min-h-11` |
| COB-24 | M | Cartera | `CarteraPage.tsx:91-103,118-125` | Error/carga propios sin roles; KPIs viejos con error; salto de layout | `EstadoError` + esqueleto de KPIs; separar error de recarga |
| COB-25 | M | Cartera | `ResumenCartera.tsx:47-55` | `Link` sin foco visible; mora y por vencer no enlazan a su pestaña | `focus-visible:outline-2`; enlazar `?pestana=` |
| COB-26 | M | Cartera | `ModalCobroCartera.tsx:101-187`, `useCobroCartera.ts:94-157` | Cobro en efectivo "aprobado al instante"; `type="number"`, ids estáticos, sin `max-h` | Línea resumen previa, `inputMode="decimal"`, `useId`, `overflow-y-auto` |
| COB-27 | M | Cartera | `ModalRecordatorioCartera.tsx:156-173` | El mensaje se envía antes de verse | Vista previa (requiere API, D2) |
| COB-28 | M | Cartera | `TablaEscritorioCartera.tsx:86-95`, `AccionesFilaCartera.tsx:28-37` | Miniatura sin `onError`; "Revisar en bandeja" no identifica el pago | `?q=<alumno>` como búsqueda inicial; "Comprobante no disponible" |

BAJA: COB-14 (bandeja vacía sin salida a Cartera), COB-15 (importes sin helper `formatMonto`), COB-16 (sin `AvisoDatosOffline`; `h3` sin jerarquía), COB-29 (tabla sin `caption`), COB-30 (cuatro nombres para dos pantallas; `title` en táctil), COB-31 (badges "USD"/"≤ 5 días" sin valor).

### SEG · Seguimiento, menú y navegación del entrenador

| ID | P | Vista | Archivo:línea | Problema | Corrección |
|---|---|---|---|---|---|
| SEG-01 | A | Dashboard | `DashboardPage.tsx:245,270` | `|| 0` y "0 pendientes" en carga y en error | "—" hasta tener datos; con error, solo el enlace |
| SEG-02 | A | Dashboard | `DashboardPage.tsx:25-46,120-160` | `isLoading` sin efecto; listas vacías con error; sin aviso offline | `EstadoCarga`, `EstadoError`, `AvisoDatosOffline` |
| SEG-03 | A | Dashboard | `DashboardPage.tsx:1-386`, `:31-46` | Página sobre 300 (deuda frente a la regla; el guardián no falla); fetch con `useEffect` en la página | Extraer hook, `GridKpisDashboard`, `ListaRiesgoDashboard`, fixture demo |
| SEG-04 | A | Dashboard | `DashboardPage.tsx:163-231`, `MetricCard.tsx:41` | KPIs no accionables; `hover` falso en tarjetas sin enlace | Enlace extendido a monitor/`?pestana=mora`; quitar `hover` |
| SEG-12 | A | Monitor | `TarjetaAlumnoMonitor.tsx:~61-67,120-140` | `article` con `onClick` sin foco; Link de ~32px | Patrón de `TarjetaAlumnoDirectorio`; controles `min-h-11 min-w-11` |
| SEG-13 | A | Monitor | `CabeceraMonitor.tsx:~71-79` | "Actualizar" ~36px; buscador de 12px | `BotonTactil`; input `text-base sm:text-xs` |
| SEG-20 | A | Antropometría | `EncabezadoAntropometria.tsx:39-60` | Pestañas sin `tablist`/`aria-selected`; "Comparador Antes / Después" no cabe | `BarraTabsSegmentada` de 2 columnas: "Por revisar", "Comparar" |
| SEG-21 | A | Antropometría | `TarjetaControlPendiente.tsx:~101-123` | Fila de acciones sin wrap; botones ~34px | `flex-col-reverse sm:flex-row`, `BotonTactil` |
| SEG-22 | A | Antropometría | `TarjetaControlPendiente.tsx:~37-50`, `AntropometriaPage.tsx:126-153` | Cabecera sin wrap; nombre del alumno al final; éxito sin `role="status"` y con timer | Nombre como `h3`, `flex-wrap min-w-0`, `role="status"` |
| SEG-25 | A | Navegación | Sidebar, BottomNav, `CoachMenuPage.tsx:160,168,196` | Cinco nombres para el mismo destino; "Ver alumnos" repetido | Tabla única en `lib/etiquetas-dominio` (D5) |
| SEG-26 | A | Navegación | `BottomNav.tsx:19-23` | Sin insignias de pendientes; solo 3 destinos | Insignias con conteo y `aria-label` (D4) |
| SEG-05 | M | Dashboard | `DashboardPage.tsx:162` | Lo accionable queda ~1100px abajo en 360px | Franja "Requiere tu atención" (D4) |
| SEG-06 | M | Dashboard | `DashboardPage.tsx:138-140` | Badge fijo "Operación Activa" | Quitar o "Actualizado hace X" |
| SEG-07 | M | Dashboard | `DashboardPage.tsx:297-301,305-320,342-346,352-365` | Emoji; filas no enlazan a la ficha; "Ver todos" solo con más de 5 | Filas como `Link` ≥44px, `EstadoVacio` sin emoji |
| SEG-08 | M | Dashboard | `MetricCard.tsx:57`, `DashboardPage.tsx:187` | `truncate` en el badge del KPI; "Montos en USD" en verde | `whitespace-nowrap`/`BadgeEstado`; USD al subtítulo |
| SEG-09 | M | Dashboard | `DashboardPage.tsx:179-182` | Montos "$1900.00" sin formato | `formatMonto` común |
| SEG-14 | M | Monitor | `CabeceraMonitor.tsx:~85-155` | Chips propios; "En riesgo (Rojo)" | `ChipFiltro` con conteo; etiquetas cortas con icono distinto |
| SEG-15 | M | Monitor | `TarjetaAlumnoMonitor.tsx:~104-118,138-152` | `animate-pulse` sin `motion-reduce`; barra solo por color; chip propio | `motion-safe:`; `BadgeEstado` |
| SEG-16 | M | Monitor | `TarjetaAlumnoMonitor.tsx:~76` | `truncate` sobre el nombre | `line-clamp-2 break-words` |
| SEG-17 | M | Monitor | `MonitorAdherenciaPage.tsx:89-98,75` | Paginación solo arriba; posible spinner en recarga (no verificado) | `Paginacion` al pie; no sustituir la lista |
| SEG-18 | M | Monitor | `EstadosMonitor.tsx` | Duplica `EstadoCarga/Error/Vacio`; sin aviso offline | Sustituir y añadir `AvisoDatosOffline` |
| SEG-23 | M | Antropometría | `AntropometriaPage.tsx:155-194`, `ColaPendientesAntropometria.tsx:~73-83` | Error de la cola oculta el comparador; buscador de 12px que solo filtra la página | `EstadoError` solo en "Por revisar"; "Buscar en esta página" |
| SEG-24 | M | Antropometría | `TarjetaControlPendiente.tsx:~85-95` | `pesoKg` sin formato ni "—"; fecha cruda si no es `YYYY-MM-DD` | "—" como en `datos-clave-alumno`; verificar el DTO |
| SEG-27 | M | Menú | `CoachMenuPage.tsx:54-283` | 8 tarjetas sin datos vivos; hero fija | `FranjaDatosClaveAlumno` con pendientes; hero según conteo |
| SEG-28 | M | Menú | `CoachMenuPage.tsx:22-23,37,44-50,65` | Nombre inventado desde el correo; badges decorativos | Nombre del perfil o "Hola"; quitar relleno |
| SEG-29 | M | Menú | `CoachMenuPage.tsx` | Foco sin offset; iconos sin `aria-hidden`; contraste de `text-warning` no verificado | `aria-hidden`, offset |
| SEG-30 | M | Cabecera | `Header.tsx:103-271` | ~8 controles en 328px; sync y fallos de ~28px (no medido) | Menú "Cuenta" (Radix), `min-h-11` |

BAJA: SEG-10 (imports duplicados; "Panel administrativo"/"Resumen del Negocio"), SEG-11 (`p-6` anidado a 360px), SEG-19 ("Últ. sesión", "Racha: 0 días"), SEG-31 (BottomNav 11px; tablet 768-1023px solo con 3 destinos), SEG-32 (doble relleno inferior).

### CFG · Plantillas y Ajustes del entrenador

| ID | P | Vista | Archivo:línea | Problema | Corrección |
|---|---|---|---|---|---|
| CFG-01 | A | Ajustes | `PestanasAjustes.tsx:44-47,55,61`, `PantallaAjustes.tsx:99-103` | 5 tabs con scroll horizontal (inferido); `sm:min-h-0`; iconos sin `aria-hidden` | `BarraTabsSegmentada` |
| CFG-02 | A | Ajustes | `PestanasAjustes.tsx:7-9`, `PantallaAjustes.tsx:99-117`, `AjustesPage.tsx:135-168` | Barra duplicada y lógica de `AjustesPage` duplicada | `AjustesPage` usa `PantallaAjustes` con `renderPestana` |
| CFG-06 | A | Planes | `use-planes-comerciales.ts:75,110` | `alert()` nativo; error de guardado y de carga comparten estado | `errorGuardado` local al modal con `role="alert"` |
| CFG-07 | A | Planes | `ModalPlanComercial.tsx:124-172,95-100,209-215` | Labels sin `htmlFor`; precio sin `inputMode`; quitar beneficio sin nombre; cierre ~28px | `CampoAjustes`, `aria-label` con `min-h-11` |
| CFG-08 | A | Planes | `ModalPlanComercial.tsx:41-48,70-76` | Fondo o Escape cierran y pierden lo escrito | `confirmandoCierre` como `ModalPlantilla` |
| CFG-10 | A | Planes | `TarjetaPlanComercial.tsx:84-95`, `use-planes-comerciales.ts:123-142` | Desactivar sin confirmación; botones ~30px; doble PATCH | Confirmación inline/`DialogoConfirmacion`; bloquear en vuelo |
| CFG-14 | A | Tasa | `FormularioTasa.tsx:95,149,161,172,99-143` | Cuatro labels sin `htmlFor`; fuentes sin `aria-pressed`/`radiogroup` | `CampoAjustes` con `inputMode="decimal"`; `role="radio"` en `radiogroup` |
| CFG-15 | A | Tasa | `FormularioTasa.tsx:58-68,82,190`, `ConversorTasas.tsx:76` | Chip "ADR-003 Vigente" (falso sin tasa); títulos con jerga | "Tasa de cambio", quitar chip, "Guardar tasa" |
| CFG-20 | A | Plantillas | `use-plantillas-banco.ts:42-45`, `PlantillasPage.tsx:130` | Cada recarga reemplaza la lista por el spinner | `cargandoInicial` vs `recargando`; aviso sobre la lista previa |
| CFG-21 | A | Plantillas | `FiltrosPlantillas.tsx:87-101` | Buscador y selector de ~34px, 12px | `min-h-11`, `text-base sm:text-sm` |
| CFG-03 | M | Ajustes | `ajustes.ts:36-42`, `PestanasAjustes.tsx:22` | Etiquetas largas; `BellRing` repetido | Etiquetas cortas con `ariaLabel` largo (D6) |
| CFG-04 | M | Ajustes | `AjustesPage.tsx:105-119` | Subtítulo enumera todo; "Nuevo plan" en la cabecera global | Subtítulo corto; acción en `PanelPlanes` |
| CFG-05 | M | Avisos | `PestanaNotificaciones.tsx:13-21` | Tarjeta redundante; "como entrenador" | `TarjetaAjustes` "Avisos" |
| CFG-09 | M | Planes | `ModalPlanComercial.tsx:19,43` | Precio `40.00` y dos beneficios precargados | Vacíos con placeholder (D7) |
| CFG-11 | M | Planes | `TarjetaPlanComercial.tsx:22-27,37,44,49,60` | "Activo en Catálogo", "USD / mes" ambiguo, sin `break-words`, badge propio | "Nuevo plan"/"Editar plan", `BadgeEstado`, `break-words` (D7) |
| CFG-13 | M | Planes | `PanelPlanes.tsx:36-58`, `AjustesPage.tsx:69-79` | Sin estado de carga; error bajo tarjetas cargadas; sin aviso offline | `EstadoCarga`, `AvisoDatosOffline` |
| CFG-16 | M | Tasa | `FormularioTasa.tsx:70-79`, `use-tasas-cambio.ts:112` | Éxito sin `role="status"` y permanente; sin "Cambios sin guardar" | `AvisosAjustes`; comparar contra `tasaVigente` |
| CFG-17 | M | Tasa | `FormularioTasa.tsx:82-90` | Texto de "Sin tasa" largo | Dos líneas, icono y color |
| CFG-18 | M | Tasa | `ConversorTasas.tsx:36-66` | Labels sin `htmlFor`; `type="number"`; símbolo `absolute` fijo | `CampoAjustes` con sufijo; plegar en `<details>` |
| CFG-19 | M | Tasa | `AjustesPage.tsx:190-226` | Muestra directo el formulario de edición | Resumen guardado + formulario en `<details>` |
| CFG-22 | M | Plantillas | `FiltrosPlantillas.tsx:116-121` | Contador técnico en `font-mono` | "N plantillas", `aria-live="polite"` |
| CFG-23 | M | Plantillas | `TarjetaPlantilla.tsx:90-100` | Badge propio sin `whitespace-nowrap` | `BadgeEstado` |
| CFG-24 | M | Plantillas | `TarjetaPlantilla.tsx:131-133` | Motivo de "Asignar" deshabilitado solo en `title` | Texto visible o `aria-describedby` |

BAJA: CFG-12 (opciones "1 Mes (Mensual)"), CFG-25 (iconos sin `aria-hidden`), CFG-26 (párrafo largo en `CabeceraPlantillas`), CFG-27 (positivo, no tocar).

### ENT · Entrenamiento, Progreso, Menú y navegación del alumno

| ID | P | Vista | Archivo:línea | Problema | Corrección |
|---|---|---|---|---|---|
| ENT-01 | A | Cabecera | `Header.tsx:112-157` | Sync y "rechazados" de ~28px; contador oculto en móvil | `min-h-11 min-w-11`, número visible |
| ENT-02 | A | Sesión | `use-cierre-sesion.ts:86-98`, `ModalFinalizarSesion.tsx:61-117` | Finalizar sin resumen de series pendientes | "Hiciste 3 de 12 series…" en el modal |
| PRO-01 | A | Progreso | `ProgresoPage.tsx:97`, `use-evolucion-progreso.ts:24-26,47` | Recarga cubre con spinner; fallo borra la evolución | Spinner solo sin datos; error sin vaciar |
| MEN-01 | A | Menú | `AtletaMenuPage.tsx` (365) | Sobre 300 (deuda frente a la regla; el guardián no falla); mezcla fetch y 4 tarjetas | `use-resumen-menu`, `TarjetaEntrenarHoy`, `TarjetaAccesoAlumno`, `ChipRacha` |
| MEN-02 | A | Menú | `AtletaMenuPage.tsx:233-242` | "Listo para iniciar" por defecto, en carga, error y completado | Derivar de datos; "Sin datos"/"Completado hoy"; quitar pulso |
| ENT-03 | M | Sesión | `EntrenamientoPage.tsx:181` | "Finalizar" solo arriba de la lista | Repetir `CtaFinalizarSesion` al final |
| ENT-04 | M | Sesión | `ChipsBloquesSemana.tsx:106`, `EntrenamientoPage.tsx:117` | "Hoy" se pinta en el bloque seleccionado | Usar `esSugeridoHoy`/`fechaProgramada` |
| ENT-05 | M | Sesión | `ChipsBloquesSemana.tsx:34,79-81,116-121` | Fecha del bloque pendiente solo en `title`; scroll horizontal | `fechaVisible` siempre; `flex-wrap`; `aria-current` |
| ENT-06 | M | Varias | ver T7 | Animaciones sin `motion-reduce` | Regla global (UX-02) |
| ENT-07 | M | Sesión | `FilaSerieEdicion.tsx:95,157` | −/+ de 32-36px en `sm` | `w-11` en todos los anchos |
| ENT-08 | M | Sesión | `FilaSerieEdicion.tsx:138` | `truncate` en "Plan: 60 kg" | `break-words` |
| ENT-09 | M | Sesión | `ModalFinalizarSesion.tsx:90,107`, `use-cierre-sesion.ts:62-63,73-78` | Rejilla de 5 con etiquetas largas (inferido); esfuerzo 8 por defecto; emoji dentro de `notas` | Etiquetas en extremos; sin valor inicial; valor interno aparte (D10) |
| NAV-01 | M | Navegación | `BottomNav.tsx:19-23,39`, `AppLayout.tsx:32-38` | `<nav>` sin `aria-label`; "Cargando módulo…" sin `role` | `aria-label`; `EstadoCarga`; cuarto destino a evaluar (D5) |
| PRO-02 | M | Progreso | `CampoMedidaCheckin.tsx:22` | Campos de ~40px | `min-h-11` |
| PRO-03 | M | Progreso | `CampoMedidaCheckin.tsx:44-51` | Error sin `aria-describedby`; foco al enviar con error sin verificar | `aria-describedby`, foco al primer error |
| PRO-04 | M | Progreso | `FormularioCheckinAntropometrico.tsx:168-175` | El envío no avisa de que no hay conexión | `AvisoDatosOffline` y bloquear (D9) |
| PRO-05 | M | Progreso | `ProgresoPage.tsx:43` | `vistaActiva` en estado: Atrás sale de Progreso; se pierde el formulario | `?vista=` en URL; "Cambios sin guardar" |
| PRO-06 | M | Progreso | `ProgresoPage.tsx:113,116`, `HubProgreso.tsx:42`, `Formulario…:90,173,50` | Jerga y Title Case; dos nombres para "evolución" | "Mi progreso", "Tus medidas", "Enviar a mi entrenador" |
| MEN-03 | M | Menú | `AtletaMenuPage.tsx:96-103` | Falla la semana sin Reintentar ni aviso; efecto sin cancelar | `EstadoError` compacto, `AvisoDatosOffline` |
| MEN-04 | M | Menú | `AtletaMenuPage.tsx:317-327,36-51` | Badge de cuota propio sin `whitespace-nowrap` | `BadgeEstado`, `flex-wrap min-w-0` |
| MEN-05 | M | Menú | `AtletaMenuPage.tsx:113-114,135-165` | Nombre desde el correo; cabecera sin `min-w-0` (inferido) | Nombre real o "Hola"; `flex-wrap` |

BAJA: ENT-10 ("coach"/"entrenador", botón sin `type`), PRO-07 (`porcentajeGrasa` 0 como vacío; peso sin formato), MEN-06 (Title Case, emoji, barra sin `role="progressbar"`).

### ALU · Nutrición, Pagos y Ajustes del alumno

| ID | P | Vista | Archivo:línea | Problema | Corrección |
|---|---|---|---|---|---|
| ALU-01 | A | Pagos | `use-reporte-pago.ts:73` | Monto precargado `'1300.00'` | Inicio `''`, placeholder, validar >0 (D8) |
| ALU-02 | A | Pagos | `FormularioReportePago.tsx:207,224,236,269,282` | Labels sin `htmlFor`/`id` | `useId`; `CampoAjustes` generalizado; specs por `getByLabelText` |
| ALU-03 | A | Pagos | `FormularioReportePago.tsx:211,228,243,277,296,306` | Controles y submit de ~40px | `min-h-11` |
| ALU-04 | A | Pagos | `PestanaReportePago.tsx:289-293`, `use-reporte-pago.ts:108,113,141,166,202` | Todos los errores en un banner arriba sin `role="alert"` | Errores por campo con `aria-describedby`; banner junto al botón |
| ALU-05 | A | Pagos | `SubidaComprobantePago.tsx:353,366-369` | Zona de adjuntar `div onClick` sin teclado; label no asociado | `<button type="button">` `min-h-11` (modelo `DiarioFotografico.tsx:67`) |
| ALU-16 | A | Nutrición | `AccionesGuardarReporte.tsx:509` | "A partir de las 18:00" fijo, ignora la zona del perfil | `HORA_INICIO_VENTANA_CHECKIN_NUTRICIONAL` y `horaDeZona(zonaPerfil)` |
| ALU-23 | A | Ajustes | `PantallaAjustes.tsx:99-117` | Píldoras con scroll horizontal; "Zona horaria" fuera de vista (inferido) | `BarraTabsSegmentada` de 4 columnas |
| ALU-06 | M | Pagos | `SubidaComprobantePago.tsx:403-410,395` | Quitar comprobante ~32px, solo `title`; `truncate` del nombre | `min-h-11 min-w-11`, `aria-label`, `line-clamp-2` |
| ALU-07 | M | Pagos | `use-reporte-pago.ts:134-206` | Reintento vuelve a subir la imagen; timer sin limpiar; red ambigua | Reutilizar `storageKey`, cleanup, mensaje de verificar historial (API, D8) |
| ALU-08 | M | Pagos | `PestanaReportePago.tsx:271-278`, `PestanaHistorialPagos.tsx:68-81` | "Volver"/"Nuevo Abono" sin `type` ni 44px; "Paso guiado" relleno | `BotonTactil`; quitar relleno |
| ALU-09 | M | Pagos | `SelectorAccionesPagos.tsx:542-547,571-575` | `div role="button"` solo con Enter; sin foco visible | `<button>` o Espacio + anillo |
| ALU-10 | M | Pagos | `FilaTransaccionPago.tsx:404-410,417-424`, `PagosPage.tsx:193` | Botones ~28px; "Corregir" abre formulario vacío | `min-h-11`; prellenar o "Reportar de nuevo" |
| ALU-12 | M | Pagos | `TarjetaResumenCuota.tsx:464-467` | `toLocaleDateString('es-ES')` a mano sin año | `formatFechaLocal`; confirmar el formato real |
| ALU-17 | M | Nutrición | `NutricionPage.tsx:189`, `AvisoVentanaReporte.tsx` | El aviso de ventana no enlaza a la zona horaria | Enlace a `rutaAjustes` `?tab=zona-horaria` |
| ALU-18 | M | Nutrición | `CalendarioUltimos7Dias.tsx:566-596` | Etiquetas truncadas en 7 columnas; estado en `title` | Lista vertical o icono + `sr-only` completo |
| ALU-19 | M | Nutrición | `FormularioDatosReporte.tsx:342-383,394` | Campos sin error junto al campo; sin `autoComplete="off"` | `aria-invalid` + error; `aria-describedby` |
| ALU-24 | M | Ajustes | `lib/ajustes.ts:31-38` | Etiquetas largas | Perfil, Acceso, Avisos, Zona horaria (D6) |
| ALU-25 | M | Ajustes | `PestanasAjustes.tsx:25` | `BellRing` en `zona-horaria`; tres copias de la barra | Una sola `BarraTabsSegmentada` |
| ALU-26 | M | Ajustes | `AjustesAlumnoPage.tsx:223-251`, `SelectorZonaHoraria.tsx:31` | Título duplicado; no muestra la hora local | "Ahora son las HH:MM en <zona>" con `horaDeZona` |

BAJA: ALU-11 (jerga y Title Case en Pagos), ALU-13 (fallback crudo de `fechaOperacion`), ALU-14 (referencia y tasa sin `break-words`), ALU-15 (saldo y total sin `flex-wrap`), ALU-20 (semáforo sin problema evidente), ALU-21 (emojis y plural manual), ALU-22 (positivo; falta `sin-datos` en Pagos), ALU-27 (`role="alert"` en `CampoAjustes`; "Cambios sin guardar" en Perfil).

## 6. Fuentes

Los cinco reportes viven en `.external-agents/auditoria-ux/` (carpeta en `.gitignore`, se borra al cerrar los lotes; este documento es la referencia permanente):

- `.external-agents/auditoria-ux/00-brief.md` (decisiones y piezas reutilizables)
- `.external-agents/auditoria-ux/01-cobros-entrenador.md` (COB)
- `.external-agents/auditoria-ux/02-seguimiento-entrenador.md` (SEG)
- `.external-agents/auditoria-ux/03-plantillas-ajustes-entrenador.md` (CFG)
- `.external-agents/auditoria-ux/04-entrenamiento-progreso-alumno.md` (ENT, NAV, PRO, MEN)
- `.external-agents/auditoria-ux/05-nutricion-pagos-ajustes-alumno.md` (ALU)

Fecha: 2026-10-28. Commit base: `541254e`. Contexto previo: rediseño de la ficha del alumno ([[RF-011-onboarding-alumnos-manual-deeplink]], [[RF-012-ciclo-vida-alumno-soft-delete]]).
