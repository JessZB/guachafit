---
id: ARCH-003
titulo: "Especificación de Contratos de API REST (Endpoints, DTOs y Seguridad)"
fecha: 2026-09-06
autor: "Tech Lead & Principal Software Architect"
estado: aprobado
modulo: Arquitectura
tags:
  - arquitectura
  - api
  - rest
  - contratos
  - dtos
  - seguridad
  - idempotencia
  - sdd
---

# 🔌 Especificación de Contratos de API REST - GUACHAFIT

> **Objetivo del Documento:** Definir formalmente las rutas HTTP, estructuras de petición y respuesta (DTOs en TypeScript y JSON Schemas), códigos de error, políticas de autorización (RBAC) y mecanismos de idempotencia para los tres módulos operacionales del MVP: **Entrenamiento**, **Antropometría** y **Conciliación Financiera**.

---

## 🌐 1. Estándares Globales de Comunicación y Seguridad

- **URL Base:** `https://api.guachafit.com/api/v1`
- **Formato de Carga:** `application/json; charset=utf-8` (salvo subidas binarias directas a Cloudflare R2 vía `image/webp`).
- **Autenticación:** Esquema Bearer Token (`Authorization: Bearer <jwt_access_token>`). Los tokens expiran cada 15 minutos; la renovación utiliza una cookie segura `HttpOnly; Secure; SameSite=Strict` sobre `/api/v1/auth/refresh`.
- **Zonas Horarias y Fechas (`ADR-002`):**
  - Todo campo con fecha y hora (`*Utc`) se serializa estrictamente en formato ISO 8601 UTC terminado en `Z` (ej. `"2026-09-06T14:30:00.000Z"`).
  - Las fechas sin hora (`fechaProgramada`, `fechaEvaluacion`) utilizan formato calendario `"YYYY-MM-DD"`.
- **Precisión Financiera (`RNF-002`):**
  - Todos los montos monetarios se transmiten como cadenas de texto numéricas con 2 decimales (ej. `"50.00"` o `"1250.50"`) para evitar que parsers JSON en frontend conviertan números a floats binarios IEEE 754.
  - Las tasas de cambio se transmiten como cadenas con 4 decimales (ej. `"65.4321"`).
- **Encabezado de Idempotencia (`RNF-002`):**
  - Toda mutación que registre o concilie fondos debe incluir el encabezado HTTP:
    ```http
    X-Idempotency-Key: 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d
    ```
- **Esquema Estándar de Error (RFC 7807):**
  ```json
  {
    "type": "https://api.guachafit.com/errors/financial-invariant-violation",
    "title": "Violación de Invariante Financiera",
    "status": 422,
    "detail": "El monto abonado excede el saldo pendiente de la cuota.",
    "instance": "/api/v1/finanzas/transacciones/a1b2c3d4/conciliar",
    "code": "OVERPAYMENT_NOT_ALLOWED",
    "timestampUtc": "2026-09-06T14:32:00.123Z"
  }
  ```

---

## 🏋️ 2. Módulo de Entrenamiento y Nutrición

### 2.1. Obtener Sesión de Hoy del Alumno
Permite a la PWA descargar la sesión programada para la fecha actual en la zona horaria del alumno, con soporte para almacenamiento local offline en IndexedDB.

- **Método y Ruta:** `GET /alumnos/me/sesiones/hoy`
- **Permisos (RBAC):** Rol `alumno`.
- **Query Params:** `?timezone=America/Caracas` (Opcional, detectado del perfil si se omite).
- **Respuesta Exitosa (`200 OK`):**
```json
{
  "id": "e8f6e9c2-5509-48e2-b13c-7435f29910d1",
  "fechaProgramada": "2026-09-06",
  "estado": "planificada",
  "porcentajeCumplimiento": "0.00",
  "fechaInicioUtc": null,
  "fechaFinUtc": null,
  "ejercicios": [
    {
      "ejercicioSesionId": "b1a7d6e4-4401-49b2-99cc-112233445566",
      "ejercicioId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "nombre": "Press de Banca Plano con Barra",
      "grupoMuscular": "Pecho",
      "patronMovimiento": "Empuje Horizontal",
      "orden": 1,
      "notasCoach": "Mantener retracción escapular y pausa de 1 seg en el pecho",
      "series": [
        {
          "serieId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
          "numeroSerie": 1,
          "repsObjetivo": 10,
          "repsLogradas": null,
          "pesoKg": "80.00",
          "rpe": null,
          "completada": false,
          "anteriorRepsLogradas": 10,
          "anteriorPesoKg": "75.00"
        },
        {
          "serieId": "8d0e7780-8536-41ef-a55c-f18fd2001bf8",
          "numeroSerie": 2,
          "repsObjetivo": 8,
          "repsLogradas": null,
          "pesoKg": "85.00",
          "rpe": null,
          "completada": false,
          "anteriorRepsLogradas": 8,
          "anteriorPesoKg": "80.00"
        }
      ]
    }
  ]
}
```

