---
id: RF-007
modulo: Finanzas
prioridad: alta
estado: parcial
version_implementada: v1.0.0
fecha_verificacion: 2026-11-03
problema_origen: "[[PROB-002-cobranza-bimonetaria-fraccionada]]"
fecha_creacion: 2026-09-06
version: 1.0
tags:
  - requerimiento
  - rf
  - sdd
  - finanzas
  - conciliacion
---

# RF-007: Reporte de Pagos por el Cliente y Bandeja de Conciliación para el Entrenador

## 1. Contexto y Justificación
Sustituye la recepción caótica de comprobantes por WhatsApp mediante un flujo digital estandarizado. Proporciona al alumno una interfaz de reporte con captura de datos estructurados y al entrenador una bandeja de entrada donde puede verificar y liquidar pagos con un solo clic.

- **Objetivo:** Capturar datos fidedignos de pago (monto, moneda, referencia bancaria y captura) y agilizar la verificación manual del entrenador.
- **Valor aportado:** Reducción del tiempo de conciliación en más del 80%, historial inmutable de comprobantes y notificaciones automáticas al cliente sobre el estado de su pago.
- **Trazabilidad:** Resuelve el desorden de chats y comprobantes perdidos documentado en [[PROB-002-cobranza-bimonetaria-fraccionada]].

---

## 2. Actores Involucrados
- **Cliente:** Realiza la transferencia/pago y carga los datos y comprobante en su interfaz.
- **Entrenador:** Revisa los pagos entrantes en su bandeja de conciliación y los aprueba o rechaza.

---

## 3. Precondiciones
1. El cliente debe tener una cuota generada en estado `Por Vencer`, `Abonada (Parcial)` o `Vencida / En Mora`.
2. El cliente debe haber realizado previamente la operación bancaria o entrega de efectivo.

---

## 4. Reglas de Negocio (Business Rules)
- **RN-01 (Métodos de Pago Manuales Soportados):**
  - `Pago Móvil (Bs.)`
  - `Transferencia Bancaria Nacional (Bs.)`
  - `Efectivo (USD o Bs.)`
  - `Billeteras Digitales / Internacionales (Zelle, Zinli, Binance Pay, PayPal, etc.)`
- **RN-02 (Campos Obligatorios del Formulario de Reporte):**
  - `Monto Pagado`: Valor numérico positivo.
  - `Moneda`: Selector excluyente (`USD` o `VES / Bs.`).
  - `Método Utilizado`: Uno de los canales de RN-01.
  - `Número de Referencia`: Obligatorio para canales electrónicos (últimos 4 a 6 dígitos alfanuméricos). Opcional para efectivo.
  - `Comprobante`: Imagen/captura de pantalla del recibo bancario (formatos WebP, JPEG o PNG $\le 5$ MB).
- **RN-03 (Bandeja de Conciliación del Entrenador):**
  - Lista de transacciones en estado `Pendiente de Verificación` ordenadas por fecha/hora de reporte (FIFO).
  - Cada tarjeta presenta: Nombre del alumno, monto en moneda original, equivalente calculado en USD, método, referencia bancaria y botón de previsualización modal del comprobante.
- **RN-04 (Acción de Aprobación):** Al presionar *"Aprobar"*, el sistema:
  1. Transiciona la transacción a estado `Aprobado`.
  2. Descuenta el crédito en USD del saldo pendiente de la cuota.
  3. Reevalúa el estado general de la cuota (si el saldo llega a 0, transiciona a `Al Día / Pagada`).
  4. Envía notificación inmediata al cliente (push y correo) con recibo de confirmación.
- **RN-05 (Acción de Rechazo):** Al presionar *"Rechazar"*, el sistema exige al entrenador ingresar un motivo de rechazo (ej. *"Referencia no aparece en cuenta"*, *"Monto insuficiente"*, *"Comprobante ilegible"*). La transacción pasa a `Rechazado` y el cliente es notificado con el motivo para que reenvíe el reporte.

---

## 5. Criterios de Aceptación (Given-When-Then / Gherkin)

