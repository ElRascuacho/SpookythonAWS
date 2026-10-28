import { describe, expect, test } from 'bun:test';
import { advanceDay, createGame, type GameConfig } from '../cureGame';
import { randomFieldOperation, missionFitsZone, completeFieldMission, connectedPipes, createPipePuzzle, missionRewardAmount, PIPE_SOLUTION, rotatePipe, weeklyFieldOperation } from '../fieldMissions';
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
    expect(() => completeFieldMission({ ...game, status: 'lost' }, 'lab', 'N04')).toThrow('terminó');
    expect(() => completeFieldMission(initial, 'lab', 'invalid')).toThrow('inválida');
    expect(() => completeFieldMission(initial, '__proto__' as 'lab', 'N04')).toThrow('inválida');
    expect(() => completeFieldMission(initial, 'shooter', 'N10')).toThrow('elegible');
  });
  test('gives seeded 5–10 percentage points, clamps at 100 and can win the campaign', () => {
    const values = new Set<number>();
    for (let seed = 0; seed < 100; seed++) {
      const game = createGame({ ...config, seed, patientZeroId: 'N04' });
      const amount = missionRewardAmount(game, 'lab', 'N04'); values.add(amount);
      expect(amount).toBeGreaterThanOrEqual(5); expect(amount).toBeLessThanOrEqual(10);
      expect(completeFieldMission(game, 'lab', 'N04')).toEqual(completeFieldMission(game, 'lab', 'N04'));
    }
    expect(values.size).toBe(6);
    const game = { ...createGame({ ...config, patientZeroId: 'N04' }), research: 98 };
    const won = completeFieldMission(game, 'lab', 'N04');
    expect(won.research).toBe(100); expect(won.status).toBe('won');
    expect(completeFieldMission(won, 'lab', 'N04')).toBe(won);
    const campaign = { ...createGame({ ...config, campaignChapter: 2, patientZeroId: 'N04' }), research: 98 };
    expect(completeFieldMission(campaign, 'lab', 'N04').status).toBe('won');
  });
});

describe('map operation encounters', () => {
  test('restricts laboratories to hospitals and rejects incompatible rewards', () => {
    expect(missionFitsZone('lab', 'N04')).toBe(true);
    expect(missionFitsZone('lab', 'N06')).toBe(false);
    expect(missionFitsZone('parkour', 'N06')).toBe(true);
    expect(() => completeFieldMission(createGame(config), 'lab', 'N06')).toThrow('incompatible');
  });
  test('requires local infection, not just susceptible people, for every operation', () => {
    const game = createGame(config);
    expect(game.timeline[0].nodes.N06.S).toBeGreaterThan(0);
    for (const kind of ['shooter', 'parkour', 'lab'] as const) {
      expect(missionRewardAmount(game, kind, 'N06')).toBe(0);
    }
    expect(() => completeFieldMission(game, 'parkour', 'N06')).toThrow('elegible');
    expect(() => completeFieldMission(game, 'lab', 'N04')).toThrow('elegible');
    for (const roll of [0, .4, .99]) expect(randomFieldOperation(game, () => roll)?.nodeId).toBe('N01');
    const exposed = structuredClone(game);
    exposed.timeline[0].nodes.N06.E = 1;
    expect(missionRewardAmount(exposed, 'parkour', 'N06')).toBe(150);
    expect(missionRewardAmount(exposed, 'shooter', 'N06')).toBe(0);
    for (const node of Object.values(exposed.timeline[0].nodes)) { node.E = 0; node.I = 0; }
    expect(randomFieldOperation(exposed)).toBeNull();
  });
  test('only picks compatible, eligible, unclaimed operations', () => {
    const initial = createGame(config);
    const params = { ...initial.params, patientZeroIds: ['N01', 'N04'] };
    let game = { ...initial, params, timeline: runSingleSeirSimulation({ ...params, days: 0 }, 'SMART_CORTAFUEGOS', 0, {}).timeline };
    const seen = new Set<string>();
    for (const roll of [0, .4, .99]) {
      const operation = randomFieldOperation(game, () => roll)!;
      expect(operation).not.toBeNull();
      expect(missionFitsZone(operation.kind, operation.nodeId)).toBe(true);
      expect(missionRewardAmount(game, operation.kind, operation.nodeId)).toBeGreaterThan(0);
      expect(seen.has(operation.kind)).toBe(false);
      seen.add(operation.kind);
      game = completeFieldMission(game, operation.kind, operation.nodeId);
    }
    expect(seen.size).toBe(3);
    expect(randomFieldOperation(game)).toBeNull();
    expect(randomFieldOperation({ ...game, status: 'lost' })).toBeNull();
    expect(randomFieldOperation(advanceDay(game, [], 1200))).not.toBeNull();
  });
  test('queues a deterministic operation as soon as an unsatisfied week starts', () => {
    const day0 = createGame(config);
    expect(weeklyFieldOperation(day0)).toBeNull();
    const day1 = advanceDay(day0, [], 1200);
    const required = weeklyFieldOperation(day1);
    expect(required).not.toBeNull();
    expect(missionRewardAmount(day1, required!.kind, required!.nodeId)).toBeGreaterThan(0);
    expect(weeklyFieldOperation(day1)).toEqual(required);
    const completed = completeFieldMission(day1, required!.kind, required!.nodeId);
    expect(weeklyFieldOperation(completed)).toBeNull();
    let later = completed;
    for (let d = 2; d <= 6; d++) {
      later = advanceDay(later, [], 1200);
      expect(weeklyFieldOperation(later)).toBeNull();
    }
    const nextWeek = advanceDay(later, [], 1200);
    expect(nextWeek.day).toBe(7);
    expect(weeklyFieldOperation(nextWeek)).not.toBeNull();
  });
  test('counts a completed day-zero operation for the first gameplay week', () => {
    const day0 = completeFieldMission(createGame(config), 'shooter', 'N01');
    const day1 = advanceDay(day0, [], 1200);
    expect(weeklyFieldOperation(day1)).toBeNull();
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
  test('weapon smoothly follows aim, clamps travel and does not change targeting', () => {
    const s = createShooter();
    s.aimX = 960; s.aimY = 480;
    stepShooter(s, 1 / 60);
    expect(s.weaponX).toBeGreaterThan(0); expect(s.weaponX).toBeLessThan(48);
    expect(s.weaponY).toBeGreaterThan(0); expect(s.weaponY).toBeLessThan(20);
    expect(s.aimX).toBe(960); expect(s.aimY).toBe(480);
    s.aimX = -1000; s.aimY = -1000;
    for (let i = 0; i < 30; i++) stepShooter(s, 1 / 60);
    expect(s.weaponX).toBeCloseTo(-48, 1); expect(s.weaponY).toBeCloseTo(-20, 1);
    expect(s.weaponX).toBeGreaterThanOrEqual(-48); expect(s.weaponY).toBeGreaterThanOrEqual(-20);
    const a = createShooter(), b = createShooter();
    a.aimX = b.aimX = 960;
    for (let i = 0; i < 30; i++) stepShooter(a, 1 / 60);
    for (let i = 0; i < 60; i++) stepShooter(b, 1 / 120);
    expect(a.weaponX).toBeCloseTo(b.weaponX, 8);
    const still = a.weaponX; a.result = 'won'; stepShooter(a, .05);
    expect(a.weaponX).toBe(still);
  });
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