### 2.2. Iniciar Sesión de Entrenamiento
Acción explícita (`comenzarEntrenamiento()`) al pulsar *"Comenzar a Entrenar"*. Sella el inicio formal y transiciona de `planificada` a `en_progreso`.

- **Método y Ruta:** `POST /sesiones/{id}/iniciar`
- **Permisos:** Rol `alumno` (titular de la sesión).
- **Cuerpo de Petición:**
```json
{
  "timezoneCliente": "America/Caracas"
}
```
- **Respuesta Exitosa (`200 OK`):**
```json
{
  "id": "e8f6e9c2-5509-48e2-b13c-7435f29910d1",
  "estado": "en_progreso",
  "fechaInicioUtc": "2026-09-06T15:05:22.450Z",
  "mensaje": "Sesión iniciada exitosamente"
}
```

### 2.3. Marcar o Actualizar Serie (Sincronización Offline-First)
Permite registrar una serie individual o un lote (*batch*) sincronizado desde IndexedDB cuando se recupera la conexión.

- **Método y Ruta:** `PUT /sesiones/{id}/series`
- **Permisos:** Rol `alumno`.
- **Cuerpo de Petición:**
```json
{
  "series": [
    {
      "serieId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      "repsLogradas": 10,
      "pesoKg": "82.50",
      "rpe": "8.5",
      "completada": true,
      "timestampCompletadaUtc": "2026-09-06T15:12:45.000Z"
    }
  ]
}
```
- **Respuesta Exitosa (`200 OK`):**
```json
{
  "sesionId": "e8f6e9c2-5509-48e2-b13c-7435f29910d1",
  "seriesActualizadas": 1,
  "porcentajeCumplimiento": "50.00"
}
```

### 2.4. Finalizar Entrenamiento y Cálculo de Racha
Calcula el volumen ejecutado, valida el umbral de completitud del 70% (`INV-01`), consolida la racha y bloquea la edición por el alumno (`INV-02`).

- **Método y Ruta:** `POST /sesiones/{id}/finalizar`
- **Permisos:** Rol `alumno`.
- **Cuerpo de Petición:**
```json
{
  "notasAlumno": "Excelente congestión en pectoral. Subí 2.5 kg en la segunda serie."
}
```
- **Respuesta Exitosa (`200 OK`):**
```json
{
  "id": "e8f6e9c2-5509-48e2-b13c-7435f29910d1",
  "estado": "completada",
  "fechaFinUtc": "2026-09-06T16:15:10.890Z",
  "porcentajeCumplimiento": "100.00",
  "creditoRachaOtorgado": true,
  "rachaActualDias": 5,
  "mensaje": "¡Entrenamiento completado! Has sumado 1 día a tu racha."
}
```

### 2.5. Reporte de Semáforo Nutricional Diario (1-Tap)
- **Método y Ruta:** `POST /nutricion/checkin-diario`
- **Permisos:** Rol `alumno`.
- **Cuerpo de Petición:**
```json
{
  "fecha": "2026-09-06",
  "semaforo": "cumplido",
  "aguaLitros": "3.50",
  "caloriasReportadas": 2450,
  "proteinaGramosReportada": 165,
  "notasAlumno": "Comí todas las comidas según el plan y tomé toda el agua.",
  "fotosPlatos": [
    {
      "tipoComida": "almuerzo",
      "storageKey": "comidas/a1b2c3d4/2026-09-06/foto-almuerzo-uuid.webp"
    }
  ]
}
```
- **Respuesta Exitosa (`201 Created` / `200 OK` si actualiza):**
```json
{
  "id": "3b7c9e10-1234-5678-abcd-ef0123456789",
  "fecha": "2026-09-06",
  "semaforo": "cumplido",
  "mensaje": "Check-in nutricional registrado con éxito"
}
```