### Escenario 1: Reporte Exitoso de Pago Móvil por el Alumno
```gherkin
Given que el alumno tiene una cuota con saldo pendiente de $40.00 USD
When completa el formulario con:
  | Monto  | Moneda | Método     | Referencia | Comprobante           |
  | 1200   | VES    | Pago Móvil | 984521     | captura_banco.jpg     |
  And presiona "Enviar Comprobante"
Then el sistema debe guardar la transacción en estado "Pendiente de Verificación"
  And cambiar temporalmente el estado de la cuota a "Pendiente de Revisión"
  And alertar al entrenador: "Nuevo pago recibido de [Alumno] por Bs. 1,200"
```

### Escenario 2: Entrenador Aprueba Pago desde la Bandeja
```gherkin
Given que el entrenador tiene un pago en su bandeja por Bs. 1,200 ($20.00 USD equivalentes)
When revisa el comprobante y presiona "Aprobar Pago"
Then el sistema debe marcar la transacción como "Aprobada"
  And reducir el saldo pendiente de la cuota de $40.00 a $20.00 USD
  And cambiar el estado de la cuota a "Abonada (Parcial)"
  And enviar una notificación al alumno: "Tu pago por Bs. 1,200 ha sido verificado con éxito"
```

### Escenario 3: Entrenador Rechaza Pago por Referencia Inexistente
```gherkin
Given que el entrenador verifica su cuenta bancaria y no encuentra la referencia "984521"
When presiona "Rechazar Pago" e introduce el motivo: "Fondos no recibidos en cuenta"
Then la transacción debe transicionar a estado "Rechazado"
  And el saldo adeudado del alumno no debe modificarse
  And la cuota debe regresar a su estado previo ("Por Vencer" o "Vencida")
  And el alumno debe recibir una notificación de rechazo con el mensaje del entrenador
```

---

## 6. Casos Borde y Excepciones
- **Referencias Bancarias Duplicadas:** Si un alumno intenta enviar una referencia ya existente para el mismo banco y fecha, el sistema debe alertar: *"Esta referencia ya ha sido registrada previamente"* para evitar fraude o doble reporte accidental.
- **Cancelación de Pago Erróneo:** Si el entrenador aprueba un pago por error, debe existir una opción de reversión administrativa auditada que devuelva el saldo a su estado original.

---

## 7. Estado real de implementación

- Flujo completo implementado y probado: reporte del alumno, bandeja FIFO, aprobación y rechazo.
- Sin reversión administrativa de un pago aprobado por error (caso borde del requisito).
- El comprobante es opcional en la implementación, aunque RN-02 lo define obligatorio.
- Entrega de notificaciones simulada: no hay envío push/email real verificado.

### Referencias duplicadas por entrenador (2026-10-09, `ee23aef`)
- El índice único era GLOBAL `(metodo_pago, referencia_bancaria, fecha_operacion)`: mezclaba referencias de entrenadores distintos y, como el cobro en sala guardaba la referencia fija `COBRO_DIRECTO_SALA`, el segundo cobro en efectivo del día fallaba en toda la plataforma.
- Ahora es `uq_transaccion_referencia_entrenador`, **por entrenador y parcial**: solo referencias no nulas, de métodos electrónicos y de pagos no rechazados (un pago rechazado puede reenviarse con la misma referencia). El efectivo no guarda referencia y el centinela se limpió a `NULL` (migración `0018`).
- Un duplicado responde 409 *"Esta referencia ya ha sido registrada previamente para este método y fecha de operación."*, tanto en la comprobación previa como si dos envíos simultáneos chocan con el índice (23505).
- Evidencia: `rf007-indice-referencias.e2e.spec.ts` contra PostgreSQL real (**5/5**), `finanzas-service.spec.ts`.

