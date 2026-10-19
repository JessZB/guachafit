---
id: ADR-023
titulo: "ADR-023: Casos de uso planos en servicios del API (fachada + contexto explícito)"
fecha: 2026-10-13
estado: aceptado
decisores:
  - "Dueño del producto"
  - "Tech Lead"
tags:
  - decision
  - adr
  - backend
  - arquitectura
---

# ADR-023: Casos de uso planos en servicios del API (fachada + contexto explícito)

## 1. Estado
`aceptado` (2026-10-13). Nació como borrador en la fase D del ODD `odd/tasks/modularizacion-api-ola1.md`
(prompt 110) y se aceptó al cerrarlo: revisión 4R (prompts 111–114) APTA y sin BLOCKERs, con la limpieza
del prompt 116. Lo aplican los 7 servicios de la Ola 1 y lo vigila
`apps/api/src/tamano-archivos.spec.ts`.

---

## 2. Contexto y Fuerzas en Juego
Siete servicios de `apps/api` superan las 900 líneas (medido 2026-10-13, `wc -l`,
base `fb87b92`):

| Servicio | Líneas |
|---|---|
| `finanzas.service.ts` | 3386 |
| `entrenamiento.service.ts` | 2221 |
| `alumnos.service.ts` | 1431 |
| `auth.service.ts` | 1279 |
| `antropometria.service.ts` | 975 |
| `cartera.service.ts` | 939 |
| `nutricion.service.ts` | 911 |

Además, los dos índices de contratos de `packages/shared` son monolitos
(`schemas/index.ts` 1779, `types/index.ts` 1435) y la web arrastraba el test
inestable W-52-2 (`EntrenamientoPage.cache`).

Tres restricciones limitan la partición: P1 prohíbe romper la fachada Nest
(los specs hacen `new Servicio(db, …)` y `createTestingModule`, y ninguno de
los dos puede romperse); P4 declara BLOCKER cualquier diferencia de
comportamiento en `api-finanzas` y `api-cartera` (RNF-002, ADR-003, ADR-020);
P3 exige semántica de datos idéntica (orden y forma de llamadas a `db`/`tx`,
transacciones, `FOR UPDATE`, `withTenant`, eventos, colas, HTTP y errores).

---

## 3. Decisión
Se adopta el patrón fachada + casos de uso planos de P1–P2 como convención
permanente del API, con la red de P3–P7:

1. **Fachada intacta (P1).** El servicio Nest conserva archivo, clase,
   decoradores, constructor idéntico (mismos parámetros, orden e
   `@Inject`/`@Optional`), todos los métodos públicos y los privados que los
   specs usan con `as any`. Esos métodos pasan a delegar.
2. **Casos de uso sin wiring nuevo (P2).** Las piezas viven en
   `src/modules/<modulo>/casos-<servicio>/` como funciones o clases planas y
   reciben un **contexto de dependencias explícito**
   (`{ db, withTenant, eventEmitter, … }`) que la fachada construye en su
   constructor. Prohibido registrarlas como providers nuevos de Nest.
3. **Semántica de datos idéntica (P3).** Orden y forma de llamadas a `db`/`tx`,
   límites de transacción, `FOR UPDATE`, `withTenant` (ADR-009, ADR-011),
   eventos (ADR-010), colas, HTTP y errores: todo intacto.
4. **Invariantes financieras intocables (P4).** En `api-finanzas` y
   `api-cartera` cualquier diferencia de comportamiento es BLOCKER.
5. **Tamaños (P5).** Fachada ≤ 400 (delegaciones), caso de uso ≤ 300
   (objetivo 250); la lógica pura sin I/O va en `casos-<servicio>/*-reglas.ts`.
6. **Red de tests (P6).** Specs existentes sin editar y con su conteo en
   verde; caracterización nueva en `apps/api/test/bdd/` para casos sin
   cobertura; e2e solo con `E2E_DATABASE_URL`.
7. **Contratos compartidos (P7).** Partir por dominio en
   `schemas/<dominio>.ts` y `types/<dominio>.ts`, con `index.ts` como barril
   (`export *`), sin renombrar ni cambiar la ruta `@guachafit/shared`.

---

## 4. Consecuencias
- **Positivas:** tocar un caso de uso ya no arrastra a otro; las 7 fachadas
  quedan ≤ 400 (finanzas 3386 → 282, entrenamiento 2221 → 334, alumnos
  1431 → 240, auth 1279 → 194, antropometría 975 → 171, cartera 939 → 251,
  nutrición 911 → 182) y el caso de uso más grande tiene 289 líneas; los dos
  índices de shared quedan como barriles de 11 líneas (exports 169 y 142
  idénticos); W-52-2 resuelto (presupuesto de 20 s + reintento acotado).
- **Costes y límites:** cada fachada construye el contexto a mano (objeto
  explícito en lugar de DI); los 8 archivos de la Ola 2 (401–899 líneas)
  quedan como excepciones explícitas del guardián con su propio ODD posterior.
