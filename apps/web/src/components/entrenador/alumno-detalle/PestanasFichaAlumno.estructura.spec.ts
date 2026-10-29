import { describe, expect, it } from 'vitest';
import fuente from './PestanasFichaAlumno.tsx?raw';

describe('PestanasFichaAlumno · estructura del wrapper (ADR-022 / UX-01)', () => {
  it('1. importa BarraTabsSegmentada desde ../../ui/BarraTabsSegmentada', () => {
    expect(fuente).toMatch(
      /import\s+{[^}]*BarraTabsSegmentada[^}]*}\s+from\s+['"]\.\.\/\.\.\/ui\/BarraTabsSegmentada['"]/
    );
  });

  it('2. no contiene la cadena <button (los botones los pinta el átomo)', () => {
    expect(fuente).not.toContain('<button');
  });

  it('3. no contiene role="img" ni grid-cols-5 (el indicador y las columnas son del átomo)', () => {
    expect(fuente).not.toContain('role="img"');
    expect(fuente).not.toContain('grid-cols-5');
  });

  it('4. tiene como máximo 60 líneas contando split(/\\r?\\n/).length', () => {
    const lineas = fuente.split(/\r?\n/).length;
    expect(lineas).toBeLessThanOrEqual(60);
  });

  it('5. sigue pasando ariaLabel "Pestañas de la ficha del alumno" y el texto "Saldo pendiente"', () => {
    expect(fuente).toContain('Pestañas de la ficha del alumno');
    expect(fuente).toContain('Saldo pendiente');
  });
});
