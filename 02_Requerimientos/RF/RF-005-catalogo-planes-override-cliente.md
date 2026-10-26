---
id: RF-005
modulo: Finanzas
prioridad: alta
estado: parcial
version_implementada: v1.0.0
fecha_verificacion: 2026-10-26
problema_origen: "[[PROB-002-cobranza-bimonetaria-fraccionada]]"
fecha_creacion: 2026-09-06
version: 1.0
tags:
  - requerimiento
  - rf
  - sdd
  - finanzas
  - membresias
---

# RF-005: Catálogo de Planes Estándar y Personalización por Cliente (Override)

## 1. Contexto y Justificación
Estandariza la oferta de servicios del entrenador en paquetes comerciales definidos, pero mantiene la flexibilidad crítica del negocio fitness personal donde los coaches negocian acuerdos particulares, descuentos por fidelidad, planes familiares o tasas cambiarias preferenciales.

- **Objetivo:** Permitir al coach gestionar un catálogo global de membresías y aplicar sobreescrituras (*overrides*) individuales por alumno sin necesidad de duplicar planes genéricos.
- **Valor aportado:** Flexibilidad comercial total sin pérdida de estructura en los reportes financieros.
- **Trazabilidad:** Resuelve la falta de estandarización y precios dispersos identificada en [[PROB-002-cobranza-bimonetaria-fraccionada]].

---

## 2. Actores Involucrados
- **Entrenador:** Crea, edita y desactiva planes estándar del catálogo. Asigna planes y aplica personalizaciones por cliente.
- **Cliente:** Visualiza los beneficios de su plan asignado, el precio pactado y las condiciones de su ciclo.

---

## 3. Precondiciones
1. El perfil del entrenador debe estar configurado con su moneda base de facturación (USD).
2. Para asignar un override, el cliente debe existir previamente en el sistema.

---

## 4. Reglas de Negocio (Business Rules)
- **RN-01 (Atributos del Plan Estándar):** Cada plan comercial incluye:
  - `Nombre`: (ej. *Presencial Completo*, *Asesoría Online*, *Plan 3 Días/Semana*).
  - `Descripción`: Alcance general del plan.
  - `Beneficios (Checklist)`: Lista de ítems incluidos (ej. *Rutina interactiva*, *Guía nutricional*, *1 Check-in quincenal*, *Acceso libre a sala*).
  - `Precio Base USD`: Monto numérico mayor a 0 con 2 decimales.
  - `Duración del Ciclo`: Periodo de facturación en **meses de calendario** (`Mensual` = 1, `Bimestral` = 2, `Trimestral` = 3, `Personalizado` = N), anclados al día de inicio del alumno (decisión del dueño 2026-10-09, [[ADR-020-suscripcion-alumno-emision-automatica-cuotas]]).
- **RN-02 (Sobrescritura por Cliente - Override):** El entrenador puede asignar a un cliente específico un plan estándar con uno o varios de los siguientes overrides:
  - `Precio Acordado USD`: Reemplaza el precio base del catálogo para ese cliente.
  - `Beneficios Personalizados`: Permite agregar o quitar ítems del checklist de beneficios.
  - `Tasa de Cambio Especial`: Permite fijar una tasa específica o una fuente de cambio particular distinta a la tasa de cambio global del entrenador.
- **RN-03 (Precedencia de Valores):** Al generarse una nueva cuota para un cliente, el sistema evalúa: si existe un *Override* activo para ese cliente, toma sus valores; en caso contrario, toma los valores por defecto del plan estándar del catálogo.

---

## 5. Criterios de Aceptación (Given-When-Then / Gherkin)

### Escenario 1: Creación de Plan Estándar en el Catálogo
```gherkin
Given que el entrenador accede a la sección "Catálogo de Planes"
When crea un nuevo plan con nombre "Asesoría Online Full", precio "$40.00", duración "Mensual" y 3 beneficios
Then el sistema debe registrar el plan en estado "Activo"
  And estar disponible para ser asignado a cualquier cliente
```

