/**
 * Haptic feedback utility using the Web Vibration API.
 * Gracefully degrades to a no-op if unsupported or running on desktop.
 */
export type HapticType = 'light' | 'medium' | 'success' | 'warning' | 'timer' | 'selection';

export function triggerHaptic(type: HapticType = 'light'): void {
  if (typeof window === 'undefined' || !('vibrate' in navigator)) {
    return;
  }

  try {
    switch (type) {
      case 'light':
      case 'selection':
        // Short crisp tick for button steppers (+ / -) or item selection
        navigator.vibrate(12);
        break;
      case 'medium':
        // Distinct tap for tab switches or modal opens
        navigator.vibrate(25);
        break;
      case 'success':
        // Satisfying double-pulse for completing a set or submitting a check-in
        navigator.vibrate([35, 45, 40]);
        break;
      case 'warning':
        // Alert pulse for errors, rejects or warnings
        navigator.vibrate([60, 50, 60]);
        break;
      case 'timer':
        // Rhythmic pattern for workout rest timer completion
        navigator.vibrate([180, 80, 180, 80, 280]);
        break;
    }
  } catch {
    // Suppress security or permission errors on mobile webviews
  }
}