### Reversión de un pago aprobado por error, API (2026-10-11, `4878d7e`)
- **Decisión del dueño (2026-10-11):** solo el **entrenador dueño** puede revertir un pago **aprobado** (de la bandeja o un cobro en sala), en cualquier momento y con **motivo obligatorio**. La reversión deshace exactamente la aprobación; si el saldo a favor que generó ese pago ya se aplicó a otra cuota, se bloquea. El pago queda **Revertido** con su motivo, sin borrarse.
- **Mecanismo:**
  - `POST /finanzas/transacciones/:id/revertir` con `{ motivo }` (`RevertirPagoSchema`); un id mal formado da 404.
  - `revertirTransaccion` bloquea en el orden de la aprobación (transacción → cuota → perfil). Devuelve a la cuota lo aplicado y retira del saldo a favor el excedente de ese pago.
  - Si el saldo a favor no alcanza, responde 409: "No se puede revertir este pago: el saldo a favor que generó ya se aplicó a otra cuota.". Un pago que no está aprobado da 409: "Solo se puede revertir un pago aprobado.".
  - El estado de la cuota sale de la misma regla que el rechazo (`estadoCuotaTrasRetirarAbono`): otro pago en revisión → pendiente de revisión; saldada → al día; con abono → parcial; si no, vencida o emitida según el corte. En pagos anteriores a la `0019` (abonado por encima del total) el pendiente se recalcula desde el total.
  - Migración `0020`: estado `revertido`, `motivo_reversion` y `fecha_reversion_utc`. Los agregados de recaudado solo suman pagos aprobados, así que un pago revertido deja de contar.
  - **Decisión del dueño (2026-10-11):** un pago revertido **libera su referencia**, igual que uno rechazado (RN-05). Si el entrenador revirtió por error, el alumno reenvía el mismo comprobante y se aprueba de nuevo desde la bandeja. Migración `0021`: el índice único parcial de referencias solo cuenta pagos `pendiente` o `aprobado`. Se nombran en positivo porque un predicado de índice no admite casts y el migrador no deja usar `revertido` en la misma transacción que lo crea.
  - El alumno recibe "Tu entrenador revirtió un pago" con el monto, el motivo y que el monto vuelve a figurar como pendiente. Si la cuota vuelve a tener deuda, sus recordatorios se agendan en el acto.
- Evidencia: `apps/api/test/bdd/rf007-reversion-pago-aprobado.spec.ts` (44 casos) y `rf007-reversion-concurrencia.e2e.spec.ts` (Postgres real: reversión frente a emisión sin saldo negativo ni `40P01`, y referencia liberada y reaprobada). La `0020` y la `0021` se aplicaron en un mismo run sobre una BD vacía. API **1674** aprobados (17 omitidos). Revisado con los 4 enfoques y validado; el BLOCKER del `jobId` del aviso y el de la `0021` (cast no inmutable) quedaron corregidos.

### Pagos con fecha anterior (reglas del 2026-10-11, implementado el 2026-10-12, `cea825b`)
- **Cobro en sala (ficha y Control de Cobros):** campo "Fecha de la operación" con hoy por defecto y como máximo; se puede registrar un pago de días anteriores. El reporte del alumno (Pagos) también limita la fecha a hoy y arranca con el día local (antes, el día UTC: de noche en Caracas salía mañana y se bloqueaba).
- **API:** rechaza con 400 "La fecha del pago no puede ser posterior a hoy." en el reporte del alumno, el cobro directo y el cobro inteligente (antes de emitir ninguna cuota). En el reporte, la comprobación corre dentro de la ejecución idempotente: un reintento con la misma clave devuelve el pago ya registrado. Sin fecha, el cobro inteligente usa el día local del alumno.
- **Bolívares:** se usa la tasa vigente al registrar (no hay histórico por día) y el modal la muestra ("Se convertirá con la tasa vigente al registrar: 1 USD = X Bs."), con la tasa propia del alumno si la tiene.
- **Recaudado del mes (KPI-01):** cuenta por fecha de registro, no por la fecha del pago.
- **Mensajes:** un error de fecha se borra al cambiar la fecha; en la ficha y en Pagos, el mensaje propio sustituye la burbuja del navegador para la fecha futura (la fecha vacía en Pagos conserva la burbuja nativa).
- **Regla provisional de "hoy" (aprobada el 2026-10-12):** la API compara con el día de `Pacific/Kiritimati` (UTC+14), así que nunca rechaza un "hoy" de ninguna zona, a costa de aceptar "mañana" durante algunas horas; la web usa el día del dispositivo que registra. Se sustituirá por la validación con la zona del alumno (ver Pendiente).
- Evidencia: `rf009-es-fecha-pago-futura`, `rf009-mensaje-fecha-pago-futura`, `rf009-rf007-fecha-anterior` (API) y `cobro-sala.fecha-anterior` + `*.fecha-anterior.interaccion` de Pagos, la ficha y Cartera (web). API **1692** aprobados (17 omitidos); typecheck y build en verde. Revisado (fiabilidad) y validado.

