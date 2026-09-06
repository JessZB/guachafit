---
id: RF-011
modulo: Onboarding
prioridad: alta
estado: aprobado
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
  1. Valida la validez y estado activo del `coach_code`.
  2. Crea la cuenta del alumno vinculada automáticamente al `entrenador_id` correspondiente.
  3. Establece la contraseña definida por el usuario en el formulario.
  4. Envía una notificación push y correo al coach: *"Nuevo alumno registrado: [Nombre Completo]"*.

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

---

## 6. Casos Borde y Excepciones
- **Enlace con Coach Code Invalido o Desactivado:** Si un usuario intenta registrarse con un `coach_code` que no existe o cuyo entrenador está suspendido, el sistema debe mostrar un mensaje amigable: *"El código de entrenador no es válido o no está disponible. Por favor contacta a tu coach."*
- **Correo Electrónico Duplicado:** Si el email ya existe en la base de datos de la plataforma, el sistema debe indicar: *"Este correo ya se encuentra registrado. Si eres tú, inicia sesión o recupera tu contraseña."*
