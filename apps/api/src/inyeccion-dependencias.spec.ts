/**
 * Guardián de dependencias inyectables (incidente: el API no arrancaba con
 * `Nest can't resolve dependencies of the AntropometriaService
 * (DRIZZLE_DB, ?, Function, WITH_TENANT)`).
 *
 * Causa: en el refactor `43a4048`, `R2StorageService` y `EventEmitter2` pasaron a
 * `import type` en `antropometria.service.ts`. `import type` se borra al compilar, así que
 * `emitDecoratorMetadata` escribe `Function` como tipo del parámetro y Nest no puede
 * inyectarlo. Los specs no lo detectaron porque crean los servicios con `new Servicio(...)`
 * y nunca pasan por la inyección de Nest.
 *
 * Lo que vigila: para cada `.ts` de `src/` (salvo specs) con `@Injectable(`, `@Controller(`
 * o `@Processor(`, ningún parámetro del constructor sin `@Inject*()` puede anotarse con un
 * tipo importado solo como tipo (`import type { … }` o `type X` dentro de `import { … }`).
 * Sin el token explícito, Nest resuelve por el metadato del tipo, y un tipo borrado rompe
 * el arranque. Falla listando `archivo: Tipo` por cada caso.
 *
 * La recolección usa `node:fs` como `tamano-archivos.spec.ts` (el paquete del API tiene
 * tipos de Node). Resuelve `src/` igual que ese spec. No toca producción ni arranca Nest.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

/** `src/` del paquete del API, resuelto desde el directorio de trabajo. */
function raizSrcApi(): string {
  const desdePaquete = path.resolve(process.cwd(), 'src');
  if (fs.existsSync(desdePaquete)) return desdePaquete;
  return path.resolve(process.cwd(), 'apps/api/src');
}

