import { hashPayload } from "./conditions";
import type { EvaluationJobService } from "./evaluationJobService";
import type { EvaluationIdentity, EvaluationStore } from "./evaluationStore";
import type { PolicyRegistry } from "./policyRegistry";
import type { CommitteeAdmissionService } from "./admissionService";
import { evaluateFrozenPolicySequential, type OfflineSimulator } from "../../src/domain/committee/offline";
import { JobNotFoundError } from "./types";

export interface EvaluationExecutorOptions {
  admission: CommitteeAdmissionService;
  evaluationJobs: EvaluationJobService;
  registry: Pick<PolicyRegistry, "get">;
  store: EvaluationStore;
  simulate?: OfflineSimulator;
}

export class EvaluationExecutor {
  constructor(private readonly options: EvaluationExecutorOptions) {}

  async execute(
    jobId: string,
    ownerHash?: string,
  ): Promise<{ status: "completed" | "cancelled" | "failed"; pairsCompleted: number }> {
    const { admission, evaluationJobs, registry, store, simulate } = this.options;
    const job = await admission.getJob(jobId, ownerHash);
    if (!job || !job.evaluation) {
      throw new JobNotFoundError("Job not found");
    }
    if (job.status === "completed" || job.status === "cancelled" || job.status === "failed") {
      return { status: job.status, pairsCompleted: job.evaluationCompletedPairs ?? 0 };
    }

    // 1. Claim the queued job (moves from 'queued' to 'running', stateRevision increments to 2)
    const claimed = await evaluationJobs.claim(jobId);
    let currentRevision = claimed.stateRevision;

    // 2. Fetch the approved policy
    const policy = await registry.get(job.evaluation.registryVersion);
    if (!policy) {
      await evaluationJobs.terminalize(jobId, "failed", currentRevision);
      throw new Error(`Policy not found: ${job.evaluation.registryVersion}`);
    }

    // 3. Prepare evaluation identity
    const scenarioHash = hashPayload(job.scenario);
    const identity: EvaluationIdentity = {
      ownerHash: job.ownerHash,
      jobId,
      registryVersion: policy.registryVersion,
      artifactHash: policy.artifact.artifactHash,
      scenarioHash,
    };

    try {
      const result = await evaluateFrozenPolicySequential({
        policy: 'toPublicProjection' in registry && typeof (registry as any).toPublicProjection === 'function'
          ? (registry as any).toPublicProjection(policy)
          : policy.artifact,
        policyVersion: policy.artifact.policyVersion,
        baseSeed: job.scenario.seed,
        params: job.scenario as any,
        startIndex: 0,
        pairs: job.evaluation.plannedPairs,
        simulate,
        shouldCancel: async () => {
          const fresh = await admission.getJob(jobId);
          return Boolean(fresh?.cancelRequested);
        },
        persistPair: async ({ completedPairs, totalPairs, run }) => {
          await store.putPair(identity, {
            completedPairs,
            totalPairs,
            runIndex: run.runIndex,
            candidate: run.candidate.totalCumulativeInfected,
            sgc: run.sgc.totalCumulativeInfected,
          });
          const fresh = await admission.getJob(jobId);
          if (fresh?.cancelRequested) {
            currentRevision = fresh.stateRevision;
            return;
          }
          const update = await evaluationJobs.completePair(
            jobId,
            completedPairs - 1,
            fresh?.stateRevision ?? currentRevision,
          );
          currentRevision = update.stateRevision;
        },
      });

      const terminalFresh = await admission.getJob(jobId);
      currentRevision = terminalFresh?.stateRevision ?? currentRevision;

      if (result.status === "cancelled") {
        await evaluationJobs.terminalize(jobId, "cancelled", currentRevision);
        return { status: "cancelled", pairsCompleted: result.completedPairs };
      }

      await store.putReport(identity, {
        completedPairs: result.summary.runs.length,
        totalPairs: job.evaluation.plannedPairs,
        meanImprovement: result.summary.meanImprovement,
      });
      await evaluationJobs.terminalize(jobId, "completed", currentRevision);
      return { status: "completed", pairsCompleted: result.summary.runs.length };
    } catch (error) {
      try {
        const fresh = await admission.getJob(jobId);
        await evaluationJobs.terminalize(jobId, "failed", fresh?.stateRevision ?? currentRevision);
      } catch {
        // preserve original error
      }
      throw error;
    }
  }
}
