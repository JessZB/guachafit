---
id: PROB-001
fecha: 2026-09-05
modulo: Adherencia y Antropometria
impacto: alto
estado: en_analisis
tags:
  - problema
  - sdd
  - fitness-app
  - mvp
requerimientos_asociados:
  - "[[RF-001-checklist-entrenamiento-diario]]"
  - "[[RF-002-nutricion-agil-reporte-rapido]]"
  - "[[RF-003-checkin-antropometrico-rbac-hibrido]]"
  - "[[RF-004-evolucion-corporal-comparador-fotografico]]"
  - "[[RNF-001-almacenamiento-seguridad-fotos-progreso]]"
  - "[[ADR-001-modelo-hibrido-auditoria-antropometrica]]"
---

# PROB-001: Falta de Adherencia y Pérdida de Trazabilidad (Rutinas, Nutrición y Métricas)

## 1. Descripción del Dolor (Problem Statement)
> El entrenador no puede determinar si el progreso o estancamiento de sus alumnos se debe a la efectividad intrínseca del plan o al incumplimiento sistemático por parte del alumno.

- **Actor afectado:** Entrenador (pérdida de control y reputación técnica) y Alumno (desmotivación por falta de resultados tangibles).
- **Frecuencia del problema:** Diaria (entrenamiento y comidas) y Periódica (días de pesaje/medición).
- **Impacto directo:** 
  - Alta tasa de deserción (churn) de clientes a las pocas semanas.
  - Incapacidad del entrenador para justificar ajustes a las rutinas o planes nutricionales basados en datos empíricos.
  - Riesgo de inconsistencia y fraude en la toma de medidas corporales en alumnos a distancia.

---

## 2. Contexto Operativo
- **Flujo actual:**
  1. El entrenador envía rutinas y planes en PDF, Word o chats de WhatsApp.
  2. El alumno intenta seguir el plan pero no tiene un canal simple para reportar cargas levantadas ni adherencia calórica diaria.
  3. El registro exhaustivo de calorías (pesar gramos de comida) fatiga mentalmente al alumno, quien abandona el reporte a los 7-14 días.
  4. Los controles de peso y medidas se hacen de forma desordenada o sin un calendario predecible; en entornos online, el alumno envía datos sospechosos o con técnicas de medición incorrectas.
- **Canales/Herramientas involucradas:** WhatsApp, notas de voz, hojas de cálculo de Google Sheets, básculas domésticas no calibradas.

---

## 3. Causa Raíz Preliminar (5 Porqués)
1. **¿Por qué el entrenador no sabe si el plan funciona?** Porque no tiene registro de si el alumno realmente ejecutó los ejercicios y respetó los rangos de macronutrientes.
2. **¿Por qué el alumno no reporta su ejecución diaria?** Porque las herramientas actuales son estáticas (PDF/WhatsApp) o requieren una entrada de datos extremadamente pesada (pesar cada gramo de comida).
3. **¿Por qué las mediciones no son confiables?** Porque no existe un calendario estructurado ni una diferenciación entre mediciones verificadas por el coach vs. autoreportes remotos del alumno.
4. **¿Por qué no hay control de calidad en los datos remotos?** Porque no existen permisos basados en roles (RBAC) ni flujos de aprobación previa para las medidas tomadas a distancia.
5. **Causa Raíz Identificada:** Ausencia de un ecosistema de software interactivo con mecanismos de reporte ágil (micro-fricción) y un modelo de datos con auditoría que distinga la operativa presencial de la remota.

---

## 4. Vínculos a Requerimientos
- **Requerimientos Funcionales (RF):**
  - [[RF-001-checklist-entrenamiento-diario]]: Checklist interactivo de rutina, racha y semáforo de actividad para el coach.
  - [[RF-002-nutricion-agil-reporte-rapido]]: Metas macro, reporte 1-Tap, diario fotográfico e input de totales externos.
  - [[RF-003-checkin-antropometrico-rbac-hibrido]]: Calendario de check-ins, registro de perímetros/grasa y RBAC presencial vs remoto.
  - [[RF-004-evolucion-corporal-comparador-fotografico]]: Curvas temporales de evolución y comparador fotográfico interactivo.
- **Requerimientos No Funcionales (RNF):**
  - [[RNF-001-almacenamiento-seguridad-fotos-progreso]]: Privacidad, cifrado de imágenes corporales y compresión en cliente.
- **Decisiones Arquitecturales (ADR):**
  - [[ADR-001-modelo-hibrido-auditoria-antropometrica]]: Flujo de doble estado (Verificado vs Pendiente de Aprobación) y RBAC estricto.
