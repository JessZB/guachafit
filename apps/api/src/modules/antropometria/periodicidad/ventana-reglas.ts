/**
 * RF-003 RN-04 / §6 (WU RF-003a): ventana del check-in remoto.
 *
 * 2. **Ventana (RN-04 + §6)**: el doc define la ventana como "día programado ± 24 horas" y, en
 *    §6, como "la ventana de 48 h". Ambas lecturas coinciden en UNA sola: desde las 00:00 locales
 *    de `D-1` hasta las 00:00 locales de `D+1` (fin EXCLUSIVO), es decir 48 horas exactas alrededor
 *    del día programado `D` en el día local del alumno.
 */
import { PeriodicidadAntropometria } from '@guachafit/shared';
import {
  fechaAnteriorYyyyMmDd,
  instanteUtcDesdeMedianocheLocal,
  obtenerFechaLocalYyyyMmDd,
  sumarDiasCalendario,
} from '../../../common/adherencia.util';
import {
  fechasProgramadasAntropometria,
  resolverTimezoneAntropometria,
} from './calendario-reglas';

/** Motivo por el que un check-in remoto no se acepta (RF-003 §7: mensajes claros al rechazar). */
export type MotivoVentanaAntropometrica = 'SIN_PERIODICIDAD' | 'FUERA_DE_VENTANA';

/** Rango local de una ventana de check-in: `[desde 00:00, hasta 00:00)` (fin exclusivo). */
export interface RangoVentanaAntropometrica {
  /** Fecha programada `D` de la ventana. */
  fecha: string;
  /** `D-1`: primer día local de la ventana (00:00). */
  desde: string;
  /** `D+1`: día local en que la ventana cierra (00:00, fin EXCLUSIVO). */
  hasta: string;
}

export interface ResultadoVentanaAntropometrica {
  /** `false` sin calendario configurado ⇒ RN-04 no aplica (comportamiento previo preservado). */
  aplica: boolean;
  permitido: boolean;
  hoyLocal: string;
  /** Ventana vigente cuando `permitido`; `null` cuando no hay ninguna abierta. */
  ventanaVigente: RangoVentanaAntropometrica | null;
  /** Próxima ventana futura (dato accionable del mensaje de rechazo); `null` si no existe. */
  proximaVentana: RangoVentanaAntropometrica | null;
  /** Última ventana ya vencida (dato accionable del mensaje de rechazo); `null` si no existe. */
  ultimaVentanaVencida: RangoVentanaAntropometrica | null;
  motivo?: MotivoVentanaAntropometrica;
}

/** Rango local de la ventana de la fecha programada `D`. */
function rangoVentana(fechaProgramada: string): RangoVentanaAntropometrica {
  return {
    fecha: fechaProgramada,
    desde: fechaAnteriorYyyyMmDd(fechaProgramada, 1),
    hasta: sumarDiasCalendario(fechaProgramada, 1),
  };
}

/**
 * RN-04/§6: ¿puede el alumno remoto registrar su check-in AHORA?
 *
 * La ventana de la fecha programada `D` va de `D-1` 00:00 locales a `D+1` 00:00 locales
 * (fin exclusivo): "día programado ± 24 horas" (RN-04) = 48 horas exactas (§6).
 *
 * Se evalúan las dos fechas programadas que rodean al día local (la anterior y la siguiente) para
 * cubrir los días intermedios: la ventana de `D` sigue abierta durante todo el día local `D`.
 */
export function evaluarVentanaCheckinAntropometrico(params: {
  periodicidad?: PeriodicidadAntropometria | null;
  antropometriaInicio?: string | null;
  timezone?: string | null;
  ahora?: Date;
}): ResultadoVentanaAntropometrica {
  const ahora = params.ahora ?? new Date();
  const timezone = resolverTimezoneAntropometria(params.timezone);
  const hoyLocal = obtenerFechaLocalYyyyMmDd(ahora, timezone);

  if (!params.periodicidad || !params.antropometriaInicio) {
    return {
      aplica: false,
      permitido: true,
      hoyLocal,
      ventanaVigente: null,
      proximaVentana: null,
      ultimaVentanaVencida: null,
      motivo: 'SIN_PERIODICIDAD',
    };
  }

  const { anterior, siguiente } = fechasProgramadasAntropometria(
    params.antropometriaInicio,
    params.periodicidad,
    hoyLocal
  );

  const candidatas = (anterior === siguiente ? [siguiente] : [anterior, siguiente]).filter(
    (fecha): fecha is string => Boolean(fecha)
  );

  const ventanaAbierta = candidatas.find((candidata) => {
    const rango = rangoVentana(candidata);
    const desde = instanteUtcDesdeMedianocheLocal(rango.desde, timezone);
    const hasta = instanteUtcDesdeMedianocheLocal(rango.hasta, timezone);
    return ahora >= desde && ahora < hasta;
  });

  if (ventanaAbierta) {
    return {
      aplica: true,
      permitido: true,
      hoyLocal,
      ventanaVigente: rangoVentana(ventanaAbierta),
      proximaVentana: null,
      ultimaVentanaVencida: null,
    };
  }

  // Fuera de ventana: se describen la próxima ventana y la última vencida para el mensaje.
  const rangoSiguiente = siguiente ? rangoVentana(siguiente) : null;
  const proximaVentana =
    rangoSiguiente &&
    instanteUtcDesdeMedianocheLocal(rangoSiguiente.desde, timezone) > ahora
      ? rangoSiguiente
      : null;

  const rangoAnterior = anterior ? rangoVentana(anterior) : null;
  const ultimaVentanaVencida =
    rangoAnterior &&
    instanteUtcDesdeMedianocheLocal(rangoAnterior.hasta, timezone) <= ahora
      ? rangoAnterior
      : null;

  return {
    aplica: true,
    permitido: false,
    hoyLocal,
    ventanaVigente: null,
    proximaVentana,
    ultimaVentanaVencida,
    motivo: 'FUERA_DE_VENTANA',
  };
}

/**
 * Mensaje claro de rechazo del check-in remoto. Nunca afirma una notificación que el sistema no
 * emitió: solo describe las ventanas reales del calendario del alumno y remite al entrenador.
 */
export function construirMensajeFueraDeVentana(resultado: ResultadoVentanaAntropometrica): string {
  const proxima = resultado.proximaVentana;
  const vencida = resultado.ultimaVentanaVencida;

  if (vencida && proxima) {
    return (
      `Tu ventana de check-in (del ${vencida.desde} al ${vencida.hasta}, fechas locales) ya cerró ` +
      `y la próxima se habilita del ${proxima.desde} al ${proxima.hasta}. ` +
      'Contacta a tu entrenador para reprogramar tu medición si necesitas registrar antes.'
    );
  }

  if (vencida) {
    return (
      `Tu ventana de check-in (del ${vencida.desde} al ${vencida.hasta}, fechas locales) ya cerró. ` +
      'Contacta a tu entrenador para reprogramar tu medición.'
    );
  }

  if (proxima) {
    return (
      `Tu ventana de check-in aún no está abierta: se habilita del ${proxima.desde} al ` +
      `${proxima.hasta} (fechas locales, 00:00). Podrás registrar tus medidas dentro de esa ` +
      'ventana de 48 horas.'
    );
  }

  return 'Tu check-in está fuera de la ventana activa. Contacta a tu entrenador para reprogramar tu medición.';
}
