import type { CommitteeAdmissionService } from './admissionService';
import type { PolicyRegistry } from './policyRegistry';
import { InvalidStateTransitionError, JobNotFoundError } from './types';

/** Internal lifecycle only: it does not schedule or execute evaluations. */
export class EvaluationJobService {
  constructor(private readonly admission: CommitteeAdmissionService, private readonly registry: Pick<PolicyRegistry, 'get'>) {}

  async admit(request: { ownerHash: string; idempotencyKey: string; registryVersion: string; seed: number; plannedPairs?: number }) {
    if (!Number.isInteger(request.seed) || request.seed < 0 || request.seed > 0xffffffff) throw new RangeError('Invalid seed');
    const plannedPairs = request.plannedPairs ?? 128;
    if (!Number.isSafeInteger(plannedPairs) || plannedPairs < 1 || plannedPairs > 128) throw new RangeError('Invalid planned pairs');
    const policy = await this.registry.get(request.registryVersion);
    if (!policy || policy.registryVersion !== request.registryVersion || policy.audit !== 'passed' || policy.artifact.recommendation !== 'trained' || policy.artifact.policyVersion <= 0) throw new Error('Approved policy not found');
    const scenario = { ...policy.artifact.params, scenarioKey: 'frozen-policy', horizonDays: policy.artifact.params.days, seed: request.seed };
    return this.admission.admitJob({ ownerHash: request.ownerHash, idempotencyKey: request.idempotencyKey, scenario, evaluation: { registryVersion: policy.registryVersion, artifactHash: policy.artifact.artifactHash, plannedPairs } });
  }

  async status(jobId: string, ownerHash: string) {
    const job = await this.admission.getJob(jobId, ownerHash);
    if (!job || !job.evaluation) throw new JobNotFoundError('Job not found');
    return { ...job, evaluation: { ...job.evaluation, completedPairs: job.evaluationCompletedPairs ?? 0 } };
  }

  async claim(jobId: string) {
    const job = await this.admission.getJob(jobId);
    if (!job?.evaluation) throw new JobNotFoundError('Job not found');
    return this.admission.claimQueuedJob(jobId);
  }

  async completePair(jobId: string, previousPairs: number, expectedRevision: number) {
    const job = await this.admission.getJob(jobId);
    if (!job?.evaluation) throw new JobNotFoundError('Job not found');
    if (!Number.isSafeInteger(previousPairs) || previousPairs < 0 || previousPairs >= job.evaluation.plannedPairs) throw new InvalidStateTransitionError();
    return this.admission.updateProgress(jobId, { expectedRevision, completedPairs: previousPairs + 1 });
  }

  async terminalize(jobId: string, status: 'completed' | 'cancelled' | 'failed', expectedRevision: number) {
    const job = await this.admission.getJob(jobId);
    if (!job?.evaluation) throw new JobNotFoundError('Job not found');
    if ((status === 'completed' && (job.cancelRequested || job.evaluationCompletedPairs !== job.evaluation.plannedPairs)) || (status === 'cancelled' && !job.cancelRequested)) throw new InvalidStateTransitionError();
    return this.admission.terminalizeJob(jobId, { terminalStatus: status, finalAuditStatus: 'not-run', expectedRevision });
  }
}
