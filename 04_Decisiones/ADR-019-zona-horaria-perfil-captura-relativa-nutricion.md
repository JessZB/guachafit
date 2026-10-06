---
id: ADR-019
titulo: "ADR-019: Zona Horaria del Alumno en el Perfil y Captura Relativa para el Reporte de Nutrición"
fecha: 2026-10-05
estado: aceptado
decisores:
  - "Dueño del producto"
  - "Tech Lead"
tags:
  - decision
  - adr
  - arquitectura
  - backend
  - nutricion
  - zonas-horarias
---

# ADR-019: Zona Horaria del Alumno en el Perfil y Captura Relativa para el Reporte de Nutrición

## 1. Estado
`aceptado`

---

## 2. Contexto y Fuerzas en Juego
[[RF-002-nutricion-agil-reporte-rapido]] (RN-02) solo admite el reporte diario entre las **18:00 y las 23:59** hora local del alumno. Siguiendo [[ADR-002-gestion-fechas-utc-zonas-horarias]], el cliente enviaba su zona IANA (`timezoneCliente`) y el servidor evaluaba la ventana con ella y con la **hora de recepción**. Eso dejaba tres problemas abiertos en RF-002:

- `timezoneCliente` lo **controla el cliente**: cambiándolo se podía mover la ventana a voluntad.
- Un reporte guardado sin conexión dentro de la ventana y sincronizado después de medianoche se rechazaba, aunque el alumno lo hubiera hecho a tiempo.
- La tolerancia histórica se evaluaba con las metas **actuales** del coach, no con las vigentes ese día.

- **Problema a resolver:** decidir de dónde sale la zona horaria que manda, cómo se conoce la hora real de captura de un reporte sincronizado tarde y qué metas se usan para evaluarlo.
- **Restricciones y Fuerzas:**
  - **Confianza vs. funcionamiento offline:** el servidor no puede ver la captura; algo del teléfono hay que creer.
  - **Reloj del teléfono:** puede estar adelantado o atrasado; un instante absoluto del cliente hereda ese desfase.
  - **Regla de negocio del dueño (2026-10-05):** margen hasta las **12:00 del día siguiente**; pasado ese plazo el día queda "No reportado".
  - **Compatibilidad:** la web publicada sigue enviando `timezoneCliente`; las filas existentes no tienen hora de captura ni metas copiadas.
- **Opciones consideradas:**
  1. *Zona del teléfono (`timezoneCliente`, lo vigente):* **descartada**, la decide el cliente y es manipulable.
  2. *Zona en el perfil del alumno:* **seleccionada**; la cambian el propio alumno o su entrenador.
  3. *Hora de captura absoluta enviada por el cliente (`capturadoEnUtc`):* **descartada** por el desfase del reloj del teléfono: un reloj mal puesto aceptaría o rechazaría reportes por error.
  4. *Captura relativa (`segundosDesdeCaptura`) restada a la hora de recepción del servidor:* **seleccionada**.
  5. *Aceptar fuera de plazo marcando el reporte como "tardío":* **descartada por el dueño**; pasado el mediodía el reporte se rechaza y el día queda "No reportado".

---

## 3. Decisión
La zona horaria que manda vive en el **perfil del alumno** y la hora de captura se calcula en el **servidor** a partir de una **duración** medida por el teléfono. Cada reporte guarda una **copia de las metas vigentes**.

