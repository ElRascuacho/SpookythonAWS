import { describe, expect, test } from "bun:test";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { trainOffline } from "../../src/domain/committee/offline";
import { CommitteeAdmissionService } from "../committee/admissionService";
import { EvaluationJobService } from "../committee/evaluationJobService";
import { EvaluationStore } from "../committee/evaluationStore";
import { EvaluationExecutor } from "../committee/evaluationExecutor";
import { PolicyRegistry } from "../committee/policyRegistry";
import { JobNotFoundError } from "../committee/types";
import { InMemoryDynamoDBClient } from "./committee/inMemoryDynamoClient";

function fakeS3() {
  const objects = new Map<string, string>();
  return {
    objects,
    async send(command: any): Promise<any> {
      const input = command.input;
      if (command instanceof PutObjectCommand) {
        if (input.IfNoneMatch === "*" && objects.has(input.Key)) {
          throw Object.assign(new Error("exists"), { name: "PreconditionFailed" });
        }
        objects.set(input.Key, input.Body);
        return {};
      }
      if (command instanceof GetObjectCommand) {
        const value = objects.get(input.Key);
        if (!value) throw Object.assign(new Error("missing"), { name: "NoSuchKey" });
        return { Body: { transformToString: async () => value } };
      }
      throw new Error(`Unexpected command: ${command.constructor?.name}`);
    },
  };
}

const mockSimulator = ({ policy, weights }: { policy: string; weights?: readonly number[] }) => ({
  totalCumulativeInfected: policy === "weighted" ? 100 - (weights?.[0] ?? 0) * 10 : 120,
  timeline: [],
});

const sampleTraining = trainOffline({
  jobId: "executor-test",
  baseSeed: 42,
  horizonDays: 20,
  simulate: mockSimulator,
});