### Confirmación y reversión en la web (2026-10-11, `e16039d`)
- **Conciliación:** "Aprobar y Descontar Saldo" ya no aprueba en el acto: abre "¿Aprobar el pago de {alumno}?" con "Se descontarán X USD de su cuota." y, si lo hay, el aviso del excedente. "Aprobar pago" confirma; el botón queda bloqueado mientras se aprueba (sin doble envío). El rechazo ya tenía su propio diálogo con motivo obligatorio.
- **Ficha del alumno:**
  - cada pago del historial muestra su estado (Verificado, Rechazado, En Revisión o Revertido);
  - los aprobados tienen **"Revertir pago"** (no en demo), con un diálogo que identifica el pago (monto, método y referencia), explica la consecuencia y exige "Motivo de la reversión";
  - al revertir se ve el mensaje del API y se recarga el historial;
  - si falla (p. ej. "…el saldo a favor que generó ya se aplicó a otra cuota."), el error se ve dentro del diálogo, que sigue abierto.
- **Alumno (Pagos):** estado "Revertido" (antes salía "En Revisión") con chip neutro y su filtro, y "Motivo: …" o "Tu entrenador revirtió este pago.".
- Evidencia: specs `*.reversion*` de Conciliación, la ficha, Pagos y `pagos-historial-filtros`. Web **1489** aprobados y API **1675** (17 omitidos); typecheck y build en verde. Revisado (fiabilidad) y validado.

### Bandeja con estados honestos (`d777772`, 2026-10-29, lote UX-05)
- Mientras carga, la bandeja muestra "Cargando la bandeja de pagos" y la cabecera no muestra contador. Antes aparecía "Bandeja al Día" con "0 transacciones en cola" antes de tener respuesta.
- Error sin datos: bloque de error con "Reintentar" (`ui/EstadoError`). Si la primera carga falla sin conexión, en su lugar se ve "Sin conexión y sin datos guardados".
- Si una recarga falla con pagos en pantalla (por ejemplo, tras aprobar uno), la lista se conserva y se avisa: "No se pudo actualizar la bandeja. Los pagos mostrados pueden estar desactualizados." Sin conexión, en su lugar aparece el aviso de datos guardados.
- Las tarjetas ya no dicen "Acreditación segura con comprobante verificado." (era un texto fijo, sin dato real).
- Evidencia: web **2561/2561**; typecheck y build en verde. La revisión de resiliencia confirmó que una consulta fallida con clave nueva no muestra datos de otra página, y que aprobar sobre datos viejos está protegido por el bloqueo del API.

### Rechazo seguro (`87fe4df`, 2026-10-29, lote UX-06)
- El modal de rechazo dice de quién es el pago y cuánto es ("Pago de Carlos Mendoza · $50,00 USD").
- El motivo se limpia cada vez que se abre o se cierra el modal, también desde el visor del comprobante. Antes, un motivo escrito y cancelado aparecía precargado en el rechazo del siguiente alumno y podía enviarse al alumno equivocado.
- Mientras el rechazo viaja, "Confirmar Rechazo", "Cancelar", el botón de cerrar y Escape quedan bloqueados: no hay doble envío ni se pierde el resultado.
- Si el rechazo falla, el error se ve **dentro** del modal (`role="alert"`), que sigue abierto con el motivo escrito para reintentar. Antes quedaba arriba en la página, tapado por el modal.
- La etiqueta "Motivo del rechazo" está asociada al campo, y los botones miden 44px.
- Evidencia: web **2573/2573**; typecheck y build en verde. La revisión de fiabilidad no dio BLOCKER ni WARNING.

### Bandeja táctil y sin jerga (`bc64170`, 2026-10-29, lote UX-07a)
- Los chips de método indican cuál está activo (`aria-pressed`) y miden 44px. El buscador mide 44px, usa texto de 16px en el móvil (sin zoom en iOS) y no autocompleta.
- **Tarjeta del pago:**
  - el nombre del alumno ocupa hasta dos líneas (nunca se corta con puntos suspensivos);
  - el método va en un badge que no se parte y la referencia bancaria larga salta de línea;
  - los botones son "Aprobar" y "Rechazar", de 44px, apilados en el móvil. Para el lector de pantalla se anuncian "Aprobar pago de <alumno>" y "Rechazar pago de <alumno>".
