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
