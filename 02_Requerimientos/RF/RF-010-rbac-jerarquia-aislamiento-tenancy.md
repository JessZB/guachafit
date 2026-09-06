---
id: RF-010
modulo: Acceso
prioridad: alta
estado: aprobado
problema_origen: "[[PROB-003-acceso-onboarding-dashboard-central]]"
fecha_creacion: 2026-09-06
version: 1.0
tags:
  - requerimiento
  - rf
  - sdd
  - rbac
  - seguridad
  - multi-tenant
---

# RF-010: Arquitectura de Roles Jerárquicos (RBAC) y Aislamiento de Tenancy

## 1. Contexto y Justificación
Establece la jerarquía de control de acceso basada en roles (RBAC) y el aislamiento lógico multi-inquilino (*tenant isolation*) entre entrenadores. Garantiza que la administración de la plataforma esté centralizada a nivel de licencias maestras, mientras que cada coach opera en un entorno privado, seguro e impenetrable por terceros.

- **Objetivo:** Definir los permisos y fronteras de visibilidad para los roles `Superadmin`, `Entrenador` y `Alumno`.
- **Valor aportado:** Confidencialidad legal, protección de la propiedad intelectual de las rutinas de cada coach y blindaje de la privacidad de los alumnos.
- **Trazabilidad:** Resuelve el riesgo de fuga y mezcla de datos identificado en [[PROB-003-acceso-onboarding-dashboard-central]].

---

## 2. Actores Involucrados
- **Superadmin:** Administrador maestro de la plataforma GUACHAFIT.
- **Entrenador (Tenant Owner):** Administrador de su gimnasio, box o asesoría independiente.
- **Alumno / Cliente (End User):** Usuario final que consume el servicio.

---

## 3. Precondiciones
1. Toda petición autenticada debe portar un token de sesión (JWT) que certifique: `user_id`, `role` y `entrenador_id` (en caso de alumnos y entrenadores).

---

## 4. Reglas de Negocio (Business Rules)
- **RN-01 (Matriz de Control de Acceso por Rol):**

| Funcionalidad / Recurso | Superadmin | Entrenador | Alumno |
| :--- | :---: | :---: | :---: |
| Crear / Deshabilitar Entrenadores | ✅ | ❌ | ❌ |
| Gestionar Licencias y Configuración Global | ✅ | ❌ | ❌ |
| Ver Dashboard de Negocio Propio | ❌ | ✅ | ❌ |
| Alta y Edición de Alumnos Propios | ❌ | ✅ | ❌ |
| Gestionar Rutinas y Asignar Planes | ❌ | ✅ | ❌ |
| Conciliar Pagos y Ver Cartera Propia | ❌ | ✅ | ❌ |
| Ver / Reportar Entrenamientos Propios | ❌ | ❌ | ✅ |
| Reportar Pagos y Ver Deuda Propia | ❌ | ❌ | ✅ |
| Consultar Datos de Otros Entrenadores | ❌ | ❌ | ❌ |
| Consultar Datos de Otros Alumnos | ❌ | ❌ | ❌ |

- **RN-02 (Aislamiento Estricto de Tenancy):** Ningún entrenador puede listar, buscar, modificar o consultar alumnos, métricas, cuotas, rutinas o reportes nutricionales pertenecientes a otro `entrenador_id`. Todas las consultas a la base de datos deben inyectar obligatoriamente la cláusula de discriminación por tenant.
- **RN-03 (Acceso Exclusivo del Alumno):** El alumno solo tiene acceso a lecturas y escrituras asociadas a su propio `alumno_id`. Cualquier intento de consultar datos de otro cliente retorna `403 Forbidden`.

---

## 5. Criterios de Aceptación (Given-When-Then / Gherkin)

### Escenario 1: Creación de Cuenta de Entrenador por el Superadmin
```gherkin
Given que el Superadmin se encuentra autenticado en el panel maestro
When registra un nuevo entrenador con nombre "Marcos Fitness", email "marcos@gym.com" y licencia "Plan Pro"
Then el sistema debe crear la cuenta en estado "Activo"
  And generar un código único de entrenador (ej. "coach_code: MARCOS-921")
  And enviar un email de bienvenida a Marcos con su enlace de activación maestro
```

### Escenario 2: Intento de Acceso Cruzado entre Entrenadores (Aislamiento)
```gherkin
Given que el entrenador "Coach A" intenta consultar vía API la lista de clientes o ingresos del "Coach B"
When el backend procesa el token de autorización de Coach A
Then el middleware de tenancy debe interceptar la solicitud
  And rechazar la operación con código HTTP 403 Forbidden
  And registrar un evento de intento de violación de aislamiento en los logs de seguridad
```

### Escenario 3: Alumno Consulta su Perfil sin Permisos Administrativos
```gherkin
Given que el alumno "Carlos Ruiz" inicia sesión en la aplicación
When navega por la interfaz
Then solo debe poder visualizar sus rutinas asignadas, sus medidas y sus cuotas pendientes
  And no debe tener acceso a ninguna pantalla de conciliación bancaria ni datos de otros alumnos
```

---

## 6. Casos Borde y Excepciones
- **Desactivación de Cuenta de Entrenador:** Si el Superadmin deshabilita a un entrenador (por cese de suscripción de la plataforma), todos los tokens activos de dicho entrenador y de sus alumnos asociados son invalidados en el siguiente ciclo de verificación.