- **Visor del comprobante ("Comprobante de pago"):**
  - tiene scroll propio en pantallas bajas;
  - ya no muestra jerga ("Presigned URL… ADR-007", "R2"). Dice "El enlace del comprobante caduca en 15 minutos." o "Este pago no tiene comprobante disponible.";
  - "Abrir original" va debajo de la imagen sin taparla;
  - las acciones son "Aprobar este pago" y "Rechazar este pago".
- La paginación va al pie de la lista y, al cambiar de página, la vista vuelve al inicio de la lista (sin animación si el sistema pide movimiento reducido).
- `ui/BotonTactil` gana la variante `peligro-contorno` (borde y texto rojos) para la acción destructiva secundaria.
- Evidencia: web **2594/2594**; typecheck y build en verde. La revisión de legibilidad dio 1 BLOCKER (selector del spec, ver seguimiento de "pago movil") y 3 WARNING; los introducidos por el lote se corrigieron y validaron, y el resto va a UX-10.

### Avisos de la bandeja (`feacbed`, 2026-10-30, lote UX-08)
- El aviso de éxito se anuncia (`role="status"`) y tiene un botón "Cerrar aviso".
- Sin saldo a favor desaparece a los 8 s (antes 3 s). Con saldo a favor se queda hasta cerrarlo, porque el entrenador tiene que leer que el alumno tiene saldo.
- El temporizador se cancela al salir de la página y al mostrar otro aviso.
- El éxito y el error nunca se muestran a la vez: un error retira el éxito, y abrir otra aprobación o rechazo retira los dos.

### Formulario de pago del alumno honesto y accesible (`87c732d`, 2026-11-01, lote UX-21, decisión D8)
- **Monto vacío y validación decimal:** el formulario de reporte de pago arranca vacío (`''`, sin el `1300.00` precargado). El campo de monto usa `type="text"` e `inputMode="decimal"`, acepta coma o punto decimal con hasta 12 dígitos enteros y 2 decimales (`validarMontoPago`), y normaliza a formato canónico (`XX.YY`) antes de enviar (`normalizarMontoPago`).
- **Etiquetas y canales de error accesibles:** todos los controles de `FormularioReportePago` enlazan su `<label>` mediante `htmlFor`/`id` (`useId()`). Los errores se anuncian con `role="alert"` por canal separado: error inline en el campo de monto (`aria-invalid` + `aria-describedby`), error inline en la fecha de operación, `errorArchivo` en `SubidaComprobantePago`, y banner `formError` para errores de validación general o de red/API. Al escribir en el monto o al reintentar el envío se limpia el `formError` previo.
- **Subida de comprobante accesible por teclado:** `SubidaComprobantePago` sustituye el contenedor no interactivo por un `<button type="button">` con altura táctil (`min-h-11`), foco visible y botón dedicado `"Quitar comprobante"` para limpiar el archivo seleccionado y el `input` oculto. Si el usuario selecciona después un archivo inválido (> 5 MB o formato no permitido), se descarta cualquier comprobante válido previo, se muestra el `errorArchivo` (`role="alert"`) y el envío queda bloqueado hasta quitar o reemplazar el archivo.
- **Reenvío de pago rechazado y limpieza de abono nuevo (ALU-10 / D8):** en el historial del alumno, pulsar `"Corregir y Reenviar"` en un pago rechazado invoca `iniciarCorreccionPago(tx)`, que abre el formulario prellenado con `metodoPago`, `monedaOriginal`, `montoOriginal` (formateado a 2 decimales), `referenciaBancaria` y `fechaOperacion` (`YYYY-MM-DD`), limpiando errores y comprobante previos. Abrir un abono nuevo desde el Hub o desde el historial (`"Nuevo Abono"` / `"Reportar un nuevo abono o pago"`) invoca `iniciarNuevoPago()`, que restablece todos los campos a su estado limpio inicial. Tras un envío exitoso también se resetean los campos del formulario.
- **Evidencia:** web **2965/2965** en 325 archivos (39 tests nuevos en 5 specs `.ux21.spec.*` y 3 tests actualizados en `PagosPage.fecha-anterior.interaccion.spec.tsx`); typecheck y build en verde.

