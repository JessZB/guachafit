---
id: PROB-004
fecha: 2026-09-06
modulo: Notificaciones y Preferencias de Entrega
impacto: alto
estado: en_analisis
tags:
  - problema
  - sdd
  - notificaciones
  - push
  - email
  - arquitectura
  - mvp
requerimientos_asociados:
  - "[[RF-014-arquitectura-event-driven-despachador-notificaciones]]"
  - "[[RF-015-matriz-preferencias-usuario-canales]]"
  - "[[RF-016-gestion-dispositivos-tokens-push-ciclo-vida]]"
  - "[[RNF-004-resiliencia-notificaciones-idempotencia-fallbacks]]"
  - "[[ADR-010-arquitectura-event-driven-notificaciones-multicanal]]"
---

# PROB-004: Orquestación y Preferencias de Notificaciones Multicanal (Push y Email)

## 1. Descripción del Dolor (Problem Statement)
> La ausencia de una capa desacoplada de mensajería acopla directamente la lógica de negocio a proveedores externos de Push/Email, provocando que fallas de red en la pasarela de correo congelen operaciones críticas. Además, la imposibilidad de que alumnos y entrenadores configuren sus preferencias genera saturación comunicativa (*spam*), induciendo a los usuarios a silenciar los permisos de la app en el sistema operativo y perdiendo recordatorios cruciales de pagos, check-ins y seguridad.

- **Actor afectado:** Entrenador (saturación por alertas innecesarias o pérdida de avisos de cobro), Alumno (fatiga de notificaciones y silenciamiento del dispositivo) y Equipo de Ingeniería (alto costo de mantenimiento por acoplamiento directo de APIs de terceros).
- **Frecuencia del problema:** Continua ante cada evento de rutina, cobro, vencimiento o reporte de pago.
- **Impacto directo:**
  - Silenciamiento masivo de notificaciones push a nivel de Android/iOS (tasa de apertura < 15%).
  - Riesgo de fallas en cascada: si el proveedor de email agota su cuota o tiene latencia alta, se bloquea la confirmación de pago o el guardado de rutinas.
  - Pérdida de dinero por falta de entrega de tokens push caducados a dispositivos que desinstalaron la app.
  - Pérdida de avisos transaccionales críticos (recuperación de contraseña y recibos de pago).

---

## 2. Contexto Operativo
- **Flujo actual:**
  1. Cada servicio de backend (Finanzas, Antropometría, Rutinas) contiene llamadas directas y síncronas a librerías de mensajería (ej. `emailService.send(...)`).
  2. Si el proveedor de correo tarda 3 segundos en responder, la respuesta HTTP de la API hacia la app cliente se degrada a 3.5 segundos.
  3. No existe un panel de preferencias: todos los usuarios reciben todos los correos y notificaciones push de forma indiscriminada.
  4. Los alumnos, al recibir notificaciones diarias que no desean, bloquean los permisos de la aplicación en los ajustes de su teléfono.
  5. Al llegar la fecha de vencimiento de la cuota o el día de pesaje en ayunas, el alumno nunca ve la alerta porque tiene la app silenciada.
  6. Si un usuario cambia de teléfono, el token push viejo sigue recibiendo intentos fallidos que degradan las cuotas del proveedor de push.

---

## 3. Causa Raíz Preliminar (5 Porqués)
1. **¿Por qué los usuarios silencian la aplicación?** Porque reciben alertas de todas las categorías sin poder elegir qué canales desean activos ni con qué frecuencia.
2. **¿Por qué los servicios de negocio son lentos o fallan ante problemas de red externa?** Porque llaman directamente a las APIs de Push (FCM) o Email (SendGrid/Resend) en el mismo hilo de ejecución de la petición HTTP.
3. **¿Por qué es costoso cambiar de proveedor de mensajería?** Porque no existe un despachador unificado ni un bus de eventos que desacople el origen del mensaje de su entrega física.
4. **¿Por qué fallan los envíos push a usuarios antiguos?** Porque no existe un mecanismo de auditoría y depuración reactiva que invalide tokens caducados o desinstalados.
5. **Causa Raíz Identificada:** Inexistencia de una arquitectura de notificaciones basada en eventos (*Event-Driven Notification Layer*), con colas asíncronas, matriz de preferencias granulares por rol y gestión del ciclo de vida de tokens de dispositivos.

---

## 4. Vínculos a Requerimientos
- **Requerimientos Funcionales (RF):**
  - [[RF-014-arquitectura-event-driven-despachador-notificaciones]]: Bus de eventos de dominio, despachador centralizado y workers asíncronos desacoplados.
  - [[RF-015-matriz-preferencias-usuario-canales]]: Panel de ajustes de notificación con switches granulares por categoría y canal para Alumno y Coach.
  - [[RF-016-gestion-dispositivos-tokens-push-ciclo-vida]]: Registro multi-dispositivo, rotación de tokens FCM/APNs y depuración reactiva de tokens inválidos.
- **Requerimientos No Funcionales (RNF):**
  - [[RNF-004-resiliencia-notificaciones-idempotencia-fallbacks]]: Colas de reintento BullMQ con backoff exponencial, clave de idempotencia anti-duplicados y SLO de entrega.
- **Decisiones Arquitecturales (ADR):**
  - [[ADR-010-arquitectura-event-driven-notificaciones-multicanal]]: Adopción de EventEmitter interno / Redis PubSub y workers asíncronos especializados.
