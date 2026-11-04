import { useCallback, useEffect, useRef, useState } from 'react';
import * as reloj from '../../../lib/cronometro-descanso';
import type { EstadoCronometro } from '../../../lib/cronometro-descanso';

/**
 * Cronómetro de descanso (RF-001, ADR-021). El estado es un instante absoluto de fin (ver
 * `lib/cronometro-descanso.ts`): sobrevive a recargas y a la pantalla bloqueada. Este hook solo
 * conecta esa lógica pura con React, el reloj, `localStorage` y los avisos.
 */
export interface OpcionesCronometro {
  sesionId: string | null;
  /** `false` en modo demo: el cronómetro funciona en memoria y no escribe en `localStorage`. */
  persistir: boolean;
  /** Por defecto `window.localStorage` dentro de un try/catch. */
  almacen?: Storage | null;
  /** Aviso de fin (vibración + beep); se llama UNA sola vez por descanso. */
  alTerminar?: () => void;
  /** Solo cambios de duración hechos por el usuario sobre un cronómetro con serie. */
  alCambiarDuracion?: (serieId: string, segundos: number) => void;
}

export interface CronometroDescanso {
  abierto: boolean;
  restanteMs: number;
  duracionMs: number;
  pausado: boolean;
  terminado: boolean;
  serieId: string | null;
  abrirParaSerie(serieId: string, segundos: number): void;
  abrirLibre(segundos?: number): void;
  pausar(): void;
  reanudar(): void;
  ajustar(deltaSegundos: number): void;
  elegirPreset(segundos: number): void;
  reiniciar(): void;
  /** Detiene, borra el estado persistido y deja `serieId` en `null`: no vuelve a avisar. */
  cerrar(): void;
}

const TICK_MS = 250;
const DEBOUNCE_DURACION_MS = 1000;
const DURACION_LIBRE_SEGUNDOS = 90;

interface Vista {
  estado: EstadoCronometro | null;
  /** Instante del último cálculo: con él se derivan restante y `terminado` sin leer el reloj en render. */
  ahoraMs: number;
}

/** Segundo que muestra el widget (mismo redondeo que `formatearRestante`). */
function segundoMostrado(e: EstadoCronometro, ahoraMs: number): number {
  return reloj.restanteSegundosCeil(e, ahoraMs);
}

/** `true` si entre ambos instantes no cambia el segundo mostrado ni el estado terminado. */
function sinCambioVisible(e: EstadoCronometro, antesMs: number, ahoraMs: number): boolean {
  return (
    segundoMostrado(e, antesMs) === segundoMostrado(e, ahoraMs) &&
    reloj.estaTerminado(e, antesMs) === reloj.estaTerminado(e, ahoraMs)
  );
}

