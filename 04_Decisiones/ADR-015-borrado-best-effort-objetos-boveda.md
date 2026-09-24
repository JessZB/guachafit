---
id: ADR-015
titulo: "ADR-015: Ciclo de Vida de Borrado en la Bóveda — Best-Effort Post-Commit en el PUT-Replace de Recursos de Nutrición"
fecha: 2026-09-24
estado: aceptado
decisores:
  - "Tech Lead"
  - "Principal Architect"
tags:
  - decision
  - adr
  - arquitectura
  - storage
  - cloudflare-r2
  - nutricion
  - ciclo-de-vida
---

# ADR-015: Ciclo de Vida de Borrado en la Bóveda — Best-Effort Post-Commit en el PUT-Replace de Recursos de Nutrición

## 1. Estado
`aceptado`

---

## 2. Contexto y Fuerzas en Juego
[[ADR-007-almacenamiento-fotos-privadas-cloudflare-r2-presigned-urls]] definió el ciclo de vida de **subida y lectura** de la bóveda (PUT/GET presignados con TTL de 900 s), pero no el de **borrado**. Los recursos educativos de [[RF-002-nutricion-agil-reporte-rapido]] (RN-01) viven dentro de la fila de metas del alumno (`metas_nutricionales.recursos`) y se reemplazan con un PUT de tipo *replace*: al quitar un PDF del arreglo, el objeto quedaba en el bucket sin ninguna referencia — huérfano e invisible. El gap quedó anotado en RF-002 ("Quitar recurso no borra el objeto") y en [[RNF-001-almacenamiento-seguridad-fotos-progreso]] §7 ("Validación de `storageKey` sin evidencia"). La tabla de metas no tiene RLS ([[ADR-011-aislamiento-multitenant-rls-progresivo-withtenant]]) y la tenancy de sus recursos se resuelve por el prefijo de la clave (`nutricion-recursos/{alumnoId}/`).

- **Problema a resolver:** definir quién, cuándo y cómo elimina de la bóveda los objetos que quedan sin referencia al reemplazar recursos, sin degradar la respuesta del endpoint ni la retención de datos con obligación legal.
- **Fuerzas en conflicto:**
  1. **Ciclo de vida completo vs. seguridad del dato persistido:** borrar evita residuos, pero un borrado dentro —o antes— del write puede destruir el respaldo de un guardado fallido.
  2. **Consistencia vs. disponibilidad:** dos PUT concurrentes del mismo alumno pueden re-referenciar una clave antes de que el borrado la elimine; serializar por alumno exige locks que hoy no existen.
  3. **Cobertura de consumidores vs. simplicidad:** borrar desde el servidor cubre API, web y cola offline; delegarlo al cliente excluye a cualquier consumidor que no sea esa UI.
  4. **Residuos inevitables vs. recolección total:** no todo objeto se puede borrar en el momento del reemplazo (subidas que nunca llegan a referenciarse); un recolector completo exige un barrido global.
- **Opciones consideradas:**
  1. *Opción A (presigned DELETE gestionado por el cliente):* la UI pide una URL firmada de borrado al quitar el recurso y borra antes o después del guardado.
     - *Descartada:* no cubre consumidores API (scripts, integraciones) y complica el orden: un borrado previo pierde el archivo si el guardado falla, y uno posterior exige reconciliación en el cliente.
  2. *Opción B (borrado server-side best-effort, post-commit, en el PUT-replace):* el servicio captura las claves previas antes del write, persiste primero y después elimina las que quedaron sin referencia, con guards de estructura y tenencia; un fallo de storage o de relectura no altera el 200.
     - *Seleccionada.*
  3. *Opción C (sweeper/reconciliador periódico):* barrido que compara las referencias persistidas contra el bucket y elimina lo no referenciado.
     - *Diferida como follow-up:* es la única vía para las subidas nunca referenciadas; no reemplaza a la Opción B, se suma a ella.
  4. *Opción D (no borrar nunca):* mantener el bucket como archivo inmutable.
     - *Rechazada:* los residuos crecen con cada reemplazo y contradicen el costo y la minimización de datos.

---

## 3. Decisión
Elegimos la **Opción B (borrado server-side best-effort, post-commit, en el PUT-replace de metas)** porque cierra el ciclo de vida en el mismo flujo que desreferencia el objeto, cubre a todos los consumidores del endpoint y no pone en riesgo ni el dato persistido ni la respuesta.

