/**
 * RNF-002 §4: registro de respuestas idempotentes en memoria.
 *
 * Misma clave => misma respuesta sin reaplicar la mutación. Antes era un `Map` sin límite que
 * crecía con cada petición; ahora cada entrada caduca (TTL, 24 h por defecto) y el registro tiene
 * un tope de entradas: al llenarse expulsa primero lo caducado y luego lo más antiguo.
 *
 * Alcance: memoria del proceso (cubre reintentos inmediatos por lag de red o timeouts). Un
 * reinicio del API o varias réplicas no comparten el registro.
 */

export const TTL_IDEMPOTENCIA_MS = 24 * 60 * 60 * 1000;
export const MAX_ENTRADAS_IDEMPOTENCIA = 10_000;

export interface OpcionesRegistroIdempotencia {
  /** Vida de cada respuesta guardada (ms). */
  ttlMs?: number;
  /** Tope de respuestas guardadas a la vez. */
  maxEntradas?: number;
  /** Reloj inyectable para tests (ms desde epoch). */
  ahora?: () => number;
}

interface Entrada {
  valor: unknown;
  expiraEn: number;
}

export class RegistroIdempotencia {
  private readonly ttlMs: number;
  private readonly maxEntradas: number;
  private readonly ahora: () => number;
  /** El orden de inserción del `Map` es el orden de antigüedad (se reinserta al guardar). */
  private readonly entradas = new Map<string, Entrada>();
  /** Ejecuciones en curso: un reintento simultáneo espera a la primera en vez de repetirla. */
  private readonly enCurso = new Map<string, Promise<unknown>>();

  constructor(opciones: OpcionesRegistroIdempotencia = {}) {
    this.ttlMs = opciones.ttlMs ?? TTL_IDEMPOTENCIA_MS;
    this.maxEntradas = Math.max(1, opciones.maxEntradas ?? MAX_ENTRADAS_IDEMPOTENCIA);
    this.ahora = opciones.ahora ?? (() => Date.now());
  }

  get tamano(): number {
    return this.entradas.size;
  }

  /** Copia de la respuesta guardada para la clave, o `null` si no existe o caducó. */
  leer<T>(clave: string | null | undefined): T | null {
    if (!clave) return null;
    const entrada = this.entradas.get(clave);
    if (!entrada) return null;
    if (entrada.expiraEn <= this.ahora()) {
      this.entradas.delete(clave);
      return null;
    }
    // Copia defensiva: el reintento nunca comparte referencias mutables con la respuesta original.
    return copiar(entrada.valor) as T;
  }

  guardar(clave: string | null | undefined, valor: unknown): void {
    if (!clave) return;
    this.entradas.delete(clave);
    this.purgarCaducadas();
    while (this.entradas.size >= this.maxEntradas) {
      const masAntigua = this.entradas.keys().next().value as string;
      this.entradas.delete(masAntigua);
    }
    this.entradas.set(clave, { valor: copiar(valor), expiraEn: this.ahora() + this.ttlMs });
  }

  /**
   * Ejecuta `operacion` una sola vez por clave: devuelve la respuesta guardada si existe, se une a
   * una ejecución en curso con la misma clave y guarda el resultado solo si terminó bien (un fallo
   * no se guarda: el reintento vuelve a ejecutar). Sin clave, ejecuta siempre.
   */
  async ejecutar<T>(clave: string | null | undefined, operacion: () => Promise<T>): Promise<T> {
    if (!clave) return operacion();

    const guardada = this.leer<T>(clave);
    if (guardada !== null) return guardada;

    const pendiente = this.enCurso.get(clave);
    if (pendiente) return copiar(await pendiente) as T;

    const promesa = operacion();
    this.enCurso.set(clave, promesa);
    try {
      const resultado = await promesa;
      this.guardar(clave, resultado);
      return resultado;
    } finally {
      this.enCurso.delete(clave);
    }
  }

  private purgarCaducadas(): void {
    const ahora = this.ahora();
    for (const [clave, entrada] of this.entradas) {
      if (entrada.expiraEn <= ahora) this.entradas.delete(clave);
    }
  }
}

function copiar(valor: unknown): unknown {
  return valor === undefined ? undefined : JSON.parse(JSON.stringify(valor));
}