/** Almacén efectivo: `null` si no se persiste, no hay sesión o el navegador bloquea el acceso. */
function almacenDe(o: OpcionesCronometro): Storage | null {
  if (!o.persistir || !o.sesionId) return null;
  if (o.almacen !== undefined) return o.almacen;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function useCronometroDescanso(opciones: OpcionesCronometro): CronometroDescanso {
  const { sesionId, persistir, almacen } = opciones;
  const [vista, setVista] = useState<Vista>({ estado: null, ahoraMs: 0 });
  // La verdad síncrona del estado: varias acciones en un mismo evento se encadenan sin esperar render.
  const estadoRef = useRef<EstadoCronometro | null>(null);
  const opcionesRef = useRef(opciones);
  opcionesRef.current = opciones;
  // El pendiente guarda la sesión y el callback con los que se programó: si la sesión cambia antes
  // de entregarlo, el ajuste va al callback de SU sesión y no al de la nueva.
  const pendienteRef = useRef<{
    timer: ReturnType<typeof setTimeout>;
    serieId: string;
    segundos: number;
    sesionId: string | null;
    alCambiarDuracion: OpcionesCronometro['alCambiarDuracion'];
  } | null>(null);

  /** Fija el estado, lo persiste y, si acaba de terminar, avisa UNA vez (fuera de updaters). */
  const comprometer = useCallback((siguiente: EstadoCronometro | null, ahoraMs: number) => {
    let final = siguiente;
    let avisar = false;
    if (final && reloj.debeAvisarFin(final, ahoraMs)) {
      // Terminado hace mucho (pantalla bloqueada, pestaña oculta): se marca como notificado y se
      // persiste, pero no suena; un aviso tardío solo confunde.
      avisar = !reloj.avisoTardio(final, ahoraMs);
      final = reloj.marcarNotificado(final);
    }
    estadoRef.current = final;
    const o = opcionesRef.current;
    if (o.sesionId) reloj.guardarCronometro(almacenDe(o), o.sesionId, final);
    setVista({ estado: final, ahoraMs });
    if (avisar) {
      // Un fallo del aviso (Web Audio bloqueado, vibración no disponible) no debe romper el tick
      // ni el evento que lo dispara; `notificadoFin` ya quedó true y persistido, no se reintenta.
      try {
        o.alTerminar?.();
      } catch (error) {
        console.warn('No se pudo emitir el aviso de fin del descanso:', error);
      }
    }
  }, []);

  /**
   * Recalcula desde el reloj. El tick (`forzar = false`) solo vuelve a renderizar si cambió algo
   * visible (segundo mostrado, pausa o fin); visibilitychange y pageshow (`forzar = true`) siempre
   * fijan el valor real.
   */
  const sincronizar = useCallback(
    (forzar: boolean) => {
      const e = estadoRef.current;
      if (!e) return;
      const ahoraMs = Date.now();
      if (reloj.debeAvisarFin(e, ahoraMs)) {
        comprometer(e, ahoraMs);
        return;
      }
      setVista((prev) => {
        if (!forzar && prev.estado === e && sinCambioVisible(e, prev.ahoraMs, ahoraMs)) return prev;
        return { estado: e, ahoraMs };
      });
    },
    [comprometer]
  );

  const vaciarPendiente = useCallback(() => {
    const p = pendienteRef.current;
    if (!p) return;
    clearTimeout(p.timer);
    pendienteRef.current = null;
    // Con la misma sesión manda el callback más reciente; si cambió, el capturado al programar.
    const alCambiar =
      p.sesionId === opcionesRef.current.sesionId
        ? opcionesRef.current.alCambiarDuracion
        : p.alCambiarDuracion;
    alCambiar?.(p.serieId, p.segundos);
  }, []);

  /** Debounce de 1 s con el valor final; solo para cronómetros con serie (los libres nunca envían). */
  const programarCambioDeDuracion = useCallback(
    (e: EstadoCronometro | null) => {
      if (!e || e.serieId === null) return;
      if (pendienteRef.current) clearTimeout(pendienteRef.current.timer);
      const serieId = e.serieId;
      const segundos = Math.round(e.duracionMs / 1000);
      const timer = setTimeout(vaciarPendiente, DEBOUNCE_DURACION_MS);
      pendienteRef.current = {
        timer,
        serieId,
        segundos,
        sesionId: opcionesRef.current.sesionId,
        alCambiarDuracion: opcionesRef.current.alCambiarDuracion,
      };
    },
    [vaciarPendiente]
  );

  const transicionar = useCallback(
    (fn: (e: EstadoCronometro, ahoraMs: number) => EstadoCronometro): boolean => {
      const e = estadoRef.current;
      if (!e) return false;
      const ahoraMs = Date.now();
      const siguiente = fn(e, ahoraMs);
      if (siguiente !== e) comprometer(siguiente, ahoraMs);
      return true;
    },
    [comprometer]
  );

  const abrir = useCallback(
    (serieId: string | null, segundos: number) => {
      vaciarPendiente();
      const ahoraMs = Date.now();
      comprometer(
        reloj.iniciar({
          sesionId: opcionesRef.current.sesionId ?? '',
          serieId,
          duracionMs: segundos * 1000,
          ahoraMs,
        }),
        ahoraMs
      );
    },
    [comprometer, vaciarPendiente]
  );

  const abrirParaSerie = useCallback(
    (serieId: string, segundos: number) => abrir(serieId, segundos),
    [abrir]
  );
  const abrirLibre = useCallback(
    (segundos: number = DURACION_LIBRE_SEGUNDOS) => abrir(null, segundos),
    [abrir]
  );
  const pausar = useCallback(() => void transicionar(reloj.pausar), [transicionar]);
  const reanudar = useCallback(() => void transicionar(reloj.reanudar), [transicionar]);
  const reiniciar = useCallback(
    () => void transicionar((e, ahoraMs) => reloj.reiniciar(e, ahoraMs)),
    [transicionar]
  );
  const ajustar = useCallback(
    (deltaSegundos: number) => {
      if (transicionar((e, ahoraMs) => reloj.ajustar(e, deltaSegundos * 1000, ahoraMs))) {
        programarCambioDeDuracion(estadoRef.current);
      }
    },
    [transicionar, programarCambioDeDuracion]
  );
  const elegirPreset = useCallback(
    (segundos: number) => {
      if (transicionar((e, ahoraMs) => reloj.reiniciar(e, ahoraMs, segundos * 1000))) {
        programarCambioDeDuracion(estadoRef.current);
      }
    },
    [transicionar, programarCambioDeDuracion]
  );
  const cerrar = useCallback(() => {
    vaciarPendiente();
    comprometer(null, Date.now());
  }, [comprometer, vaciarPendiente]);

  // Al tener sesión (o cambiar de sesión) se restaura el estado guardado. Un descanso que venció
  // mientras la app estaba cerrada queda terminado SIN sonar y se persiste ya notificado.
  useEffect(() => {
    vaciarPendiente();
    const ahoraMs = Date.now();
    let leido =
      sesionId && persistir ? reloj.leerCronometro(almacenDe(opcionesRef.current), sesionId, ahoraMs) : null;
    if (leido && reloj.debeAvisarFin(leido, ahoraMs)) {
      leido = reloj.marcarNotificado(leido);
      reloj.guardarCronometro(almacenDe(opcionesRef.current), leido.sesionId, leido);
    }
    estadoRef.current = leido;
    setVista({ estado: leido, ahoraMs });
  }, [sesionId, persistir, almacen, vaciarPendiente]);

  // Un cambio de duración pendiente no se pierde al desmontar.
  useEffect(() => vaciarPendiente, [vaciarPendiente]);

  const estado = vista.estado;
  const corriendo =
    estado !== null && !reloj.estaPausado(estado) && !reloj.estaTerminado(estado, vista.ahoraMs);

  // Tick de 250 ms solo mientras está abierto y corriendo.
  useEffect(() => {
    if (!corriendo) return;
    const id = setInterval(() => sincronizar(false), TICK_MS);
    return () => clearInterval(id);
  }, [corriendo, sincronizar]);

  // Al volver a la app (pantalla bloqueada, pestaña oculta, bfcache) el valor salta al real.
  const abierto = estado !== null;
  useEffect(() => {
    if (!abierto) return;
    const alCambiarVisibilidad = () => {
      if (document.visibilityState === 'visible') sincronizar(true);
    };
    const alMostrarPagina = () => sincronizar(true);
    document.addEventListener('visibilitychange', alCambiarVisibilidad);
    window.addEventListener('pageshow', alMostrarPagina);
    return () => {
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
      window.removeEventListener('pageshow', alMostrarPagina);
    };
  }, [abierto, sincronizar]);

  return {
    abierto,
    restanteMs: estado ? reloj.restanteMs(estado, vista.ahoraMs) : 0,
    duracionMs: estado?.duracionMs ?? 0,
    pausado: estado ? reloj.estaPausado(estado) : false,
    terminado: estado ? reloj.estaTerminado(estado, vista.ahoraMs) : false,
    serieId: estado?.serieId ?? null,
    abrirParaSerie,
    abrirLibre,
    pausar,
    reanudar,
    ajustar,
    elegirPreset,
    reiniciar,
    cerrar,
  };
}
