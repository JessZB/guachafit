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
│   ├── RF/                       # RF-001 al RF-018 (Gherkin)
│   └── RNF/                      # RNF-001 al RNF-004 (Métricas y SLOs)
├── 03_Dominio/                   # Entidades y Agregados DDD
├── 04_Decisiones/                # ADR-001 al ADR-022
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
- Ecosistema de Requerimientos: [[RF-001-checklist-entrenamiento-diario]] al [[RF-018-mi-perfil-autogestion-cuenta]].
- Atributos de Calidad: [[RNF-001-almacenamiento-seguridad-fotos-progreso]] al [[RNF-004-resiliencia-notificaciones-idempotencia-fallbacks]].
- Decisiones Arquitecturales: [[ADR-001-modelo-hibrido-auditoria-antropometrica]] al [[ADR-022-estructura-componentes-atomicos-web]] (incluye [[ADR-021-modo-foco-entrenamiento-alumno]], [[ADR-019-zona-horaria-perfil-captura-relativa-nutricion]], [[ADR-020-suscripcion-alumno-emision-automatica-cuotas]], [[ADR-018-proveedor-correo-transaccional-brevo]], [[ADR-017-despliegue-vps-coolify]], [[ADR-011-aislamiento-multitenant-rls-progresivo-withtenant]], [[ADR-012-modo-demo-explicito-datos-sinteticos]] y [[ADR-013-paginacion-server-side-stack-listas]]).

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
12. **Peso tipográfico máximo 700 (desde 2026-10-10):** ningún texto usa pesos 800 ni 900 (`font-black`, `font-extrabold`, `font-[800\|900]`, `font-weight: 800/900`). La jerarquía se construye con 700 (`font-bold`, títulos y cifras clave), 600 (`font-semibold`), 500 (`font-medium`, etiquetas) y 400 (cuerpo). Lo vigila el test guardián `apps/web/src/estilo-tipografia.spec.ts`, que falla y lista cada archivo y línea si aparece un peso prohibido.
13. **Entrada numérica filtrada (desde 2026-10-11):** todo input de un dato numérico de series (peso, repeticiones, esfuerzo, series) filtra al teclear con `apps/web/src/lib/entrada-numerica.ts` y los topes compartidos `LIMITES_SERIE` de `@guachafit/shared`: lo inválido no llega a escribirse y la validación al guardar repite la regla del API. Usa `inputMode` acorde (`decimal` o `numeric`) y nunca `type="number"` para estos datos.
14. **Componentes atómicos y tope de tamaño (desde 2026-10-13):**
   - Toda vista nueva o trabajada sigue [[ADR-022-estructura-componentes-atomicos-web]]:
     - la página es un contenedor orquestador de ≤ 300 líneas;
     - los átomos sin dominio van en `components/ui/` (estados de carga, vacío y error, `BotonTactil`, `BadgeEstado`, `ChipFiltro`);
     - lo compartido va en `components/common/` o `components/<dominio>/`;
     - lo único de la vista va en `components/<rol>/<modulo>/`, con sus hooks `use-*.ts`;
     - la lógica pura va en `lib/<modulo>-*.ts`.
   - Los componentes presentacionales no piden datos: reciben props y callbacks.
   - Ningún `.ts`/`.tsx` de `pages/` o `components/` pasa de 400 líneas. Lo vigila el test guardián `apps/web/src/tamano-archivos.spec.ts`, que desde el 2026-10-13 (cierre de la Ola 3) no admite excepciones. Cualquier excepción nueva exige añadirla de forma explícita al guardián con una referencia a su ODD, y el guardián falla en cuanto sobra.
   - Un refactor de estructura no edita specs existentes ni cambia el mecanismo de datos de la vista.
