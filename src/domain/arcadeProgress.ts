import { z } from 'zod';

export const COSMETICS = [
  { id: 'default', name: 'Clásico', price: 0, color: '#75c9bd' },
  { id: 'neon', name: 'Neón violeta', price: 60, color: '#c084fc' },
  { id: 'gold', name: 'Marco dorado', price: 120, color: '#fbbf24' },
] as const;
export const ACHIEVEMENTS = [
  { id: 'first', name: 'Primera victoria', target: 1, reward: 20 },
  { id: 'five', name: 'Veterano arcade', target: 5, reward: 50 },
  { id: 'ten', name: 'Leyenda arcade', target: 10, reward: 100 },
] as const;
const cosmeticId = z.enum(['default', 'neon', 'gold']);
export const ProgressSchema = z.object({
  coins: z.number().int().nonnegative().max(1000000000),
  wins: z.number().int().nonnegative().max(1000000),
  owned: z.array(cosmeticId), equipped: cosmeticId,
}).refine(p => p.owned.includes('default') && p.owned.includes(p.equipped));
export type ArcadeProgress = z.infer<typeof ProgressSchema>;
export const initialProgress = (): ArcadeProgress => ({ coins: 0, wins: 0, owned: ['default'], equipped: 'default' });
export const ARCADE_KEY = 'zero-day-arcade-v1';
// shortcut: browser-local cosmetic economy is editable, use server authority before adding competitive or paid rewards.
export function loadProgress(): ArcadeProgress {
  try { return ProgressSchema.parse(JSON.parse(localStorage.getItem(ARCADE_KEY) || 'null')); }
  catch { return initialProgress(); }
}
export function rewardWin(p: ArcadeProgress): ArcadeProgress {
  const wins = p.wins + 1;
  return { ...p, wins, coins: p.coins + 10 + ACHIEVEMENTS.filter(a => p.wins < a.target && wins >= a.target).reduce((n, a) => n + a.reward, 0) };
}
export function purchase(p: ArcadeProgress, id: ArcadeProgress['equipped']): ArcadeProgress {
  const item = COSMETICS.find(c => c.id === id);
  if (!item || (!p.owned.includes(id) && p.coins < item.price)) return p;
  return { ...p, equipped: id, coins: p.coins - (p.owned.includes(id) ? 0 : item.price), owned: p.owned.includes(id) ? p.owned : [...p.owned, id] };
}