describe("EvaluationExecutor", () => {
  const tableName = "test-evaluations-table";
  const ownerHash = "test-owner-hash-abc123";

  test("happy path: executes pairs sequentially, persists each pair and report, terminalizes as completed", async () => {
    const s3Client = fakeS3();
    const ddbClient = new InMemoryDynamoDBClient() as unknown as DynamoDBClient;
    const admission = new CommitteeAdmissionService(ddbClient, tableName);
    const store = new EvaluationStore(s3Client as any, "test-bucket");
    const registry = new PolicyRegistry(s3Client as any, "test-bucket");

    // Publish approved policy
    const published = await registry.publish(
      sampleTraining,
      new Date("2026-10-28T12:00:00Z"),
      "v1-0-0",
    );

    const evaluationJobs = new EvaluationJobService(admission, registry);
    const executor = new EvaluationExecutor({
      admission,
      evaluationJobs,
      registry,
      store,
      simulate: mockSimulator,
    });

    // 1. Admit evaluation job with plannedPairs = 4
    const admitted = await evaluationJobs.admit({
      ownerHash,
      idempotencyKey: "test-idem-exec-1",
      registryVersion: published.registryVersion,
      seed: 12345,
      plannedPairs: 4,
    });

    expect(admitted.status).toBe("queued");
    expect(admitted.stateRevision).toBe(1);

    // 2. Execute
    const execResult = await executor.execute(admitted.jobId, ownerHash);
    expect(execResult.status).toBe("completed");
    expect(execResult.pairsCompleted).toBe(4);

    // 3. Verify in DynamoDB: completed and slot released
    const terminalJob = await admission.getJob(admitted.jobId, ownerHash);
    expect(terminalJob?.status).toBe("completed");
    expect(terminalJob?.evaluationCompletedPairs).toBe(4);
    expect(terminalJob?.evaluation?.plannedPairs).toBe(4);

    // 4. Verify in S3: 4 pairs and 1 report
    const scenarioHash = terminalJob!.scenario ? (await import("../committee/conditions")).hashPayload(terminalJob!.scenario) : "";
    const identity = {
      ownerHash,
      jobId: admitted.jobId,
      registryVersion: published.registryVersion,
      artifactHash: published.artifact.artifactHash,
      scenarioHash,
    };

    for (let i = 1; i <= 4; i++) {
      const pair = await store.getPair(identity, i);
      expect(pair).not.toBeNull();
      expect(pair?.completedPairs).toBe(i);
      expect(pair?.totalPairs).toBe(4);
      expect(pair?.candidate).toBeLessThan(120);
      expect(pair?.sgc).toBe(120);
    }

    const report = await store.getReport(identity);
    expect(report).not.toBeNull();
    expect(report?.completedPairs).toBe(4);
    expect(report?.totalPairs).toBe(4);
    expect(report?.meanImprovement).toBeGreaterThan(0);
  });

  test("cancellation: stops between pairs when cancelRequested is set, skips report, terminalizes as cancelled", async () => {
    const s3Client = fakeS3();
    const ddbClient = new InMemoryDynamoDBClient() as unknown as DynamoDBClient;
    const admission = new CommitteeAdmissionService(ddbClient, tableName);
    const store = new EvaluationStore(s3Client as any, "test-bucket");
    const registry = new PolicyRegistry(s3Client as any, "test-bucket");

    const published = await registry.publish(
      sampleTraining,
      new Date("2026-10-28T12:00:00Z"),
      "v1-0-1",
    );

    const evaluationJobs = new EvaluationJobService(admission, registry);

    const admitted = await evaluationJobs.admit({
      ownerHash,
      idempotencyKey: "test-cancel-idem-1",
      registryVersion: published.registryVersion,
      seed: 9999,
      plannedPairs: 4,
    });

    let pairsSimulated = 0;
    const cancelingSimulator = ({ policy }: { policy: string }) => {
      pairsSimulated++;
      if (pairsSimulated === 4) {
        // Request cancellation on second pair
        admission.requestCancel(admitted.jobId, ownerHash);
      }
      return { totalCumulativeInfected: policy === "weighted" ? 80 : 100, timeline: [] };
    };

    const executor = new EvaluationExecutor({
      admission,
      evaluationJobs,
      registry,
      store,
      simulate: cancelingSimulator,
    });

    const execResult = await executor.execute(admitted.jobId, ownerHash);
    expect(execResult.status).toBe("cancelled");
    expect(execResult.pairsCompleted).toBe(2);

    const job = await admission.getJob(admitted.jobId, ownerHash);
    expect(job?.status).toBe("cancelled");
    expect(job?.cancelRequested).toBe(true);

    // Verify report does not exist
    const scenarioHash = (await import("../committee/conditions")).hashPayload(job!.scenario);
    const identity = {
      ownerHash,
      jobId: admitted.jobId,
      registryVersion: published.registryVersion,
      artifactHash: published.artifact.artifactHash,
      scenarioHash,
    };
    const report = await store.getReport(identity);
    expect(report).toBeNull();
  });

  test("isolation: foreign owner cannot execute job", async () => {
    const s3Client = fakeS3();
    const ddbClient = new InMemoryDynamoDBClient() as unknown as DynamoDBClient;
    const admission = new CommitteeAdmissionService(ddbClient, tableName);
    const store = new EvaluationStore(s3Client as any, "test-bucket");
    const registry = new PolicyRegistry(s3Client as any, "test-bucket");

    const published = await registry.publish(
      sampleTraining,
      new Date("2026-10-28T12:00:00Z"),
      "v1-0-2",
    );

    const evaluationJobs = new EvaluationJobService(admission, registry);
    const executor = new EvaluationExecutor({
      admission,
      evaluationJobs,
      registry,
      store,
      simulate: mockSimulator,
    });

    const admitted = await evaluationJobs.admit({
      ownerHash,
      idempotencyKey: "test-owner-iso",
      registryVersion: published.registryVersion,
      seed: 1111,
      plannedPairs: 2,
    });

    await expect(executor.execute(admitted.jobId, "foreign_owner")).rejects.toThrow(JobNotFoundError);
  });
});