15. **Servicios del API como fachada de casos de uso (desde 2026-10-13):**
   - Todo servicio nuevo o trabajado del API sigue [[ADR-023-casos-de-uso-servicios-api]]:
     - el servicio Nest es una fachada que delega y conserva su constructor y sus métodos públicos;
     - los casos de uso van en `src/modules/<modulo>/casos-<servicio>/` como funciones o clases planas que reciben un contexto de dependencias explícito, sin providers nuevos de Nest;
     - la lógica pura va en `*-reglas.ts`, con su spec unitario.
   - Ningún `.ts` de `apps/api/src` (sin contar specs) pasa de 400 líneas. Lo vigila el test guardián `apps/api/src/tamano-archivos.spec.ts`; sus únicas excepciones son los 8 archivos de la Ola 2 del API.
   - Un refactor que mueve código conserva los comentarios originales en español, palabra por palabra, y ejecuta la suite completa de los paquetes que lo consumen, no solo el typecheck: hay specs que leen el código fuente por ruta.

16. **Movimiento reducido global (desde 2026-10-28, UX-02):**
   - `apps/web/src/index.css` termina con un único `@media (prefers-reduced-motion: reduce)`, sin capa y con `!important`. Fija animaciones y transiciones a 0.01ms, una iteración, y `scroll-behavior: auto`. Usa duración mínima y no `animation: none`, para que las animaciones de entrada acaben en su estado final y Radix reciba `animationend`.
   - Las clases `motion-reduce:` sueltas pasan a ser opcionales.
   - Lo vigila el guardián `apps/web/src/estilo-movimiento-reducido.spec.ts`.
   - El desplazamiento suave pedido desde JS no lo cubre la regla: todo `scrollIntoView({ behavior: 'smooth' })` consulta `matchMedia('(prefers-reduced-motion: reduce)')`, como `PestanaEntrenamientoAlumno`.
   - Un spinner no es la única señal de carga: va con texto visible o con `ui/EstadoCarga`, porque con movimiento reducido se queda quieto.

17. **Montos y decimales con formato común (desde 2026-10-28, UX-03):**
   - Todo monto o decimal visible se formatea con `apps/web/src/lib/formato-monto.ts`: `formatMonto` (`$1.900,00`, `Bs. 36.500,00`, `—` sin dato) y `formatDecimal` (tasas). Prohibido interpolar `$${monto}` o `Bs. ${monto}` crudos y prohibido fijar un locale en un componente.
   - El formato por defecto es el venezolano (`FORMATO_NUMERO_POR_DEFECTO = 'coma-decimal'`), por decisión del dueño. Se prevé que cada usuario elija coma o punto decimal.
   - Para que esa preferencia se inyecte en un solo punto, **las vistas no llaman a `formatMonto` directamente**: usan `useFormatoNumero()` de `lib/use-formato-numero.ts` (creado en UX-06, `87fe4df`). Hoy devuelve el formato por defecto y mañana leerá la preferencia del usuario. Las funciones puras de `lib/` reciben el formato como parámetro. Los componentes presentacionales reciben el monto ya formateado (p. ej. `montoTexto`).
   - Los campos de formulario de Ajustes y de los módulos que adopten el patrón usan `CampoAjustes` o `SelectAjustes` (`components/ajustes/CampoAjustes.tsx`):
     - la unidad va en `sufijo` y no se repite en la etiqueta ("Precio base" con sufijo "USD", no "Precio base (USD)");
     - los datos numéricos usan `inputMode`, nunca `type="number"`.

---

## 🤝 7. Flujo de Trabajo: Claude Code como orquestador + agentes externos (vigente desde 2026-10-18)

> **Divide y vencerás:** Claude Code dirige y valida; un subagente de Claude escribe el código; los tests y las revisiones extensas los ejecutan **agentes externos**: agentes de otros CLI, fuera del ecosistema de Claude, que el dueño lanza desde otra terminal. Este flujo sustituye al del 2026-10-06, en el que Claude escribía el código y un CLI externo concreto hacía los tests. Para este proyecto, **prevalece** sobre cualquier regla global de dirección de agentes.

### 7.1. Roles

