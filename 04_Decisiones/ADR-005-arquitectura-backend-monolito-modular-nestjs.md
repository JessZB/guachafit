---
id: ADR-005
titulo: "ADR-005: Arquitectura de Backend como Monolito Modular en NestJS (Node.js/TypeScript) con Clean Architecture"
fecha: 2026-09-06
estado: aceptado
decisores:
  - "Tech Lead & Principal Software Architect"
  - "Equipo de Ingeniería"
tags:
  - decision
  - adr
  - arquitectura
  - backend
  - nestjs
  - clean-architecture
  - ddd
---

# ADR-005: Arquitectura de Backend como Monolito Modular en NestJS (Node.js/TypeScript) con Clean Architecture

## 1. Estado
`aceptado`

---

## 2. Contexto y Fuerzas en Juego
La arquitectura de backend de **GUACHAFIT** debe articular dos dominios con naturalezas marcadamente distintas:
1. **Dominio de Salud y Entrenamiento:** Altas lecturas, checklists rápidos en tiempo real, ingestión de fotos y cálculos de racha (`RF-001` a `RF-004`).
2. **Dominio Financiero y de Tesorería:** Estricto rigor transaccional ACID, inmutabilidad de libros mayores (*ledger*), prevención de doble gasto y conciliación de pagos bimonetarios (`RF-005` a `RF-009`, `RNF-002`, `ADR-003`).

### Fuerzas en Conflicto
- **Consistencia Financiera Inmediata vs. Desacoplamiento:** Descomponer el sistema en microservicios prematuros (ej. *Auth Service*, *Workout Service*, *Billing Service*) forzaría el uso de transacciones distribuidas (Two-Phase Commit o Sagas con consistencia eventual). Una inconsistencia eventual entre la aprobación de un pago y la actualización del saldo de una cuota destruiría la confianza del entrenador y violaría flagrantemente `RNF-002`.
- **Estructura Empresarial vs. Agilidad de Desarrollo:** Se requiere un marco de trabajo que imponga límites estrictos de módulos y capas (Clean Architecture / Puertos y Adaptadores), pero que permita máxima velocidad de iteración compartiendo contratos de tipado con el frontend.

### Opciones Consideradas
1. **Opción A (Microservicios Independientes con gRPC / Kafka):** Máximo aislamiento de despliegue, pero introduce una complejidad operativa devastadora para un equipo en fase MVP, costos elevados de infraestructura en Kubernetes y consistencia eventual inaceptable en finanzas.
2. **Opción B (Monolito en Go o Python/FastAPI):** Alto rendimiento o simplicidad de scripts, pero carece de un estándar maduro de inyección de dependencias para DDD empresarial en TypeScript y rompe el flujo de tipos compartidos extremo a extremo (*End-to-End Type Safety*).
3. **Opción C (Monolito Modular en NestJS con Clean Architecture):** Un único artefacto desplegable pero internamente particionado en módulos estrictamente aislados (`IAMModule`, `TrainingModule`, `AnthropometryModule`, `FinanceModule`), con una base de datos relacional compartida que permite transacciones ACID locales.

---

## 3. Decisión
Elegimos la **Opción C: Monolito Modular en NestJS (Node.js 22 LTS / TypeScript) con Clean Architecture**:

```
[Cliente HTTP / PWA]
        │
        ▼ (Rutas REST / DTOs Validados con Zod/Pipes)
┌─────────────────────────────────────────────────────────────┐
│                       NESTJS APPLICATION                    │
│                                                             │
│   ┌────────────────┐   ┌────────────────┐   ┌───────────┐   │
│   │ Módulo IAM     │   │ Módulo Entrena │   │ Módulo    │   │
│   │ (Auth / RBAC)  │   │ y Nutrición    │   │ Antropo   │   │
│   └───────┬────────┘   └───────┬────────┘   └─────┬─────┘   │
│           │                    │                  │         │
│           └────────────────────┼──────────────────┘         │
│                                ▼                            │
│                  ┌───────────────────────────┐              │
│                  │  Módulo Finanzas & Ledger │              │
│                  │  (ACID, Bimonetario, Cuota│              │
│                  └─────────────┬─────────────┘              │
│                                │                            │
│        (Dominio ──> Aplicación ──> Infraestructura)         │
│                                │                            │
└────────────────────────────────┼────────────────────────────┘
                                 ▼
                 PostgreSQL (Transacción ACID Local)
```

