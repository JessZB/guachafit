---
entidad: PerfilAlumno
modulo: Clientes
tipo: AggregateRoot
estado_ciclo_vida: activo
fecha_creacion: 2026-09-06
tags:
  - dominio
  - ddd
  - entidad
  - clientes
  - onboarding
---

# Entidad de Dominio: PerfilAlumno

## 1. Ubiquitous Language (Lenguaje Ubicuo)
> Representa la ficha personal, médica y deportiva del alumno dentro de la cartera privada de un entrenador específico.

- **Definición de negocio:** Entidad central que aglutina la identidad legal, edad calculada, datos de contacto, notas médicas confidenciales y el estado operativo del servicio del alumno.
- **Términos del Dominio:**
  - `Documento de Identidad`: Cédula o pasaporte validado según nacionalidad.
  - `Ficha de Salud Privada`: Anotaciones confidenciales sobre lesiones y limitaciones biomecánicas del alumno, accesibles únicamente por el coach.
  - `Estado de Activación`: Nivel de servicio (`Activo`, `Inactivo/Pausado`, `Suspendido por Pago`).
- **Bounded Context:** Contexto de Gestión de Clientes y Onboarding.

---

## 2. Atributos Clave (Schema de Dominio)

| Atributo | Tipo / Value Object | Requerido | Descripción | Restricciones / Formato |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | Sí | Identificador único inmutable | UUID v4 |
| `usuario_id` | `UUID` | Sí | Vínculo con la cuenta de autenticación | 1 a 1 con `Usuario` |
| `entrenador_id` | `UUID` | Sí | Entrenador propietario del cliente (Tenant) | Llave foránea lógica |
| `tipo_documento` | `EnumTipoDoc` | Sí | `V_`, `E_`, `PASAPORTE` | Selector estructurado |
| `numero_documento`| `string` | Sí | Número de identificación legal | Alfanumérico validado |
| `nombres` | `string` | Sí | Nombres de pila | 2 a 60 caracteres |
| `apellidos` | `string` | Sí | Apellidos | 2 a 60 caracteres |
| `fecha_nacimiento`| `Date` | Sí | Fecha natal del alumno | YYYY-MM-DD |
| `telefono_whatsapp`| `PhoneNumber` (VO) | Sí | Teléfono con código internacional | E.164 (ej. `+584121234567`) |
| `ficha_salud_privada`| `string` | No | Notas médicas confidenciales del coach | Texto encriptado en reposo |
| `estado_activacion`| `EnumEstadoAlumno`| Sí | `Activo`, `InactivoPausado`, `SuspendidoPago` | Máquina de estados |
| `modalidad` | `EnumModalidad` | Sí | `Presencial` u `Online` | Modelo híbrido |
| `deleted_at_utc` | `DateTime` | No | Timestamp de borrado lógico (Soft Delete)| Null si está vigente |

---

## 3. Invariantes de Negocio (Business Invariants)
- **INV-01 (Aislamiento de Tenancy por Alumno):** Un alumno siempre está asociado a exactamente un `entrenador_id`. Toda operación sobre el alumno requiere que el usuario autenticado sea su propio entrenador o el propio alumno.
- **INV-02 (Privacidad Médica Absoluta):** El campo `ficha_salud_privada` nunca debe ser retornado en llamadas API autenticadas por el alumno (`rol == ALUMNO`).
- **INV-03 (Preservación Soft Delete):** La entidad nunca se destruye físicamente de la base de datos; cualquier baja sella `deleted_at_utc`.

---

## 4. Relaciones y Límites de Agregado
- **Raíz del Agregado:** `PerfilAlumno`.
- **Referencias externas:** Se vincula lógicamente con `SesionEntrenamiento`, `ControlAntropometrico` y `CuotaMembresia` a través de su `id`.

---

## 5. Operaciones de Negocio (Comportamientos / Métodos)
- `calcularEdad(fechaActual)`: Función pura que calcula la edad cronológica en años cumplidos:
  $$\text{Edad} = \text{años transcurridos entre } \text{fecha\_nacimiento} \text{ y } \text{fechaActual}$$
- `actualizarFichaSalud(entrenadorId, notas)`: Permite al coach documentar nuevas lesiones o ajustes clínicos.
- `pausar(motivo)`: Cambia el estado a `InactivoPausado` y emite `AlumnoPausadoEvent`.
- `suspenderPorMora()`: Cambia el estado a `SuspendidoPago` y bloquea nuevas rutinas.
- `reactivar()`: Restaura el estado a `Activo` y emite `AlumnoReactivadoEvent`.
- `eliminarLogico()`: Sella `deleted_at_utc = now_utc()`.

---

## 6. Eventos de Dominio Emitidos (Domain Events)
- `AlumnoRegistradoEvent`: Disparado tras el alta manual o vía deep link.
- `AlumnoPausadoEvent`: Notifica a los módulos de facturación para detener el cron de cuotas automáticas.
- `AlumnoReactivadoEvent`: Restaura los permisos de entrenamiento y check-in del alumno.
