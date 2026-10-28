// Short synthesized effects keep field operations playable offline without media assets.
export type GameSound = 'shoot' | 'jump' | 'rotate' | 'reload' | 'hit' | 'pickup' | 'select' | 'error' | 'win';

type SoundSpec = { type: OscillatorType; from: number; to: number; duration: number; volume: number };
const SOUNDS: Record<GameSound, SoundSpec> = {
  shoot:  { type: 'sawtooth', from: 170, to: 42, duration: .12, volume: .10 },
  jump:   { type: 'sine', from: 280, to: 650, duration: .14, volume: .09 },
  rotate: { type: 'triangle', from: 680, to: 420, duration: .07, volume: .07 },
  reload: { type: 'square', from: 330, to: 210, duration: .09, volume: .035 },
  hit:    { type: 'triangle', from: 650, to: 950, duration: .09, volume: .07 },
  pickup: { type: 'sine', from: 620, to: 1100, duration: .15, volume: .07 },
  select: { type: 'sine', from: 440, to: 600, duration: .08, volume: .065 },
  error:  { type: 'triangle', from: 220, to: 120, duration: .18, volume: .07 },
  win:    { type: 'sine', from: 480, to: 960, duration: .28, volume: .075 },
};

let context: AudioContext | null = null;

/** Call from a user gesture so browsers permit later effects from animation frames. */
export function unlockGameSounds(): void {
  if (typeof window === 'undefined' || typeof window.AudioContext !== 'function') return;
  try {
    if (!context || context.state === 'closed') context = new window.AudioContext();
    if (context.state === 'suspended') void context.resume().catch(() => {});
  } catch { /* Audio is optional; gameplay must work without it. */ }
}

export function playGameSound(sound: GameSound): void {
  unlockGameSounds();
  if (!context || context.state === 'closed') return;
  try {
    const spec = SOUNDS[sound], now = context.currentTime;
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = spec.type;
    oscillator.frequency.setValueAtTime(spec.from, now);
    oscillator.frequency.exponentialRampToValueAtTime(spec.to, now + spec.duration);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(spec.volume, now + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, now + spec.duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(now);
    oscillator.stop(now + spec.duration);
  } catch { /* Unsupported or blocked audio must not interrupt the game. */ }
}
