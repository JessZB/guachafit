/**
 * Lote E9 (RF-001 §7.10): registro en memoria de los envíos directos en vuelo por grupo causal
 * (`sesion:{id}`, el mismo grupo que `grupoCausalDeMutacion` en `offline-db`).
 *
 * Mientras un envío directo de una sesión va por la red, los cambios siguientes de esa sesión
 * se encolan y la cola no saca nada del grupo; al liberarse, se avisa para drenarla. Así un
 * cambio posterior nunca llega al servidor antes que uno anterior del mismo dispositivo.
 * Límite documentado: no coordina pestañas ni dispositivos distintos.
 */

type OyenteLiberacion = (grupo: string) => void;

const enVueloPorGrupo = new Map<string, number>();
const oyentes = new Set<OyenteLiberacion>();
let ultimaMarcaMs = 0;

/**
 * Reserva un envío en vuelo para el grupo. Devuelve `liberar`, idempotente: llamarlo dos veces
 * cuenta una sola vez y el contador nunca baja de cero.
 */
export function registrarEnvioEnVuelo(grupo: string): () => void {
  enVueloPorGrupo.set(grupo, (enVueloPorGrupo.get(grupo) ?? 0) + 1);
  let liberado = false;
  return () => {
    if (liberado) return;
    liberado = true;
    const restantes = (enVueloPorGrupo.get(grupo) ?? 0) - 1;
    if (restantes > 0) {
      enVueloPorGrupo.set(grupo, restantes);
      return;
    }
    enVueloPorGrupo.delete(grupo);
    oyentes.forEach((oyente) => {
      try {
        oyente(grupo);
      } catch {
        // Un oyente que falla no impide avisar a los demás.
      }
    });
  };
}

export function hayEnvioEnVuelo(grupo: string): boolean {
  return (enVueloPorGrupo.get(grupo) ?? 0) > 0;
}

/** Copia de los grupos con envíos en vuelo (mutarla no cambia el registro). */
export function gruposConEnvioEnVuelo(): Set<string> {
  return new Set(enVueloPorGrupo.keys());
}

/** Avisa cada vez que un grupo se queda sin envíos en vuelo. Devuelve la baja. */
export function alLiberarGrupo(oyente: OyenteLiberacion): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

/**
 * Marca de tiempo de una acción, estrictamente creciente en todo el módulo: dos toques en el
 * mismo milisegundo (o un reloj que retrocede) conservan su orden en la cola.
 */
export function marcaDeAccionMs(ahora: number = Date.now()): number {
  ultimaMarcaMs = Math.max(ahora, ultimaMarcaMs + 1);
  return ultimaMarcaMs;
}

/**
 * Solo para tests: vacía el registro y la última marca. Los oyentes se conservan para no
 * perder la suscripción que `offline-sync` hace al cargar el módulo.
 */
export function reiniciarEnviosEnVueloParaTests(): void {
  enVueloPorGrupo.clear();
  ultimaMarcaMs = 0;
}