### Idempotencia del reporte de pago, caché de comprobante y red ambigua (`3bfce29`, 2026-11-01, lote UX-22, decisión D8)
- **Reutilización de comprobante subido en reintentos (`ALU-07a`):** `useReportePago` conserva `comprobanteSubidoKeyRef` cuando la subida del recibo a Cloudflare R2 tiene éxito pero el `POST /finanzas/cuotas/:id/reportar-pago` falla; al reintentar con el mismo archivo no vuelve a comprimir ni a subir la imagen. La caché se invalida al cambiar o quitar el archivo, al confirmar el pago o al llamar a `iniciarNuevoPago` / `iniciarCorreccionPago`. Además, valida `if (!cuota)` antes de comprimir o subir el archivo a R2.
- **Clave de idempotencia estable y renovable (`ALU-07` / `D8`):** cada intento de reporte envía `idempotencyKey` (`generarClaveIdempotenciaPago()`) tanto en las opciones de `apiClient` (cabecera `X-Idempotency-Key`) como en el cuerpo JSON (`ReportarPagoSchema`). La clave se preserva en reintentos idénticos tras fallos de red o servidor y se renueva tras un pago exitoso, al iniciar un abono nuevo o corrección, o cuando el alumno edita los datos del formulario (`metodoPago`, `moneda`, `montoOriginal`, `referenciaBancaria`, `fechaOperacion`). Un cerrojo síncrono (`enVueloRef`) impide envíos concurrentes por doble toque o Enter rápido.
- **Temporizador post-éxito seguro (`ALU-07b`):** el `setTimeout` de 1800 ms tras el éxito se guarda en `temporizadorExitoRef`, solo se arma si el hook sigue montado (`montadoRef`) y se cancela al desmontar, al iniciar otro flujo o al pulsar `"Volver a opciones de pago"` en `PagosPage`.
- **Mensaje honesto en fallo ambiguo de red (`ALU-07c`):** cuando el `POST` del reporte falla por corte de red, timeout o pasarela (`TypeError`, `ErrorDeConexion`, `ErrorTiempoAgotado`, `AbortError`, `TimeoutError` o HTTP `502`/`503`/`504`), muestra `MENSAJE_ERROR_RED_AMBIGUO_PAGO` (*"No se pudo confirmar el envío; revisa tu historial antes de repetirlo."*), diferenciándolo de rechazos HTTP deterministas del servidor (como `409` por referencia duplicada) y de errores previos al subir el comprobante.
- **Evidencia:** web **2986/2986** en 327 archivos (21 tests nuevos en `use-reporte-pago.ux22.spec.ts` y `PagosPage.ux22.interaccion.spec.tsx`); typecheck y build en verde.

### Revisión UX del reporte de pago del alumno (`af33433`, 2026-11-03, revisión de UX-19 a UX-29)
- **Historial y saldo al día tras reportar:** `PagosPage` vuelve a cargar los datos (`cargarDatos`) cuando el reporte termina bien; el pago nuevo aparece en el historial sin recargar la página y el alumno ya no ve un saldo viejo que invite a reportarlo dos veces.
- **Clave de idempotencia por comprobante:** `useReportePago` renueva la clave al adjuntar o quitar el comprobante. Un reintento idéntico sigue reutilizando la misma clave; si el alumno cambia la foto, el servidor no devuelve la transacción anterior y la foto nueva no se pierde sin aviso.
- **Formulario bloqueado durante el envío:** todo el contenido del formulario va en un `<fieldset disabled>` mientras `isSubmitting`, incluido el comprobante; el contravalor en USD muestra «—» con el monto vacío o sin tasa; el `<label>` huérfano del comprobante pasa a `<div>`; la confirmación se anuncia con `role="status"`; los mensajes dicen «entrenador».
- **Evidencia:** web **3074/3074** en 351 archivos (6 tests nuevos en `use-reporte-pago.revux.spec.ts`, `PagosPage.revux.interaccion.spec.tsx` y `FormularioReportePago.revux.spec.tsx`); typecheck y build en verde.

