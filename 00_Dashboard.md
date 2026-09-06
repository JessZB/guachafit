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

---

## 🏗️ 6. Especificaciones de Arquitectura Técnica (MVP)
Diseño de sistemas, stack tecnológico, modelo relacional DDL y contratos de API REST.

```dataview
TABLE id AS "ID", titulo AS "Documento Técnico", estado AS "Estado", fecha AS "Fecha"
FROM "05_Arquitectura"
WHERE !contains(file.name, "tpl-") AND file.name != "README"
SORT id asc
```

