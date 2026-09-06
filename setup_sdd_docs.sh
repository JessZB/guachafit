#!/usr/bin/env bash
# ==============================================================================
# Script de Inicialización de Documentación Técnica SDD para Obsidian
# Proyecto: GUACHAFIT
# Rol: Arquitecto de Software y Analista de Sistemas Senior
# ==============================================================================

set -euo pipefail

echo "==> Creando estructura de directorios SDD..."
mkdir -p "00_Inbox"
mkdir -p "01_Problemas"
mkdir -p "02_Requerimientos/RF"
mkdir -p "02_Requerimientos/RNF"
mkdir -p "03_Dominio"
mkdir -p "04_Decisiones"
mkdir -p "_templates"

echo "==> Generando plantillas en _templates/..."

# 1. Plantilla de Problemas
cat <<'EOF' > "_templates/tpl-problema.md"
---
id: PROB-000
fecha: 2026-09-05
modulo: General
impacto: medio # alto | medio | bajo
estado: abierto # abierto | en_analisis | resuelto | descartado
tags:
  - problema
  - sdd
requerimientos_asociados: []
---

# {{title}} [{{id}}]

## 1. Descripción del Dolor (Problem Statement)
> Describe de forma concisa qué está fallando, a quién afecta negativamente y cuál es el síntoma observable.

- **Actor afectado:** (ej. Cliente, Entrenador, Administrador)
- **Frecuencia del problema:** (ej. Diario, Ocasional, En cada cierre de mes)
- **Impacto directo:** (ej. Pérdida de tiempo, inconsistencia de datos, fricción en el pago)

---

## 2. Contexto Operativo
> Detalla el flujo actual, entorno, procesos manuales involucrados y cómo se manifiesta el problema en la operativa diaria.

- **Flujo actual:**
  1. Paso 1...
  2. Paso 2...
  3. Punto de fricción o falla...
- **Canales/Herramientas involucradas:** (ej. WhatsApp, Excel, Transferencias bancarias, Correo)

---

## 3. Causa Raíz Preliminar (5 Porqués / Hipótesis)
> Análisis preliminar de por qué ocurre este dolor y qué factores estructurales o de software lo originan.

1. **¿Por qué ocurre?** 
2. **¿Por qué?** 
3. **¿Por qué?** 
4. **¿Por qué?** 
5. **Causa Raíz Identificada:**

---

## 4. Vínculos a Requerimientos
> Especificaciones generadas en SDD para erradicar este problema.

- **Requerimientos Funcionales (RF):**
  - [[RF-000]] - Nombre del RF
- **Requerimientos No Funcionales (RNF):**
  - [[RNF-000]] - Nombre del RNF
- **Decisiones Arquitecturales (ADR):**
  - [[ADR-000]] - Nombre del ADR
EOF

# 2. Plantilla de Requerimientos Funcionales (RF)
cat <<'EOF' > "_templates/tpl-rf.md"
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
EOF

# 3. Plantilla de Requerimientos No Funcionales (RNF)
cat <<'EOF' > "_templates/tpl-rnf.md"
---
id: RNF-000
modulo: General
categoria: rendimiento # rendimiento | resiliencia | seguridad | disponibilidad | escalabilidad
prioridad: alta # alta | media | baja
estado: borrador # borrador | en_revision | aprobado
requisito_origen: "[[RF-000]]"
metrica_objetivo: "p95 < 200ms"
fecha_creacion: 2026-09-05
tags:
  - requerimiento
  - rnf
  - sdd
---

# {{id}}: {{title}}

## 1. Definición y Alcance
> Descripción del atributo de calidad requerido, justificación de por qué es crítico para la experiencia o la arquitectura del sistema.

- **Atributo de calidad:** (ej. Rendimiento, Tolerancia a Fallos, Latencia, Concurrencia)
- **Alcance / Componente afectado:** (ej. API Gateway, Servicio de Pagos, Cálculo de Grasa Corporal, DB)

