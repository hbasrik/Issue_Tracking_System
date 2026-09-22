/** Short Web Audio beep for newly appeared CRITICAL issues on the board. */

let sharedCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!sharedCtx) sharedCtx = new Ctx();
  return sharedCtx;
}

export type PlayCriticalResult =
  | { ok: true }
  | { ok: false; blocked: true }
  | { ok: false; blocked: false; error: unknown };

/**
 * Try to play a short alert. Prefer calling after a user gesture (login / nav),
 * but always attempt first — show an unlock UI only when the browser blocks.
 */
export async function playCriticalAlert(): Promise<PlayCriticalResult> {
  try {
    const ctx = getCtx();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(660, now + 0.12);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
    return { ok: true };
  } catch (error) {
    const name =
      error && typeof error === 'object' && 'name' in error
        ? String((error as { name: string }).name)
        : '';
    if (name === 'NotAllowedError' || name === 'NotSupportedError') {
      return { ok: false, blocked: true };
    }
    // Suspended contexts that reject resume count as blocked for unlock UX.
    if (
      error instanceof DOMException &&
      (error.name === 'InvalidStateError' || error.message.includes('user'))
    ) {
      return { ok: false, blocked: true };
    }
    return { ok: false, blocked: false, error };
  }
}

/** Unlock audio after an explicit click on the "Sesi aç" control. */
export async function unlockCriticalAudio(): Promise<boolean> {
  try {
    const ctx = getCtx();
    if (ctx.state === 'suspended') await ctx.resume();
    // Tiny silent blip so the gesture is tied to a play() path.
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    osc.start(now);
    osc.stop(now + 0.01);
    return true;
  } catch {
    return false;
  }
}
