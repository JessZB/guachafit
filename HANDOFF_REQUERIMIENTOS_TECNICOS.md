---
tipo: handoff-tecnico
proyecto: GUACHAFIT
fecha_corte: 2026-09-06
sesion_origen: conversation://86eb9b81-b8ec-48b5-b3ca-50facba1dab3
estado: listo-para-ejecucion
tags:
  - handoff
  - arquitectura
  - stack-tecnologico
  - base-de-datos
  - sdd
---

# 🚀 Handoff de Arquitectura Técnica y Stack Tecnológico - GUACHAFIT

> Este documento resume el estado de especificación del sistema en la bóveda de Obsidian y sirve como documento de transferencia (*handoff*) para iniciar la fase de **Definición de Requerimientos Técnicos, Selección de Tecnologías y Diseño de Base de Datos**.

---

## 📌 1. Resumen Ejecutivo del Proyecto
**GUACHAFIT** es una plataforma integral para entrenadores personales y gimnasios que resuelve dos problemas críticos del negocio fitness:
1. **Adherencia, Nutrición y Antropometría ([[PROB-001-adherencia-trazabilidad]]):** 
   - Eliminación de PDFs estáticos mediante checklist interactivo de entrenamiento con cálculo de sobrecarga progresiva y rachas.
   - Nutrición ágil de baja fricción (semáforo diario 1-Tap, diario fotográfico de comidas y totales opcionales).
   - Check-ins antropométricos periódicos con modelo híbrido RBAC (Presencial: entrenador registra y valida; Remoto: alumno autoreporta en ventana activa con aprobación previa).
2. **Finanzas, Pagos Bimonetarios y Control de Cartera ([[PROB-002-cobranza-bimonetaria-fraccionada]]):**
   - Catálogo de planes con overrides individuales por cliente (precio, beneficios y tasa acordada).
   - Deuda maestra anclada en USD con liquidación dinámica de abonos en Bolívares (VES) a tasa congelada por transacción.
   - Bandeja de conciliación rápida (aprobación/rechazo de Pago Móvil, transferencias, efectivo y wallets).
   - Tablero de control de cartera con KPIs en tiempo real y recordatorios automatizados (T-5, T-1, T, T+2).

---

## 📂 2. Inventario de Artefactos Formalizados en el Vault

| Carpeta | Artefactos Clave | Descripción |
| :--- | :--- | :--- |
| **`01_Problemas/`** | `PROB-001`, `PROB-002` | Análisis de causa raíz (5 Porqués) e impacto del dolor operativo. |
| **`02_Requerimientos/RF/`** | `RF-001` al `RF-009` | Especificaciones en formato Gherkin (*Given-When-Then*) con reglas de negocio. |
| **`02_Requerimientos/RNF/`** | `RNF-001`, `RNF-002` | Seguridad de fotos corporales, precisión decimal sin punto flotante, idempotencia y SLOs. |
| **`03_Dominio/`** | 6 Entidades/Agregados DDD | `SesionEntrenamiento`, `CheckinNutricional`, `ControlAntropometrico`, `PlanMembresia`, `CuotaMembresia`, `TransaccionPago`. |
| **`04_Decisiones/`** | `ADR-001`, `ADR-002`, `ADR-003` | RBAC antropométrico híbrido, manejo temporal universal en UTC y Deuda Maestra en USD. |
| **Raíz** | `00_Dashboard.md` | Tablero dinámico configurado con consultas de Dataview. |

---

## 🎯 3. Alcance Requerido para la Siguiente Sesión

El objetivo de la nueva sesión es actuar como **Tech Lead & Principal Architect** para definir:

