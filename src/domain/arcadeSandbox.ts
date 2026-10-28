export type Sandbox = { zones: number[]; score: number; ticks: number };
export function createSandbox(difficulty: 'relajada' | 'normal' | 'caotica' = 'normal', seed = 42): Sandbox {
  const intensity = difficulty === 'relajada' ? 0.5 : difficulty === 'caotica' ? 1.7 : 1;
  const random = (index: number) => ((Math.imul(seed ^ (index + 1), 2654435761) >>> 0) % 31);
  return { zones: Array.from({ length: 16 }, (_, i) => Math.round(random(i) * intensity)), score: 0, ticks: 0 };
}
export function sandboxAction(state: Sandbox, index: number, action: 'cure' | 'outbreak'): Sandbox {
  if (!Number.isInteger(index) || index < 0 || index >= state.zones.length) return state;
  const zones = [...state.zones];
  const removed = Math.min(35, zones[index]);
  zones[index] = action === 'cure' ? zones[index] - removed : Math.min(100, zones[index] + 40);
  return { ...state, zones, score: state.score + (action === 'cure' ? removed : 0) };
}
export function tickSandbox(state: Sandbox): Sandbox {
  return { ...state, ticks: state.ticks + 1, zones: state.zones.map((risk, i) => Math.min(100, risk + (risk > 0 ? 3 : 0) + (state.zones[(i + 1) % state.zones.length] >= 50 ? 5 : 0))) };
}
