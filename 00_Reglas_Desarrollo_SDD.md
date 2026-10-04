---
id: REGLAS-SDD
titulo: "Reglas Maestras de Desarrollo SDD y Protocolo de Agentes Especializados"
fecha: 2026-09-06
autor: "Tech Lead & Principal Software Architect"
estado: activo
tags:
  - reglas
  - sdd
  - agentes
  - pnpm
  - arquitectura
  - workflow
---

# 📜 Protocolo de Desarrollo SDD y Ecosistema de Agentes - GUACHAFIT

> **Principio Rector:** La documentación contenida en esta bóveda de Obsidian es la **única fuente de la verdad (*Single Source of Truth*)**. Ningún código de producción, esquema de base de datos o endpoint de API puede existir sin estar previamente fundamentado en un requerimiento (`RF-XXX`), un atributo de calidad (`RNF-XXX`) o una decisión de arquitectura (`ADR-XXX`).

---

## 🤖 1. Ecosistema de Agentes y Responsabilidades

Para asegurar que la documentación y el código se mantengan en sincronía perpetua y evitar la deriva (*Doc Drift*), el ciclo de desarrollo se divide en cuatro roles especializados:

```
[ Bóveda de Obsidian: RFs, RNFs, ADRs ]
                   │
                   ▼
  1. 📥 AGENTE EXTRACTOR DE CONTRATOS (Spec Ingestion)
     • Lee notas en Markdown y extrae esquemas Zod, DTOs y tipos
     • Alimenta: packages/shared/src/
                   │
                   ▼
  2. 🧪 AGENTE DE PRUEBAS DE ACEPTACIÓN (Test Generator)
     • Genera tests BDD / E2E basados exclusivamente en escenarios Gherkin
     • Alimenta: apps/api/test/bdd/ y apps/web/test/
                   │
                   ▼
  [ IMPLEMENTACIÓN / PROGRAMACIÓN ]
  (Uso estricto de pnpm sin postinstall)
                   │
                   ▼
  3. 🔍 AGENTE AUDITOR DE CONFORMIDAD Y DERIVA (Conformance Reviewer)
     • Analiza el 'git diff' antes de merge o commit
     • ¿Cumple la especificación al 100%?
        ├── [NO] ──► Bloquea integración y reporta discrepancias
        └── [SÍ] ──► Aprueba el cambio
                          │
                          ▼
  4. 🔄 AGENTE DE SINCRONIZACIÓN INVERSA Y DECISIONES (Doc-Sync & ADR)
     • Actualiza frontmatter: estado = 'implementado'
     • Redacta nuevos ADR-XXX si surgieron decisiones no previstas
```

---

## 🛠️ 2. Especificación Operativa por Agente

### 2.1. Agente Extractor de Contratos (*Spec Ingestion Agent*)
- **Gatillo de Activación:** Al planificar una nueva funcionalidad o modificar una especificación funcional.
- **Entrada:** Archivos en `02_Requerimientos/RF/`, `03_Dominio/` y `05_Arquitectura/03_Contratos_API_Especificacion.md`.
- **Salida Obligatoria:**
  - Definición de esquemas **Zod** en `packages/shared/src/schemas/`.
  - Interfaces y tipos TypeScript exportados en `packages/shared/src/types/`.
  - Enums coincidentes en `packages/shared/src/enums/`.
- **Regla Estricta:** Ningún desarrollador ni subagente puede inventar tipos TypeScript en `apps/api` o `apps/web` que no provengan de los contratos extraídos en `packages/shared`.

### 2.2. Agente de Pruebas de Aceptación (*Test Generator Agent*)
- **Gatillo de Activación:** Antes de escribir el código de producción de una funcionalidad (*Test-First Approach*).
- **Entrada:** Escenarios Gherkin (`Scenario: ... Given-When-Then`) de los archivos `RF-001` a `RF-016`.
- **Salida Obligatoria:** Suites de tests automatizadas (Vitest / Jest / Supertest) que verifican el cumplimiento de las invariantes de negocio.
- **Regla Estricta:** Las pruebas deben evaluar la lógica desde la perspectiva del contrato, sin acoplarse a la implementación interna. Si el requerimiento exige que *"alumnos presenciales tengan modo Read-only en antropometría"*, el test debe comprobar que `POST /antropometria/checkin` por un alumno presencial retorne `HTTP 403 Forbidden`.

