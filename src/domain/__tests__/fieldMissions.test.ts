import { describe, expect, test } from 'bun:test';
import { advanceDay, createGame, type GameConfig } from '../cureGame';
import { completeFieldMission, connectedPipes, createPipePuzzle, missionRewardAmount, PIPE_SOLUTION, rotatePipe } from '../fieldMissions';
import { TOTAL_MANTA_POPULATION } from '../mantaGraph';
import { runSingleSeirSimulation } from '../seirEngine';
import { simulateSample } from '../multiSimulation';
import { createParkour, createShooter, reloadShooter, ROOFS, shoot, stepParkour, stepShooter, zombieTarget } from '../fieldArcade';

const config: GameConfig = { seed: 20261030, scenario: 'standard', patientZeroId: 'N01', dailyBudget: 7500 };
describe('field mission rewards', () => {
  test('treats infected and protects susceptible people without deleting population or rewriting cumulative infections', () => {
    const initial = createGame(config), before = initial.timeline[0];
    const treated = completeFieldMission(initial, 'shooter', 'N01');
    const rescued = completeFieldMission(treated, 'parkour', 'N01');
    expect(treated.timeline[0].totalI).toBe(before.totalI - Math.ceil(before.nodes.N01.I * .2));
    expect(rescued.timeline[0].totalS).toBe(before.totalS - 150);
    expect(rescued.timeline[0].totalR).toBe(150 + Math.ceil(before.nodes.N01.I * .2));
    expect(rescued.timeline[0].cumulativeInfected).toBe(before.cumulativeInfected);
    expect(before.totalR).toBe(0);
    expect(rescued.actions[0].budgetSpent).toBe(0);
    const next = advanceDay(rescued, [], 1200);
    expect(next.timeline[0]).toEqual(rescued.timeline[0]);
    for (const s of next.timeline) {
      expect(s.totalS + s.totalE + s.totalI + s.totalR).toBe(TOTAL_MANTA_POPULATION);
      for (const node of Object.values(s.nodes)) expect(Math.min(node.S, node.E, node.I, node.R)).toBeGreaterThanOrEqual(0);
    }
    const replay = runSingleSeirSimulation({ ...next.params, days: 1 }, 'SMART_CORTAFUEGOS', 0, next.actions);
    expect(replay.timeline).toEqual(next.timeline);
    expect(simulateSample({ ...next.params, days: 1 }, 'PLAYER', 0, next.actions).infected).toBe(next.timeline[1].cumulativeInfected);
  });
  test('claims each kind only once per day, preserves orders and permits the next day', () => {
    const initial = advanceDay(createGame(config), [{ nodeId: 'N01', kind: 'cordon' }], 1200);
    const game = completeFieldMission(initial, 'parkour', 'N01');
    expect(completeFieldMission(game, 'parkour', 'N02')).toBe(game);
    expect(game.actions[1].cordonedNodes).toEqual(['N01']);
    expect(game.actions[1].budgetSpent).toBe(initial.actions[1].budgetSpent);
    const next = advanceDay(game, [], 0);
    expect(completeFieldMission(next, 'parkour', 'N02').actions[2].fieldRewards?.parkour?.amount).toBe(150);
    expect(() => completeFieldMission({ ...game, status: 'lost' }, 'lab', 'N01')).toThrow('terminó');
    expect(() => completeFieldMission(initial, 'lab', 'invalid')).toThrow('inválida');
    expect(() => completeFieldMission(initial, '__proto__' as 'lab', 'N01')).toThrow('inválida');
    expect(() => completeFieldMission(initial, 'shooter', 'N10')).toThrow('elegible');
  });
  test('gives seeded 5–10 percentage points, clamps at 100 and can win the campaign', () => {
    const values = new Set<number>();
    for (let seed = 0; seed < 100; seed++) {
      const game = createGame({ ...config, seed });
      const amount = missionRewardAmount(game, 'lab', 'N01'); values.add(amount);
      expect(amount).toBeGreaterThanOrEqual(5); expect(amount).toBeLessThanOrEqual(10);
      expect(completeFieldMission(game, 'lab', 'N01')).toEqual(completeFieldMission(game, 'lab', 'N01'));
    }
    expect(values.size).toBe(6);
    const game = { ...createGame(config), research: 98 };
    const won = completeFieldMission(game, 'lab', 'N01');
    expect(won.research).toBe(100); expect(won.status).toBe('won');
    expect(completeFieldMission(won, 'lab', 'N01')).toBe(won);
    const campaign = { ...createGame({ ...config, campaignChapter: 2 }), research: 98 };
    expect(completeFieldMission(campaign, 'lab', 'N01').status).toBe('won');
  });
});

describe('lab circuit puzzle', () => {
  test('rotates pieces, has a connected solution and never starts solved', () => {
    expect(rotatePipe(9)).toBe(3);
    expect(connectedPipes(PIPE_SOLUTION).has(11)).toBe(true);
    expect(connectedPipes(Array(16).fill(0)).size).toBe(0);
    for (let seed = 0; seed < 100; seed++) {
      const pieces = createPipePuzzle(seed, 1);
      expect(pieces).toEqual(createPipePuzzle(seed, 1));
      expect(connectedPipes(pieces).has(11) && !!(pieces[11] & 2)).toBe(false);
      pieces.forEach((p, i) => {
        let mask = p; const possible = [];
        for (let j = 0; j < 4; j++) { possible.push(mask); mask = rotatePipe(mask); }
        expect(possible).toContain(PIPE_SOLUTION[i]);
      });
    }
  });
});

describe('arcade mechanics', () => {
  test('shooter needs eight hits, handles cooldown and reload, and can lose', () => {
    const s = createShooter();
    for (let i = 0; i < 8; i++) {
      if (!s.ammo) { reloadShooter(s); for (let n = 0; n < 70; n++) stepShooter(s, 1 / 60); }
      s.enemies = [{ id: i, lane: 0, depth: .5 }];
      const box = zombieTarget(s.enemies[0], s.time); s.aimX = box.x; s.aimY = box.y - box.h / 2;
      shoot(s); const shots = s.ammo; shoot(s); expect(s.ammo).toBe(shots);
      for (let n = 0; n < 15; n++) stepShooter(s, 1 / 60);
    }
    expect(s.kills).toBe(8); expect(s.result).toBe('won');
    const lost = createShooter(); lost.enemies = [0, 1, 2].map(id => ({ id, lane: 0, depth: .001 }));
    stepShooter(lost, .05); expect(lost.result).toBe('lost'); expect(lost.health).toBe(0);
  });
  test('parkour level is traversable using actual physics, supplies and checkpoint', () => {
    const s = createParkour();
    for (let tick = 0; tick < 1800 && s.result === 'playing'; tick++) {
      const roof = ROOFS.find(r => s.x >= r.x && s.x < r.x + r.w);
      stepParkour(s, 1 / 60, 1, !!(s.grounded && roof && s.x > roof.x + roof.w - 48));
    }
    expect(s.result).toBe('won'); expect(s.supplies).toEqual([true, true, true]); expect(s.health).toBe(3); expect(s.checkpoint).toBe(1000);
    const lost = createParkour();
    for (let tick = 0; tick < 2400 && lost.result === 'playing'; tick++) stepParkour(lost, 1 / 60, 1, false);
    expect(lost.result).toBe('lost'); expect(lost.health).toBe(0);
  });
});
