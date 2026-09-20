/**
 * RN-05: los timestamps operativos se persisten y transportan en UTC; el cliente los presenta
 * en la zona horaria local del dispositivo usando Intl. Nunca se renderizan strings crudos.
 */

export function formatHoraLocal(iso?: string | null): string | null {
  if (!iso) return null;
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(fecha);
}

export function formatFechaHoraLocal(iso?: string | null): string | null {
  if (!iso) return null;
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(fecha);
}

/** Solo fecha local (día + mes) a partir de un timestamp ISO UTC. */
export function formatFechaLocal(iso?: string | null): string | null {
  if (!iso) return null;
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(fecha);
}

/**
 * Formatea una fecha calendario 'YYYY-MM-DD' como fecha local SIN desfase de zona horaria
 * (evita el clásico -1 día por parsear el string como UTC).
 */
export function formatFechaCalendario(yyyyMmDd?: string | null): string | null {
  if (!yyyyMmDd) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyyMmDd);
  if (!match) return null;
  const fecha = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(fecha.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(fecha);
}

/** Formato humano de duración: '1 h 12 min', '45 min', '2 h'. */
export function formatDuracionMinutos(minutos?: number | null): string | null {
  if (minutos === null || minutos === undefined || !Number.isFinite(minutos) || minutos < 0) {
    return null;
  }
  const total = Math.round(minutos);
  const horas = Math.floor(total / 60);
  const min = total % 60;
  if (horas === 0) return `${min} min`;
  if (min === 0) return `${horas} h`;
  return `${horas} h ${min} min`;
}

/** Rango local inicio–fin: '10:15 – 11:27'. */
export function formatRangoHorasLocal(
  inicioIso?: string | null,
  finIso?: string | null
): string | null {
  const inicio = formatHoraLocal(inicioIso);
  const fin = formatHoraLocal(finIso);
  if (inicio && fin) return `${inicio} – ${fin}`;
  return inicio || fin;
}

/**
 * Zona horaria IANA del dispositivo (RN-05). El backend espera `?timezone=` para calcular
 * la ventana semanal del coach; si Intl no está disponible se cae a UTC (default documentado).
 */
export function obtenerTimezoneDispositivo(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

