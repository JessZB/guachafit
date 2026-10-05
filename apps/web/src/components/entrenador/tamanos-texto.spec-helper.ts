/**
 * Helper de tests: tamaños de texto arbitrarios por debajo de 12px (`text-[11px]`,
 * `text-[0.7rem]`…). Los de la escala de Tailwind (`text-xs` = 12px) no cuentan.
 */
export function tamanosMenoresA12px(texto: string): string[] {
  const menores: string[] = [];
  for (const [clase, valor, unidad] of texto.matchAll(/text-\[(\d*\.?\d+)(px|rem)\]/g)) {
    const px = unidad === 'rem' ? Number(valor) * 16 : Number(valor);
    if (px < 12) menores.push(clase);
  }
  return menores;
}
