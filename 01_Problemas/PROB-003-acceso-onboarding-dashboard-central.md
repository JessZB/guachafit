---
id: PROB-003
fecha: 2026-09-06
modulo: Acceso, Onboarding de Clientes y Dashboard Central
impacto: alto
estado: en_analisis
tags:
  - problema
  - sdd
  - autenticacion
  - rbac
  - onboarding
  - dashboard
  - crm
  - mvp
requerimientos_asociados:
  - "[[RF-010-rbac-jerarquia-aislamiento-tenancy]]"
  - "[[RF-011-onboarding-alumnos-manual-deeplink]]"
  - "[[RF-012-ciclo-vida-alumno-soft-delete]]"
  - "[[RF-013-dashboard-comando-entrenador-kpis]]"
  - "[[RNF-003-aislamiento-multitenant-seguridad-datos-salud]]"
  - "[[ADR-009-modelo-multitenancy-aislamiento-entrenadores]]"
---

# PROB-003: Modelo de Acceso, Onboarding Híbrido y Dashboard de Control

## 1. Descripción del Dolor (Problem Statement)
> La plataforma requiere un modelo de accesos seguro y jerárquico donde la incorporación de entrenadores esté regulada centralmente, pero cada entrenador disponga de autonomía total para dar de alta alumnos (de forma presencial o por autorregistro remoto), gestionar su estado de servicio y visualizar la salud integral de su cartera desde un único panel ejecutivo.

- **Actor afectado:** Superadministrador (falta de control sobre licencias), Entrenador (fricción al registrar alumnos a mano, ceguera operativa sin dashboard unificado) y Alumno (demoras para acceder a sus rutinas tras el pago).
- **Frecuencia del problema:** Continua en cada nuevo alta de cliente, inicio de sesión diario y seguimiento de estados de servicio.
- **Impacto directo:**
  - Riesgo crítico de fuga o mezcla de datos entre entrenadores competidores en la misma plataforma si no hay aislamiento estricto (*data leakage*).
  - Abandono en el registro de alumnos remotos por falta de un enlace ágil de inscripción autónoma (*self-service onboarding*).
  - Pérdida de contexto clínico/deportivo (olvido de lesiones o cirugías previas del alumno por falta de ficha de salud privada).
  - Ceguera operativa al arrancar la jornada diaria: el coach no sabe de un vistazo cuántos alumnos activos tiene frente a su tope de capacidad ni qué pagos están pendientes.

---

## 2. Contexto Operativo
- **Flujo actual:**
  1. No existe distinción formal de roles en el sistema: los accesos se entregan de manera informal o por credenciales compartidas.
  2. Cuando llega un alumno presencial al gimnasio, el coach anota sus datos personales y patologías en hojas sueltas o chats de WhatsApp, perdiendo la edad exacta y el historial médico con el tiempo.
  3. Para alumnos remotos, el entrenador debe solicitar todos los datos por mensaje de texto y transcribirlos manualmente uno a uno.
  4. Si un alumno no paga o se lesiona, el coach no tiene una máquina de estados clara para pausarlo o suspenderlo sin perder su historial acumulado de meses anteriores.
  5. Al iniciar su jornada laboral, el coach debe abrir múltiples pantallas (bancos, hojas de cálculo, chats) para saber a quién debe atender, a quién cobrarle y qué comprobantes verificar.

---

## 3. Causa Raíz Preliminar (5 Porqués)
1. **¿Por qué hay riesgo de exposición de información sensible?** Porque no existe un modelo de permisos RBAC con políticas estrictas de aislamiento multi-inquilino (*multi-tenancy*) a nivel de base de datos.
2. **¿Por qué toma tanto tiempo incorporar a un nuevo alumno?** Porque todo el registro depende de la transcripción manual del entrenador, sin enlaces de captación autónoma (*deep links*).
3. **¿Por qué se pierde la información médica y de salud del alumno?** Porque las notas de lesiones y patologías no están integradas en una ficha confidencial de acceso rápido para el coach.
4. **¿Por qué se eliminan datos valiosos al retirar a un cliente?** Porque no se aplica una política de eliminación lógica (*soft delete*) que congele el acceso pero preserve el historial biométrico y contable.
5. **Causa Raíz Identificada:** Ausencia de un ecosistema de identidad y acceso RBAC con aislamiento por entrenador, flujos duales de onboarding (manual + deep link), gestión de ciclo de vida con preservación histórica y un cuadro de mando ejecutivo (Dashboard de Comando).

---

## 4. Vínculos a Requerimientos
- **Requerimientos Funcionales (RF):**
  - [[RF-010-rbac-jerarquia-aislamiento-tenancy]]: Modelo jerárquico Superadmin $\rightarrow$ Entrenador $\rightarrow$ Alumno y aislamiento multi-tenant estricto.
  - [[RF-011-onboarding-alumnos-manual-deeplink]]: Alta manual con cálculo automático de edad y ficha de salud confidencial + Deep Link con `coach_code`.
  - [[RF-012-ciclo-vida-alumno-soft-delete]]: Máquina de activación (`Activo`, `Inactivo/Pausado`, `Suspendido por Pago`) y Soft Delete de preservación.
  - [[RF-013-dashboard-comando-entrenador-kpis]]: Panel central con 4 KPIs macro (incluyendo capacidad máxima) y pestañas operativas rápidas.
- **Requerimientos No Funcionales (RNF):**
  - [[RNF-003-aislamiento-multitenant-seguridad-datos-salud]]: Row-Level Security (RLS) en BD, cifrado en reposo para notas médicas y expiración de tokens.
- **Decisiones Arquitecturales (ADR):**
  - [[ADR-009-modelo-multitenancy-aislamiento-entrenadores]]: Patrón de Base de Datos Compartida con Discriminador Tenant y Row-Level Security en PostgreSQL.