---

## 📏 3. Módulo de Antropometría y Fotos de Progreso

### 3.1. Solicitar URL Presignada de Subida Directa (Direct-to-Storage)
Genera una URL temporal firmada en Cloudflare R2 con TTL de 15 minutos (`RNF-001`), evitando que los megabytes de fotos pasen por el servidor NestJS.

- **Método y Ruta:** `POST /antropometria/presigned-upload-url`
- **Permisos:** Roles `alumno` y `entrenador`.
- **Cuerpo de Petición:**
```json
{
  "modulo": "antropometria",
  "alumnoId": "4a5b6c7d-8e9f-0a1b-2c3d-4e5f6a7b8c9d",
  "angulo": "frontal",
  "mimeType": "image/webp"
}
```
- **Respuesta Exitosa (`200 OK`):**
```json
{
  "uploadUrl": "https://guachafit-media.r2.cloudflarestorage.com/antropometria/4a5b6c7d/2026/frontal-9a8b7c6d.webp?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=900...",
  "storageKey": "antropometria/4a5b6c7d/2026/frontal-9a8b7c6d.webp",
  "expiraEnSegundos": 900
}
```

### 3.2. Registrar Evaluación Antropométrica (Híbrido Presencial / Remoto)
Implementa la máquina de estados de `ADR-001`. Si el usuario autenticado es el alumno (modalidad remota), el registro se crea en estado `pendiente_aprobacion`. Si es el coach (modalidad presencial), se aprueba de inmediato.

- **Método y Ruta:** `POST /antropometria/checkin`
- **Permisos:** Roles `alumno` y `entrenador`.
- **Cuerpo de Petición:**
```json
{
  "alumnoId": "4a5b6c7d-8e9f-0a1b-2c3d-4e5f6a7b8c9d",
  "fechaEvaluacion": "2026-09-06",
  "pesoKg": "78.40",
  "alturaCm": "178.00",
  "porcentajeGrasa": "14.50",
  "perimetros": {
    "cuelloCm": "39.00",
    "pechoCm": "104.00",
    "cinturaCm": "81.50",
    "caderaCm": "98.00",
    "brazoCm": "37.50",
    "musloCm": "58.00"
  },
  "fotos": [
    { "angulo": "frontal", "storageKey": "antropometria/4a5b6c7d/2026/frontal-9a8b7c6d.webp" },
    { "angulo": "lateral", "storageKey": "antropometria/4a5b6c7d/2026/lateral-1a2b3c4d.webp" },
    { "angulo": "posterior", "storageKey": "antropometria/4a5b6c7d/2026/posterior-5e6f7a8b.webp" }
  ]
}
```
- **Respuesta Exitosa (`201 Created`):**
```json
{
  "id": "f1e2d3c4-b5a6-7890-1234-567890abcdef",
  "alumnoId": "4a5b6c7d-8e9f-0a1b-2c3d-4e5f6a7b8c9d",
  "modalidad": "remoto",
  "origen": "remoto_autoreporte",
  "estado": "pendiente_aprobacion",
  "mensaje": "Check-in enviado al entrenador para validación y aprobación."
}
```

### 3.3. Consultar Evolución Corporal y Fotos con URLs Firmadas
Entrega el historial de mediciones aprobadas y genera URLs firmadas GET con TTL de 15 minutos para renderizar el comparador fotográfico (`RF-004`).

