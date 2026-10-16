---
id: ADR-024
titulo: "ADR-024: Orden de los envíos de una sesión de entrenamiento (un envío directo en vuelo retiene lo posterior)"
fecha: 2026-10-15
estado: aceptado
decisores:
  - "Dueño del producto"
  - "Tech Lead"
tags:
  - decision
  - adr
  - frontend
  - offline
  - entrenamiento
---

# ADR-024: Orden de los envíos de una sesión de entrenamiento

## 1. Estado
`aceptado`

---

## 2. Contexto y Fuerzas en Juego
En [[RF-001-checklist-entrenamiento-diario]] §7.10, la pantalla de entrenamiento envía cada cambio en directo o lo deja en la cola offline. La cola ya respetaba el orden causal por sesión, pero un envío **directo** quedaba fuera de ese orden:

- **Carrera real:** con mala señal, el alumno marca la serie 2 y la desmarca. El desmarcado llega antes que el marcado, y el servidor (último en escribir gana, sin versiones) se queda con la serie marcada.
- **Re-encolado con la hora equivocada:** un directo que fallaba se re-encolaba con la hora del fallo, detrás de cambios que el alumno hizo después.
- **Finalizar se adelantaba:** `/finalizar` salía con una serie todavía en vuelo.
- **Rechazo tardío ciego:** el rechazo de un toque viejo restauraba instantáneas antiguas (serie, porcentaje y racha) y pisaba un toque posterior.

El diagnóstico salió de un Judgment Day de diseño con dos jueces independientes (2026-10-12), que confirmaron la carrera y recomendaron la opción B.

---

## 3. Decisión
**Decisión del dueño:** el orden se garantiza dentro del dispositivo. Con red lenta, el segundo cambio puede verse unos segundos como "por enviar". Varias pestañas o dispositivos y el versionado en el servidor quedan fuera.

Mecanismo (opción B corregida, más la guarda G):

- **Registro de envíos en vuelo** (`apps/web/src/lib/envios-en-vuelo.ts`): cuenta, por sesión (`sesion:{id}`), los envíos directos que van por la red. Avisa cuando una sesión se queda sin vuelos.
- **`enviarOEncolar`** (`components/atleta/entrenamiento/use-envio-sesion.ts`):
  - reserva el vuelo **antes del primer `await`**, para que dos toques seguidos no puedan salir los dos en directo;
  - encola si ya hay un vuelo de la sesión, si no hay red o si la cola aún tiene algo de la sesión;
  - todo lo encolado lleva la **hora de la acción** (`marcaDeAccionMs`, estrictamente creciente), también el directo que falla y se re-encola;
  - el directo tiene un **plazo de 15 s**: al vencer, se re-encola con la misma clave de idempotencia (el servidor deduplica si sí llegó) y libera el vuelo, en lugar de retener la sesión hasta recargar.
- **Cola** (`lib/offline-db.ts`, `lib/offline-sync.ts`): no saca nada de una sesión con un vuelo en curso. Al liberarse el vuelo, la cola se procesa sola. Si se pide procesar mientras ya hay una pasada en curso, se hace otra al acabar.
- **Guarda G** (`components/atleta/entrenamiento/use-marcado-serie.ts`):
  - un rechazo tardío solo revierte la serie si el toque rechazado sigue siendo el último de esa serie;
  - **opción A del dueño (2026-10-15):** si ya hubo un toque posterior, el rechazo no se avisa (sin error inline, sin vibración y sin banner);
  - el porcentaje y la racha se recalculan del estado actual (`recalcularCumplimiento` en `lib/sesion-estado.ts`), nunca desde instantáneas.

---

## 4. Consecuencias
- **Positivas:**
  - el servidor aplica los toques de una sesión en el orden en que el alumno los hizo;
  - finalizar nunca se adelanta a una serie en vuelo;
  - un rechazo viejo no deshace ni ensucia la pantalla de un toque posterior;
  - sin cambios en el API ni en `@guachafit/shared`, y sin migración de IndexedDB.
- **Costes y límites:**
  - con red lenta, el segundo cambio se ve como "por enviar" (indicador de cola) hasta que termina el primero;
  - **el orden se garantiza dentro de la misma pestaña:** dos pestañas con la misma sesión no se coordinan (registro en memoria, sin `BroadcastChannel`);
  - al recargar, el registro nace vacío y la cola se drena con su orden por hora de acción;
  - `creadoEnMs` solo debe recibir la marca de `marcaDeAccionMs()`: una hora inventada adelantaría la mutación en la cola.
- **Implementación:** commit `a4371fe`. Tests: `lib/envios-en-vuelo.spec.ts`, `lib/offline-db.spec.ts`, `lib/offline-sync.spec.ts`, `lib/sesion-estado.spec.ts`, `components/atleta/entrenamiento/use-envio-sesion.spec.tsx` y `pages/atleta/EntrenamientoPage.orden.interaccion.spec.tsx`.

---

## 5. Alternativas consideradas
- **(A) Serializar todos los envíos de la sesión con un mutex:** descartada por riesgo de bloqueo (401, tope de 8 errores) y porque un PUT lento congela toda la sesión.
- **(C) Agrupar los cambios por serie:** reduce tráfico, pero no resuelve finalizar ni iniciar.
- **(D) Versionado en el servidor con 409 y resolución de conflictos:** la única que cubre varias pestañas y dispositivos, pero exige migración, cambio de contrato y una pantalla de conflictos. El dueño la descartó.
