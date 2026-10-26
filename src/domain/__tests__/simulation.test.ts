import { describe, expect, test } from 'bun:test';
import { DEFAULT_SIMULATION_PARAMS, MANTA_NODES, TOTAL_MANTA_POPULATION } from '../mantaGraph';
import { runMonteCarloComparison } from '../monteCarlo';
import { runSingleSeirSimulation } from '../seirEngine';
import { handler } from '../../../backend/handler';

describe('Operación Manta Cero — SEIR-V Graph Simulation & Monte Carlo', () => {
  test('Test 1: Deterministic reproducibility (same seed + same params = identical results)', () => {
    const params = {
      ...DEFAULT_SIMULATION_PARAMS,
      seed: 20261030,
      monteCarloRuns: 20,
      days: 45,
    };

    const resultA = runMonteCarloComparison(params);
    const resultB = runMonteCarloComparison(params);

    expect(resultA.strategies.NO_INTERVENTION.meanTotalInfected).toBe(
      resultB.strategies.NO_INTERVENTION.meanTotalInfected,
    );
    expect(resultA.strategies.RANDOM.meanTotalInfected).toBe(
      resultB.strategies.RANDOM.meanTotalInfected,
    );
    expect(resultA.strategies.SMART_CORTAFUEGOS.meanTotalInfected).toBe(
      resultB.strategies.SMART_CORTAFUEGOS.meanTotalInfected,
    );
    expect(resultA.strategies.SMART_CORTAFUEGOS.dailyBands[30]).toEqual(
      resultB.strategies.SMART_CORTAFUEGOS.dailyBands[30],
    );
  });

  test('Test 2: Golden Rule of Vaccination — 0 doses wasted on E, I, or R compartments & population conservation', () => {
    const run = runSingleSeirSimulation(
      {
        ...DEFAULT_SIMULATION_PARAMS,
        seed: 99991234,
        dailyBudget: 2500,
        days: 60,
      },
      'SMART_CORTAFUEGOS',
      0,
    );

    expect(run.wastedDosesOnInfected).toBe(0);
    expect(run.totalVaccinesUsed).toBeGreaterThan(0);

    // Verify population conservation on every single day across all 16 Manta nodes
    for (const snap of run.timeline) {
      const sumCompartments = snap.totalS + snap.totalE + snap.totalI + snap.totalR;
      expect(sumCompartments).toBe(TOTAL_MANTA_POPULATION);

      for (const node of MANTA_NODES) {
        const nSnap = snap.nodes[node.id];
        expect(nSnap.S).toBeGreaterThanOrEqual(0);
        expect(nSnap.E).toBeGreaterThanOrEqual(0);
        expect(nSnap.I).toBeGreaterThanOrEqual(0);
        expect(nSnap.R).toBeGreaterThanOrEqual(0);
        expect(nSnap.S + nSnap.E + nSnap.I + nSnap.R).toBe(node.population);
      }
    }
  });

  test('Test 3: SMART_CORTAFUEGOS beats both NO_INTERVENTION and RANDOM baselines on lives saved', () => {
    const mc = runMonteCarloComparison({
      ...DEFAULT_SIMULATION_PARAMS,
      seed: 20261030,
      monteCarloRuns: 30,
      days: 60,
    });

    const noInterventionInfected = mc.strategies.NO_INTERVENTION.meanTotalInfected;
    const randomInfected = mc.strategies.RANDOM.meanTotalInfected;
    const smartInfected = mc.strategies.SMART_CORTAFUEGOS.meanTotalInfected;

    // Smart Cortafuegos must result in fewer total infected than both Random and No Intervention
    expect(smartInfected).toBeLessThan(randomInfected);
    expect(randomInfected).toBeLessThan(noInterventionInfected);
    expect(mc.strategies.SMART_CORTAFUEGOS.meanLivesSavedVsBaseline).toBeGreaterThan(
      mc.strategies.RANDOM.meanLivesSavedVsBaseline,
    );
    expect(mc.strategies.SMART_CORTAFUEGOS.zeroWastedVaccinesVerified).toBe(true);
  });

  test('Test 4: AWS Lambda handler responds to /simulate and /mayor-report with valid JSON', async () => {
    const simRes = await handler({
      rawPath: '/simulate',
      body: JSON.stringify({ seed: 20261030, monteCarloRuns: 15, days: 30 }),
    });
    expect(simRes.statusCode).toBe(200);
    const parsedSim = JSON.parse(simRes.body);
    expect(parsedSim.ok).toBe(true);
    expect(parsedSim.result.strategies.SMART_CORTAFUEGOS.zeroWastedVaccinesVerified).toBe(true);

    const reportRes = await handler({
      rawPath: '/mayor-report',
      body: JSON.stringify({ seed: 20261030, monteCarloRuns: 15, days: 30 }),
    });
    expect(reportRes.statusCode).toBe(200);
    const parsedReport = JSON.parse(reportRes.body);
    expect(parsedReport.ok).toBe(true);
    expect(parsedReport.report.auditMetrics.zeroWastedVaccinesVerified).toBe(true);
  });
});
