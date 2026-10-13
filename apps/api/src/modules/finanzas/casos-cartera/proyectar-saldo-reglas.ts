/**
 * Reglas puras de proyección de saldos USD → Bs (sub-lote 1, sin I/O).
 *
 * La proyección informativa usa el override del alumno cuando es una tasa
 * utilizable (> 0); si no, la tasa activa del coach. Sin tasa utilizable el
 * resultado es `null` honesto, nunca un valor inventado.
 */

/** Elige la tasa aplicable: override del alumno > tasa base del coach. */
export function elegirTasaAplicada(
  tasaOverride: string | null,
  tasaBase: string | null
): string | null {
  const tasa =
    tasaOverride && parseFloat(tasaOverride) > 0 ? tasaOverride : tasaBase;
  if (!tasa || parseFloat(tasa) <= 0) {
    return null;
  }
  return tasa;
}

export interface ProyeccionSaldo {
  tasaAplicada: string | null;
  saldoPendienteBs: string | null;
}

/**
 * Proyecta un saldo en USD a Bs con la tasa aplicable.
 * `proyectarVES` se inyecta como función para mantener la regla sin I/O.
 */
export function proyectarSaldoCon(
  proyectarVES: (saldoUsd: string, tasa: string) => string,
  saldoUsd: string,
  tasaOverride: string | null,
  tasaBase: string | null
): ProyeccionSaldo {
  const tasa = elegirTasaAplicada(tasaOverride, tasaBase);
  if (!tasa) {
    return { tasaAplicada: null, saldoPendienteBs: null };
  }
  return {
    tasaAplicada: tasa,
    saldoPendienteBs: proyectarVES(saldoUsd, tasa),
  };
}
