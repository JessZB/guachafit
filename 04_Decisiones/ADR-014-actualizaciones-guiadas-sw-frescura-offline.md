---
id: ADR-014
titulo: "ADR-014: Actualizaciones Guiadas del Service Worker, Frescura Offline y Logout Seguro"
fecha: 2026-09-21
estado: propuesto
decisores:
  - "Tech Lead"
  - "Principal Architect"
tags:
  - decision
  - adr
  - arquitectura
  - frontend
  - pwa
  - offline-first
  - service-worker
  - ux
---

# ADR-014: Actualizaciones Guiadas del Service Worker, Frescura Offline y Logout Seguro

## 1. Estado
`propuesto`

---

## 2. Contexto y Fuerzas en Juego
La PWA ([[ADR-004-stack-frontend-pwa-offline-first]]) usaba `registerType: 'autoUpdate'` de `vite-plugin-pwa`: al detectar un Service Worker nuevo, la app lo activaba y recargaba **en silencio**, incluso si el alumno estaba a mitad de una serie del checklist (`RF-001`) o de un check-in (`RF-003`). Además, el Service Worker cachea los `GET` de API con estrategia `NetworkFirst` y TTL de 24h (`vite.config.ts`), de modo que sin conexión se servía la última copia **sin ninguna señal de su antigüedad**: el usuario no podía saber si veía datos de hace 5 minutos o de ayer. Por último, el cierre de sesión limpiaba la cola offline de Dexie y las cachés **descartando mutaciones pendientes en silencio** (solo un `console.warn`).

- **Problema a resolver:** eliminar las tres pérdidas silenciosas de confianza —recarga imprevista, datos sin fecha y logout que borra trabajo— sin romper el modo offline-first ([[ADR-004-stack-frontend-pwa-offline-first]]).
- **Fuerzas en conflicto:**
  1. **Frescura vs. no interrumpir:** recibir la versión nueva rápido es deseable, pero una recarga no anunciada puede destruir el estado local de captura.
  2. **Offline útil vs. offline honesto:** servir caché permite entrenar sin señal, pero presentarla como actual es mentir.
  3. **Cerrar sesión fácil vs. cerrar sesión seguro:** añadir fricción a todos los logouts castiga el caso normal; ignorar los pendientes pierde trabajo real ya capturado.
  4. **Simplicidad técnica vs. control del usuario:** `autoUpdate` es una línea de configuración; el modo `prompt` exige estado observable, UI y pruebas.
- **Opciones consideradas:**
  1. *Opción A (mantener `autoUpdate`):* actualización invisible y recarga inmediata.
     - *Descartada:* puede perder el trabajo en curso; es exactamente el problema a resolver.
  2. *Opción B (avisar y recargar automáticamente al quedar "idle"):* aplicar la versión nueva sin clic cuando el usuario no interactúa.
     - *Descartada:* "idle" es una heurística; un descanso entre series es el momento exacto en que el usuario vuelve a la pantalla. Cualquier recarga sin acción explícita es una apuesta.
  3. *Opción C (modo `prompt` + banner pasivo + frescura visible + logout con confirmación):* nada se aplica sin clic; la antigüedad de los datos cacheados se informa; el logout cuenta pendientes y ofrece cancelar / sincronizar / confirmar.
     - *Seleccionada.*

---

## 3. Decisión
Elegimos la **Opción C**: el Service Worker queda en espera (`registerType: 'prompt'`) y **solo se aplica cuando el usuario pulsa "Actualizar"** en un banner pasivo ("Nueva versión disponible"); la app nunca recarga sola a mitad de sesión. Los datos servidos desde caché offline se señalan con su antigüedad, y el logout asume explícitamente el trabajo pendiente antes de cerrar.

