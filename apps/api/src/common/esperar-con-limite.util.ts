/**
 * Espera una promesa como máximo `ms` milisegundos, sin lanzar nunca.
 *
 * Existe porque con Redis caído (`maxRetriesPerRequest: null`) una llamada a BullMQ queda
 * pendiente para siempre: quien la espera necesita una respuesta acotada.
 *
 * - El temporizador se limpia siempre (no deja nada vivo en el event loop).
 * - Si vence, se llama a `alCancelar` para que quien encola descarte el trabajo pendiente (p. ej.
 *   que no llegue a encolar algo con un enlace de un solo uso) y se dejan de retener referencias.
 * - Un rechazo posterior de la promesa original se absorbe (no hay rechazos sin manejar).
 */
export type ResultadoConLimite<T> =
  | { ok: true; valor: T }
  | { ok: false; motivo: 'tiempo' }
  | { ok: false; motivo: 'error'; error: unknown };

export function esperarConLimite<T>(
  promesa: Promise<T>,
  ms: number,
  alCancelar?: () => void
): Promise<ResultadoConLimite<T>> {
  return new Promise((resolve) => {
    let terminado = false;
    const temporizador = setTimeout(() => {
      if (terminado) return;
      terminado = true;
      alCancelar?.();
      resolve({ ok: false, motivo: 'tiempo' });
    }, ms);

    promesa.then(
      (valor) => {
        if (terminado) return;
        terminado = true;
        clearTimeout(temporizador);
        resolve({ ok: true, valor });
      },
      (error: unknown) => {
        if (terminado) return;
        terminado = true;
        clearTimeout(temporizador);
        resolve({ ok: false, motivo: 'error', error });
      }
    );
  });
}
