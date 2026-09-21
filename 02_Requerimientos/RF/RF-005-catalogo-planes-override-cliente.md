---
id: RF-005
modulo: Finanzas
prioridad: alta
estado: parcial
version_implementada: v1.0.0
fecha_verificacion: 2026-09-20
problema_origen: "[[PROB-002-cobranza-bimonetaria-fraccionada]]"
fecha_creacion: 2026-09-06
version: 1.0
tags:
  - requerimiento
  - rf
  - sdd
  - finanzas
  - membresias
---

# RF-005: Catálogo de Planes Estándar y Personalización por Cliente (Override)

## 1. Contexto y Justificación
Estandariza la oferta de servicios del entrenador en paquetes comerciales definidos, pero mantiene la flexibilidad crítica del negocio fitness personal donde los coaches negocian acuerdos particulares, descuentos por fidelidad, planes familiares o tasas cambiarias preferenciales.

- **Objetivo:** Permitir al coach gestionar un catálogo global de membresías y aplicar sobreescrituras (*overrides*) individuales por alumno sin necesidad de duplicar planes genéricos.
- **Valor aportado:** Flexibilidad comercial total sin pérdida de estructura en los reportes financieros.
- **Trazabilidad:** Resuelve la falta de estandarización y precios dispersos identificada en [[PROB-002-cobranza-bimonetaria-fraccionada]].

---

## 2. Actores Involucrados
- **Entrenador:** Crea, edita y desactiva planes estándar del catálogo. Asigna planes y aplica personalizaciones por cliente.
- **Cliente:** Visualiza los beneficios de su plan asignado, el precio pactado y las condiciones de su ciclo.

---

## 3. Precondiciones
1. El perfil del entrenador debe estar configurado con su moneda base de facturación (USD).
2. Para asignar un override, el cliente debe existir previamente en el sistema.

---

## 4. Reglas de Negocio (Business Rules)
- **RN-01 (Atributos del Plan Estándar):** Cada plan comercial incluye:
  - `Nombre`: (ej. *Presencial Completo*, *Asesoría Online*, *Plan 3 Días/Semana*).
  - `Descripción`: Alcance general del plan.
  - `Beneficios (Checklist)`: Lista de ítems incluidos (ej. *Rutina interactiva*, *Guía nutricional*, *1 Check-in quincenal*, *Acceso libre a sala*).
  - `Precio Base USD`: Monto numérico mayor a 0 con 2 decimales.
  - `Duración del Ciclo`: Periodo de facturación (`Mensual` = 30 días, `Bimestral` = 60 días, `Trimestral` = 90 días, `Personalizado`).
- **RN-02 (Sobrescritura por Cliente - Override):** El entrenador puede asignar a un cliente específico un plan estándar con uno o varios de los siguientes overrides:
  - `Precio Acordado USD`: Reemplaza el precio base del catálogo para ese cliente.
  - `Beneficios Personalizados`: Permite agregar o quitar ítems del checklist de beneficios.
  - `Tasa de Cambio Especial`: Permite fijar una tasa específica o una fuente de cambio particular distinta a la tasa de cambio global del entrenador.
- **RN-03 (Precedencia de Valores):** Al generarse una nueva cuota para un cliente, el sistema evalúa: si existe un *Override* activo para ese cliente, toma sus valores; en caso contrario, toma los valores por defecto del plan estándar del catálogo.

---

## 5. Criterios de Aceptación (Given-When-Then / Gherkin)

### Escenario 1: Creación de Plan Estándar en el Catálogo
```gherkin
Given que el entrenador accede a la sección "Catálogo de Planes"
When crea un nuevo plan con nombre "Asesoría Online Full", precio "$40.00", duración "Mensual" y 3 beneficios
Then el sistema debe registrar el plan en estado "Activo"
  And estar disponible para ser asignado a cualquier cliente
```

### Escenario 2: Asignación de Plan con Override de Precio y Tasa Especial
```gherkin
Given que el cliente "Carlos Ruiz" tiene asignado el plan "Asesoría Online Full" ($40.00 base)
When el entrenador edita el perfil financiero de Carlos y define:
  | Campo                 | Valor                |
  | precio_override_usd   | $35.00               |
  | tasa_override_fijada  | 65.00 Bs/USD         |
Then el sistema debe guardar la personalización vinculada exclusivamente a Carlos Ruiz
  And la siguiente cuota generada para Carlos debe emitirse por $35.00 USD
  And reflejar una equivalencia calculada a 65.00 Bs/USD en lugar de la tasa global
```

### Escenario 3: Cliente sin Override Hereda Valores Estándar
```gherkin
Given que el cliente "Ana Gomez" tiene asignado el plan "Asesoría Online Full" sin personalizaciones
When el sistema genera la cuota del nuevo mes
Then el monto total a pagar debe ser exactamente de $40.00 USD
  And el cálculo en Bolívares debe realizarse utilizando la tasa global vigente del entrenador
```

---

## 6. Casos Borde y Excepciones
- **Desactivación de Plan del Catálogo:** Si un plan estándar se desactiva o elimina del catálogo, los clientes que ya lo tienen contratado deben mantener sus condiciones históricas activas hasta que el coach cambie manualmente su membresía.
- **Override con Precio Cero ($0.00):** Permitido exclusivamente para alumnos becados o acuerdos de intercambio, generando cuotas en estado automático `Al Día / Becado`.

---

## 7. Estado real de implementación

- Catálogo de planes y override existen a nivel de API.
- Resuelto (2026-09-21): la UI ya no inventa un "Plan Estándar" para alumnos sin plan; muestra "Sin plan asignado" (`apps/web/src/pages/entrenador/AlumnosPage.tsx`).
- Sin UI funcional de override: los campos quedan muertos y la interfaz espera campos que la API no hidrata.
- Sin precedencia de override al emitir la cuota (RN-03 no aplica en el flujo real).
- Sin soporte del estado `Becado / $0` para override con precio cero (caso borde).