- **Implementación:** `apps/api/src/modules/*/casos-*/` (7 módulos),
  `packages/shared/src/schemas/` y `types/` (11 dominios cada uno),
  reportes `.opencode-prompts/reportes/{api-*,shared-*,web-flake-cache}/`.

---

## 5. Alternativas consideradas
- **Registrar cada caso de uso como provider de Nest (DI por caso):**
  descartada. Cambiaría el wiring y rompería los specs que hacen
  `new Servicio(db, …)` y `createTestingModule` (P1: el constructor y sus
  `@Inject` son contrato). La DI solo movería el acoplamiento al contenedor
  sin partir la responsabilidad real.
- **CQRS (bus de comandos/consultas + handlers):** descartada. Añade
  maquinaria de runtime (bus, middlewares, registro de handlers) para un
  problema de tamaño de archivo, no de despacho; cambia el wiring observable
  y eleva el riesgo de migración en los módulos financieros bajo P4. El
  trade-off formal (separación comando/consulta explícita) no compensa la
  indirección y la curva de aprendizaje cuando funciones planas con contexto
  explícito resuelven lo mismo sin piezas nuevas.
- **Partir por capa técnica (un repositorio de lecturas, otro de
  escrituras):** descartada. Recrea archivos grandes por capa y los cambios
  dejan de ser quirúrgicos por funcionalidad: una feature toca ambas capas.
  El corte por caso de uso deja una responsabilidad por archivo.
- **No partir y solo documentar los monolitos:** descartada. Un archivo de
  3386 líneas hace que cualquier cambio arrastre casos no relacionados y que
  la revisión no pueda ser quirúrgica; perpetúa el riesgo bajo P4 en lugar de
  acotarlo.
- **Contratos: renombrar rutas públicas o un único cajón `common/`:**
  descartada. P7 conserva la ruta `@guachafit/shared` y los barriles
  preservan los 169 + 142 exports; `tsc` detecta los conflictos de
  `export *`. Los 3 auxiliares no exportados duplicados por el split viven
  una sola vez en `schemas/campos-internos.ts`, fuera del barril.

---

## 6. Lo aprendido en los reportes (fases M, F y S)
- **La fachada intacta sostiene la red:** constructores, decoradores, métodos
  públicos, exports de módulo y privados usados con `as any` quedaron
  intactos, sin cambios en ningún `*.module.ts` ni spec existente; los
  conteos de llamadas ( `withTenant(`, `FOR UPDATE`, transacciones, eventos,
  colas, `throw new`, `insert`/`update`/`delete`, `Math.round`/`toFixed`,
  códigos de error) son idénticos entre el servicio original y la fachada con
  sus casos.
- **Un prompt que mueve código debe ejecutar la suite completa de los
  paquetes que lo consumen, no solo el typecheck.** Dos specs leían el código
  fuente por ruta (`api2-errores-claros` sobre `schemas/index.ts`,
  `rf005-rf008` sobre `types/index.ts`); el split los dejó en rojo y la
  corrección 115 los pasó a escanear el directorio (40/40 y 36/36, mismos
  tests y aserciones, 224 literales de jerga idénticos). Excepción a P6
  autorizada y documentada.
- **E2E omitidos sin `E2E_DATABASE_URL`:** se reportan como omitidos, sin
  inventar resultados (API 1801 en verde x3 con 29 omitidos; web 2105/2105).
- **W-52-2:** el flake de `EntrenamientoPage.cache` se estabilizó con
  presupuesto de 20 s y reintento acotado del clic, con los 6 `expect`
  intactos; debe pasar en verde dentro de la suite completa sin re-corridas
  (R12).

## 7. Incidente posterior: dependencias del constructor importadas solo como tipo (2026-10-19)
- **Qué pasó:** el API no arrancaba (`Nest can't resolve dependencies of the AntropometriaService (DRIZZLE_DB, ?, Function, WITH_TENANT)`). En el refactor de la fachada (`43a4048`), `R2StorageService` y `EventEmitter2` pasaron a `import type`. TypeScript borra esos imports al compilar, `emitDecoratorMetadata` escribe `Function` como tipo del parámetro y Nest no puede inyectarlo.
- **Por qué no lo vio nadie:**
  - los specs crean las fachadas con `new Servicio(...)` y nunca pasan por la inyección de Nest;
  - vitest compila con esbuild, que no emite `design:paramtypes`, así que ni un `Test.createTestingModule` resolvería las dependencias, estuvieran rotas o no;
  - la verificación comparó el texto del constructor (idéntico), pero no sus imports.
- **Corrección:** los dos imports vuelven a ser imports de valor, como antes del refactor.
- **Guardián:** `apps/api/src/inyeccion-dependencias.spec.ts` falla si un `@Injectable`, `@Controller` o `@Processor` anota un parámetro del constructor sin `@Inject(<token>)` con un tipo importado solo como tipo. Se comprobó que habría detectado este caso.
- **Regla para la P1 de futuras olas:** "constructor idéntico" incluye los imports de los tipos de sus parámetros. Un parámetro que Nest resuelve por clase se importa siempre como valor.
