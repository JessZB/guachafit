/**
 * U1 (Ola 4): soporte de instalación PWA (A2HS) y persistencia de almacenamiento.
 *
 * La lógica de detección es pura y recibe sus entradas por parámetro para poder
 * probarse sin DOM (vitest corre en entorno node); el componente que la consume
 * (`InstalarAppPrompt`) es quien lee `navigator`, `matchMedia` y `localStorage`.
 */

export const CLAVE_DESCARTE_INSTALACION = 'guachafit_install_prompt_descartado';
export const DIAS_ESPERA_TRAS_DESCARTE = 30;
export const MS_ESPERA_TRAS_DESCARTE = DIAS_ESPERA_TRAS_DESCARTE * 24 * 60 * 60 * 1000;

/**
 * Evento no estándar de Chromium: TypeScript no lo incluye en lib.dom.
 * `prompt()` solo puede invocarse una vez por evento diferido.
 */
export interface EventoInstalacionDiferida extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/** true si la app corre instalada (standalone) o fue lanzada desde el ícono en iOS. */
export function esModoStandalone(
  coincideDisplayModeStandalone: boolean,
  navigatorStandalone: boolean | undefined
): boolean {
  return coincideDisplayModeStandalone || navigatorStandalone === true;
}

/**
 * iOS/iPadOS Safari: único navegador Apple donde existe
 * "Compartir → Añadir a pantalla de inicio". Se excluyen los navegadores iOS
 * (CriOS/FxiOS/EdgiOS/OPiOS) y las WebViews de apps (Instagram, Facebook, WhatsApp...),
 * que corren sobre WebKit pero no ofrecen instalación.
 * iPadOS 13+ se identifica como Macintosh: se distingue por maxTouchPoints > 1.
 */
export function esIOSSafari(userAgent: string, maxTouchPoints: number): boolean {
  const ua = userAgent ?? '';
  const esIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1);
  if (!esIOS) return false;
  if (!/Safari/i.test(ua)) return false;
  return !/(CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|FBAN|FBAV|FB_IAB|Instagram|WhatsApp|MicroMessenger|Line\/)/i.test(
    ua
  );
}

/**
 * Un descarte voluntario silencia la invitación durante 30 días.
 * Un timestamp futuro (reloj movido) no cuenta como descarte vigente.
 */
export function descarteVigente(
  descartadoEn: number | null,
  ahora: number,
  esperaMs: number = MS_ESPERA_TRAS_DESCARTE
): boolean {
  if (descartadoEn === null || !Number.isFinite(descartadoEn)) return false;
  const transcurrido = ahora - descartadoEn;
  return transcurrido >= 0 && transcurrido < esperaMs;
}

/** Lee el timestamp de descarte; cualquier valor corrupto se trata como "sin descarte". */
export function leerDescarteDeInstalacion(
  storage: Pick<Storage, 'getItem'> | null
): number | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(CLAVE_DESCARTE_INSTALACION);
    if (!raw) return null;
    const valor = Number(raw);
    return Number.isFinite(valor) ? valor : null;
  } catch {
    return null;
  }
}

/** Registra el descarte. Best-effort: en modo privado localStorage puede fallar. */
export function registrarDescarteDeInstalacion(
  storage: Pick<Storage, 'setItem'> | null,
  ahora: number
): void {
  if (!storage) return;
  try {
    storage.setItem(CLAVE_DESCARTE_INSTALACION, String(ahora));
  } catch {
    /* El descarte no es crítico: si no se puede guardar, la invitación reaparecerá. */
  }
}

let persistenciaSolicitada = false;

/**
 * Best-effort: pide almacenamiento persistente para que el SO no desaloje la cola
 * offline (Dexie/IndexedDB) ni la caché del Service Worker. Nunca lanza ni bloquea.
 * Se resetea solo por recarga de página; el guard evita prompts repetidos por sesión.
 */
export async function solicitarPersistenciaDeAlmacenamiento(): Promise<boolean> {
  if (persistenciaSolicitada) return false;
  persistenciaSolicitada = true;
  try {
    if (typeof navigator === 'undefined' || typeof navigator.storage?.persist !== 'function') {
      return false;
    }
    if (typeof navigator.storage.persisted === 'function' && (await navigator.storage.persisted())) {
      return true;
    }
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