| Rol | Hace | No hace |
|---|---|---|
| **Claude Code** (orquestador y validador) | Audita, aclara requisitos (una pregunta a la vez), diseña y fija los contratos de cada lote, delega la escritura del código al subagente escritor y **valida el código generado** contra el diseño y el `git diff` antes de aceptarlo. Escribe el doc-sync del vault, redacta los prompts de los agentes externos, verifica cada reporte contra el `git diff` y hace los commits. | No escribe código de producción (lo delega), no escribe ni ejecuta tests, no hace push. |
| **Subagente explorador** (Claude Haiku 5.5, desde 2026-10-31) | Mapea el código antes de cada lote, en solo lectura: textos exactos, props, consumidores, specs que se romperán y si comprueban comportamiento o texto. | No edita archivos, no ejecuta tests, no lee `.env`. |
| **Subagente escritor** (Claude Sonnet 5.5, `effort: high`, desde 2026-10-31; antes Haiku 5.5) | Escribe el código de producción (front, API, shared, migraciones) y las correcciones de los hallazgos, a partir de un encargo preciso de Claude: archivos, cambios exactos, decisiones resueltas y prohibiciones. Devuelve la lista de archivos con sus líneas, dónde cumple cada contrato y cualquier desviación con su porqué. | No escribe ni ejecuta tests, no edita specs, no hace commit ni push, no lee `.env`. |
| **Agentes externos** (otros CLI, fuera del ecosistema de Claude) | Escriben los tests (TDD, fase roja), ejecutan suites, typecheck y build, y hacen las revisiones 4R y las validaciones acotadas. Siempre dejan un reporte `.md`. | No tocan código de producción (salvo que el prompt lo autorice de forma explícita), no hacen commit ni push, no leen `.env`. |
| **Dueño** | Decide producto. Puede ejecutar él mismo un prompt en el agente externo que elija; por defecto lo lanza Claude (§7.6). | — |

### 7.2. Carpeta de prompts

- Ruta: `.external-agents/` en la raíz del repo (ignorada por git). Los reportes van en `.external-agents/reportes/`.
- Nombre: `<NN>-<lote>-<tipo>.md`, con `tipo` ∈ `tests`, `verificacion`, `review-risk`, `review-reliability`, `review-resilience`, `review-readability`, `validacion`. El reporte se llama igual con sufijo `.reporte.md`.
- Los prompts no dependen de ninguna herramienta concreta: describen la tarea, la superficie y el reporte, y cualquier agente externo debe poder ejecutarlos.
- Desde el 2026-10-30 Claude lanza el agente externo por su cuenta con la orquestación de Orca (§7.6). Si el dueño prefiere ejecutarlo él en modo interactivo, Claude le indica el archivo y la instrucción a pegar:
  ```text
  Lee y ejecuta exactamente el prompt .external-agents/<NN>-<lote>-<tipo>.md y deja el reporte en la ruta que indica.
  ```
- Si el lote tiene varios prompts independientes de solo lectura (por ejemplo, las 4 revisiones), pueden lanzarse en paralelo.

### 7.3. Ciclo por lote

1. **Auditoría y decisiones:** Claude audita el módulo (el mapeo del código lo delega al subagente explorador, Haiku 5.5) y resuelve con el dueño las decisiones de producto.
2. **Tests en rojo:** Claude genera el prompt `tests` con los contratos exactos. El agente externo escribe los tests, los ejecuta, confirma que **fallan por la razón esperada** y lo reporta. Un test rojo afirma solo el comportamiento nuevo: nunca espera el comportamiento viejo para luego afirmar lo contrario.
3. **Implementación:** Claude encarga el código de producción al subagente escritor (Sonnet 5.5, `effort: high`) y **valida el resultado**: revisa el diff, comprueba cada contrato y cada desviación declarada, y devuelve el encargo si algo no cuadra. Los tests no se tocan salvo error evidente, que se reporta.
4. **Verificación:** prompt `verificacion`. El agente externo corre la suite completa de los paquetes afectados, typecheck y build, y reporta los números (re-ejecuta una vez los tests HTTP intermitentes del API antes de darlos por fallidos).
5. **Revisión:** prompts `review-*` de solo lectura. Riesgo medio: un enfoque (el del riesgo dominante). Auth, seguridad, permisos, datos o migraciones, o más de 400 líneas: los cuatro.
6. **Corrección:** Claude verifica cada hallazgo en el código, resuelve con el dueño los que son de producto y encarga las correcciones al subagente escritor. Si hubo cambios, genera un prompt `validacion` (re-ejecuta las suites y confirma cada hallazgo como resuelto o no).
7. **Cierre:** Claude verifica cada reporte contra el diff y hace el commit de código y su commit `docs(vault)` de doc-sync (ver §2.4). Commits convencionales en español, sin `Co-Authored-By` y sin push.
8. **Limpieza:** con el lote cerrado, Claude borra los prompts y reportes del lote de `.external-agents/`. Antes, anota en el ODD o en el RF los hallazgos que quedan como seguimiento, para que no se pierdan con los reportes.

