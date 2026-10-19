---
id: ADR-013
titulo: "ADR-013: Paginación Server-Side y Stack de Listas — Envelopes + TanStack Query + Radix"
fecha: 2026-09-20
estado: aceptado
decisores:
  - "Tech Lead"
  - "Principal Architect"
tags:
  - decision
  - adr
  - arquitectura
  - frontend
  - api
  - paginacion
  - tanstack-query
  - radix
---

# ADR-013: Paginación Server-Side y Stack de Listas — Envelopes + TanStack Query + Radix

## 1. Estado
`aceptado`

---

## 2. Contexto y Fuerzas en Juego
Los paneles del entrenador (directorio de alumnos, monitor de adherencia, bandeja de conciliación, cola antropométrica, historial de sesiones y de pagos) cargaban listas completas o traían la data sin un contrato de paginación común: cada pantalla resolvía su propio recorte, varias filtraban en el cliente sobre el arreglo completo y el costo de red/CPU crecía con la cartera. Al mismo tiempo, TanStack Query ya estaba instalado como parte del stack offline-first ([[ADR-004-stack-frontend-pwa-offline-first]]) pero permanecía **dormido**: las pantallas usaban estados manuales en lugar del estado de servidor que el stack ya pagaba.

- **Problema a resolver:** unificar el contrato de los listados paginados del coach, mover búsqueda/filtros/orden al servidor donde aporta valor y activar el estado de servidor real (TanStack Query) con controles de UI accesibles y reutilizables.
- **Fuerzas en conflicto:**
  1. **Consistencia vs. velocidad de entrega:** cinco endpoints con formas de respuesta distintas obligan a cada pantalla a reimplementar corte, conteo y controles; un envelope común acelera, pero exige tocarlos todos.
  2. **Compatibilidad vs. paginación total:** el historial de pagos y la evolución corporal alimentan charts y fichas que necesitan la serie completa; forzar paginación rompería consumidores existentes.
  3. **Server-side vs. client-side:** filtrar en el servidor es correcto con offset y totales reales, pero algunos filtros de bandejas (búsqueda/método/estado) aún no tienen camino SQL dedicado.
  4. **Accesibilidad y cero duplicación de UI:** los controles de paginación deben ser accesibles (teclado, ARIA) y existir una sola vez para todas las pantallas.
- **Opciones consideradas:**
  1. *Opción A (Paginación por cursor + scroll infinito):* cursor opaco por página, sin `total`.
     - *Descartada:* los paneles del coach necesitan "Mostrando X de N" y saltos directos de página; el scroll infinito complica la auditoría visual de bandejas operativas.
  2. *Opción B (Offset + envelope estándar + opt-in para series completas + hook/componente compartidos):* envelope `{ items, total, limit, offset }`, defaults y techos por endpoint, paginación opt-in donde el consumidor necesita la serie completa, y un componente/hook únicos.
     - *Seleccionada.*
  3. *Opción C (Virtualización con listas completas):* renderizar todo y virtualizar solo el DOM.
     - *Descartada por ahora:* no resuelve la transferencia de red ni el COUNT real; se reevaluará si una página supera ~200 filas visibles.

---

## 3. Decisión
Elegimos la **Opción B (offset + envelope estándar con opt-in)** porque da un contrato único y honesto (`total` real) sin romper los consumidores que necesitan la serie completa, y activa el stack de listas ya previsto en el proyecto.

### Detalles de la Implementación
1. **Envelope estándar (`PaginadoDTO<T>`):** `{ items, total, limit, offset }`; `total` es el COUNT real de filas que cumplen los filtros (nunca el tamaño de `items`). Defaults y techos documentados en [[03_Contratos_API_Especificacion]] §1.1:
   - `GET /alumnos`: default y techo 100 (+ `resumen` de cartera completa).
   - `GET /sesiones/alumno/{alumnoId}/historial`: default 30, techo 100.
   - `GET /entrenador/monitor-adherencia`: default 25, techo 100 (+ `resumen` de cartera completa).
   - `GET /finanzas/conciliacion/bandeja`: default 25, techo 100 (FIFO).
   - `GET /antropometria/pendientes`: default 25, techo 100.
2. **Paginación opt-in para series completas:** `GET /finanzas/clientes/{clienteId}/historial` (`txLimit`/`txOffset` + `transaccionesTotal`) y `GET /antropometria/evolucion/{alumnoId}` (`controlesLimit`/`controlesOffset` + `controlesTotal`) conservan el comportamiento histórico cuando no reciben parámetros; los charts siguen pidiendo la serie completa.
3. **Filtros server-side antes del slice:** `q`, `estado`, `modalidad`, `incluirArchivados`, `soloArchivados`, `semaforoPago` y `orden` en el directorio; `q`, `semaforo` y `orden` en el monitor.
   - El `orden` del directorio se añadió el 2026-10-19 (lote "Mis alumnos").
   - Va en SQL, con desempate total por `id`, para que el offset no repita ni salte filas.
   - La regla vale para todo listado paginado: ordenar en memoria la página ya cortada está prohibido, porque ordena cada página por separado y no la cartera.
   - Ese orden se prueba con un E2E contra Postgres real (`apps/api/test/bdd/mis-alumnos-directorio-orden.e2e.spec.ts`). El mock drizzle de los BDD ignora `orderBy` y no puede demostrarlo. Los totales de contexto (`resumen`) siempre describen la cartera completa, no la página.