### Reglas de Diseño e Implementación
1. **Aislamiento de Módulos:** Cada módulo en NestJS (`TrainingModule`, `FinanceModule`, etc.) es dueño de sus propios servicios de aplicación, casos de uso y repositorios. Ningún módulo puede consultar directamente las tablas o entidades internas de otro módulo; la comunicación entre módulos se realiza exclusivamente a través de interfaces públicas de servicios de dominio o eventos de dominio en memoria (`EventEmitter2`).
2. **Estructura en Capas (Hexagonal / Clean Architecture):**
   - `domain/`: Entidades DDD inmutables, Value Objects, eventos de dominio y reglas de negocio puras (sin dependencias de frameworks ni ORM).
   - `application/`: Casos de uso (*Commands* y *Queries*), orquestación transaccional y DTOs de entrada/salida.
   - `infrastructure/`: Implementaciones de repositorios con Drizzle ORM, adaptadores de Cloudflare R2 y clientes de colas BullMQ.
   - `presentation/`: Controladores REST de NestJS, Guards de autorización (`ADR-001`) e Interceptores de logging.
3. **Garantía Transaccional Local:** Cuando el caso de uso `AprobarTransaccionPagoUseCase` se ejecuta, Drizzle ORM abre una transacción interactiva contra PostgreSQL, bloquea la fila de la `CuotaMembresia` con `FOR UPDATE`, actualiza el estado del pago, decrementa el saldo y comitea atómicamente.
4. **Despliegue Sencillo:** Un único contenedor Docker desplegable en cualquier PaaS/VPS moderno (Render, Railway, Fly.io, AWS ECS o Hetzner) detrás de Nginx / Cloudflare.

---

## 4. Consecuencias y Trade-offs

### Consecuencias Positivas (Beneficios)
- **Cumplimiento Estricto de ACID (`RNF-002`):** Cero transacciones distribuidas ni estados inconsistentes entre pagos y cuotas.
- **Simplicidad Operativa:** Monitoreo, logging y despliegue unificados en un solo proceso de servidor.
- **Tipado Integral End-to-End:** Posibilidad de compartir paquetes de DTOs y tipos de dominio entre la API y la PWA mediante un monorepo (Turborepo/pnpm workspaces).
- **Evolución Natural a Microservicios:** Si a futuro el volumen de tráfico de entrenamientos crece 100x respecto a finanzas, la estricta modularidad permite extraer `TrainingModule` a un servicio independiente en días sin reescribir la lógica de negocio.

### Consecuencias Negativas (Trade-offs)
- **Riesgo de Acoplamiento Accidental:** Si los desarrolladores no respetan la encapsulación modular de NestJS, podrían inyectar repositorios ajenos directamente en controladores. *Mitigación:* Se configuran reglas de ESLint (`boundaries/element-types`) para prohibir importaciones cruzadas entre módulos.

---

## 5. Trazabilidad y Referencias
- **Problemas que resuelve:** [[PROB-001-adherencia-trazabilidad]], [[PROB-002-cobranza-bimonetaria-fraccionada]]
- **Requerimientos asociados:**
  - [[RF-006-motor-bimonetario-liquidacion-abonos]]
  - [[RF-007-reporte-pagos-bandeja-conciliacion]]
  - [[RF-008-maquina-estados-cuota-recordatorios]]
  - [[RNF-002-consistencia-financiera-idempotencia-pagos]]
- **Documento de Arquitectura:** [[01_Evaluacion_Stack_Tecnologico]]