- **Método y Ruta:** `GET /antropometria/evolucion/{alumnoId}`
- **Permisos:** Rol `entrenador` o el propio `alumno` titular.
- **Respuesta Exitosa (`200 OK`):**
```json
{
  "alumnoId": "4a5b6c7d-8e9f-0a1b-2c3d-4e5f6a7b8c9d",
  "historial": [
    {
      "id": "c1d2e3f4-5678-90ab-cdef-1234567890ab",
      "fechaEvaluacion": "2026-08-06",
      "pesoKg": "80.20",
      "porcentajeGrasa": "15.80",
      "cinturaCm": "83.50",
      "estado": "aprobado",
      "fotos": [
        {
          "angulo": "frontal",
          "signedViewUrl": "https://guachafit-media.r2.cloudflarestorage.com/antropometria/...signed-token...",
          "expiraEnSegundos": 900
        }
      ]
    },
    {
      "id": "f1e2d3c4-b5a6-7890-1234-567890abcdef",
      "fechaEvaluacion": "2026-09-06",
      "pesoKg": "78.40",
      "porcentajeGrasa": "14.50",
      "cinturaCm": "81.50",
      "estado": "aprobado",
      "fotos": [
        {
          "angulo": "frontal",
          "signedViewUrl": "https://guachafit-media.r2.cloudflarestorage.com/antropometria/...signed-token...",
          "expiraEnSegundos": 900
        }
      ]
    }
  ],
  "delta": {
    "diasTranscurridos": 31,
    "deltaPesoKg": "-1.80",
    "deltaGrasa": "-1.30",
    "deltaCinturaCm": "-2.00"
  }
}
```

### 3.4. Aprobar o Rechazar Check-in (Entrenador)
- **Método y Ruta:** `PATCH /antropometria/{id}/conciliar`
- **Permisos:** Rol `entrenador`.
- **Cuerpo de Petición (Aprobación):**
```json
{
  "accion": "aprobar",
  "observacionesCoach": "Excelente reducción de cintura. Medición validada."
}
```
- **Cuerpo de Petición (Rechazo con corrección):**
```json
{
  "accion": "rechazar",
  "motivoRechazo": "La foto lateral no se tomó con buena iluminación y la cinta métrica de cadera parece holgada. Por favor repetir medición."
}
```
- **Respuesta Exitosa (`200 OK`):**
```json
{
  "id": "f1e2d3c4-b5a6-7890-1234-567890abcdef",
  "estado": "aprobado",
  "fechaAprobacionUtc": "2026-09-06T16:45:00.000Z"
}
```

---

## 💰 4. Módulo de Finanzas, Cobranza y Conciliación

### 4.1. Consultar Tasas Cambiarias y Saldos Bimonetarios
Provee la tasa oficial, la tasa activa del entrenador y la tasa personalizada de override del alumno si existe (`ADR-003`).

- **Método y Ruta:** `GET /finanzas/tasas/vigente`
- **Permisos:** Roles `alumno` y `entrenador`.
- **Respuesta Exitosa (`200 OK`):**
```json
{
  "tasaOficialBcv": "60.5000",
  "tasaActivaEntrenador": "65.0000",
  "tasaAplicableUsuario": "65.0000",
  "tieneOverride": false,
  "fechaActualizacionUtc": "2026-09-06T12:00:00.000Z"
}
```

### 4.2. Reporte de Pago por el Alumno (Abono Fraccionado Bimonetario)
Sella inmutablemente la tasa de cambio vigente al momento del reporte (`ADR-003`), genera la transacción en estado `pendiente`, coloca la cuota en `pendiente_revision` y exige cabecera de idempotencia (`RNF-002`).

- **Método y Ruta:** `POST /finanzas/cuotas/{id}/reportar-pago`
- **Encabezados Requeridos:**
  - `Authorization: Bearer <token>`
  - `X-Idempotency-Key: 7f8a9b0c-1d2e-3f4a-5b6c-7d8e9f0a1b2c`
- **Permisos:** Rol `alumno` (titular de la cuota).
- **Cuerpo de Petición:**
```json
{
  "montoOriginal": "1300.00",
  "monedaOriginal": "VES",
  "metodoPago": "pago_movil",
  "referenciaBancaria": "847291",
  "fechaOperacion": "2026-09-06",
  "comprobanteStorageKey": "comprobantes/coach-uuid/cuota-uuid/recibo-847291.webp"
}
```
- **Lógica de Ejecución en Backend:**
  1. Verifica el `X-Idempotency-Key` en Redis / DB. Si ya existe la misma operación, devuelve el resultado guardado sin duplicar.
  2. Determina la tasa aplicable: `65.0000 Bs/USD`.
  3. Calcula el crédito equivalente: $1,300.00 / 65.0000 = \$20.00 \text{ USD}$.
  4. Inserta `transacciones_pago` con `estado_conciliacion = 'pendiente'`.
  5. Actualiza `cuotas_membresia` con `estado = 'pendiente_revision'`.