### 2.3. Agente Auditor de Conformidad y Deriva (*Drift & Conformance Reviewer*)
- **Gatillo de Activación:** En cada commit, revisión de pull request o verificación de fase (`sdd-verify`).
- **Entrada:** El `git diff` del código contra las notas funcionales vinculadas.
- **Comportamiento:**
  - Valida que cada endpoint, tabla DDL o mutación esté amparado por un `RF` o `ADR`.
  - **Bloqueo Inmediato:** Si detecta:
    1. Campos en tablas o DTOs que no existen en el modelo de dominio.
    2. Modificación de invariantes financieras sin referencia a `RNF-002` o `ADR-003`.
    3. Bypass o ausencia de Row-Level Security (`ADR-009`) en consultas de tenants.
  - Genera un reporte explícito de conformidad o desviación.

### 2.4. Agente de Sincronización Inversa y Decisiones (*Doc-Sync & ADR Agent*)
- **Gatillo de Activación:** Al completar satisfactoriamente una funcionalidad o cuando durante el desarrollo surge una necesidad de ajuste justificada.
- **Comportamiento:**
  - **Actualización de Metadatos:** Cambia el frontmatter de los requerimientos finalizados:
    ```yaml
    estado: implementado
    version_implementada: v1.0.0
    fecha_verificacion: 2026-09-06
    ```
  - **Generación de ADRs Emergentes:** Si durante el desarrollo se decide reemplazar una librería, ajustar un algoritmo o cambiar un flujo de datos, el agente redacta inmediatamente el borrador de `ADR-XXX` en `04_Decisiones/` con la justificación y los trade-offs.

---

## 🔒 3. Políticas de Seguridad en el Monorepo (Uso Estricto de `pnpm`)

1. **Gestor Único Autorizado:** Queda terminantemente prohibido el uso de `npm` o `yarn`. Todo comando de instalación o ejecución debe realizarse mediante **`pnpm`**.
2. **Bloqueo de Scripts Postinstall (`ignore-scripts=true`):**
   - El archivo `.npmrc` del repositorio tiene configurado `ignore-scripts=true`.
   - Ninguna librería externa puede ejecutar código binario ni scripts de ciclo de vida (`preinstall`, `postinstall`) durante la instalación.
   - Si una dependencia nativa legítima requiere compilación (ej. `esbuild` o `sharp`), debe ser aprobada explícitamente mediante:
     ```bash
     pnpm approve-builds
     ```
3. **Workspace Protocol (`workspace:*`):**
   - Las dependencias internas entre paquetes del monorepo deben declararse siempre utilizando el protocolo de workspace:
     ```json
     "@guachafit/shared": "workspace:*",
     "@guachafit/database": "workspace:*"
     ```

---

## 📂 4. Mapa Estructural del Monorepo

```
GUACHAFIT/
├── 00_Dashboard.md               # Tablero central Dataview
├── 00_Reglas_Desarrollo_SDD.md   # Este documento de gobernanza
├── 01_Problemas/                 # Problemáticas de negocio (PROB-001..004)
├── 02_Requerimientos/            # Requerimientos funcionales y no funcionales
│   ├── RF/                       # RF-001 al RF-017 (Gherkin)
│   └── RNF/                      # RNF-001 al RNF-004 (Métricas y SLOs)
├── 03_Dominio/                   # Entidades y Agregados DDD
├── 04_Decisiones/                # ADR-001 al ADR-018
├── 05_Arquitectura/              # Especificación técnica, DDL y contratos API
├── apps/                         # Aplicaciones ejecutables
│   ├── api/                      # Backend NestJS + Drizzle + BullMQ
│   └── web/                      # Frontend PWA (React 19 + Vite + Tailwind v4 + primitivas Radix)
├── packages/                     # Paquetes compartidos del monorepo
│   ├── shared/                   # Contratos Zod, DTOs, Enums y Tipos comunes
│   ├── database/                 # Esquemas Drizzle, DDL, migraciones y cliente Postgres
│   └── typescript-config/        # Configuraciones base de tsconfig.json
├── scripts/                      # Herramientas de extracción y auditoría SDD
├── .npmrc                        # Bloqueo de postinstall y seguridad pnpm
├── pnpm-workspace.yaml           # Definición de workspaces
└── package.json                  # Scripts raíz de orquestación
```