### 7.4. Contenido mínimo de cada prompt

`Contexto` (repo, rama, requisito, commits de referencia) · `Objetivo` · `Superficie permitida` (archivos que puede crear o tocar) · `Prohibido` (`.env`, commit, push, dependencias nuevas, código de producción si no está autorizado) · `Tareas` · `Comandos de verificación` · `Reporte` (ruta exacta y formato).

El reporte debe incluir: resumen, archivos tocados, comandos ejecutados con resultados observados (números), estado por criterio (CUMPLE / NO, con razón), hallazgos con severidad (BLOCKER / WARNING / SUGGESTION) y `archivo:línea`, y bloqueos. Nada se declara sin haberlo observado; Claude no acepta un reporte sin evidencia.

### 7.5. Encargo al subagente escritor

Cada encargo incluye: el objetivo y la decisión del dueño; los tests o contratos que debe cumplir (y que debe leer primero); el diseño con las decisiones ya resueltas; la superficie (archivos a crear, cambiar o borrar); las restricciones (tamaños de §6.14 y §6.15, sin cambios fuera del alcance); las prohibiciones (no ejecutar tests, no editar specs, no hacer commit ni push, no leer `.env`, no añadir dependencias); y el formato de la respuesta (archivos con sus líneas, dónde cumple cada contrato, desviaciones y `git status --short`).

### 7.6. Ejecución del agente externo por Claude (desde 2026-10-30, orquestación de Orca)

> Sustituye al lanzamiento sin interfaz con `agy -p` y `.permisos.json`, usado solo en el estreno (UX-10). Desde UX-11 funciona con la orquestación de Orca (skill `orchestration`), con un worker `antigravity` en una terminal visible de Orca.

- **Requisito previo.** Claude debe correr dentro de una terminal de Orca: `ORCA_TERMINAL_HANDLE` debe existir. Si `run-create` falla con `no_active_sender_terminal`, Claude se detiene y avisa al dueño. Nunca usa el handle de otra terminal, porque leería el buzón de otra sesión. En UX-11 `orca status --json` no traía `caller` y aun así `run-create` funcionó con el handle de la propia terminal, así que ese campo ausente no es motivo para detenerse.
- **Flujo**, desde la raíz del repo y con la guía cargada con `orca skills get orchestration`:
  1. Un Run por lote: `orca orchestration run-create --objective "<lote>" --json`.
  2. Un worker por prompt:
     ```bash
     orca orchestration worker-start \
       --spec "Lee y ejecuta exactamente el prompt .external-agents/<NN>-<lote>-<tipo>.md y deja el reporte en la ruta que indica." \
       --worktree current --agent antigravity --model <modelo> --json
     ```
  3. Espera con `orca orchestration check --wait --types "worker_done,escalation,question" --timeout-ms 540000 --json`, en segundo plano. Un `timedOut: true` sin mensajes no indica fallo: se revisa el estado del worker y se vuelve a esperar. Las preguntas se responden con `reply`.
  4. Tras un `worker_done`, Claude verifica el reporte (ver «Evidencia en archivos») y solo entonces hace `worker-release --dispatch <id>` y `check --ack <deliveryId>`.
  5. Compara `launch.requested` con `launch.effective` antes de afirmar qué modelo corrió.
