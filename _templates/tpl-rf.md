---
id: RF-000
modulo: General
prioridad: alta # alta | media | baja
estado: borrador # borrador | en_revision | aprobado
problema_origen: "[[PROB-000]]"
fecha_creacion: 2026-09-05
version: 1.0
tags:
  - requerimiento
  - rf
  - sdd
---

# {{id}}: {{title}}

## 1. Contexto y Justificación
> Breve descripción del comportamiento esperado del sistema y la justificación técnica/negocio de por qué es necesario.

- **Objetivo:** 
- **Valor aportado:** 
- **Trazabilidad:** Resuelve directamente el problema planteado en `problema_origen`.

---

## 2. Actores Involucrados
- **Actor Primario:** (ej. Entrenador, Cliente)
- **Actores Secundarios:** (ej. Sistema de Notificaciones, Pasarela de Pagos, Administrador)

---

## 3. Precondiciones
- El usuario debe contar con rol y permisos adecuados.
- El sistema debe tener disponibles los siguientes datos/estados previos:
  - Condición 1...
  - Condición 2...

---

## 4. Reglas de Negocio (Business Rules)
- **RN-01:** Descripción estricta de la regla de validación o restricción de negocio.
- **RN-02:** Descripción estricta del cálculo, flujo de estados o invariante a respetar.
- **RN-03:** Restricción de permisos o temporalidad.

---

## 5. Criterios de Aceptación (Formato Gherkin / Given-When-Then)

### Escenario 1: Flujo Principal (Camino Feliz)
```gherkin
Given que el [Actor] se encuentra autenticado en el sistema
  And tiene el estado o precondición necesaria cumplida
When ejecuta la acción [Acción específica con parámetros]
Then el sistema debe [Resultado esperado observable]
  And registrar el evento de auditoría o persistencia correspondiente
```

### Escenario 2: Validación Fallida o Parámetros Incorrectos
```gherkin
Given que el [Actor] intenta ejecutar la acción [Acción]
When ingresa datos que violan la regla [RN-XX]
Then el sistema debe rechazar la operación
  And retornar un mensaje de error claro y estructurado: "[Mensaje de error]"
  And mantener el estado previo sin efectos colaterales
```

---

## 6. Casos Borde y Excepciones
- **Concurrencia:** ¿Qué sucede si dos actores modifican este registro simultáneamente?
- **Pérdida de conectividad:** Comportamiento ante timeout o fallo de red.
- **Datos nulos o extremos:** Valores cero, negativos, longitudes de texto máximas.
- **Transaccionalidad:** Reversión / Rollback en caso de fallo parcial.
