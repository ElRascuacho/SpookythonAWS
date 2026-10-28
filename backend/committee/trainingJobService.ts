import { PROTOCOL_BUDGET } from '../../src/domain/committee/types';
import type { CommitteeAdmissionService } from './admissionService';
import { InvalidStateTransitionError, JobNotFoundError, type FinalAuditStatus, type JobStatus } from './types';

/** Durable training state transitions; execution and evidence verification live elsewhere. */
export class TrainingJobService {
  constructor(private readonly admission: CommitteeAdmissionService) {}

  async status(jobId: string, ownerHash: string, now = new Date()) {
    const job = await this.admission.getJob(jobId, ownerHash);
    if (!job || job.evaluation) throw new JobNotFoundError('Training job not found');
    if (job.status === 'running' && now.getTime() >= Date.parse(job.hardDeadlineAt)) {
      await this.admission.reconcileSlot(now);
      return (await this.admission.getJob(jobId, ownerHash)) ?? job;
    }
    return job;
  }

  async claim(jobId: string) {
    const job = await this.admission.getJob(jobId);
    if (!job || job.evaluation) throw new JobNotFoundError('Training job not found');
    return this.admission.claimQueuedJob(jobId);
  }

  async completeTrajectory(jobId: string, previousTrajectories: number, expectedRevision: number) {
    const job = await this.admission.getJob(jobId);
    if (!job || job.evaluation) throw new JobNotFoundError('Training job not found');
    if (!Number.isSafeInteger(previousTrajectories) || previousTrajectories < 0 || previousTrajectories >= PROTOCOL_BUDGET.total
      || job.trainingCompletedTrajectories !== previousTrajectories) throw new InvalidStateTransitionError();
    return this.admission.updateProgress(jobId, { expectedRevision, completedTrajectories: previousTrajectories + 1 });
  }

  async terminalize(jobId: string, status: Extract<JobStatus, 'completed' | 'no-improvement' | 'cancelled' | 'timed-out' | 'failed'>, audit: FinalAuditStatus, expectedRevision: number, artifact?: { key: string; artifactHash: string }) {
    const job = await this.admission.getJob(jobId);
    if (!job || job.evaluation) throw new JobNotFoundError('Training job not found');
    if ((status === 'completed' && (job.cancelRequested || audit !== 'passed' || job.trainingCompletedTrajectories !== PROTOCOL_BUDGET.total))
      || (status === 'no-improvement' && (job.cancelRequested || audit !== 'failed' || job.trainingCompletedTrajectories !== PROTOCOL_BUDGET.total))
      || (status === 'cancelled' && !job.cancelRequested)
      || ((status === 'timed-out' || status === 'failed') && audit !== 'not-run')
      || ((status === 'completed' || status === 'no-improvement') && (!artifact || artifact.key !== `${job.resultPrefix}artifact.json` || !/^[a-f0-9]{64}$/.test(artifact.artifactHash)))
      || ((status === 'cancelled' || status === 'timed-out' || status === 'failed') && artifact !== undefined)) throw new InvalidStateTransitionError();
    return this.admission.terminalizeJob(jobId, { terminalStatus: status, finalAuditStatus: audit, expectedRevision, trainingArtifactKey: artifact?.key, trainingArtifactHash: artifact?.artifactHash });
  }
}