### Detalles de la Implementación
1. **Modelo de datos (migración `0016_nutricion_zona_captura_metas.sql`, aditiva):** `perfiles_alumno.zona_horaria` (`varchar(64)`, `NOT NULL`, por defecto `'America/Caracas'`); `checkins_nutricionales.capturado_en_utc` (`timestamptz`) y `checkins_nutricionales.metas_vigentes` (`jsonb`), `NULL` en los reportes anteriores.
2. **Quién cambia la zona:** el alumno con `PATCH /alumnos/me/zona-horaria` (perfil tomado del token, contexto RLS propio, política `rls_perfiles_alumno_self_update`) y su entrenador con `PATCH /alumnos/:id`. Solo se aceptan zonas IANA reales. `timezoneCliente` queda obsoleto y sin efecto.
3. **Captura relativa:** la web envía `segundosDesdeCaptura` (entero, 0–48 h) calculado **al enviar**; el API calcula `captura = recepción − segundos` y la guarda en `capturado_en_utc`. Sin el campo cuenta la hora del servidor.
4. **Reglas de tiempo** (zona del perfil, `apps/api/src/modules/nutricion/nutricion-tiempo.util.ts`): captura dentro de 18:00–23:59 del día del reporte y recepción hasta las **12:00:00 del día siguiente** (inclusive); si no, **400** `CHECKIN_FUERA_DE_PLAZO`, rechazo definitivo que la web no reintenta.
5. **Metas del día:** al registrar se copian las metas vigentes en `metas_vigentes` y la tolerancia se evalúa con esa copia.
6. **Días cerrados:** un día queda "No reportado" cuando vence su plazo (mediodía del día siguiente en la zona del perfil); el resumen semanal del coach lo cuenta con la zona de cada alumno.

---

## 4. Consecuencias y Trade-offs

### Consecuencias Positivas (Beneficios)
- **C1:** El cliente ya no puede mover la ventana cambiando la zona que envía.
- **C2:** Un teléfono con la hora adelantada o atrasada no cambia el resultado: solo mide una duración.
- **C3:** Los reportes hechos a tiempo sin conexión se aceptan hasta el mediodía siguiente, según lo decidido por el dueño.
- **C4:** Cada reporte conserva las metas con las que se hizo; cambiar las metas no altera la evaluación de los reportes anteriores.

### Consecuencias Negativas (Costos y Trade-offs)
- **T1 — Confianza en el cliente:** el servidor cree `segundosDesdeCaptura`; un cliente podría declarar una captura anterior a la real, con un margen máximo de ~18 h (el plazo decidido).
- **T2 — Zona por defecto:** los perfiles existentes quedan en `America/Caracas`; un alumno en otra zona debe cambiarla (el selector en la UI llega en el lote de front).
- **T3 — Precisión:** la web redondea a segundos; la captura puede moverse hasta 0,5 s en los bordes.
- **T4 — Reportes anteriores:** no tienen hora de captura ni metas copiadas (`NULL`).
- **T5 — Alcance:** un alumno pausado también puede cambiar su zona.

### Riesgos Mitigados y Residuales
- **Riesgo Mitigado:** manipulación de la ventana por la zona enviada; rechazos o aceptaciones erróneas por el reloj del teléfono; tolerancia histórica evaluada con metas que no regían ese día.
- **Riesgo Residual:** declaración falsa de la captura dentro del margen de T1.

---

## 5. Trazabilidad y Referencias
- Requerimientos asociados: [[RF-002-nutricion-agil-reporte-rapido]] (RN-02, §6 y sección "Zona horaria del perfil, reportes tardíos y copia de metas"), [[RNF-003-aislamiento-multitenant-seguridad-datos-salud]] (autorización del cambio de zona).
- Decisiones relacionadas: [[ADR-002-gestion-fechas-utc-zonas-horarias]] (para nutrición, la zona deja de venir del cliente), [[ADR-011-aislamiento-multitenant-rls-progresivo-withtenant]] (self-update por RLS).
- Implementación (2026-10-05, `0555dfe`): `packages/database/drizzle/0016_nutricion_zona_captura_metas.sql`, `apps/api/src/modules/nutricion/nutricion-tiempo.util.ts`, `apps/api/src/modules/nutricion/nutricion.service.ts`, `apps/api/src/modules/alumnos/alumnos.service.ts`, `apps/api/src/modules/notificaciones/processors/resumen-semanal.processor.ts`, `apps/web/src/lib/nutricion-checkin.ts`, `apps/web/src/lib/offline-sync.ts`.
- Evidencia: `apps/api/test/bdd/lote-api-n2-zona-horaria.spec.ts`, `apps/api/test/bdd/nutricion-service.spec.ts`, `apps/api/test/bdd/rf014-resumen-semanal.spec.ts`, `apps/web/src/lib/nutricion-checkin.spec.ts`, `apps/web/src/lib/offline-sync-nutricion.spec.ts`; API **1244** aprobados (1 omitida), web **919**; migración `0016` aplicada y verificada en la BD de desarrollo.