1. **Evaluación y Selección del Stack Tecnológico (Trade-off Analysis):**
   - **Frontend / Client Apps:** Evaluación entre PWA (Next.js/React), App Móvil Híbrida (Flutter vs. React Native / Expo) considerando la necesidad de soporte Offline-First en el gimnasio y compresión de fotos del lado del cliente.
   - **Backend & API:** Evaluación de runtime (Node.js/NestJS vs. Go vs. Python/FastAPI) considerando transaccionalidad bancaria, concurrencia y velocidad de desarrollo.
   - **Base de Datos Principal:** Justificación de PostgreSQL con extensiones (UUIDs, tipos `DECIMAL`, índices únicos parciales).
   - **Storage & Media:** Estrategia para imágenes (S3 / Cloudflare R2 / Supabase Storage) con URLs firmadas y ciclo de vida de caché.
   - **Procesamiento en Segundo Plano (Cron & Workers):** Arquitectura para recordatorios automáticos de cobranza y check-ins (Redis + BullMQ, Cloudflare Queues o AWS SQS).
2. **Modelo Físico de Base de Datos (Esquema DDL / DER):**
   - Tablas relacionales normalizadas para las 6 entidades del dominio.
   - Claves foráneas, índices de idempotencia (`UNIQUE`), restricciones `CHECK` y enumeraciones.
3. **Contratos de API (Especificación de Endpoints y DTOs):**
   - Definición de rutas REST / RPC para entrenamiento, nutrición, antropometría y conciliación de cartera.

---

## 📋 4. Prompt Maestro para Iniciar la Próxima Sesión

Copia y pega el siguiente prompt en tu nueva sesión para arrancar inmediatamente con todo el contexto cargado:

```markdown
Actúa como Tech Lead y Principal Software Architect especializado en sistemas distribuidos, aplicaciones móviles/PWA y arquitectura de datos.

En este workspace (Vault de Obsidian de GUACHAFIT) ya contamos con la especificación funcional completa bajo Spec-Driven Development (SDD) en las carpetas:
- 01_Problemas/ (PROB-001: Adherencia/Antropometría y PROB-002: Finanzas/Control de Cartera)
- 02_Requerimientos/RF/ (RF-001 al RF-009 en formato Gherkin)
- 02_Requerimientos/RNF/ (RNF-001: Seguridad/Fotos y RNF-002: Consistencia Financiera/Idempotencia)
- 03_Dominio/ (6 Agregados DDD: SesionEntrenamiento, CheckinNutricional, ControlAntropometrico, PlanMembresia, CuotaMembresia, TransaccionPago)
- 04_Decisiones/ (ADR-001: RBAC Antropometría, ADR-002: Timestamps UTC, ADR-003: Deuda Maestra USD)
- Puedes consultar el resumen ejecutivo en HANDOFF_REQUERIMIENTOS_TECNICOS.md y el tablero 00_Dashboard.md.

Tu objetivo en esta sesión es diseñar y documentar la ARQUITECTURA TÉCNICA Y SELECCIÓN DE TECNOLOGÍAS para el MVP:

1. Realiza una evaluación de alternativas tecnológicas (Trade-off Analysis) y define el Stack Tecnológico recomendado para:
   - Frontend de Alumnos y Entrenador (PWA vs React Native / Flutter para soporte Offline-first y cámara).
   - Backend / APIs (Node.js/NestJS vs Go vs Python) y arquitectura de servicios.
   - Base de Datos (PostgreSQL con Prisma/Drizzle/TypeORM).
   - Almacenamiento de fotos privadas (S3/R2 con Presigned URLs temporales).
   - Motor de colas y tareas programadas (Background Workers para recordatorios de cobro y check-ins).
2. Genera los Architecture Decision Records (ADRs) correspondientes dentro de 04_Decisiones/ para cada elección técnica clave.
3. Diseña el Esquema Relacional de Base de Datos (DDL en SQL / PostgreSQL y Diagrama Mermaid de Entidad-Relación) respetando estrictamente las invariantes financieras (RNF-002), el manejo UTC (ADR-002) y los estados de las 6 entidades de dominio.
4. Define los contratos de API y endpoints principales para los módulos de Entrenamiento, Antropometría y Conciliación Financiera.

Por favor, revisa primero los archivos existentes en el workspace y genera los documentos en sus carpetas correspondientes con formato Markdown y frontmatter YAML estandarizado.
```
