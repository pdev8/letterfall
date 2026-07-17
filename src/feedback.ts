// Feedback mapping (DB-132) — PURE. The native trigger lives in the screen
// (expo-haptics), but the decision "which signal, if the toggle is on" is
// pure and unit-tested here. Sound is gated too but stays a no-op until real
// audio lands with DB-163 (sound design).

/** A player action that may produce feedback. */
export type FeedbackKind = 'tap' | 'play' | 'win' | 'invalid';

/** The haptic signal a kind maps to (matches expo-haptics families). */
export type HapticSignal = 'selection' | 'impact' | 'success' | 'warning';

const HAPTIC: Record<FeedbackKind, HapticSignal> = {
  tap: 'selection', // light tick on picking/placing a card
  play: 'impact', // a word committed to the foundation
  win: 'success', // deal cleared
  invalid: 'warning', // rejected PLAY
};

/** The haptic to fire for `kind`, or null when haptics are off. */
export function hapticFor(kind: FeedbackKind, hapticsEnabled: boolean): HapticSignal | null {
  return hapticsEnabled ? HAPTIC[kind] : null;
}

/** Whether a sound should play for `kind` (audio itself arrives at DB-163). */
export function shouldPlaySound(soundEnabled: boolean): boolean {
  return soundEnabled;
}