/** Cada `.ts` bajo `src/` con decorador gestionado por Nest, salvo specs. */
function recolectarInyectables(): Map<string, string> {
  const raiz = raizSrcApi();
  const fuentes = new Map<string, string>();
  const MARCA_NEST = /@(Injectable|Controller|Processor)\(/;

  function visitar(directorio: string): void {
    for (const entrada of fs.readdirSync(directorio, { withFileTypes: true })) {
      const absoluta = path.join(directorio, entrada.name);
      if (entrada.isDirectory()) {
        visitar(absoluta);
        continue;
      }
      if (!absoluta.endsWith('.ts')) continue;
      if (absoluta.endsWith('.spec.ts')) continue;
      const contenido = fs.readFileSync(absoluta, 'utf8');
      if (!MARCA_NEST.test(contenido)) continue;
      const relativa = `src/${path.relative(raiz, absoluta).split(path.sep).join('/')}`;
      fuentes.set(relativa, contenido);
    }
  }

  visitar(raiz);
  return fuentes;
}

/**
 * Nombres importados solo como tipo: `import type { A, B as C }`,
 * `import type Foo`, `import type * as ns` y `type X` dentro de `import { … }`.
 */
function tiposSoloTipo(contenido: string): Set<string> {
  const tipos = new Set<string>();
  const VALIDO = /^[A-Za-z_$][\w$]*$/;

  for (const m of contenido.matchAll(/import\s+type\s*\{([\s\S]*?)\}\s*from\s*['"][^'"]*['"]/g)) {
    for (const pieza of m[1].split(',')) {
      const nombre = pieza.trim().split(/\s+as\s+/).pop()?.trim() ?? '';
      if (VALIDO.test(nombre)) tipos.add(nombre);
    }
  }
  for (const m of contenido.matchAll(/import\s+type\s+(?:\*\s*as\s+)?([A-Za-z_$][\w$]*)/g)) {
    tipos.add(m[1]);
  }
  for (const m of contenido.matchAll(/import\s*\{([\s\S]*?)\}\s*from\s*['"][^'"]*['"]/g)) {
    for (const pieza of m[1].split(',')) {
      const mm = pieza.trim().match(/^type\s+([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
      if (mm) tipos.add(mm[2] ?? mm[1]);
    }
  }
  return tipos;
}

/**
 * Divide la lista de parámetros del constructor por las comas de nivel superior
 * (respeta paréntesis/corchetes/llaves, genéricos `<…>` y comillas, para no romper
 * `@Inject(forwardRef(() => X))` ni `Map<string, Foo>`).
 */
function dividirParametros(lista: string): string[] {
  const partes: string[] = [];
  let actual = '';
  let parentesis = 0;
  let corchetes = 0;
  let llaves = 0;
  let genericos = 0;
  let comilla: string | null = null;
  let anteriorNoEspacio = '';
  const esPalabra = (c: string) => /[\w$)\]]/.test(c);

  for (let i = 0; i < lista.length; i++) {
    const c = lista[i];
    if (comilla) {
      actual += c;
      if (c === '\\') actual += lista[++i] ?? '';
      else if (c === comilla) comilla = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      comilla = c;
      actual += c;
      continue;
    }
    if (c === '(') parentesis++;
    else if (c === ')') parentesis = Math.max(0, parentesis - 1);
    else if (c === '[') corchetes++;
    else if (c === ']') corchetes = Math.max(0, corchetes - 1);
    else if (c === '{') llaves++;
    else if (c === '}') llaves = Math.max(0, llaves - 1);
    else if (c === '<' && lista[i + 1] !== '=' && esPalabra(anteriorNoEspacio)) genericos++;
    else if (c === '>' && lista[i + 1] !== '=' && anteriorNoEspacio !== '=' && genericos > 0)
      genericos--;
    if (
      c === ',' &&
      parentesis === 0 &&
      corchetes === 0 &&
      llaves === 0 &&
      genericos === 0
    ) {
      partes.push(actual);
      actual = '';
      continue;
    }
    actual += c;
    if (c !== ' ' && c !== '\t' && c !== '\n' && c !== '\r') anteriorNoEspacio = c;
  }
  if (actual.trim() !== '') partes.push(actual);
  return partes;
}

/**
 * Tipos anotados en parámetros del constructor SIN token explícito. Nest resuelve esos
 * parámetros por el metadato del tipo, así que el identificador base (lo que va antes de
 * `<`, `[`, `|`…) es el token. Cada parámetro se casa ANCLADO al inicio (los decoradores,
 * si los hay, quedan a la vista y `@Inject*()` descarta el parámetro): así un `@Inject`
 * previo nunca se salta. Heurística documentada: el tipo se corta en `=`, `;`, `,` o `)`
 * y solo cuenta si empieza por un identificador.
 */
function tiposDeParametrosSinInject(contenido: string): string[] {
  const tipos: string[] = [];
  const PARAMETRO =
    /^\s*((?:@[\w$]+\s*(?:\((?:[^()]*|\([^()]*\))*\))?\s*)*)((?:(?:private|public|protected|readonly)\s+)*)([\w$]+)\s*(\?)?:\s*([^=;,)]+)/;
  for (const ctor of contenido.matchAll(/constructor\s*\(([\s\S]*?)\)\s*\{/g)) {
    for (const parte of dividirParametros(ctor[1])) {
      const p = parte.match(PARAMETRO);
      if (!p) continue;
      if (/@Inject\w*\(/.test(p[1])) continue;
      const base = p[5].trim().match(/^([\w$]+)/);
      if (base) tipos.push(base[1]);
    }
  }
  return tipos;
}

/**
 * Tipos usados en el constructor sin `@Inject*()` pero importados solo como tipo.
 * En orden de aparición, sin duplicados. Vacío = la inyección por metadatos resuelve.
 */
export function detectarTiposBorradosEnConstructores(contenido: string): string[] {
  const soloTipo = tiposSoloTipo(contenido);
  if (soloTipo.size === 0) return [];
  const hallados: string[] = [];
  for (const tipo of tiposDeParametrosSinInject(contenido)) {
    if (soloTipo.has(tipo) && !hallados.includes(tipo)) hallados.push(tipo);
  }
  return hallados;
}

/** `archivo: Tipo1, Tipo2` por cada fuente con tipos borrados en el constructor. */
function buscarCasos(fuentes: Map<string, string>): string[] {
  const casos: string[] = [];
  for (const [ruta, contenido] of fuentes) {
    const tipos = detectarTiposBorradosEnConstructores(contenido);
    if (tipos.length > 0) casos.push(`${ruta}: ${tipos.join(', ')}`);
  }
  return casos.sort();
}

describe(
  'Guardián DI: ningún constructor Nest usa un tipo importado solo como tipo sin @Inject',
  // La recolección recorre `src/` en frío (~12 s medidos en tamano-archivos): una sola vez.
  { timeout: 30000 },
  () => {
    let fuentes: Map<string, string>;

    beforeAll(() => {
      fuentes = recolectarInyectables();
    });

    it('ningún @Injectable/@Controller/@Processor inyecta por metadatos un tipo borrado', () => {
      expect(buscarCasos(fuentes)).toEqual([]);
    });

    it('el recorrido cubre los servicios con constructor del API', () => {
      const rutas = [...fuentes.keys()];
      expect(rutas.length).toBeGreaterThan(20);
      expect(rutas).toContain('src/modules/antropometria/antropometria.service.ts');
    });

    it('el detector encuentra el patrón del incidente y respeta @Inject', () => {
      const roto =
        `import type { Foo } from './foo';\n` +
        `import { Injectable, Inject } from '@nestjs/common';\n` +
        `@Injectable()\n` +
        `export class A {\n` +
        `  constructor(private foo: Foo) {}\n` +
        `}\n`;
      expect(detectarTiposBorradosEnConstructores(roto)).toEqual(['Foo']);

      const conToken = roto.replace(
        'constructor(private foo: Foo)',
        "constructor(@Inject('TOKEN') private foo: Foo)",
      );
      expect(detectarTiposBorradosEnConstructores(conToken)).toEqual([]);
    });

    it('el detector habría fallado sobre la versión rota de antropometria.service.ts', () => {
      const actual = fuentes.get('src/modules/antropometria/antropometria.service.ts');
      expect(actual).toBeDefined();
      // Reconstruye el incidente en memoria sobre el archivo actual, sin tocar producción:
      // los dos imports de valor vuelven a `import type`.
      const rota = actual!
        .replace(
          `import { EventEmitter2 } from '@nestjs/event-emitter';`,
          `import type { EventEmitter2 } from '@nestjs/event-emitter';`,
        )
        .replace(
          `import { R2StorageService } from './r2-storage.service';`,
          `import type { R2StorageService } from './r2-storage.service';`,
        );
      expect(rota).not.toBe(actual);
      // En orden de parámetros del constructor: r2StorageService y luego eventEmitter.
      // `Database` y `WithTenantFn` también son `import type`, pero llevan @Inject y no cuentan.
      expect(detectarTiposBorradosEnConstructores(rota)).toEqual([
        'R2StorageService',
        'EventEmitter2',
      ]);
    });
  },
);