- **Respuesta Exitosa (`201 Created`):**
```json
{
  "transaccionId": "3e4f5a6b-7c8d-9e0f-1a2b-3c4d5e6f7a8b",
  "cuotaId": "c9d8e7f6-5a4b-3c2d-1e0f-9a8b7c6d5e4f",
  "montoOriginal": "1300.00",
  "monedaOriginal": "VES",
  "tasaCambioFijada": "65.0000",
  "montoEquivalenteUsd": "20.00",
  "estadoConciliacion": "pendiente",
  "estadoCuota": "pendiente_revision",
  "mensaje": "Pago reportado exitosamente. Tu entrenador verificará el ingreso en breve."
}
```

### 4.3. Cobro Directo en Efectivo Registrado por el Entrenador
Permite al coach cobrar en sala (dólares o bolívares en efectivo). Se aprueba y aplica inmediatamente sin requerir comprobante ni pasar por la bandeja de revisión (`INV-04` de `Entidad-TransaccionPago`).

- **Método y Ruta:** `POST /finanzas/cuotas/{id}/cobro-directo`
- **Encabezados Requeridos:** `X-Idempotency-Key: <UUID>`
- **Permisos:** Rol `entrenador`.
- **Cuerpo de Petición:**
```json
{
  "montoOriginal": "30.00",
  "monedaOriginal": "USD",
  "metodoPago": "efectivo_usd",
  "fechaOperacion": "2026-09-06",
  "notas": "Pago recibido en efectivo en el gimnasio"
}
```
- **Respuesta Exitosa (`200 OK`):**
```json
{
  "transaccionId": "a1b2c3d4-e5f6-7890-1234-567890abcdef",
  "cuotaId": "c9d8e7f6-5a4b-3c2d-1e0f-9a8b7c6d5e4f",
  "montoAbonadoUsd": "50.00",
  "saldoPendienteUsd": "0.00",
  "estadoCuota": "al_dia",
  "mensaje": "Cobro directo registrado. La cuota ha sido liquidada al 100%."
}
```

### 4.4. Bandeja de Conciliación: Aprobar o Rechazar Transacción
Ejecuta la transacción ACID interactiva en PostgreSQL bloqueando la cuota con `SELECT ... FOR UPDATE` (`RNF-002`).

- **Método y Ruta:** `PATCH /finanzas/transacciones/{id}/conciliar`
- **Permisos:** Rol `entrenador`.
- **Cuerpo de Petición (Aprobar):**
```json
{
  "accion": "aprobar"
}
```
- **Cuerpo de Petición (Rechazar):**
```json
{
  "accion": "rechazar",
  "motivoRechazo": "Los fondos no aparecen reflejados en la cuenta de Pago Móvil con la referencia provista."
}
```
- **Respuesta Exitosa (`200 OK` - Tras Aprobación):**
```json
{
  "transaccionId": "3e4f5a6b-7c8d-9e0f-1a2b-3c4d5e6f7a8b",
  "estadoConciliacion": "aprobado",
  "fechaConciliacionUtc": "2026-09-06T17:02:15.340Z",
  "impactoCuota": {
    "cuotaId": "c9d8e7f6-5a4b-3c2d-1e0f-9a8b7c6d5e4f",
    "montoAcreditadoUsd": "20.00",
    "montoAbonadoTotalUsd": "20.00",
    "saldoPendienteUsd": "30.00",
    "nuevoEstadoCuota": "abonada_parcial"
  }
}
```

### 4.5. Tablero de Control de Cartera y Morosidad (`RF-009`)
Entrega las métricas agregadas en tiempo real para el entrenador: total facturado, cobrado, por cobrar, en mora y la lista clasificada de alumnos.

