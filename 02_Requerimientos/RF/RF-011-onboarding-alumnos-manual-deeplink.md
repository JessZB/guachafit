---
id: RF-011
modulo: Onboarding
prioridad: alta
estado: parcial
version_implementada: v1.0.0
fecha_verificacion: 2026-09-24
problema_origen: "[[PROB-003-acceso-onboarding-dashboard-central]]"
fecha_creacion: 2026-09-06
version: 1.0
tags:
  - requerimiento
  - rf
  - sdd
  - onboarding
  - clientes
  - ficha-salud
---

# RF-011: Onboarding Híbrido de Alumnos (Registro Manual y Enlace Único Deep Link)

## 1. Contexto y Justificación
Permite al entrenador captar e incorporar alumnos tanto en el entorno físico del gimnasio (mostrador) como en el canal digital a distancia. Combina la carga rápida de fichas completas por parte del coach con un mecanismo de autorregistro autónomo mediante enlaces personalizados.

- **Objetivo:** Estandarizar la recopilación de datos de identidad, contacto, cálculo dinámico de edad y antecedentes de salud, facilitando la entrega de credenciales.
- **Valor aportado:** Reducción del tiempo de alta a menos de 2 minutos, captura de factores de riesgo clínico y automatización en la vinculación del alumno con su coach.
- **Trazabilidad:** Resuelve la fricción y desorden en la captura de clientes de [[PROB-003-acceso-onboarding-dashboard-central]].

---

## 2. Actores Involucrados
- **Entrenador:** Introduce la ficha del cliente presencial o comparte su enlace de captación.
- **Alumno:** Completa su autorregistro online o activa sus credenciales mediante el correo de bienvenida.

---

## 3. Precondiciones
1. El entrenador debe tener una cuenta activa en la plataforma y contar con su `coach_code` generado.

---

## 4. Reglas de Negocio (Business Rules)

### Vía A: Registro Manual por el Entrenador
- **RN-01 (Documento de Identidad):** Selector obligatorio de tipo de documento:
  - `V-` (Cédula de Identidad Venezolana)
  - `E-` (Extranjero residente)
  - `Pasaporte / Otro` (Para clientes internacionales)
  - Número de documento (alfanumérico validado según tipo).
- **RN-02 (Cálculo Automático de Edad en Tiempo Real):** El formulario solicita la `fecha_nacimiento`. El sistema calcula y renderiza dinámicamente la edad exacta en años al lado del campo:
  $$\text{Edad} = \text{floor}\left(\frac{\text{now}() - \text{fecha\_nacimiento}}{365.25 \text{ días}}\right)$$
- **RN-03 (Datos de Contacto y Login):**
  - Nombres y Apellidos.
  - Teléfono / WhatsApp (con selector de código de país internacional, ej. `+58`, `+57`, `+1`).
  - Correo electrónico (único a nivel de sistema; actúa como *username* de inicio de sesión).
- **RN-04 (Ficha de Salud y Observaciones Privadas):** Campo de texto enriquecido / notas confidenciales visible **exclusivamente para el entrenador** (nunca visible para el alumno), destinado a registrar:
  - Lesiones previas, hernias discales, cirugías recientes.
  - Patologías cardíacas, hipertensión, diabetes.
  - Medicación actual o advertencias biomecánicas para la sesión física.
- **RN-05 (Entrega de Credenciales por Token):** Al guardar la ficha manual, el sistema dispara automáticamente un correo transaccional de bienvenida con un token seguro de un solo uso (TTL de 48 horas) para que el alumno cree su contraseña.