- **Aviso `turn_start_unobserved`.** Si `worker-start` devuelve `state: outcome_unknown` con ese aviso, no reenvíes el prompt: lee la terminal con `orca terminal read --terminal <handle> --json`. En UX-11 el agente solo tardó más de 30 s en arrancar y después trabajó con normalidad.
- **Modelo según el tipo de prompt:**
  - `tests`, `verificacion` y `validacion` usan `gemini-3.8-flash-medium`: son tareas mecánicas, respaldadas por el JSON y el diff;
  - las `review-*` usan `gemini-3.8-flash-high`, y las de un mismo lote pueden ir en paralelo.
- **Una sola pasada de la suite completa.** El agente itera con el subconjunto de specs del lote y ejecuta la suite completa **una vez**, al final. En UX-10 la verificación tardó 49 min por repetir la suite completa cuatro veces. Cada prompt lista los dos comandos (subconjunto y suite completa) en `Comandos`. Con la máquina cargada, la suite completa se lanza con `--maxWorkers=4`.
- **Sin lista de permisos.** Con Orca no hay `.permisos.json`: el worker corre en una terminal visible y el dueño puede seguirlo. El control pasa al prompt, que dice "ejecuta solo los comandos de `Comandos`, escritos exactamente igual" y pide buscar texto con las herramientas de búsqueda del agente. Claude contrasta después el `git status` y el diff para detectar cualquier cambio fuera de la superficie permitida.
- **Evidencia en archivos, no en el resumen.** En el estreno (UX-10), el agente resumió bien los números, pero reescribió las rutas de los archivos en su tabla. Por eso:
  - toda ejecución de suite que deba clasificarse se lanza con `--reporter=json --outputFile=../../.external-agents/reportes/<NN>-<lote>-vitest.json`, y Claude lee ese JSON directamente;
  - Claude contrasta cada reporte con `git status`, `git diff` y los archivos de evidencia antes de aceptarlo.
- **Carga de la máquina.** La suite web completa tarda 2-5 min y, con la máquina cargada, aparecen `Test timed out in 5000ms` ajenos al lote. Un fallo fuera del lote solo cuenta como regresión si no es un tiempo agotado o si se repite al volver a ejecutar.
- Los prompts y reportes del lote se borran al cerrarlo (§7.3, paso 8). Si quedara algún `*.permisos.json` del estreno, se borra con ellos.


---

## 🛟 8. Reglas secundarias (contingencia): trabajo en Antigravity sin Claude Code ni Orca (desde 2026-11-01)

> Se aplican **solo** cuando no están disponibles las herramientas de §7 (Claude Code con subagentes por modelo y la orquestación de Orca). Cuando vuelvan, **prevalece §7**. Los contratos, el ciclo por lote, las lecciones y las convenciones de §6 no cambian.

- **Orquestador y arquitecto:** el agente principal de la sesión. Define contratos, valida cada diff y cada reporte contra el JSON de Vitest, `git status` y `git diff`, hace el doc-sync y los commits (sin push, sin `Co-Authored-By`). No escribe producción ni tests: los delega.
- **Subagentes** (herramienta `invoke_subagent`, para no acumular contexto en el orquestador):

  | Rol | Modelo | Esfuerzo |
  |---|---|---|
  | Exploración (mapeo de solo lectura) | Gemini 3.8 Flash | high |
  | Implementación (producción y correcciones) | Gemini 3.8 Flash | high |
  | Testing (fase roja, verificación, validación) | Gemini 3.8 Flash | medium |
  | Revisiones `review-*` | Gemini 3.8 Flash | high |

  Si la herramienta no permite fijar el esfuerzo, se indica en el prompt del subagente y se anota el modelo realmente usado.
- **Sin Orca:** no hay `lanzar.sh` ni Runs. Los prompts siguen en `.external-agents/<NN>-<lote>-<tipo>.md` y los reportes en `.external-agents/reportes/`; el subagente recibe «Lee y ejecuta el prompt … y deja el reporte en la ruta que indica».
- **Engram:** si las herramientas MCP `mem_*` no están disponibles, se usa la CLI (verificada el 2026-11-01): `engram search "<texto>"` y `engram save <título> <contenido> --type <tipo> --project guachafit`.
- **Mismas prohibiciones** que en §7.1: ningún subagente lee `.env`, hace commit ni push; los escritores no tocan specs ni los testers producción.
