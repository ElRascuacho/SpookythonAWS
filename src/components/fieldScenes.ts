import { ROOFS, SUPPLIES, zombieTarget, type ParkourState, type ShooterState } from '../domain/fieldArcade';

const rect = (c: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number) => { c.fillStyle = color; c.fillRect(x, y, w, h); };
function polygon(c: CanvasRenderingContext2D, color: string, points: number[][]) {
  c.fillStyle = color; c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.fill();
}
function atmosphere(c: CanvasRenderingContext2D, top: string, bottom: string) {
  const sky = c.createLinearGradient(0, 0, 0, 480); sky.addColorStop(0, top); sky.addColorStop(1, bottom); c.fillStyle = sky; c.fillRect(0, 0, 960, 480);
}
function skyline(c: CanvasRenderingContext2D, offset: number, base: number, color: string, scale: number) {
  for (let i = -2; i < 28; i++) {
    const x = i * 66 - (offset % 66), height = (45 + Math.abs(Math.sin(i * 4.7)) * 105) * scale;
    rect(c, color, x, base - height, 57, height);
    for (let row = 0; row < 5; row++) for (let col = 0; col < 4; col++) {
      if ((i + row * 3 + col * 7) % 5 === 0) rect(c, '#90baac35', x + 9 + col * 11, base - height + 12 + row * 22, 4, 7);
    }
  }
}
function vignette(c: CanvasRenderingContext2D) {
  const shade = c.createRadialGradient(480, 240, 150, 480, 240, 580); shade.addColorStop(0, '#0000'); shade.addColorStop(1, '#000b'); c.fillStyle = shade; c.fillRect(0, 0, 960, 480);
}
function zombie(c: CanvasRenderingContext2D, s: ShooterState, z: ShooterState['enemies'][number], sprite?: HTMLImageElement) {
  const p = zombieTarget(z, s.time); c.save(); c.translate(p.x, p.y); c.scale(p.h / 160, p.h / 160);
  const walk = Math.sin(s.time * 5 + z.id) * 9;
  c.fillStyle = '#0006'; c.beginPath(); c.ellipse(0, 1, 35, 7, 0, 0, Math.PI * 2); c.fill();
  if (sprite) { c.drawImage(sprite, -58, -166 + Math.sin(s.time * 4 + z.id) * 2, 116, 172); c.restore(); return; }
  polygon(c, '#253c39', [[-19, -70], [2, -70], [-7 + walk, -4], [-23 + walk, -4]]);
  polygon(c, '#314841', [[0, -70], [22, -70], [26 - walk, -4], [9 - walk, -4]]);
  polygon(c, '#5f7967', [[-21, -117], [19, -118], [28, -67], [-25, -67]]);
  polygon(c, '#3a524b', [[-23, -114], [-35, -109], [-49, -67 + walk], [-39, -63 + walk], [-15, -98]]);
  polygon(c, '#5d7566', [[20, -115], [32, -112], [47, -75 - walk], [36, -69 - walk], [15, -98]]);
  rect(c, '#354b44', -22, -83, 45, 9);
  c.fillStyle = '#90a282'; c.beginPath(); c.ellipse(0, -133, 15, 20, -0.12, 0, Math.PI * 2); c.fill();
  polygon(c, '#243b32', [[-14, -144], [-7, -155], [10, -151], [15, -143]]);
  rect(c, '#efb171', -10, -137, 6, 3); rect(c, '#efb171', 4, -137, 6, 3); rect(c, '#243c33', -5, -124, 10, 3);
  c.strokeStyle = '#b4d9a755'; c.lineWidth = 1; c.strokeRect(-29, -158, 58, 160); c.restore();
}
export function drawShooter(c: CanvasRenderingContext2D, s: ShooterState, reducedMotion: boolean, background?: HTMLImageElement, sprite?: HTMLImageElement, weapon?: HTMLImageElement) {
  if (background) c.drawImage(background, 0, 0, 960, 480);
  else {
  atmosphere(c, '#07141a', '#3a514b');
  const moon = c.createRadialGradient(590, 100, 5, 590, 100, 100); moon.addColorStop(0, '#d6dfba40'); moon.addColorStop(1, '#d6dfba00'); c.fillStyle = moon; c.fillRect(490, 0, 200, 200);
  skyline(c, 0, 230, '#142b30', 0.8);
  polygon(c, '#152329', [[370, 222], [590, 222], [960, 480], [0, 480]]);
  polygon(c, '#213437', [[0, 0], [260, 90], [374, 230], [0, 480]]);
  polygon(c, '#182b30', [[960, 0], [710, 80], [586, 230], [960, 480]]);
  for (let i = 0; i < 6; i++) {
    const y = i * 75;
    polygon(c, '#0a1a21', [[15, y], [210, 75 + y * 0.4], [235, 100 + y * 0.4], [15, y + 38]]);
    polygon(c, i % 3 === 0 ? '#6b83612e' : '#0b2025', [[945, y], [745, 75 + y * 0.4], [720, 100 + y * 0.4], [945, y + 38]]);
  }
  c.strokeStyle = '#96bbac35'; c.lineWidth = 2;
  for (let i = 0; i < 8; i++) { const y = 230 + Math.pow(i / 7, 2) * 250; c.beginPath(); c.moveTo(0, y); c.lineTo(960, y); c.stroke(); }
  for (const x of [70, 250, 710, 890]) { c.beginPath(); c.moveTo(480 + (x - 480) * 0.06, 225); c.lineTo(x, 480); c.stroke(); }
  rect(c, '#152e2f', 352, 175, 256, 27); c.fillStyle = '#c9c99c'; c.font = 'bold 14px monospace'; c.textAlign = 'center'; c.fillText('MANTA · ZONA DE CONTENCIÓN', 480, 194);
  for (const side of [1, -1]) {
    c.save(); c.translate(480 + side * 315, 338); polygon(c, '#33433d', [[-95, 0], [60, 0], [100, 72], [-130, 72]]);
    for (let i = -2; i < 3; i++) polygon(c, '#d1a04c', [[i * 40, 4], [i * 40 + 17, 4], [i * 40 + 54, 62], [i * 40 + 37, 62]]); c.restore();
  }
  const haze = c.createLinearGradient(0, 185, 0, 320); haze.addColorStop(0, '#91bba220'); haze.addColorStop(1, '#91bba200'); c.fillStyle = haze; c.fillRect(0, 185, 960, 150);
  }
  for (const z of [...s.enemies].sort((a, b) => b.depth - a.depth)) zombie(c, s, z, sprite);
  // Fixed first-person viewpoint; no pointer lock or camera shake is needed.
  const recoil = !reducedMotion && s.flashUntil > s.time ? 9 : 0;
  c.save(); c.translate(reducedMotion ? 0 : s.weaponX, recoil + (reducedMotion ? 0 : s.weaponY));
  if (weapon) c.drawImage(weapon, 475, 260 + (s.reloadUntil ? 60 : 0), 485, 323);
  else {
  polygon(c, '#15262d', [[553, 480], [589, 393], [620, 369], [677, 426], [723, 480]]);
  polygon(c, '#50605c', [[702, 480], [694, 399], [647, 367], [614, 391], [642, 480]]);
  polygon(c, '#192d32', [[582, 480], [549, 350], [542, 320], [566, 306], [610, 361], [653, 480]]);
  polygon(c, '#536767', [[550, 322], [564, 313], [594, 365], [574, 373]]);
  rect(c, '#a3c9bc', 551, 303, 14, 6);
  polygon(c, '#75958b', [[548, 350], [558, 345], [600, 438], [585, 443]]);
  }
  if (!reducedMotion && s.flashUntil > s.time) polygon(c, '#fee4a1', [[550, 313], [529, 283], [545, 288], [545, 268], [566, 294], [580, 285], [567, 318]]);
  c.restore(); vignette(c);
  if (!reducedMotion && s.hurtUntil > s.time) { c.strokeStyle = '#dd775aaa'; c.lineWidth = 16; c.strokeRect(0, 0, 960, 480); }
  const x = s.aimX, y = s.aimY; c.strokeStyle = s.hitUntil > s.time ? '#ffd58a' : '#d6f9ed'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(x - 15, y); c.lineTo(x - 5, y); c.moveTo(x + 5, y); c.lineTo(x + 15, y); c.moveTo(x, y - 15); c.lineTo(x, y - 5); c.moveTo(x, y + 5); c.lineTo(x, y + 15); c.stroke();
}
export function drawParkour(c: CanvasRenderingContext2D, s: ParkourState, reducedMotion: boolean, background?: HTMLImageElement) {
  const camera = Math.max(0, Math.min(1310, s.x - 270));
  if (background) c.drawImage(background, -camera * 0.1, 0, 1100, 480);
  else {
  atmosphere(c, '#18202f', '#ad785b');
  c.fillStyle = '#f5c98c'; c.beginPath(); c.arc(765 - camera * 0.04, 122, 35, 0, Math.PI * 2); c.fill();
  skyline(c, camera * 0.16, 330, '#35414a', 1.5); skyline(c, camera * 0.32, 390, '#25343e', 1.1);
  }
  c.strokeStyle = '#f6d5a239'; c.lineWidth = 1;
  for (let i = 0; i < 7; i++) { const x = (i * 167 + 70) - camera * 0.2; c.beginPath(); c.moveTo(x, 175); c.lineTo(x + 150, 150); c.stroke(); }
  c.save(); c.translate(-camera, 0);
  for (const roof of ROOFS) {
    rect(c, '#172b32', roof.x, roof.y, roof.w, 600);
    rect(c, '#729080', roof.x, roof.y, roof.w, 6);
    rect(c, '#35504e', roof.x + 7, roof.y + 7, roof.w - 14, 12);
    for (let x = roof.x + 24; x < roof.x + roof.w - 10; x += 48) { rect(c, '#0c1e27', x, roof.y + 41, 21, 35); rect(c, '#9eb1a32a', x + 3, roof.y + 44, 15, 26); }
    rect(c, '#3e5856', roof.x + roof.w - 73, roof.y - 26, 43, 26);
    rect(c, '#89a092', roof.x + roof.w - 77, roof.y - 30, 51, 5);
  }
  SUPPLIES.forEach((item, i) => {
    if (s.supplies[i]) return;
    const bob = reducedMotion ? 0 : Math.sin(s.time * 3 + i) * 3;
    c.shadowColor = '#bdebd5'; c.shadowBlur = 18; rect(c, '#b9e2cc', item.x - 13, item.y - 12 + bob, 26, 25); c.shadowBlur = 0;
    rect(c, '#2b5b52', item.x - 3, item.y - 6 + bob, 6, 14); rect(c, '#2b5b52', item.x - 7, item.y - 2 + bob, 14, 6);
  });
  rect(c, '#c6c7a3', 1005, 303, 3, 47); polygon(c, '#e7b96d', [[1008, 303], [1036, 312], [1008, 322]]);
  c.strokeStyle = '#a6e6c8'; c.lineWidth = 3; c.strokeRect(2110, 280, 64, 108); rect(c, '#a6e6c81a', 2110, 280, 64, 108);
  c.fillStyle = '#e4f5e7'; c.font = 'bold 14px monospace'; c.textAlign = 'center'; c.fillText('EXTRACCIÓN', 2142, 267);
  const stride = s.grounded && !reducedMotion ? Math.sin(s.time * 14) * 8 : 0;
  c.save(); c.translate(s.x, s.y);
  polygon(c, '#1b2e37', [[-10, 23], [1, 23], [-5 + stride, 40], [-14 + stride, 40]]);
  polygon(c, '#293e48', [[0, 23], [11, 23], [16 - stride, 40], [7 - stride, 40]]);
  polygon(c, '#e1b27b', [[-9, 1], [8, 1], [13, 24], [-12, 24]]);
  rect(c, '#334b48', -15, 5, 7, 19);
  c.fillStyle = '#debca0'; c.beginPath(); c.arc(0, -5, 8, 0, Math.PI * 2); c.fill();
  polygon(c, '#1c333c', [[-8, -6], [-8, -13], [3, -15], [9, -8]]);
  c.restore(); c.restore(); vignette(c);
}