### Vía B: Registro Autónomo mediante Enlace Único (Deep Link)
- **RN-06 (Estructura del Enlace):** Cada entrenador dispone de una URL personalizable:
  $$\text{https://app.guachafit.com/registro?coach\_code=XYZ}$$
- **RN-07 (Vinculación Automática al Tenant):** Cuando un usuario completa el formulario público a través de ese enlace, el backend:
  1. Valida que el `coach_code` exista y que su entrenador esté operativo (cuenta habilitada y licencia vigente); un código inexistente, una cuenta deshabilitada o una licencia suspendida responden con el mismo 404 uniforme.
  2. Crea la cuenta del alumno vinculada automáticamente al `entrenador_id` correspondiente.
  3. Establece la contraseña definida por el usuario en el formulario.
  4. Envía una notificación push y correo al coach: *"Nuevo alumno registrado: [Nombre Completo]"*.

### Vía C: Gestión Centralizada y Expediente Deportivo 360°
- **RN-08 (Directorio Dinámico con Toggle Cards / Tabla):** El listado principal de alumnos cuenta con un selector de visualización:
  - *Cards Compactas Densas:* Tarjetas escaneables de ~120px de altura con avatar circular, semáforo de pagos (`Al Día`, `Por Vencer`, `Moroso`), badges de modalidad y estado, botón directo de WhatsApp y navegación al expediente.
  - *Vista Tabla:* Filas ordenables de alta densidad operativa.
  - KPIs en cabecera con recuento de alumnos totales, activos, pausados, morosos y modalidades.
- **RN-09 (Expediente Deportivo 360° - `/coach/alumnos/:id`):** Al seleccionar un alumno, se accede a una pantalla dedicada con cabecera fija de identidad y 4 pestañas de gestión operativa:
  1. *Resumen & Ficha Médica:* Datos personales, ficha médica cifrada (AES-256-GCM) y asignación de Plan del catálogo (`RF-005`) con override de precio/tasa.
  2. *Finanzas & Pagos:* Resumen del mes actual, histórico acumulado de cobros y modal de Cobro Directo Inteligente en sala.
  3. *Antropometría & Medidas:* Métricas biométricas con deltas comparativos, histórico de check-ins y fotos evolutivas.
  4. *Entrenamiento & Rutinas:* Planificación semanal por bloques de días con series/reps y auditoría de última sesión con RPE y reporte de molestias.

---

## 5. Criterios de Aceptación (Given-When-Then / Gherkin)

### Escenario 1: Alta Manual con Cálculo Dinámico de Edad
```gherkin
Given que el entrenador se encuentra en el formulario "Nuevo Alumno"
When selecciona tipo "V-", introduce "18456123", nombres "Marcos", apellidos "Perez"
  And selecciona fecha de nacimiento "1994-05-15"
Then la interfaz debe mostrar automáticamente la etiqueta "Edad: 32 años"
  And al guardar, debe enviar el correo de bienvenida con el token de creación de contraseña a Marcos
```

### Escenario 2: Autorregistro Autónomo vía Deep Link del Entrenador
```gherkin
Given que un prospecto accede a "https://app.guachafit.com/registro?coach_code=ALEXFIT"
When completa sus datos personales, email y crea su contraseña directamente
Then el sistema debe crear la cuenta en estado "Activo"
  And vincular al alumno inmediatamente bajo la cartera del entrenador "ALEXFIT"
  And disparar una notificación al entrenador: "Nuevo alumno registrado: [Nombre]"
```

### Escenario 3: Confidencialidad de la Ficha de Salud Privada
```gherkin
Given que el entrenador registró en la ficha de salud: "Hernia discal L4-L5, evitar sentadilla libre pesada"
When el alumno inicia sesión en su aplicación móvil y consulta su perfil
Then el alumno NO debe tener acceso ni visibilidad sobre este campo de notas privadas
  And el entrenador sí debe poder consultarlo rápidamente antes de cada entrenamiento
```

### Escenario 4: Navegación al Expediente 360° desde Tarjeta Compacta
```gherkin
Given que el entrenador está en el Directorio de Alumnos en vista de Cards Compactas
When hace clic sobre la tarjeta del alumno "Carlos Mendoza"
Then la aplicación debe navegar a "/coach/alumnos/al-001"
  And renderizar la cabecera fija con sus datos personales, estado y semáforo de pago
  And cargar las 4 pestañas 360° (Resumen, Finanzas, Antropometría, Rutinas)
```

---

## 6. Casos Borde y Excepciones
- **Enlace con Coach Code Inválido, Desactivado o Suspendido:** Si un usuario intenta registrarse con un `coach_code` que no existe, o cuyo entrenador tiene la cuenta deshabilitada o la licencia suspendida, el backend responde el mismo 404 uniforme que ante un código inexistente y el sistema muestra el mensaje amigable: *"El código de entrenador no es válido o no está disponible. Por favor contacta a tu coach."*
- **Correo Electrónico Duplicado:** Si el email ya existe en la base de datos de la plataforma, el sistema debe indicar: *"Este correo ya se encuentra registrado. Si eres tú, inicia sesión o recupera tu contraseña."*
- **Alumno Sin Cuotas Emitidas en el Semáforo:** Si un alumno recién registrado no posee aún ninguna cuota emitida, el semáforo se mostrará en gris neutro con etiqueta "Sin Cuota Emitida".

---

## 7. Estado real de implementación

- Resuelto (2026-09-21): deep link con `coachCode` REAL (perfil del coach + `construirLinkOnboarding`), validación de licencia activa (404 uniforme) y notificación al coach del nuevo registro (evento `ALUMNO_REGISTRADO`). Sin hardcodes.
- Resuelto (2026-09-21): el alta manual entrega credenciales con token de un solo uso (TTL 48 h) y enlace copiable a la página pública `/activar`; el canje establece la contraseña (RN-05). Sigue pendiente el envío automático por correo transaccional.
- Resuelto parcial (2026-09-21): "Sin cuota emitida" ya se rotula correctamente vía etiquetas centralizadas (`apps/web/src/lib/etiquetas-dominio.ts`). El estado de datos `Por Vencer` sigue sin existir.
- Implementado (2026-09-24, unidad CASCADA-COACH): la resolución pública del `coach_code` y el registro público exigen un entrenador **operable** (cuenta habilitada + licencia vigente): un código inexistente, una cuenta deshabilitada y una licencia suspendida comparten la misma respuesta 404 uniforme en ambos flujos ([[ADR-016-cascada-acceso-coach-alumnos-autenticacion]]).
