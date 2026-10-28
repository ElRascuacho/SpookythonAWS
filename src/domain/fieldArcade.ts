export const VIEW_W = 960, VIEW_H = 480;
export interface Zombie { id: number; lane: number; depth: number }
export interface ShooterState {
  time: number; nextSpawn: number; serial: number; enemies: Zombie[];
  aimX: number; aimY: number; ammo: number; reloadUntil: number; lastShot: number;
  kills: number; health: number; flashUntil: number; hitUntil: number; hurtUntil: number;
  result: 'playing' | 'won' | 'lost';
}
export const createShooter = (): ShooterState => ({ time: 0, nextSpawn: 0.4, serial: 0, enemies: [], aimX: 480, aimY: 240, ammo: 6, reloadUntil: 0, lastShot: -1, kills: 0, health: 3, flashUntil: 0, hitUntil: 0, hurtUntil: 0, result: 'playing' });
export function zombieTarget(z: Zombie, time: number) {
  const progress = 1 - z.depth, height = 52 + progress * 168;
  return { x: 480 + z.lane * (100 + progress * 270) + Math.sin(time * 2 + z.id) * 16, y: 233 + progress * 205, w: height * 0.48, h: height };
}
export function reloadShooter(s: ShooterState) {
  if (s.result === 'playing' && s.ammo < 6 && !s.reloadUntil) s.reloadUntil = s.time + 1.1;
}
export function shoot(s: ShooterState) {
  if (s.result !== 'playing' || s.reloadUntil || s.time - s.lastShot < 0.18) return;
  if (!s.ammo) { reloadShooter(s); return; }
  s.ammo--; s.lastShot = s.time; s.flashUntil = s.time + 0.085;
  const target = [...s.enemies].sort((a, b) => a.depth - b.depth).find(z => {
    const p = zombieTarget(z, s.time);
    return Math.abs(s.aimX - p.x) < p.w * 0.65 && s.aimY > p.y - p.h && s.aimY < p.y;
  });
  if (target) { s.enemies = s.enemies.filter(z => z.id !== target.id); s.kills++; s.hitUntil = s.time + 0.15; }
  if (s.kills >= 8) s.result = 'won';
}
export function stepShooter(s: ShooterState, dt: number) {
  if (s.result !== 'playing') return;
  dt = Math.min(0.05, Math.max(0, dt));
  s.time += dt;
  if (s.reloadUntil && s.time >= s.reloadUntil) { s.ammo = 6; s.reloadUntil = 0; }
  if (s.time >= s.nextSpawn) {
    const id = s.serial++;
    s.enemies.push({ id, lane: [-0.9, 0.55, -0.25, 0.95, 0.1][id % 5], depth: 1 });
    s.nextSpawn = s.time + 1.65;
  }
  for (const z of s.enemies) z.depth -= dt * 0.115;
  const escaped = s.enemies.filter(z => z.depth <= 0).length;
  if (escaped) { s.health = Math.max(0, s.health - escaped); s.hurtUntil = s.time + 0.35; }
  s.enemies = s.enemies.filter(z => z.depth > 0);
  if (s.health <= 0) s.result = 'lost';
}

export const ROOFS = [{ x: 0, w: 310, y: 390 }, { x: 370, w: 220, y: 350 }, { x: 650, w: 240, y: 310 }, { x: 950, w: 260, y: 350 }, { x: 1270, w: 220, y: 295 }, { x: 1550, w: 260, y: 350 }, { x: 1870, w: 400, y: 390 }];
export const SUPPLIES = [{ x: 470, y: 320 }, { x: 1080, y: 320 }, { x: 1680, y: 320 }];
export interface ParkourState { x: number; y: number; vy: number; time: number; grounded: boolean; coyote: number; jumpBuffer: number; health: number; supplies: boolean[]; checkpoint: number; result: 'playing' | 'won' | 'lost' }
export const createParkour = (): ParkourState => ({ x: 75, y: 350, vy: 0, time: 0, grounded: true, coyote: 0.1, jumpBuffer: 0, health: 3, supplies: [false, false, false], checkpoint: 75, result: 'playing' });
export function stepParkour(s: ParkourState, dt: number, move: number, jump: boolean) {
  if (s.result !== 'playing') return;
  dt = Math.min(0.05, Math.max(0, dt));
  if (jump) s.jumpBuffer = 0.12;
  const steps = Math.max(1, Math.ceil(dt * 120)), t = dt / steps;
  for (let n = 0; n < steps; n++) {
    s.time += t; s.jumpBuffer -= t;
    s.coyote = s.grounded ? 0.1 : s.coyote - t;
    if (s.jumpBuffer > 0 && s.coyote > 0) { s.vy = -610; s.grounded = false; s.coyote = 0; s.jumpBuffer = 0; }
    const previousFoot = s.y + 40;
    s.x = Math.max(14, Math.min(2220, s.x + Math.max(-1, Math.min(1, move)) * 260 * t));
    s.vy += 1400 * t; s.y += s.vy * t; s.grounded = false;
    for (const roof of ROOFS) {
      if (s.x + 13 > roof.x && s.x - 13 < roof.x + roof.w && s.vy >= 0 && previousFoot <= roof.y + 1 && s.y + 40 >= roof.y) {
        s.y = roof.y - 40; s.vy = 0; s.grounded = true;
      }
    }
    if (s.grounded && s.x >= 980 && s.x < 1210) s.checkpoint = 1000;
    SUPPLIES.forEach((item, i) => { if (Math.abs(s.x - item.x) < 32 && Math.abs(s.y + 20 - item.y) < 62) s.supplies[i] = true; });
    if (s.y > 520) {
      s.health--; s.x = s.checkpoint; s.y = s.checkpoint === 75 ? 350 : 310; s.vy = 0; s.grounded = true; s.coyote = 0; s.jumpBuffer = 0;
      if (s.health <= 0) { s.result = 'lost'; return; }
    }
    if (s.x >= 2120 && s.supplies.every(Boolean)) { s.result = 'won'; return; }
  }
}
