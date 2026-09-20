---
id: ADR-012
titulo: "ADR-012: Modo Demo Explícito — Prohibido Presentar Datos Sintéticos como Reales"
fecha: 2026-09-20
estado: propuesto
decisores:
  - "Tech Lead"
  - "Principal Architect"
tags:
  - decision
  - adr
  - arquitectura
  - frontend
  - datos
  - demo
  - confianza
---

# ADR-012: Modo Demo Explícito — Prohibido Presentar Datos Sintéticos como Reales

## 1. Estado
`propuesto`

---

## 2. Contexto y Fuerzas en Juego
Durante la construcción de las vistas del coach y del alumno se detectaron incidentes de **fallbacks demo silenciosos**: cuando la API fallaba, devolvía vacío o la data real no alcanzaba, varias pantallas completaban la interfaz con datos sintéticos (alumnos de ejemplo, métricas inventadas, comprobantes de pago demo) sin ninguna señal visual de que no eran reales.

El impacto no es cosmético: el entrenador tomaba decisiones de negocio (a quién cobrar, a quién exigir adherencia) y el alumno veía progreso que no había ejecutado. Un dato falso presentado como real destruye la confianza en la plataforma y puede generar decisiones clínicas o financieras incorrectas.

- **Problema a resolver:** eliminar la ambigüedad entre dato real, dato vacío, error de carga y dato sintético de demostración en todo el frontend.
- **Fuerzas en conflicto:**
  1. **Confianza vs. "pantalla llena":** un fallback demo evita el vacío visual, pero miente; un estado honesto de error o vacío es más pobre visualmente y obliga a trabajar la UX.
  2. **Demo comercial vs. producto real:** la demostración a prospectos necesita datos sintéticos atractivos; el producto en operación no puede contenerlos.
  3. **Costo por vista vs. consistencia global:** cada pantalla nueva debe implementar estados honestos; sin una regla transversal, la deuda reaparece.
- **Opciones consideradas:**
  1. *Opción A (Fallbacks silenciosos):* mantener datos mock como red de seguridad ante errores o vacíos.
     - *Descartada:* es exactamente el incidente que se busca erradicar; decisiones sobre datos falsos.
  2. *Opción B (Modo demo explícito con flag único + estados honestos en modo real):* un solo interruptor `isDemoMode`; los datos sintéticos viven exclusivamente dentro de él y en modo real la UI muestra loading/error/vacío veraces.
     - *Seleccionada.*
  3. *Opción C (Entorno demo separado con su propio backend/tenant):* aislar la demo en un despliegue aparte.
     - *Descartada por ahora:* mayor costo operativo para la etapa actual; no se excluye adoptarla más adelante como evolución de la Opción B.

---

## 3. Decisión
Elegimos la **Opción B (modo demo explícito con flag único y estados honestos)** porque separa con una frontera verificable el dato sintético del real sin duplicar infraestructura.

### Detalles de la Implementación
1. **Interruptor único:** `isDemoMode` expuesto por `useAuth` es la única vía para habilitar datos sintéticos en el frontend. Todo dataset mock vive dentro de `if (isDemoMode)`.
2. **Señal visual obligatoria:** en modo demo se muestra un banner global en `AppLayout` que declara que los datos son de demostración. Sin banner, no hay demo.
3. **Modo real sin fallbacks:** prohibido completar pantallas con datos sintéticos. Ante fallo o ausencia de datos la UI muestra estados honestos: carga, error con acción de reintento, o vacío explícito ("sin datos aún"), nunca un éxito o contenido fabricado.
4. **Cero llamadas reales en modo demo:** la demo no consulta ni muta la API real; no se mezclan datos demo con datos reales en una misma vista.
5. **Sin éxito falso:** prohibidas las mutaciones optimistas que simulan éxito en modo real cuando la operación no se confirmó.
6. **Regla de conformidad para toda vista nueva:** cualquier pantalla nueva debe cumplir 1–5; se verifica en revisión de conformidad (agente auditor, `00_Reglas_Desarrollo_SDD.md` §2.3).

---

## 4. Consecuencias y Trade-offs

### Consecuencias Positivas (Beneficios)
- **C1:** El coach y el alumno solo ven datos reales o estados honestos; se elimina la toma de decisiones sobre información fabricada.
- **C2:** Los errores de API se vuelven visibles de inmediato (con reintento), en lugar de quedar enmascarados por un fallback.
- **C3:** La demo comercial conserva su utilidad con una frontera explícita y señalizada (`isDemoMode` + banner).

### Consecuencias Negativas (Costos y Trade-offs)
- **T1:** Más trabajo por vista: cada pantalla debe implementar loading/error/vacío y no puede "rellenar" con mocks.
- **T2:** La demo puede verse más vacía en módulos sin dataset sintético trabajado.
- **T3:** Requiere disciplina de revisión: un fallback demo nuevo fuera de `isDemoMode` reintroduce el incidente.

### Riesgos Mitigados y Residuales
- **Riesgo Mitigado:** decisiones operativas sobre datos sintéticos presentados como reales; confusión entre fallo de API y ausencia legítima de datos.
- **Riesgo Residual:** cobertura incompleta de estados en pantallas heredadas; se reduce a medida que cada vista se revisa contra esta regla.
- **Riesgo Residual:** deuda de UX en estados vacíos (copy, ilustración, siguiente acción) si no se prioriza.

---

## 5. Trazabilidad y Referencias
- Incidentes que originan la decisión: fallbacks demo detectados en vistas de coach y alumno durante la re-validación del lote (WU8: expediente del alumno, progreso, comprobantes de pago).
- Requerimientos asociados: [[RF-001-checklist-entrenamiento-diario]], [[RF-013-dashboard-comando-entrenador-kpis]], [[RF-017-banco-plantillas-rutinas-entrenamiento]]
- Gobernanza: `00_Reglas_Desarrollo_SDD.md` §2.3 (Agente Auditor de Conformidad) y §2.4 (Doc-Sync & ADR)
