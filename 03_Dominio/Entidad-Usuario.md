---
entidad: Usuario
modulo: Acceso
tipo: AggregateRoot
estado_ciclo_vida: activo
fecha_creacion: 2026-09-06
tags:
  - dominio
  - ddd
  - entidad
  - autenticacion
  - rbac
---

# Entidad de Dominio: Usuario (IAM)

## 1. Ubiquitous Language (Lenguaje Ubicuo)
> Representa la identidad digital y las credenciales de acceso de cualquier persona que interactúa con la plataforma GUACHAFIT.

- **Definición de negocio:** Cuenta única de autenticación asociada a un correo electrónico que determina los permisos globales a través de su rol asignado.
- **Términos del Dominio:**
  - `Credenciales de Acceso`: Pareja email / password hash.
  - `Rol`: Nivel de autoridad jerárquico (`SUPERADMIN`, `ENTRENADOR`, `ALUMNO`).
- **Bounded Context:** Contexto de Identidad y Gestión de Accesos (IAM).

---

## 2. Atributos Clave (Schema de Dominio)

| Atributo | Tipo / Value Object | Requerido | Descripción | Restricciones / Formato |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | Sí | Identificador único global inmutable | UUID v4 |
| `email` | `EmailAddress` (VO) | Sí | Correo electrónico de inicio de sesión | Formato RFC 5322, normalizado lowercase |
| `password_hash` | `string` | No | Hash de contraseña segura | Algoritmo Argon2id o bcrypt |
| `rol` | `EnumRol` | Sí | `SUPERADMIN`, `ENTRENADOR`, `ALUMNO` | Inmutable tras creación |
| `estado` | `EnumEstadoUsuario`| Sí | `Activo`, `Inactivo`, `Bloqueado` | Máquina de estados de acceso |
| `token_invitacion_hash`| `string` | No | Hash de token para primer seteo de clave | SHA-256 |
| `token_invitacion_expira`| `DateTime` | No | Vencimiento del token de bienvenida | ISO 8601 UTC |
| `ultimo_acceso_utc` | `DateTime` | No | Momento del último login exitoso | ISO 8601 UTC |
| `created_at_utc` | `DateTime` | Sí | Timestamp de alta en el sistema | ISO 8601 UTC |

---

## 3. Invariantes de Negocio (Business Invariants)
- **INV-01 (Unicidad Global del Email):** No pueden existir dos usuarios con el mismo correo electrónico en toda la plataforma, sin importar el rol o el entrenador al que pertenezcan.
- **INV-02 (Prohibición de Contraseñas en Texto Plano):** La entidad jamás almacena contraseñas en claro; solo admite hashes criptográficos robustos.
- **INV-03 (Exclusividad de Rol):** Un usuario tiene un único rol primario asignado en la entidad de identidad.

---

## 4. Relaciones y Límites de Agregado
- **Raíz del Agregado:** `Usuario`.
- **Relaciones con Perfiles:**
  - Si `rol == ENTRENADOR`, se asocia 1 a 1 con `PerfilEntrenador`.
  - Si `rol == ALUMNO`, se asocia 1 a 1 con `PerfilAlumno`.

---

## 5. Operaciones de Negocio (Comportamientos / Métodos)
- `crearPorSuperadmin(email, rol)`: Genera cuenta con token de activación.
- `crearPorAutorregistro(email, passwordPlano, rol)`: Genera cuenta con contraseña cifrada inmediata.
- `establecerContrasenaConToken(token, nuevoPasswordPlano)`: Valida expiración del token y guarda el hash.
- `bloquearAcceso()`: Suspende la capacidad de autenticación.
- `registrarLoginExitoso()`: Actualiza `ultimo_acceso_utc`.

---

## 6. Eventos de Dominio Emitidos (Domain Events)
- `UsuarioCreadoEvent`: Dispara el envío de correos transaccionales de bienvenida con token.
- `ContrasenaEstablecidaEvent`: Notifica al usuario de la activación exitosa de su cuenta.
