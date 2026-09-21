---
id: RF-003
modulo: Antropometria
prioridad: alta
estado: parcial
version_implementada: v1.0.0
fecha_verificacion: 2026-09-20
problema_origen: "[[PROB-001-adherencia-trazabilidad]]"
fecha_creacion: 2026-09-05
version: 1.0
tags:
  - requerimiento
  - rf
  - sdd
  - antropometria
  - rbac
---

# RF-003: Check-in Antropométrico y Auditoría RBAC Híbrida (Presencial vs. Remoto)

## 1. Contexto y Justificación
Estructura un calendario predecible de control antropométrico y composición corporal. Resuelve la inconsistencia y riesgo de alteración de métricas estableciendo permisos basados en roles (RBAC) y un flujo de auditoría diferenciado según la modalidad del cliente.

- **Objetivo:** Capturar mediciones corporales fiables con trazabilidad total sobre el autor del registro y su nivel de verificación técnica.
- **Valor aportado:** Datos fisiológicos válidos para la toma de decisiones clínicas y deportivas sin perder la flexibilidad de clientes a distancia.
- **Trazabilidad:** Resuelve la falta de estructura y confiabilidad documentada en [[PROB-001-adherencia-trazabilidad]].

---

## 2. Actores Involucrados
- **Entrenador:** Configura calendarios, toma y valida medidas en modalidad presencial, audita y aprueba medidas remotas.
- **Alumno Presencial:** Acceso de solo lectura a sus mediciones y evolución.
- **Alumno Online/Remoto:** Acceso de escritura condicionado a la ventana activa de check-in.

---

## 3. Precondiciones
1. El cliente debe tener asignada una modalidad de atención en su perfil: `Presencial` u `Online/Remoto`.
2. El entrenador debe haber configurado la periodicidad del check-in (`Semanal`, `Quincenal` o `Mensual`).

---

## 4. Reglas de Negocio (Business Rules)
- **RN-01 (Calendario y Disparo de Alertas):** En la fecha programada a las 06:00 AM (hora local), el sistema envía una notificación push y correo: *"Hoy es día de check-in: registra tus métricas en ayunas"*.
- **RN-02 (Modelo de Datos Antropométrico):**
  - **Generales:** Peso (kg), Altura (cm).
  - **Perímetros corporales:** Pecho, cintura, cadera, brazo relajado/contraído, muslo medio, cuello.
  - **Composición:** % Grasa corporal (estimado por bioimpedancia o fórmula) y/o pliegues cutáneos (tríceps, subescapular, suprailíaco, abdominal).
  - **Fotos obligatorias/opcionales de control:** Frontal, lateral y posterior (privadas y protegidas).
- **RN-03 (RBAC Presencial - Solo Lectura para el Cliente):**
  - Si `modalidad == "Presencial"`, el cliente tiene permisos `Read-only` sobre el formulario de métricas.
  - Solo el Entrenador puede digitar las medidas físicas tomadas en consulta.
  - El registro se crea con: `origen: "Presencial (Verificado)"` y `estado: "Aprobado"`.
- **RN-04 (RBAC Online/Remoto - Escritura Condicional y Aprobación):**
  - Si `modalidad == "Online"`, el cliente tiene permisos `Read-write` **únicamente** durante la ventana activa de check-in (ej. día programado $\pm 24$ horas).
  - Los datos enviados por el cliente se guardan con: `origen: "Remoto (Autoreporte)"` y `estado: "Pendiente de Aprobación"`.
  - El entrenador recibe una alerta para revisar las fotos y valores; al presionar *"Aprobar y Consolidar"*, el registro transiciona a `estado: "Aprobado"`. Si detecta anomalías, puede solicitar corrección mediante notas de retroalimentación.

---

## 5. Criterios de Aceptación (Given-When-Then / Gherkin)

### Escenario 1: Registro Presencial Realizado por el Entrenador
```gherkin
Given que el cliente "Juan Perez" tiene modalidad "Presencial"
  And el entrenador se encuentra en la ficha del cliente en el gimnasio
When el entrenador completa el formulario de medidas físicas y presiona "Guardar Registro"
Then el sistema debe guardar el registro con:
  | Campo          | Valor                    |
  | registrado_por | ID_DEL_ENTRENADOR        |
  | origen         | "Presencial (Verificado)"|
  | estado         | "Aprobado"               |
  And el cliente solo debe poder visualizar las métricas resultantes sin opción a edición
```

### Escenario 2: Autoreporte Remoto del Alumno en Ventana de Check-in
```gherkin
Given que el cliente "Maria Lopez" tiene modalidad "Online/Remoto"
  And hoy es su fecha configurada de check-in quincenal
When accede a la app, llena su peso, perímetros corporales y adjunta sus 3 fotos de progreso
  And presiona "Enviar Check-in"
Then el sistema debe persistir el registro con:
  | Campo          | Valor                    |
  | registrado_por | ID_DEL_CLIENTE           |
  | origen         | "Remoto (Autoreporte)"   |
  | estado         | "Pendiente de Aprobación"|
  And enviar una notificación al entrenador: "Nuevo check-in pendiente de validación para Maria Lopez"
  And bloquear nuevas ediciones por parte de Maria hasta que el coach emita feedback
```

### Escenario 3: Cliente Presencial Intentando Modificar Medidas
```gherkin
Given que un cliente con modalidad "Presencial" intenta enviar un payload HTTP de mutación sobre sus medidas
When el backend procesa la petición
Then debe interceptar la solicitud mediante la política RBAC
  And rechazar la operación con código HTTP 403 Forbidden
  And registrar un evento de intento de modificación no autorizado en logs de auditoría
```

---

## 6. Casos Borde y Excepciones
- **Expiración de la ventana de check-in:** Si el alumno remoto no completa el check-in en la ventana de 48h, el formulario se deshabilita automáticamente y se notifica al entrenador para reprogramación.
- **Valores biológicamente imposibles:** Validación de rango (ej. peso $< 30$ kg o $> 300$ kg; % grasa $< 2\%$ o $> 70\%$) para evitar errores de tipeo accidentales antes de persistir.

---

## 7. Estado real de implementación

- Núcleo RBAC híbrido implementado: presencial de solo lectura y remoto con aprobación del coach.
- Ventana de check-in de ±24 h / 48 h (RN-04) no implementada.
- Periodicidad configurable y recordatorio de las 06:00 (RN-01) ausentes.
- Modelo de RN-02 incompleto: un solo brazo/muslo y sin pliegues cutáneos.
- El alumno presencial no tiene vista de solo lectura en la UI.
- El coach no puede ver las fotos que debe auditar (RN-04).