---

## 🔗 5. Trazabilidad
- Ecosistema de Requerimientos: [[RF-001-checklist-entrenamiento-diario]] al [[RF-017-banco-plantillas-rutinas-entrenamiento]].
- Atributos de Calidad: [[RNF-001-almacenamiento-seguridad-fotos-progreso]] al [[RNF-004-resiliencia-notificaciones-idempotencia-fallbacks]].
- Decisiones Arquitecturales: [[ADR-001-modelo-hibrido-auditoria-antropometrica]] al [[ADR-018-proveedor-correo-transaccional-brevo]] (incluye [[ADR-017-despliegue-vps-coolify]], [[ADR-011-aislamiento-multitenant-rls-progresivo-withtenant]], [[ADR-012-modo-demo-explicito-datos-sinteticos]] y [[ADR-013-paginacion-server-side-stack-listas]]).

---

## 🎨 6. Convenciones de Interfaz y Copy

Reglas transversales del frontend, vinculantes para toda vista nueva (se revisan en la auditoría de conformidad, §2.3):

1. **Español claro, sin jerga técnica interna:** la UI no expone vocabulario de implementación ni abreviaturas opacas. Prohibido en copy visible: "Presc." (usar "Prescrito" / "Plan"), "Δ" (usar "Diferencia" o el formato humano de tiempo), "Comando Central" (usar "Panel del entrenador"), UUIDs crudos (usar nombres o enlaces) y "pago(s)" (pluralizar correctamente).
2. **Formatos humanos:** los tiempos visibles se formatean con el formateador compartido (`formatearSegundos` en `apps/web/src/lib/sesion-tiempos.ts`): "45 s", "2 min", "1 min 30 s", "1 h 12 min". Nunca se muestran segundos crudos ni valores negativos (se usa "—" cuando no hay dato).
3. **Pluralización correcta:** usar el helper compartido (`pluralizar` en `apps/web/src/lib/pluralizar.ts`) en lugar de concatenar "(s)".
4. **Paginación estándar:** los listados paginados consumen el envelope `{ items, total, limit, offset }` con `total` real del servidor y el componente `Paginacion` + hook `usePaginacionServidor` (TanStack Query + Radix); contrato en `05_Arquitectura/03_Contratos_API_Especificacion.md` §1.1 y decisión en [[ADR-013-paginacion-server-side-stack-listas]].
5. **Datos demo solo con frontera explícita:** los datos sintéticos viven exclusivamente detrás de `isDemoMode` y se muestran con banner visible; en modo real está prohibido el fallback demo ([[ADR-012-modo-demo-explicito-datos-sinteticos]]).
6. **Estados honestos:** toda vista de datos implementa carga, vacío explícito y error con acción de reintento; nunca un éxito fabricado. El copy de filtros parciales declara su alcance ("en esta página") cuando el filtro no es server-side.
7. **Acceso por estado honesto (RF-012):** las superficies del alumno traducen el `403 ALUMNO_BLOQUEADO` a una pantalla informativa por estado (pausado, suspendido por pago, archivado) con la acción disponible; nunca un error genérico ni un bloqueo silencioso.
8. **Táctil accesible en móvil:** todo control interactivo (botones, steppers, tabs, iconos de acción) expone un área táctil mínima de 44px en viewports móviles; los inputs numéricos declaran su `inputMode` y se mantienen legibles.
9. **Piso tipográfico de 11px:** ningún texto visible baja de 11px, en ningún tema ni viewport.
10. **Contraste AA en AMBOS temas:** el color se consume exclusivamente desde tokens semánticos con variante claro/oscuro (`:root` / `.dark`) y contraste AA verificado en ambos; prohibido hardcodear paletas fijas sin variante de tema (los estados usan sus variantes `-strong`/`-foreground`).
11. **Actualizaciones y datos offline con control del usuario:** la app nunca aplica una actualización del Service Worker ni recarga sin acción explícita del usuario; los datos servidos desde caché se señalan como offline con su antigüedad ("hace X"). Decisión en [[ADR-014-actualizaciones-guiadas-sw-frescura-offline]].