### Reporte de pago del alumno: moneda según el método, referencia validada y motivo real del rechazo (`4371639`, 2026-11-03, decisiones D11 y D15)
- **Moneda según el método (D11):** `setMetodoPago` propone la moneda habitual (Zelle, Binance USDT y Efectivo USD → USD; Pago Móvil, Transferencia y Efectivo VES → VES; `otro` no se ofrece). El alumno puede cambiarla a mano y se respeta hasta que cambie de método. Una combinación poco habitual muestra un aviso discreto, sin bloquear, enlazado al selector de moneda con `aria-describedby`. Al corregir un pago rechazado se conservan el método y la moneda del pago original. El API sigue sin cruzar método y moneda: la protección es de la interfaz.
- **Referencia validada en el cliente:** `validarReferenciaPago` exige de 4 a 64 caracteres, obligatoria salvo en efectivo (si se escribe algo en efectivo también debe cumplir el largo). Se comprueba antes de la subida del comprobante y de cualquier petición; el error sale junto al campo con `role="alert"` y `aria-invalid`, se limpia al editar o al cambiar de método. El payload envía la referencia recortada. La etiqueta ya no dice «Últimos 4-6 dígitos», que contradecía al API.
- **Motivo real del rechazo (D15):** la columna `motivo_rechazo` ya existía, pero `historial-cliente.ts` no la enviaba al alumno y la fila mostraba siempre un texto de respaldo inventado («La referencia no coincide con el estado de cuenta bancario»). Ahora el historial devuelve `motivoRechazo` (solo al alumno dueño de la transacción: titularidad y aislamiento por inquilino ya existentes) y el formulario de corrección lo muestra; sin texto, la fila dice solo «Tu entrenador rechazó este pago.».
- **Montos con el formato común (regla 6.17):** cuota, cabecera, fila del historial, aviso de saldo a favor y contravalor usan `useFormatoNumero()` (coma decimal y miles con punto, `Bs.` para bolívares, tasa con 4 decimales). `textoSaldoAFavor` admite un formateador opcional y sin él conserva la salida de las pantallas del entrenador. El campo del monto sigue aceptando coma o punto y se normaliza igual que antes.
- **Evidencia:** web **3098/3098** en 359 archivos más P26 (subconjunto de pagos 66/66); API **262/262** (P25: `rf007-historial-alumno-motivo-rechazo.spec.ts`); typecheck de los cuatro paquetes y build en verde. 26 tests nuevos y 9 specs existentes ajustados (referencia válida y formato común). Las cuatro revisiones 4R no dieron BLOCKER ni WARNING.

### Fecha de operación en la zona del perfil y textos unificados de Pagos (`6da5794`, 2026-11-03, lotes ZH-2 y D12, [[ADR-025-zona-horaria-alumno-precarga-dispositivo-aviso-discrepancia]])
- **Fecha de operación en la zona del perfil (ZH-2):** el estado inicial del formulario, el reinicio con `iniciarNuevoPago`, la validación de la fecha de cobro y el `max` del campo usan el «hoy» de la zona del perfil del alumno (`useZonaPerfil()` y `fechaCalendarioEnZona`) y no el del dispositivo. `FormularioReportePago` recibe ese día por la prop `hoyLocal`. Solo cambia la web: la regla provisional de la API (día de `Pacific/Kiritimati`) sigue igual.
- **Textos unificados (D12):** mayúscula solo en la primera palabra y un único nombre por acción: «Reportar pago», «Historial», «Pagos y cuotas», «Saldo pendiente», «Corregir y reenviar», «Método de pago», «Monto pagado», «Fecha de operación», «Referencia bancaria» y «Enviar comprobante de pago». La etiqueta de estado «En revisión» (`etiquetaEstadoTransaccion`) pasa a sentence case y también la ve el entrenador en la bandeja.
- **Sin jerga:** se retiraron los textos con enlaces temporales, almacenamiento R2 y auditoría.
- **Refactor:** `use-comprobante-pago.ts` se extrae de `use-reporte-pago.ts` (de 401 a 349 líneas) para respetar el tope de 400 líneas por archivo.
- **Revisión:** fiabilidad (ZH-2) y legibilidad (D12) sin BLOCKER. Se rechazaron como seguimiento la guarda de `asegurarComprobanteSubido`, el renombrado de `onNuevoAbono` a `onReportarPago` y reemplazar `querySelectorAll` por `getByLabelText` en specs antiguos.
- **Evidencia:** web **3152/3152** en 376 archivos; typecheck de shared, database, api y web y build web con código 0.

