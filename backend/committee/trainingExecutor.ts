import type { CommitteeAdmissionService } from './admissionService';
import type { TrainingJobService } from './trainingJobService';
import type { TrainingEvidenceIdentity, TrainingEvidenceStore } from './trainingEvidenceStore';
import type { PolicyRegistry } from './policyRegistry';
import { InvalidStateTransitionError, JobNotFoundError, TERMINAL_JOB_STATUSES, type JobDdbItem, type JobStatus } from './types';
import { trainOffline, trainOfflineSequential, type OfflineSimulator, type OfflineTrainingRequest, type TrajectoryRecord } from '../../src/domain/committee/offline';

export interface TrainingExecutorOptions {
  admission: CommitteeAdmissionService;
  jobs: TrainingJobService;
  store: Pick<TrainingEvidenceStore, 'putManifest' | 'putTrajectory' | 'finalize' | 'putArtifact'>;
  registry?: Pick<PolicyRegistry, 'publish'>;
  simulate?: OfflineSimulator;
  now?: () => number;
  run?: typeof trainOfflineSequential;
}

type TrainingOutcome = { status: JobStatus; completedTrajectories: number };
const compact = (record: TrajectoryRecord) => {
  const { timeline: _timeline, ...rest } = record;
  return rest;
};
const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

function requestFor(job: JobDdbItem, simulate?: OfflineSimulator): OfflineTrainingRequest {
  const { scenarioKey: _scenarioKey, horizonDays: _horizonDays, ...params } = job.scenario;
  if (!Number.isSafeInteger(job.scenario.seed) || job.scenario.seed < 0 || job.scenario.seed > 0xffffffff
    || !Number.isSafeInteger(job.horizonDays) || job.horizonDays < 20 || job.horizonDays > 60
    || job.scenario.horizonDays !== job.horizonDays || !job.scenario.scenarioKey) throw new Error('Invalid training scenario');
  return { jobId: job.jobId, baseSeed: job.scenario.seed, horizonDays: job.horizonDays, params, simulate };
}

/** Replays the frozen compact outcomes through the exact search/audit algorithm, without rerunning the simulator. */
function verifyStatistics(request: OfflineTrainingRequest, result: ReturnType<typeof trainOffline>): void {
  if (result.ledger.length !== result.trajectories) throw new Error('Training ledger length mismatch');
  let index = 0;
  const replay = trainOffline({
    ...request,
    simulate: ({ phase, policy, weights, runIndex }) => {
      const record = result.ledger[index++];
      const policyId = policy === 'weighted' ? `weighted:${JSON.stringify(weights)}` : policy;
      if (!record || record.phase !== phase || record.policy !== policy || record.policyId !== policyId || record.runIndex !== runIndex || !Number.isFinite(record.outcome)) throw new Error('Training ledger replay mismatch');
      return { totalCumulativeInfected: record.outcome, timeline: [] };
    },
  });
  if (index !== result.ledger.length || !equal(replay.artifact, result.artifact)
    || !equal(replay.promotion, result.promotion) || !equal(replay.finalEvidence, result.finalEvidence)
    || !equal(replay.final, result.final) || !equal(replay.baseline, result.baseline)
    || !equal(replay.ledger.map(compact), result.ledger.map(compact))
    || replay.audit !== result.audit) throw new Error('Training statistical evidence mismatch');
}

/** Internal worker foundation only; public training admission remains disabled. */
export class TrainingExecutor {
  constructor(private readonly options: TrainingExecutorOptions) {}