### Escenario 2: Asignación de Plan con Override de Precio y Tasa Especial
```gherkin
Given que el cliente "Carlos Ruiz" tiene asignado el plan "Asesoría Online Full" ($40.00 base)
When el entrenador edita el perfil financiero de Carlos y define:
  | Campo                 | Valor                |
  | precio_override_usd   | $35.00               |
  | tasa_override_fijada  | 65.00 Bs/USD         |
Then el sistema debe guardar la personalización vinculada exclusivamente a Carlos Ruiz
  And la siguiente cuota generada para Carlos debe emitirse por $35.00 USD
  And reflejar una equivalencia calculada a 65.00 Bs/USD en lugar de la tasa global
```

### Escenario 3: Cliente sin Override Hereda Valores Estándar
```gherkin
Given que el cliente "Ana Gomez" tiene asignado el plan "Asesoría Online Full" sin personalizaciones
When el sistema genera la cuota del nuevo mes
Then el monto total a pagar debe ser exactamente de $40.00 USD
  And el cálculo en Bolívares debe realizarse utilizando la tasa global vigente del entrenador
```

---

## 6. Casos Borde y Excepciones
- **Desactivación de Plan del Catálogo:** Si un plan estándar se desactiva o elimina del catálogo, los clientes que ya lo tienen contratado deben mantener sus condiciones históricas activas hasta que el coach cambie manualmente su membresía.
- **Override con Precio Cero ($0.00):** Permitido exclusivamente para alumnos becados o acuerdos de intercambio, generando cuotas en estado automático `Al Día / Becado`.

---

## 7. Estado real de implementación

- Catálogo de planes y override existen a nivel de API.
- Resuelto (2026-09-21): la UI ya no inventa un "Plan Estándar" para alumnos sin plan; muestra "Sin plan asignado" (`apps/web/src/pages/entrenador/AlumnosPage.tsx`).
- Resuelto (2026-09-21, WU-J): contrato de override completo — `GET /finanzas/planes/override?clienteId=` (listado por coach y por alumno, hidratado con nombre de plan, precio base y nombre del cliente) y `DELETE /finanzas/planes/override/:id` (quita el override y limpia la tasa sincronizada del alumno). Se retiró `ActualizarOverridePlanSchema` (huérfano): el upsert `POST` acepta `null` explícito para limpiar precio/tasa.
- Resuelto (2026-09-21, WU-J): precedencia RN-03 real al emitir cuota — `emitirCuota` resuelve `precio_acordado_usd` del override del alumno > `precio_base_usd` del plan del catálogo; el monto del DTO quedó como contrato legado opcional que ya NO decide el monto.
- Resuelto (2026-09-21, WU-J): estado `Becado / $0` — un override de precio 0.00 emite la cuota por $0.00 en estado `al_dia`, sin recordatorios de cobro (RF-005 §6). RN-01 exige precio base > 0.00 en el catálogo (el becado se expresa con override, nunca con un plan de $0).
- Resuelto (2026-09-21, WU-J): la API hidrata `planActivoId`, `planActivoNombre` y `precioAcordadoOverride` (override vigente o, en su defecto, plan de la última cuota) en el directorio y en el expediente del alumno; la ficha permite asignar plan, fijar precio acordado y tasa especial, ver el override vigente y quitarlo con feedback honesto (solo 2xx).
### Suscripción del alumno y emisión automática (2026-10-09, `ee23aef`)
- **Plan asignado persistido:** `perfiles_alumno.plan_suscrito_id`, `ciclo_ancla` y `proximo_corte` (migración `0018`). Contrato `GET`/`PUT`/`DELETE /finanzas/suscripciones/:clienteId` (rol Entrenador; otro coach, inexistente o archivado → 404).
- **Primer plan:** exige fecha de inicio entre hace 30 y dentro de 60 días (*"Elige una fecha de inicio entre el DD/MM/AAAA y el DD/MM/AAAA."*) y que no caiga en un periodo ya cubierto (*"Este alumno ya tiene cubierto hasta el DD/MM/AAAA. Elige esa fecha o una posterior, o cambia el plan sin quitarlo."*). Si el primer vencimiento está a 5 días o menos, la cuota sale en el acto.
- **Cambio de plan:** aplica desde la próxima cuota, sin mover el día de vencimiento. Plan inexistente → 404; desactivado → 400.
- **Cuotas automáticas:** se emiten 5 días antes de cada vencimiento, que cae al inicio del periodo cubierto; la precedencia RN-03 (override > catálogo) y el becado ($0.00 → `al_dia`) se mantienen. Detalle en [[ADR-020-suscripcion-alumno-emision-automatica-cuotas]].
- **Hidratación:** el "plan activo" de directorio y expediente sale primero de la suscripción (precio del override de ese mismo plan).
- Evidencia: `rf005-rf008-suscripcion-ciclo.spec.ts`, `rf005-rf008-suscripcion-servicio.spec.ts`, `rf005-rf009-m5l1-correcciones.spec.ts`; API **1447** aprobados (6 omitidos).

