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
