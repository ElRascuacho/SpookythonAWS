import { evaluateFrozenPolicy, type OfflineSimulator } from '../../src/domain/committee/offline';
import type { PolicyRegistry } from './policyRegistry';

export interface EvaluationRequest {
  registryVersion: string;
  seed: number;
  horizonDays?: number;
}

/** Internal computation only. The caller must first implement durable admission and worker lifecycle. */
export async function evaluateRegisteredPolicy(registry: Pick<PolicyRegistry, 'get'>, request: EvaluationRequest, simulate?: OfflineSimulator) {
  if (!Number.isInteger(request.seed) || request.seed < 0 || request.seed > 0xffffffff) throw new RangeError('Invalid seed');
  const horizonDays = request.horizonDays ?? 40;
  if (!Number.isInteger(horizonDays) || horizonDays < 20 || horizonDays > 60) throw new RangeError('Invalid horizon');
  const policy = await registry.get(request.registryVersion);
  if (!policy) throw new Error('Policy not found');
  if (policy.registryVersion !== request.registryVersion) throw new Error('Policy version mismatch');
  // A policy carries scenario parameters and horizon. Do not silently change its scenario.
  if (policy.artifact.params.days !== horizonDays) throw new Error('Policy horizon mismatch');
  const result = evaluateFrozenPolicy({ artifact: policy.artifact, policyVersion: policy.artifact.policyVersion, baseSeed: request.seed, pairs: 128, simulate });
  return {
    registryVersion: policy.registryVersion,
    policyVersion: result.policyVersion,
    artifactHash: policy.artifact.artifactHash,
    recommendation: policy.artifact.recommendation,
    horizonDays,
    seed: request.seed,
    trajectories: result.trajectories,
    candidateMean: result.candidateMean,
    sgcMean: result.sgcMean,
    meanImprovement: result.meanImprovement,
    confidenceInterval: result.confidenceInterval,
    runs: result.runs.map(({ runIndex, candidate, sgc }) => ({ runIndex, candidate: candidate.totalCumulativeInfected, sgc: sgc.totalCumulativeInfected })),
  };
}