  async execute(jobId: string, ownerHash?: string): Promise<TrainingOutcome> {
    const { admission, jobs, store, simulate, now = Date.now, run = trainOfflineSequential } = this.options;
    const job = await admission.getJob(jobId, ownerHash);
    if (!job || job.evaluation) throw new JobNotFoundError('Training job not found');
    const outcome = (fresh: JobDdbItem): TrainingOutcome => ({ status: fresh.status, completedTrajectories: fresh.trainingCompletedTrajectories ?? 0 });
    if (TERMINAL_JOB_STATUSES.has(job.status) || job.status === 'running') return outcome(job);

    let currentRevision: number;
    try {
      currentRevision = (await jobs.claim(jobId)).stateRevision;
    } catch (error) {
      if (!(error instanceof InvalidStateTransitionError)) throw error;
      const fresh = await admission.getJob(jobId, ownerHash);
      if (!fresh) throw new JobNotFoundError('Training job not found');
      if (fresh.status !== 'running' && !TERMINAL_JOB_STATUSES.has(fresh.status)) throw error;
      return outcome(fresh);
    }

    let identity: TrainingEvidenceIdentity | undefined;
    try {
      const request = requestFor(job, simulate);
      const trained = await run({
        ...request,
        deadlineAt: Date.parse(job.softDeadlineAt),
        now,
        shouldCancel: async () => Boolean((await admission.getJob(jobId))?.cancelRequested),
        persistManifest: async ({ manifest, manifestHash }) => {
          if (manifest.jobId !== jobId) throw new Error('Training manifest job mismatch');
          identity = { ownerHash: job.ownerHash, jobId, scenarioHash: manifest.scenarioHash, manifestHash, versions: manifest.versions };
          await store.putManifest(identity, manifest);
        },
        persistTrajectory: async progress => {
          if (!identity) throw new Error('Training manifest was not persisted');
          await store.putTrajectory(identity, progress);
          const fresh = await admission.getJob(jobId);
          if (!fresh || fresh.ownerHash !== job.ownerHash) throw new Error('Training job identity changed');
          if (fresh.cancelRequested) { currentRevision = fresh.stateRevision; return; }
          currentRevision = (await jobs.completeTrajectory(jobId, progress.completedTrajectories - 1, fresh.stateRevision)).stateRevision;
        },
      });
      const fresh = await admission.getJob(jobId);
      if (!fresh || fresh.ownerHash !== job.ownerHash) throw new Error('Training job identity changed');
      currentRevision = fresh.stateRevision;
      if (trained.status !== 'completed') {
        const terminal = trained.status === 'deadline-exceeded' ? 'timed-out' : 'cancelled';
        await jobs.terminalize(jobId, terminal, 'not-run', currentRevision);
        return { status: terminal, completedTrajectories: fresh.trainingCompletedTrajectories ?? 0 };
      }
      if (fresh.cancelRequested) {
        await jobs.terminalize(jobId, 'cancelled', 'not-run', currentRevision);
        return { status: 'cancelled', completedTrajectories: fresh.trainingCompletedTrajectories ?? 0 };
      }
      if (!identity || trained.result.artifact.manifestHash !== identity.manifestHash || trained.result.artifact.manifest.scenarioHash !== identity.scenarioHash) throw new Error('Training manifest integrity mismatch');
      if (trained.result.audit === 'not-run') throw new Error('Training final audit missing');
      verifyStatistics(request, trained.result);
      const finalAudit = await store.finalize(identity, { audit: trained.result.audit, artifactHash: trained.result.artifact.artifactHash, finalEvidence: trained.result.finalEvidence }, trained.result.ledger.map(compact));
      const artifact = await store.putArtifact(identity, trained.result.artifact, finalAudit);
      const terminalFresh = await admission.getJob(jobId);
      if (!terminalFresh || terminalFresh.ownerHash !== job.ownerHash) throw new Error('Training job identity changed');
      currentRevision = terminalFresh.stateRevision;
      const status = terminalFresh.cancelRequested ? 'cancelled' : trained.result.audit === 'passed' ? 'completed' : 'no-improvement';
      if (status === 'completed' && this.options.registry) {
        await this.options.registry.publish(trained.result, new Date(now()));
      }
      await jobs.terminalize(jobId, status, status === 'cancelled' ? 'not-run' : trained.result.audit, currentRevision, status === 'cancelled' ? undefined : artifact);
      return { status, completedTrajectories: terminalFresh.trainingCompletedTrajectories ?? 0 };
    } catch (error) {
      const fresh = await admission.getJob(jobId);
      if (fresh && fresh.status === 'running') {
        try {
          await jobs.terminalize(jobId, fresh.cancelRequested ? 'cancelled' : 'failed', 'not-run', fresh.stateRevision);
        } catch { /* Preserve the original failure; the reconciler owns stale transitions. */ }
      }
      throw error;
    }
  }
}