### Detalles de la Implementación
1. **Nunca dentro del write:** `definirMetasNutricionales` captura las claves previas **antes** del update/insert; la respuesta se decide tras persistir y el borrado corre al final, de modo que un fallo de storage jamás tumba un guardado ya confirmado.
2. **Idempotencia en la bóveda:** `R2StorageService.eliminarObjeto` usa `DeleteObjectCommand` (borrar una clave inexistente también responde 204); valida la estructura de la clave (warning y return si es inválida) y hace early-return en modo mock. Un fallo de red se propaga al llamador, que lo contiene.
3. **Guards de frontera:** solo se borra lo que cumple `nutricion-recursos/{alumnoId}/` y la estructura válida de clave; una clave de otro módulo o de otro alumno nunca se elimina.
4. **Anti-race con re-lectura:** antes de borrar se re-lee la fila actual y se descartan las claves que volvieron a estar referenciadas; cada clave se borra con `Promise.allSettled` para que un fallo no cancele el resto.
5. **Reemplazo total honesto:** `recursos` omitido o `[]` ⇒ se borran todos los PDFs previos del alumno (el PUT es replace, no merge).
6. **Retención intacta donde aplica:** el ciclo toca únicamente `nutricion-recursos`; no se añade borrado a comprobantes de pago —retención mínima de 5 años ([[RNF-002-consistencia-financiera-idempotencia-pagos]])— ni al flujo de antropometría, que conserva las fotos de rechazos para auditoría ([[ADR-001-modelo-hibrido-auditoria-antropometrica]]).

---

## 4. Consecuencias y Trade-offs

### Consecuencias Positivas (Beneficios)
- **C1:** Quitar o reemplazar un recurso ya no deja el PDF huérfano: el ciclo de vida de `nutricion-recursos` queda cerrado sin que la UI orqueste borrados.
- **C2:** La respuesta del PUT no depende de la bóveda: un fallo de borrado o de relectura deja warning y el guardado sigue siendo 200 (nunca un falso fallo).
- **C3:** Los guards de estructura y tenencia hacen imposible que un PUT borre un objeto de otro alumno o de otro módulo.

### Consecuencias Negativas (Costos y Trade-offs)
- **T1:** Al ser best-effort, un fallo de borrado deja el objeto huérfano hasta que algo lo recolecte (hoy, nada; el sweeper es follow-up).
- **T2:** La re-lectura **reduce** la ventana de carrera (PUT concurrente que re-referencia una clave) pero no la elimina: sin serialización por alumno (advisory lock transaccional, follow-up), un PUT puede borrar un objeto recién re-referenciado por otro.
- **T3:** Las subidas que nunca llegan a referenciarse (PDF subido sin guardar; fotos de comidas descartadas offline con objetos ya subidos) siguen siendo huérfanas por diseño: requieren el sweeper.

### Riesgos Mitigados y Residuales
- **Riesgo Mitigado:** acumulación silenciosa de PDFs huérfanos en cada edición de metas; falsos 500 por fallos de la bóveda al guardar.
- **Riesgo Residual:** carrera PUT-vs-PUT sobre el mismo alumno, acotada por la re-lectura y documentada para el follow-up de serialización.
- **Riesgo Residual:** objetos nunca referenciados a la espera del sweeper.

---

## 5. Trazabilidad y Referencias
- Requerimientos asociados: [[RF-002-nutricion-agil-reporte-rapido]] (RN-01, recursos educativos; nota de límites actualizada), [[RNF-001-almacenamiento-seguridad-fotos-progreso]] §7 (borrado y validación estructural de claves).
- Decisiones relacionadas: [[ADR-007-almacenamiento-fotos-privadas-cloudflare-r2-presigned-urls]] (extiende su ciclo de vida con el borrado sobre la misma bóveda S3-compatible), [[ADR-011-aislamiento-multitenant-rls-progresivo-withtenant]] (`metas_nutricionales` sin RLS: la tenancy del borrado es el guard de prefijo), [[ADR-001-modelo-hibrido-auditoria-antropometrica]] (los rechazos de antropometría conservan sus fotos).
- Implementación: `apps/api/src/modules/antropometria/r2-storage.service.ts` (`eliminarObjeto`, `validarStorageKeyEstructura`) y `apps/api/src/modules/nutricion/nutricion.service.ts` (`definirMetasNutricionales`, `eliminarRecursosHuerfanos`).
- Evidencia de verificación (2026-09-24): E2E real contra MinIO en verde (`rnf001-r2-delete-minio.e2e.spec.ts`: presign PUT → objeto existe → `eliminarObjeto` → 404 → limpieza); 64 tests targeted (`rnf001-r2-storage` + `nutricion-service`); suite completa del API **818 passed / 1 skipped** (el skip es el E2E gateado por `STORAGE_ENDPOINT`); typecheck OK; validación independiente PASA CON SALVEDADES (carrera residual T2 documentada).