---

## 2. Métricas Cuantitativas y SLOs / SLAs
> Toda exigencia no funcional debe ser medible numéricamente y verificable mediante instrumentación o tests.

| Métrica | Valor Mínimo Aceptable | Valor Deseado (SLO) | Condición de Medición |
| :--- | :--- | :--- | :--- |
| **Tiempo de Respuesta (p95)** | < 500 ms | < 200 ms | Bajo carga nominal |
| **Tiempo de Respuesta (p99)** | < 1000 ms | < 400 ms | En picos de tráfico |
| **Disponibilidad (Uptime)** | 99.5% | 99.9% | Mensual |
| **Tasa de Error** | < 0.5% | < 0.05% | Errores 5xx |

---

## 3. Latencia y Tiempos de Respuesta
- **Latencia de lectura:** (ej. Consulta de dashboard de salud < 150ms)
- **Latencia de escritura / procesamiento:** (ej. Registro de transacción de pago < 300ms)
- **Operaciones asíncronas / background:** (ej. Envío de correos de alimentación completado en cola en < 30s)

---

## 4. Concurrencia y Perfil de Carga
- **Usuarios concurrentes esperados (Nominal):** 
- **Usuarios concurrentes pico (Stress peak):** 
- **RPS (Requests Per Second):** 
- **Estrategia de aislamiento de concurrencia:** (ej. Optimistic Locking, transacciones ACID, Rate Limiting)

---

## 5. Tolerancia a Fallos y Resiliencia
- **Mecanismos de degradación elegante (Graceful Degradation):** 
  - Si el servicio externo (ej. proveedor de correo) falla: ¿Se encola con backoff exponencial?
- **Recuperación ante caídas:** 
  - **RTO (Recovery Time Objective):** < X minutos
  - **RPO (Recovery Point Objective):** < X minutos / Pérdida máxima de datos
- **Circuit Breaker / Retries:** Políticas de reintento, dead-letter queues y fallbacks.

---

## 6. Estrategia de Verificación y Pruebas de Carga
- **Herramienta de prueba:** (ej. k6, Locust, Artillery, JMeter)
- **Escenario de prueba de estrés:**
- **Telemetría y Observabilidad:** Dashboards (Grafana / Datadog / OpenTelemetry) y alertas asociadas.
EOF

# 4. Plantilla de Entidad de Dominio (DDD)
cat <<'EOF' > "_templates/tpl-entidad.md"
---
entidad: NombreEntidad
modulo: Dominio
tipo: AggregateRoot # AggregateRoot | Entity | ValueObject | DomainEvent
estado_ciclo_vida: en_diseno # en_diseno | activo | deprecado
fecha_creacion: 2026-09-05
tags:
  - dominio
  - ddd
  - entidad
---

# Entidad de Dominio: {{entidad}}

## 1. Ubiquitous Language (Lenguaje Ubicuo)
> Definición canónica acordada entre expertos de negocio (entrenadores, analistas financieros) y el equipo de ingeniería.

- **Definición de negocio:** Concepto exacto e inequívoco de lo que representa esta entidad en el dominio.
- **Sinónimos o términos a evitar:** (ej. Evitar decir "Usuario" cuando el término de dominio es "Cliente" o "Atleta").
- **Bounded Context (Contexto Delimitado):** (ej. Gestión de Entrenamientos, Facturación y Cobranzas, Medición Antropométrica)

---

## 2. Atributos Clave (Schema de Dominio)
> Lista estructurada de campos, tipos primitivos o Value Objects que definen la entidad.