### Endurecimiento del reporte de pago del alumno (`26153aa`, 2026-11-03, lote D16)
- **Comprobante del propio alumno, al escribir:** `esClaveComprobanteDe(clave, alumnoId)` (`casos-finanzas/comprobantes.ts`) exige la estructura de ADR-007, el prefijo exacto `comprobantes/<alumno>/` y extensión `webp`, `jpeg` o `jpg`. `reportar-pago` responde 400 «El comprobante adjunto no es válido.» **antes de abrir la transacción**, sin lecturas ni escrituras. Sin clave, el comprobante sigue siendo opcional.
- **Al leer:** `resolverComprobanteUrlCaso(ctx, clave, clienteId)` solo firma la URL si la clave pertenece al titular de la fila; si no, devuelve `null`, avisa en el log con texto fijo (sin la clave ni el id) y no lanza. Aplica a la bandeja de conciliación, el detalle de cuota, el reporte y la revisión de la cartera. El fallo de R2 también deja un aviso con texto fijo.
- **Web:** `montoParaEditarPago` precarga el monto de «Corregir y reenviar» con coma y sin separador de miles (`75,00`), compatible con `validarMontoPago`; el cuerpo enviado sigue con punto. `validarArchivoComprobante` pasa a `lib/comprobante-pago.ts` y rechaza archivos vacíos. «Ver comprobante» solo aparece con URL; con clave y sin URL (R2 caído o clave heredada) se lee «Comprobante no disponible por ahora».
- **Seed:** la clave de ejemplo cumple ADR-007.
- **Decisión sobre `pagoVesBloqueadoPorFaltaTasa`:** no cambia. Devuelve `false` cuando falla la consulta de la tasa de forma deliberada (D6) y la API decide con un 400 si no hay tasa. El «$— USD» del handoff no existe en el código. Se añadió cobertura del aviso «Sin tasa configurada…» y del botón deshabilitado.
- **Revisión 4R:** risk y readability sin BLOCKER ni WARNING. Se rechazaron con evidencia el BLOCKER de reliability (el prefijo se construye con el mismo `alumnoId` que `solicitar-presigned` exige idéntico al del JWT) y que el botón desaparezca tras conciliar (la web solo usa `excedenteUsd` de esa respuesta y la reversión recarga la lista). Se aplicaron el texto honesto, el aviso del fallo de R2, `clienteId` obligatorio en la fachada y cinco mejoras de tests.
- **Evidencia:** web **3177/3177** en 380 archivos; API **2070/2081**, con 10 fallos ajenos al lote (1 spec que espera la migración 0023 cuando existe la 0024 y 9 e2e de concurrencia que necesitan PostgreSQL local con la 0024); typecheck de shared, database, api y web y build de api y web con código 0.

### Pendiente
- El mensaje de éxito de la reversión no se borra solo; las mutaciones de Conciliación y de la reversión no tienen tiempo límite; la demo de Conciliación llama al API.
- El comprobante sigue siendo opcional.
- **Zona horaria del alumno, lo que falta:** la zona del dispositivo ya se precarga con aviso de discrepancia (ZH-1) y la web calcula la fecha del pago con la zona del perfil (ZH-2); falta validar la fecha del pago con la zona del alumno en la API, en lugar de la regla provisional.
- Textos: la opción «(VES)» del selector de método sigue pendiente de revisar.
- **Seguimientos de D16:** «Corregir y reenviar» descarta el comprobante previo (el alumno debe volver a adjuntarlo); `reportar-pago` firma dos veces la misma URL; la estructura de la clave admite también un tercer segmento con fecha completa (no abre acceso ajeno); antes de desplegar conviene contar las filas con claves que no cumplen ADR-007 (cada una deja un aviso por listado y su comprobante deja de verse); las respuestas de conciliar y revertir traen la clave sin URL (la web no la usa hoy).
- `fechaOperacion` solo valida el formato: una llamada directa con `2026-02-30` se acepta.
- Dos ventanas de "recaudado del mes": KPI-01 usa el mes UTC y `totalPagadoMesActualUsd` el mes en la hora local del servidor (solo discrepan si el servidor no corre en UTC).