### Plan del alumno en la ficha (2026-10-10, `e0747e2`)
- **Tarjeta "Plan y tarifa" (antes "Plan Comercial & Tarifa"; textos renombrados el 2026-10-26, `ad1788f`):** el plan sale de la suscripción (`GET /finanzas/suscripciones`; sin plan responde vacío y se muestra "Sin plan").
  - El primer plan pide la **fecha de inicio**, con el "hoy" del alumno (su zona) por defecto y el mismo rango que la API. La ayuda dice cada cuánto vencen las cuotas.
  - Con plan vigente se ve "Próxima cuota: vence el DD/MM/AAAA" y **Quitar plan** (con confirmación). Cambiar de plan aplica desde la próxima cuota, sin fecha.
  - Si la suscripción no carga, se avisa y el selector queda bloqueado (nunca se asigna un plan por error).
- **El override ya no asigna el plan:** solo guarda el precio acordado y la tasa especial. Un precio sin plan pide elegir un plan; dejar el plan vacío no borra el precio acordado.
- **Orden de escritura:** al asignar el primer plan, la tarifa se guarda ANTES del `PUT`, porque la API emite la primera cuota en ese momento (así sale con el precio acordado o como becado).
- **Fallos:** si el override no carga, la tarifa no se toca (el campo vacío borraría el precio real). Tras un fallo de `PUT`/`DELETE` la tarjeta y el selector se alinean con el servidor. Los avisos y el éxito nombran exactamente lo que se guardó.
- Evidencia: `apps/web/src/lib/suscripcion-alumno.spec.ts`, `plan-tarifa.spec.ts`, `pages/entrenador/AlumnoDetallePage.suscripcion.interaccion.spec.tsx`, `AlumnoDetallePage.correcciones-1b.interaccion.spec.tsx`; web **1207** aprobados. Revisado con los 4 enfoques y validado en dos rondas.

### Sin emisión manual (2026-10-10, `68457a6`)
- **Decisión del dueño:** se retira `POST /finanzas/cuotas/emitir`. Las cuotas solo se emiten desde la suscripción del alumno, así que la regla de solape y la zona horaria se aplican siempre. RN-03 (override > catálogo) y el becado siguen cubiertos por la emisión por suscripción.

### Pendiente
- **Precio residual tras reconciliar:** si "Quitar plan" se aplicó en el servidor pero su respuesta se perdió, el campo "Precio acordado (USD)" conserva el valor y el siguiente guardado pide "Elige un plan…" hasta vaciarlo. En modo demo, el éxito del guardado sigue con el texto fijo "Expediente, plan y tarifa…".
- Editor de `beneficiosPersonalizados` en la UI (la API los persiste y los devuelve, pero la ficha no los edita) y selección de "fuente de cambio particular" por cliente (hoy la tasa especial es un valor fijo).