### Detalles de la Implementación
1. **Actualización guiada del Service Worker:** `vite-plugin-pwa` con `registerType: 'prompt'`; el estado de actualización (`onNeedRefresh`) vive en `pwa-actualizacion.ts` y el banner `ActualizacionDisponible` es discreto y no bloqueante. Solo un clic llama a `updateSW(true)` para activar el SW en espera y recargar; si la recarga no ocurre o el registro falla, se muestra un error honesto en lugar de fingir que se actualizó. El registro se inyecta como dependencia (probado en Node sin navegador).
2. **Frescura offline honesta:** los `GET` de API se cachean con `NetworkFirst` y TTL de 24h; al servir desde caché, `frescura-cache.ts` fecha la copia con el header `date` de la respuesta original y la UI (`use-frescura-offline` + `AvisoDatosOffline`) muestra "Sin conexión · datos guardados · hace X", con formato humano ("hace 25 min", "hace 3 h", "hace 1 día"). Sin header válido o sin copia cacheada no se afirma edad alguna.
3. **Logout sin pérdidas silenciosas:** `use-logout-seguro` cuenta las mutaciones pendientes de la cola offline; si hay al menos una, abre un diálogo accesible (`DialogoLogoutPendientes`) con tres salidas: **Cancelar**, **Sincronizar ahora** (reintenta la cola y cierra sesión solo si queda en 0) y **Cerrar sesión igualmente**. En modo demo no hay datos reales y no se pide confirmación ([[ADR-012-modo-demo-explicito-datos-sinteticos]]).
4. **Dependencia directa:** `workbox-window` se declara como dependencia directa de `apps/web` y `virtual:pwa-register` reemplaza al registro estático anterior.

---

## 4. Consecuencias y Trade-offs

### Consecuencias Positivas (Beneficios)
- **C1:** Ninguna recarga silenciosa puede interrumpir una sesión de entrenamiento o una captura en curso: el usuario decide cuándo aplicar la versión nueva.
- **C2:** Los datos offline dejan de ser opacos: antigüedad visible cuando se sirven desde caché y logout con conteo explícito de pendientes.
- **C3:** El TTL de 24h de la caché de API se mantiene, pero mitigado por transparencia: el usuario acepta el dato sabiendo su edad (o se le dice que no puede afirmarla).
- **C4:** El flujo es testeable en Node (specs de actualización, frescura e instalación) sin depender del navegador ni de `virtual:pwa-register`.

### Consecuencias Negativas (Costos y Trade-offs)
- **T1:** La actualización deja de ser *over-the-air* instantánea: hasta que el usuario acepta, sigue la versión previa. El banner es la única señal y no se puede forzar sin romper la garantía de "nunca sin clic".
- **T2:** Suma una dependencia directa de runtime (`workbox-window`) y una superficie de UI nueva (banner, chips de frescura, diálogo de logout) que debe mantenerse accesible.
- **T3:** La frescura depende del header `date` de la respuesta original; sin él la UI degrada a "no se puede afirmar la antigüedad" (honesto, pero menos útil).

### Riesgos Mitigados y Residuales
- **Riesgo Mitigado:** pérdida de series o check-ins por una recarga de actualización o por un logout que limpiaba la cola sin avisar.
- **Riesgo Residual:** usuarios que nunca pulsan "Actualizar" permanecen en versiones antiguas; no se fuerza la aplicación de la versión nueva.
- **Riesgo Residual:** un dato cacheado puede seguir teniendo hasta 24h de antigüedad; ahora es visible, no eliminado.

---

## 5. Trazabilidad y Referencias
- Requerimientos asociados: [[RF-001-checklist-entrenamiento-diario]] (checklist offline y logout con pendientes), [[RF-002-nutricion-agil-reporte-rapido]] y [[RF-003-checkin-antropometrico-rbac-hibrido]] (capturas offline que no deben perderse por una recarga).
- Decisiones relacionadas: [[ADR-004-stack-frontend-pwa-offline-first]] (PWA offline-first, Dexie/IndexedDB, `storage.persist()`), [[ADR-012-modo-demo-explicito-datos-sinteticos]] (el logout no pide confirmación en modo demo).
- Implementación (commits `9f121e5` y `e37c235`): `apps/web/vite.config.ts` (`registerType: 'prompt'`, manifest, runtime caching 24h), `apps/web/src/lib/pwa-actualizacion.ts`, `apps/web/src/lib/frescura-cache.ts`, `apps/web/src/lib/use-frescura-offline.ts`, `apps/web/src/lib/use-logout-seguro.ts`, `apps/web/src/components/common/ActualizacionDisponible.tsx`, `apps/web/src/components/common/AvisoDatosOffline.tsx`, `apps/web/src/components/common/DialogoLogoutPendientes.tsx`.
