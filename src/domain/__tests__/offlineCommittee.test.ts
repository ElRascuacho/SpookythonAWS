import { describe, expect, test } from 'bun:test';
import { trainOffline, trainOfflineSequential, evaluateFrozenPolicy } from '../committee/offline';
import { DEFAULT_COMPATIBILITY_VERSIONS, ZERO_POLICY_WEIGHTS } from '../committee/types';
import { DEFAULT_SIMULATION_PARAMS } from '../mantaGraph';

describe('offline committee protocol', () => {
  test('sequential training persists each trajectory in deterministic order and matches offline output', async () => {
    const simulate = (input: any) => ({ totalCumulativeInfected: input.runIndex + (input.policy === 'weighted' ? input.weights[0] : 0), timeline: [] });
    const request = { jobId: 'sequential-parity', baseSeed: 42, horizonDays: 20, simulate };
    const expected = trainOffline(request);
    const eventOrder: string[] = [];
    const persisted: Array<{ completedTrajectories: number; phase: string; runIndex: number }> = [];
    const actual = await trainOfflineSequential({
      ...request,
      shouldCancel: async () => false,
      persistManifest: async ({ manifest, manifestHash }) => {
        eventOrder.push('manifest');
        expect(manifest).toEqual(expected.artifact.manifest);
        expect(manifestHash).toBe(expected.artifact.manifestHash);
      },
      persistTrajectory: async ({ completedTrajectories, totalTrajectories, record }) => {
        if (completedTrajectories === 1) eventOrder.push('trajectory');
        expect(totalTrajectories).toBe(3552);
        persisted.push({ completedTrajectories, phase: record.phase, runIndex: record.runIndex });
      },
    });
    expect(actual).toEqual({ status: 'completed', result: expected });
    expect(eventOrder).toEqual(['manifest', 'trajectory']);
    expect(persisted).toHaveLength(3552);
    expect(persisted.map(row => row.completedTrajectories)).toEqual(Array.from({ length: 3552 }, (_, i) => i + 1));
    expect(persisted.map(({ phase, runIndex }) => ({ phase, runIndex }))).toEqual(expected.ledger.map(({ phase, runIndex }) => ({ phase, runIndex })));
  });
  test('sequential training stops before the next trajectory and never returns a final artifact on cancellation', async () => {
    let simulated = 0;
    const persisted: number[] = [];
    const result = await trainOfflineSequential({
      jobId: 'sequential-cancel', baseSeed: 42, horizonDays: 20,
      simulate: () => { simulated++; return { totalCumulativeInfected: 100, timeline: [] }; },
      shouldCancel: async () => persisted.length === 97,
      persistTrajectory: async ({ completedTrajectories }) => { persisted.push(completedTrajectories); },
    });
    expect(result).toEqual({ status: 'cancelled', completedTrajectories: 97, totalTrajectories: 3552 });
    expect(simulated).toBe(97);
    expect(persisted.at(-1)).toBe(97);
    expect(result).not.toHaveProperty('result');
  });
  test('sequential training respects a deadline before starting another trajectory', async () => {
    let completed = 0;
    const result = await trainOfflineSequential({
      jobId: 'sequential-deadline', baseSeed: 42, horizonDays: 20,
      simulate: () => ({ totalCumulativeInfected: 100, timeline: [] }),
      shouldCancel: async () => false,
      deadlineAt: 2,
      now: () => completed,
      persistTrajectory: async () => { completed++; },
    });
    expect(result).toEqual({ status: 'deadline-exceeded', completedTrajectories: 2, totalTrajectories: 3552 });
    expect(result).not.toHaveProperty('result');
  });
  test('sequential training does not advance or return an artifact when persistence fails', async () => {
    let simulated = 0;
    let persisted = 0;
    await expect(trainOfflineSequential({
      jobId: 'sequential-store-failure', baseSeed: 42, horizonDays: 20,
      simulate: () => { simulated++; return { totalCumulativeInfected: 100, timeline: [] }; },
      shouldCancel: async () => false,
      persistTrajectory: async ({ record }) => {
        persisted++;
        record.outcome = -1;
        if (persisted === 3) throw new Error('store unavailable');
      },
    })).rejects.toThrow('store unavailable');
    expect(simulated).toBe(3);
    expect(persisted).toBe(3);
  });
  test('replays deterministically, separates pools, respects budget and falls back on ties', () => {
    const calls: Array<{ phase: string; index: number }> = [];
    const simulate = (input: any) => { calls.push({ phase: input.phase, index: input.runIndex }); return { totalCumulativeInfected: 100, timeline: [] }; };
    const request = { jobId: 'test', baseSeed: 42, horizonDays: 20, simulate };
    const first = trainOffline(request);
    const second = trainOffline(request);
    expect(first).toEqual(second);
    expect(first.trajectories).toBe(3552);
    expect(['baseline', 'training', 'selection', 'promotion', 'final'].map(phase => first.ledger.filter(x => x.phase === phase).length)).toEqual([96, 1536, 384, 1024, 512]);
    expect(first.artifact.policyVersion).toBe(0);
    expect(first.artifact.weights).toEqual(ZERO_POLICY_WEIGHTS);
    expect(first.audit).toBe('failed');
    expect(Object.isFrozen(first.artifact.weights)).toBe(true);
    const train = new Set(calls.filter(x => x.phase === 'training').map(x => x.index));
    expect(calls.filter(x => ['selection', 'promotion', 'final'].includes(x.phase)).every(x => !train.has(x.index))).toBe(true);
  });
  test('a failed final audit falls back even after promotion', () => {
    const simulate = (input: any) => ({ totalCumulativeInfected: input.phase !== 'final' && input.policy === 'weighted' && input.weights.some((x: number) => x !== 0) ? 90 : 100, timeline: [] });
    const result = trainOffline({ jobId: 'fallback', baseSeed: 42, horizonDays: 20, simulate });
    expect(result.promotion.publishedPolicyVersion).toBeGreaterThan(0);
    expect(result.audit).toBe('failed');
    expect(result.finalEvidence?.meanDifference).toBe(0);
    expect(result.artifact.policyVersion).toBe(0);
    expect(result.artifact.recommendation).toBe('sgc-fallback');
  });
  test('frozen paired evaluation retains weights and records equal outcomes', () => {
    const simulate = (input: any) => ({ totalCumulativeInfected: input.runIndex, timeline: [] });
    const trained = trainOffline({ jobId: 'test', baseSeed: 42, horizonDays: 20, simulate });
    const before = trained.artifact.weights;
    const result = evaluateFrozenPolicy({ artifact: trained.artifact, policyVersion: 0, baseSeed: 42, simulate });
    expect(result.trajectories).toBe(256);
    expect(result.runs).toHaveLength(128);
    expect(result.meanImprovement).toBe(0);
    expect(result.confidenceInterval).toEqual([0, 0]);
    expect(trained.artifact.weights).toEqual(before);
    expect(() => evaluateFrozenPolicy({ artifact: trained.artifact, policyVersion: 1, baseSeed: 42, simulate })).toThrow();
  });
  test('preserves trajectory diagnostics, compatible warm starts and dispersion', () => {
    const action = { day: 1, vaccinatedNodes: {}, fumigatedNodes: [], cordonedNodes: [], cordonedEdges: [], budgetSpent: 0, summaryText: '' };
    const entry = { entryId: 'warm', weights: [1, 1, 1, 1] as const, ...DEFAULT_COMPATIBILITY_VERSIONS, horizonClass: 20, archivedAt: 1 };
    const inputs: any[] = [];
    const result = trainOffline({ jobId: 'diag', baseSeed: 2, horizonDays: 20, librarySnapshot: [entry], simulate: input => {
      inputs.push(input);
      return { totalCumulativeInfected: input.runIndex, timeline: [{ day: 1, totalS: 1, totalE: 2, totalI: 3, totalR: 4, cumulativeInfected: 5, hospitalCollapsed: false, nodes: { N01: { detail: 'large' } }, action } as any] };
    } });
    expect(inputs.some(i => i.phase === 'training' && i.weights.every((x: number) => x === 1))).toBe(true);
    expect(result.artifact.manifest.librarySnapshot[0].entryId).toBe('warm');
    expect(Object.isFrozen(result.artifact.manifest.librarySnapshot[0].weights)).toBe(true);
    expect(result.ledger[0].policyId).toBeTruthy();
    expect(result.ledger[0].envNamespace).toBe('committee-env');
    expect(result.ledger[0].outcome).toBe(0);
    expect(result.ledger[0].timeline[0].action).toEqual(action);
    expect(result.ledger[0].timeline[0].totalI).toBe(3);
    expect(result.ledger[0].timeline[0]).not.toHaveProperty('nodes');
    expect(result.ledger).toHaveLength(3552);
    expect(result.baseline.sgc.p10).toBeLessThan(result.baseline.sgc.p90);
    expect(result.final.sgc.p10).toBeLessThan(result.final.sgc.p90);
  });
  test('rejects artifact tampering after serialization', () => {
    const result = trainOffline({ jobId: 'integrity', baseSeed: 3, horizonDays: 20, simulate: () => ({ totalCumulativeInfected: 1, timeline: [] }) });
    const restored = JSON.parse(JSON.stringify(result.artifact));
    expect(evaluateFrozenPolicy({ artifact: restored, policyVersion: 0, baseSeed: 3, pairs: 2, simulate: () => ({ totalCumulativeInfected: 1, timeline: [] }) }).trajectories).toBe(4);
    for (const field of ['weights', 'params', 'manifest']) {
      const artifact = JSON.parse(JSON.stringify(result.artifact));
      if (field === 'weights') artifact.weights[0] = 2;
      if (field === 'params') artifact.params.betaHuman = 99;
      if (field === 'manifest') artifact.manifest.versions.engineVersion = 'tampered';
      expect(() => evaluateFrozenPolicy({ artifact, policyVersion: 0, baseSeed: 3, pairs: 2 })).toThrow();
    }
  });
  test('real engine gives identical paired timelines for SGC fallback', () => {
    const trained = trainOffline({ jobId: 'real', baseSeed: 4, horizonDays: 20, simulate: () => ({ totalCumulativeInfected: 100, timeline: [] }) });
    const result = evaluateFrozenPolicy({ artifact: trained.artifact, policyVersion: 0, baseSeed: 7, pairs: 2 });
    expect(result.runs[0].candidate).toEqual(result.runs[0].sgc);
    expect(result.runs[0].candidate.timeline.length).toBeGreaterThan(0);
  });
  test('evaluates with PublicPolicyProjection on requester scenario and pool without private artifact', () => {
    const projection = {
      registryVersion: '2026-10-28T12:00:00.000Z_v1-abc',
      publishedAt: '2026-10-28T12:00:00.000Z',
      policyVersion: 1,
      recommendation: 'trained' as const,
      weights: [1, 0, -1, 0] as const,
      audit: 'passed' as const,
      finalEvidence: { meanDifference: -100, upperBound: -50 },
      compatibilityVersions: { ...DEFAULT_COMPATIBILITY_VERSIONS },
      projectionHash: 'hash-abc',
    };
    const capturedInputs: any[] = [];
    const simulate = (input: any) => {
      capturedInputs.push(input);
      return { totalCumulativeInfected: 100, timeline: [] };
    };
    const customParams = { ...DEFAULT_SIMULATION_PARAMS, days: 30, betaHuman: 0.45 };
    expect(() => evaluateFrozenPolicy({ policy: projection, policyVersion: 1, baseSeed: 99, pairs: 2, simulate })).toThrow('requester simulation parameters');

    const result = evaluateFrozenPolicy({
      policy: projection,
      policyVersion: 1,
      baseSeed: 99,
      params: customParams,
      startIndex: 500,
      pairs: 3,
      simulate,
    });
    expect(result.trajectories).toBe(6);
    expect(result.policyVersion).toBe(1);
    expect(capturedInputs[0].runIndex).toBe(500);
    expect(capturedInputs[0].params.days).toBe(30);
    expect(capturedInputs[0].params.betaHuman).toBe(0.45);
    expect(result.meanImprovement).toBe(0);
  });
});