| Atributo | Tipo / Value Object | Requerido | Descripción | Restricciones / Formato |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` / `EntityId` | Sí | Identificador único e inmutable | Formato UUID v4 |
| `nombre` | `string` | Sí | Nombre descriptivo | 3 a 100 caracteres |
| `estado` | `EnumEstado` | Sí | Estado dentro de la máquina de estados | Valores controlados |
| `fecha_registro`| `DateTime` | Sí | Timestamp de creación | ISO 8601 UTC |

---

## 3. Invariantes de Negocio (Business Invariants)
> Reglas de consistencia que SIEMPRE deben ser verdaderas en cualquier punto del ciclo de vida de la entidad.

- **INV-01:** La entidad no puede transicionar a estado `Activo` si faltan los campos obligatorios X e Y.
- **INV-02:** Los cálculos derivados (ej. porcentaje de grasa corporal, total en divisa) deben satisfacer la fórmula Z.
- **INV-03:** Valores numéricos no pueden ser negativos o sobrepasar los límites fisiológicos/financieros.

---

## 4. Relaciones y Límites de Agregado
- **Límite del Agregado (Aggregate Boundary):** ¿Es la raíz del agregado o forma parte de uno externo?
- **Entidades Hijas / Value Objects contenidos:**
  - `ChildEntity` (1 a N)
  - `SpecificValueObject` (Inmutable)
- **Referencias externas:** Solo por ID (ej. `cliente_id: UUID`), nunca por acoplamiento directo de instancia en memoria.

---

## 5. Operaciones de Negocio (Comportamientos / Métodos)
- `crear(...)`: Factoría con validación de invariantes iniciales.
- `actualizarParametros(...)`: Modificación atómica de variables operativas.
- `cerrarCiclo(...)`: Transición de estado con emisión de eventos.

---

## 6. Eventos de Dominio Emitidos (Domain Events)
- `EntidadCreadaEvent`: Payload emitido al persistirse por primera vez.
- `EntidadModificadaEvent`: Emite cambios relevantes para otros Bounded Contexts.
EOF

# 5. Plantilla de Architecture Decision Record (ADR)
cat <<'EOF' > "_templates/tpl-adr.md"
---
id: ADR-000
titulo: "ADR-000: Título de la Decisión Arquitectural"
fecha: 2026-09-05
estado: propuesto # propuesto | aceptado | rechazado | superado
decisores:
  - "Nombre del Arquitecto / Equipo"
tags:
  - decision
  - adr
  - arquitectura
---

# {{id}}: {{titulo}}

## 1. Estado
`propuesto` | `aceptado` | `rechazado` | `superado por [[ADR-XXX]]`

---

## 2. Contexto y Fuerzas en Juego
> Describe el problema técnico o arquitectural, las fuerzas que influyen en la decisión (técnicas, de negocio, costo, tiempo, operativas) y por qué se requiere una decisión explícita.

- **Problema a resolver:** 
- **Restricciones y Fuerzas:**
  - **Fuerza 1 (ej. Rendimiento vs Complejidad):** 
  - **Fuerza 2 (ej. Costo de infraestructura vs Latencia):** 
  - **Fuerza 3 (ej. Facilidad de mantenimiento del equipo actual):**
- **Opciones consideradas:**
  1. *Opción A:* Descripción breve.
  2. *Opción B:* Descripción breve.
  3. *Opción C:* Descripción breve.

---

## 3. Decisión
> Declaración clara y afirmativa de la opción seleccionada y la justificación técnica de la elección.

Elegimos **[Opción Seleccionada]** para resolver [el problema], porque [justificación técnica y de negocio].

### Detalles de la Implementación
- Tecnologías / Patrones involucrados.
- Puntos de integración y contratos.

---

## 4. Consecuencias y Trade-offs
> Toda decisión arquitectural tiene consecuencias positivas y negativas. Es vital documentar ambas honestamente.

### Consecuencias Positivas (Beneficios)
- **C1:** Beneficio directo en rendimiento, mantenibilidad o costo.
- **C2:** Reducción de deuda técnica o alineación con estándares de la industria.

### Consecuencias Negativas (Costos y Trade-offs)
- **T1:** Incremento en la curva de aprendizaje o complejidad operacional.
- **T2:** Necesidad de infraestructura o dependencias adicionales.

### Riesgos Mitigados y Residuales
- **Riesgo Mitigado:** (ej. Evitar inconsistencia eventual en cobros)
- **Riesgo Residual:** (ej. Mayor tiempo en despliegue inicial)

---

## 5. Trazabilidad y Referencias
- Requerimientos asociados: [[RF-000]], [[RNF-000]]
- Problema que origina la decisión: [[PROB-000]]
- Documentación externa / Benchmarks:
EOF

# 6. Dashboard Principal con Dataview
cat <<'EOF' > "00_Dashboard.md"
---
tags:
  - dashboard
  - sdd
  - arquitectura
---

# 🧭 SDD Architecture Dashboard - GUACHAFIT

> **Panel Central de Control y Trazabilidad:** Monitoreo activo de problemas operativos, matriz de requerimientos (SDD), lenguaje de dominio (DDD) y registros de decisiones de arquitectura (ADR).
> 
> *Nota: Requiere el plugin comunitario **Dataview** activo en Obsidian.*

---

## 🚨 1. Problemas Operativos Abiertos
Problemas de negocio y dolores detectados pendientes de resolución (`estado != "resuelto"`).

```dataview
TABLE id AS "ID", modulo AS "Módulo", impacto AS "Impacto", estado AS "Estado", fecha AS "Fecha"
FROM "01_Problemas" OR #problema
WHERE estado != "resuelto" AND !contains(file.name, "tpl-") AND file.name != "README"
SORT impacto desc, fecha desc
```

---

## 📋 2. Matriz de Requerimientos por Módulo (SDD)
Requerimientos funcionales y no funcionales agrupados por bounded context / módulo funcional.

### Vista Agrupada por Módulo
```dataview
TABLE rows.id AS "ID", rows.file.link AS "Requerimiento", rows.prioridad AS "Prioridad", rows.estado AS "Estado"
FROM "02_Requerimientos" OR #requerimiento
WHERE !contains(file.name, "tpl-") AND file.name != "README"
GROUP BY modulo
```

### Vista Plana Detallada
```dataview
TABLE id AS "ID", file.link AS "Requerimiento", modulo AS "Módulo", prioridad AS "Prioridad", estado AS "Estado", problema_origen AS "Problema Origen"
FROM "02_Requerimientos" OR #requerimiento
WHERE !contains(file.name, "tpl-") AND file.name != "README"
SORT modulo asc, id asc
```

---

## 🏛️ 3. Decisiones Arquitecturales Activas (ADRs)
Registros de arquitectura en estado vigente o en discusión (`estado = "propuesto"` o `estado = "aceptado"`).

```dataview
TABLE id AS "ID", titulo AS "Título", estado AS "Estado", fecha AS "Fecha", decisores AS "Decisores"
FROM "04_Decisiones" OR #adr
WHERE (estado = "aceptado" OR estado = "propuesto") AND !contains(file.name, "tpl-") AND file.name != "README"
SORT id asc
```

---

## 🧩 4. Ubiquitous Language & Modelo de Dominio
Entidades, Value Objects y Agregados modelados en el sistema.

```dataview
TABLE entidad AS "Entidad", modulo AS "Módulo", tipo AS "Tipo DDD", estado_ciclo_vida AS "Ciclo de Vida"
FROM "03_Dominio" OR #dominio
WHERE !contains(file.name, "tpl-") AND file.name != "README"
SORT modulo asc, entidad asc
```

---

## ⚡ 5. Atributos de Calidad y Rendimiento (RNF)
Especificaciones cuantitativas de latencia, concurrencia y resiliencia.

```dataview
TABLE id AS "ID", modulo AS "Módulo", categoria AS "Categoría", metrica_objetivo AS "Métrica Objetivo", prioridad AS "Prioridad", estado AS "Estado"
FROM "02_Requerimientos/RNF"
WHERE !contains(file.name, "tpl-") AND file.name != "README"
SORT prioridad asc, modulo asc
```
EOF

echo "==> Inicialización completada exitosamente."
