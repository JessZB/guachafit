---
entidad: PerfilEntrenador
modulo: Acceso
tipo: AggregateRoot
estado_ciclo_vida: activo
fecha_creacion: 2026-09-06
tags:
  - dominio
  - ddd
  - entidad
  - entrenador
  - multi-tenant
---

# Entidad de Dominio: PerfilEntrenador (Tenant Owner)

## 1. Ubiquitous Language (Lenguaje Ubicuo)
> Representa la entidad de negocio del entrenador o gimnasio independiente que actúa como inquilino (*tenant*) en GUACHAFIT.

- **Definición de negocio:** Profesional o centro deportivo que gestiona su propio catálogo de servicios, cuotas de membresía, alumnos y rutinas de ejercicio.
- **Términos del Dominio:**
  - `Coach Code`: Código alfanumérico único e inmutable utilizado en los enlaces de captación pública (Deep Link).
  - `Capacidad Máxima`: Límite de alumnos activos que el coach se propone atender con alta calidad técnica.
  - `Tasa de Cambio Global`: Valor de referencia en Bolívares (VES/USD) configurado por el entrenador para su cartera.
- **Bounded Context:** Contexto de Gestión de Entrenadores y Multi-Tenancy.

---

## 2. Atributos Clave (Schema de Dominio)

| Atributo | Tipo / Value Object | Requerido | Descripción | Restricciones / Formato |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | Sí | Identificador único del tenant | UUID v4 |
| `usuario_id` | `UUID` | Sí | Vínculo con credenciales IAM | 1 a 1 con `Usuario` |
| `nombres` | `string` | Sí | Nombres del profesional | 2 a 60 caracteres |
| `apellidos` | `string` | Sí | Apellidos | 2 a 60 caracteres |
| `nombre_comercial`| `string` | No | Nombre del box, gimnasio o marca | ej. "GuachaFit Performance" |
| `coach_code` | `string` | Sí | Código para enlace de captación | 4 a 15 caracteres únicos alfanuméricos |
| `capacidad_maxima`| `integer` | Sí | Meta máxima de alumnos activos | $\ge 1$ (por defecto 50) |
| `tasa_cambio_global`| `Decimal`| Sí | Tasa vigente para su cartera | $> 0.0000$ con 4 decimales |
| `telefono_contacto`| `PhoneNumber` (VO) | Sí | Teléfono / WhatsApp público para cobros | E.164 internacional |
| `estado_licencia` | `EnumEstadoLicencia`| Sí | `Activa`, `SuspendidaSuperadmin` | Control maestro |

---

## 3. Invariantes de Negocio (Business Invariants)
- **INV-01 (Unicidad Global del `coach_code`):** No pueden existir dos entrenadores con el mismo `coach_code` en la plataforma, ya que se utiliza para resolver rutas públicas web (`/registro?coach_code=XYZ`).
- **INV-02 (Tasa de Cambio Mayor a Cero):** La `tasa_cambio_global` debe ser estrictamente positiva.

---

## 4. Relaciones y Límites de Agregado
- **Raíz del Agregado:** `PerfilEntrenador`.
- **Frontera de Tenancy:** Todos los alumnos, cuotas, planes, rutinas y transacciones del sistema dependen de `id` (referenciado como `entrenador_id`).

---

## 5. Operaciones de Negocio (Comportamientos / Métodos)
- `crearPerfil(usuarioId, nombres, apellidos, coachCode, capacidadMaxima)`: Inicialización del tenant.
- `actualizarTasaGlobal(nuevaTasa)`: Actualiza la tasa de referencia y dispara recálculo reactivo en el dashboard.
- `ajustarCapacidadMaxima(nuevoLimite)`: Modifica el umbral para el KPI de ocupación.
- `suspenderPorSuperadmin()`: Invalida el acceso administrativo del entrenador.

---

## 6. Eventos de Dominio Emitidos (Domain Events)
- `TasaCambioEntrenadorActualizadaEvent`: Notifica a los módulos financieros la nueva tasa de conversión vigente.
- `EntrenadorSuspendidoEvent`: Bloquea temporalmente el acceso de la cuenta del coach y sus servicios.