4. **Stack de UI:** componente `Paginacion` (Radix DropdownMenu para filas por página 10/25/50/100, números con elipsis, `aria-current="page"`, controles deshabilitados durante la carga) y hook `usePaginacionServidor` sobre TanStack Query (`placeholderData: keepPreviousData` para evitar parpadeo al cambiar de página y `AbortSignal` para cancelar consultas obsoletas).
5. **Honestidad de datos:** el filtro de semáforo del monitor se aplica en el servidor, pero el semáforo se calcula en memoria (agregados por alumno), no como columna SQL consultable.
6. **Deuda declarada:** los filtros de página visible (bandeja de conciliación, pendientes antropométricos y pagos del alumno con copy "en esta página") y la lista de plantillas sin paginar quedan registrados en [[03_Contratos_API_Especificacion]] §1.2 y en las notas de [[RF-017-banco-plantillas-rutinas-entrenamiento]].

---

## 4. Consecuencias y Trade-offs

### Consecuencias Positivas (Beneficios)
- **C1:** Contrato único de listados: las pantallas no reinterpretan payloads y el conteo "X de N" es real (`total` = COUNT del servidor).
- **C2:** Menor costo de red y CPU: solo viaja la página y los filtros server-side reducen la transferencia a lo que el coach realmente consulta.
- **C3:** TanStack Query deja de estar dormido: caché por `[clave, pagina, tamano, filtros]`, `keepPreviousData` sin parpadeos y cancelación de consultas obsoletas.
- **C4:** Controles accesibles y consistentes implementados una sola vez (`Paginacion` + Radix), con teclado y ARIA en lugar de soluciones ad-hoc por pantalla.

### Consecuencias Negativas (Costos y Trade-offs)
- **T1:** Deuda declarada: filtros de bandeja de conciliación, pendientes antropométricos y pagos del alumno filtran solo la página visible, y la lista de plantillas no está paginada (carga completa con filtro client-side).
- **T2:** La paginación por offset degrada con páginas muy profundas o inserciones concurrentes (posibles duplicados/saltos entre páginas); aceptable para los volúmenes actuales, a revisar si la cartera crece.
- **T3:** La UI debe mantener coherentes los filtros activos y el `queryKey` (clave compuesta) para no servir caché de una combinación incorrecta.
- **T4:** Cada endpoint nuevo de listado debe adoptar el envelope y sus techos, o justificar su excepción en el contrato (disciplina de conformidad).

### Riesgos Mitigados y Residuales
- **Riesgo Mitigado:** decisiones operativas sobre listas truncadas o conteos falsos; pantallas que descargaban cientos de filas para mostrar veinte.
- **Riesgo Residual:** si una lista supera ~200 filas por página o el volumen crece mucho, habrá que reevaluar virtualización (TanStack Virtual) o paginación por cursor.
- **Riesgo Residual:** los filtros declarados "en esta página" pueden confundir si el usuario espera alcance global; el copy lo declara explícitamente hasta que se migren al servidor.

---

## 5. Trazabilidad y Referencias
- Requerimientos asociados: [[RF-001-checklist-entrenamiento-diario]], [[RF-003-checkin-antropometrico-rbac-hibrido]], [[RF-004-evolucion-corporal-comparador-fotografico]], [[RF-007-reporte-pagos-bandeja-conciliacion]], [[RF-009-tablero-control-cartera-morosidad]], [[RF-011-onboarding-alumnos-manual-deeplink]], [[RF-013-dashboard-comando-entrenador-kpis]], [[RF-017-banco-plantillas-rutinas-entrenamiento]]; [[RNF-003-aislamiento-multitenant-seguridad-datos-salud]] (p95 del dashboard).
- Decisiones relacionadas: [[ADR-004-stack-frontend-pwa-offline-first]] (TanStack Query/Dexie en el stack), [[ADR-012-modo-demo-explicito-datos-sinteticos]] (los fixtures demo cortan la página con el mismo contrato, sin red).
- Documentación de arquitectura: [[03_Contratos_API_Especificacion]] §1.1 (convención) y §1.2 (pendientes conocidos), [[01_Evaluacion_Stack_Tecnologico]].
- Implementación: `packages/shared/src/types/index.ts` (`PaginadoDTO<T>`), `packages/shared/src/schemas/index.ts` (límites y filtros), `apps/web/src/components/common/Paginacion.tsx`, `apps/web/src/lib/use-paginacion-servidor.ts`.
