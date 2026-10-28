// Voice holds temporary audio focus without changing the user's music preference.
const holders = new Set<symbol>();
const listeners = new Set<() => void>();
function notify() { for (const listener of listeners) listener(); }
export function acquireVoiceAudioFocus(): () => void {
  const token = Symbol("voice");
  holders.add(token);
  notify();
  return () => { if (holders.delete(token)) notify(); };
}
export function isVoiceAudioFocused() { return holders.size > 0; }
export function subscribeVoiceAudioFocus(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
