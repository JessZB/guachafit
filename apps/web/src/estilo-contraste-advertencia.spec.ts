import { describe, expect, it } from 'vitest';

/** Todo `apps/web/src` con extensiones de código y estilos, excluyendo specs (`?raw`). */
const FUENTES_SRC = import.meta.glob<string>(
  ['./**/*.{ts,tsx,css,html}', '!./**/*.spec.{ts,tsx}'],
  { query: '?raw', import: 'default', eager: true }
);

function rutaRelativaAWeb(clave: string): string {
  return clave.replace(/^\.\//, 'src/').replace(/^\.\.\//, '');
}

export function buscarContrasteAdvertenciaInvalido(): string[] {
  const coincidencias: string[] = [];

  for (const [clave, contenido] of Object.entries(FUENTES_SRC)) {
    const ruta = rutaRelativaAWeb(clave);
    const lineas = contenido.split(/\r?\n/);
    lineas.forEach((linea, indice) => {
      if (linea.includes('bg-warning/') && linea.includes('text-warning-foreground')) {
        coincidencias.push(`${ruta}:${indice + 1}: ${linea.trim()}`);
      }
    });

    // Detección en bloques que puedan abarcar template strings multilínea
    const bloqueRegex = /`([^`]+)`|"([^"]+)"|'([^']+)'/gs;
    let match: RegExpExecArray | null;
    while ((match = bloqueRegex.exec(contenido)) !== null) {
      const texto = match[1] ?? match[2] ?? match[3] ?? '';
      if (texto.includes('bg-warning/') && texto.includes('text-warning-foreground')) {
        const subtextoPrevio = contenido.substring(0, match.index);
        const numLinea = subtextoPrevio.split(/\r?\n/).length;
        const entrada = `${ruta}:${numLinea}: ${texto.replace(/\s+/g, ' ').trim()}`;
        if (!coincidencias.some((c) => c.startsWith(`${ruta}:${numLinea}:`))) {
          coincidencias.push(entrada);
        }
      }
    }
  }

  return coincidencias;
}

describe('Guardián de contraste advertencia (G3)', () => {
  it('R17: ningún archivo fuente combina bg-warning/ con text-warning-foreground', () => {
    const coincidencias = buscarContrasteAdvertenciaInvalido();
    expect(coincidencias).toEqual([]);
  });
});
