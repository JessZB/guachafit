/**
 * Aviso de fin del descanso (RF-001, ADR-021): vibración + beep sintético (Web Audio, sin mp3).
 *
 * Un único `AudioContext` perezoso y reutilizado: los navegadores móviles lo dejan suspendido
 * hasta que se crea o reanuda dentro de un gesto del usuario, por eso `desbloquearAudio()` se
 * llama al marcar una serie o abrir el cronómetro. Si el audio falla se ignora: el aviso
 * nunca debe romper el entrenamiento.
 */
import { triggerHaptic } from './haptics';

let contexto: AudioContext | null = null;

function crearContexto(): AudioContext | null {
  try {
    const Constructor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return Constructor ? new Constructor() : null;
  } catch {
    return null;
  }
}

/** Crea (una sola vez) o reanuda el contexto de audio; llamar siempre desde un gesto del usuario. */
export function desbloquearAudio(): void {
  try {
    contexto ??= crearContexto();
    if (contexto && contexto.state === 'suspended') void contexto.resume().catch(() => {});
  } catch {
    // Audio bloqueado por el navegador: el aviso seguirá siendo solo háptico.
  }
}

function reproducirBeep(): void {
  try {
    contexto ??= crearContexto();
    const ctx = contexto;
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    const inicio = ctx.currentTime;

    // Tono 1: 880 Hz (La)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, inicio);
    gain1.gain.setValueAtTime(0.18, inicio);
    gain1.gain.exponentialRampToValueAtTime(0.001, inicio + 0.18);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(inicio);
    osc1.stop(inicio + 0.18);

    // Tono 2: 1174 Hz (Re agudo de confirmación)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1174.66, inicio + 0.2);
    gain2.gain.setValueAtTime(0.22, inicio + 0.2);
    gain2.gain.exponentialRampToValueAtTime(0.001, inicio + 0.5);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(inicio + 0.2);
    osc2.stop(inicio + 0.5);
  } catch {
    // Ignorar si el navegador bloquea el audio.
  }
}

/** Vibración rítmica + beep. Se llama UNA vez por descanso desde `useCronometroDescanso`. */
export function avisarFinDescanso(): void {
  triggerHaptic('timer');
  reproducirBeep();
}