- **Método y Ruta:** `GET /finanzas/cartera/dashboard`
- **Permisos:** Rol `entrenador`.
- **Query Params:** `?periodo=2026-09` (Opcional, mes actual por defecto).
- **Respuesta Exitosa (`200 OK`):**
```json
{
  "periodo": "2026-09",
  "kpis": {
    "carteraTotalUsd": "1500.00",
    "totalCobradoUsd": "950.00",
    "totalPendienteUsd": "450.00",
    "totalEnMoraUsd": "100.00",
    "tasaCobranzaPorcentaje": "63.33",
    "totalAlumnosActivos": 30,
    "alumnosAlDia": 19,
    "alumnosConAbonoParcial": 5,
    "alumnosEnMora": 2,
    "transaccionesPendientesRevision": 4
  },
  "bandejaConciliacionPendiente": [
    {
      "transaccionId": "3e4f5a6b-7c8d-9e0f-1a2b-3c4d5e6f7a8b",
      "clienteNombre": "Carlos Mendoza",
      "montoOriginal": "1300.00",
      "monedaOriginal": "VES",
      "montoEquivalenteUsd": "20.00",
      "metodoPago": "pago_movil",
      "referenciaBancaria": "847291",
      "comprobanteSignedUrl": "https://guachafit-media.r2.cloudflarestorage.com/comprobantes/...signed-url..."
    }
  ]
}
```

---

## 🔒 5. Matriz de Autorización (RBAC Endpoints)

| Endpoint | Rol Alumno | Rol Entrenador | Validación Especial |
| :--- | :---: | :---: | :--- |
| `GET /alumnos/me/sesiones/hoy` | ✅ | ❌ | Solo accede a sus propias sesiones. |
| `POST /sesiones/{id}/iniciar` | ✅ | ❌ | Debe ser el titular de la sesión. |
| `PUT /sesiones/{id}/series` | ✅ | ❌ | Solo si estado es `en_progreso`. |
| `POST /sesiones/{id}/finalizar` | ✅ | ❌ | Calcula racha si cumplimiento $\ge 70\%$. |
| `POST /antropometria/presigned-upload-url` | ✅ | ✅ | Valida cupo de fotos y tipo MIME `image/webp`. |
| `POST /antropometria/checkin` | ✅ (Remoto) | ✅ (Presencial) | Si es alumno $\rightarrow$ `pendiente_aprobacion`. |
| `PATCH /antropometria/{id}/conciliar` | ❌ | ✅ | Requiere motivo si es rechazo. |
| `POST /finanzas/cuotas/{id}/reportar-pago` | ✅ | ❌ | Exige `X-Idempotency-Key` y comprobante. |
| `POST /finanzas/cuotas/{id}/cobro-directo` | ❌ | ✅ | Auto-aprobación inmediata en efectivo. |
| `PATCH /finanzas/transacciones/{id}/conciliar` | ❌ | ✅ | Mutación bajo transacción interactiva ACID. |
| `GET /finanzas/cartera/dashboard` | ❌ | ✅ | Filtra únicamente alumnos del entrenador. |

---

## 🔗 6. Trazabilidad y Referencias
- **Problemas resueltos:** [[PROB-001-adherencia-trazabilidad]], [[PROB-002-cobranza-bimonetaria-fraccionada]].
- **Requerimientos asociados:** [[RF-001-checklist-entrenamiento-diario]] al [[RF-009-tablero-control-cartera-morosidad]].
- **Requerimientos No Funcionales:** [[RNF-001-almacenamiento-seguridad-fotos-progreso]], [[RNF-002-consistencia-financiera-idempotencia-pagos]].
- **Decisiones arquitecturales:**
  - [[ADR-001-modelo-hibrido-auditoria-antropometrica]]
  - [[ADR-002-gestion-fechas-utc-zonas-horarias]]
  - [[ADR-003-deuda-maestra-usd-liquidacion-multitasa]]
  - [[ADR-004-stack-frontend-pwa-offline-first]]
  - [[ADR-005-arquitectura-backend-monolito-modular-nestjs]]
  - [[ADR-006-persistencia-postgresql-drizzle-orm]]
  - [[ADR-007-almacenamiento-fotos-privadas-cloudflare-r2-presigned-urls]]
  - [[ADR-008-motor-colas-background-workers-bullmq]]
- **Documento de Esquema:** [[02_Esquema_Base_de_Datos_PostgreSQL]]
