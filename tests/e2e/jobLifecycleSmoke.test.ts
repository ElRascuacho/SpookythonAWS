import { describe, expect, it, beforeEach } from "bun:test";
import { createApiHandler, ApiHandlerDependencies } from "../../backend/handlers/apiHandler";
import { executeBatchWorker } from "../../backend/workers/batchWorker";
import { executeAggregator } from "../../backend/workers/aggregator";
import { InMemoryDatabase } from "../../backend/storage/inMemoryDatabase";
import { S3StorageService } from "../../backend/storage/s3Client";
import { InvitationService } from "../../backend/auth/invitationService";
import { SessionService } from "../../backend/auth/sessionService";
import { JobAdmissionService } from "../../backend/services/jobAdmissionService";
import { JobQueryService } from "../../backend/services/jobQueryService";
import { DEFAULT_SIMULATION_PARAMS } from "../../src/domain/mantaGraph";

describe("E2E: Complete Simulation Job Lifecycle Smoke Test", () => {
  let db: InMemoryDatabase;
  let s3: S3StorageService;
  let invitationService: InvitationService;
  let sessionService: SessionService;
  let jobAdmissionService: JobAdmissionService;
  let jobQueryService: JobQueryService;
  let handler: (req: Request) => Promise<Response>;

  beforeEach(() => {
    db = new InMemoryDatabase();
    s3 = new S3StorageService({ bucketName: "e2e-smoke-bucket", localMode: true });
    invitationService = new InvitationService(db);
    sessionService = new SessionService(db, invitationService);
    jobAdmissionService = new JobAdmissionService(db);
    jobQueryService = new JobQueryService(db);

    const deps: ApiHandlerDependencies = {
      db,
      s3,
      invitationService,
      sessionService,
      jobAdmissionService,
      jobQueryService,
    };
    handler = createApiHandler(deps);
  });

  it("executes the entire simulation lifecycle from admission to results inspection in < 45s", async () => {
    const overallStart = performance.now();

    // 1. Authenticate with invitation code
    const inv = await invitationService.createInvitation({ label: "Jurado Smoke Test" });
    const loginRes = await handler(
      new Request("https://api.internal/api/v1/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: inv.code }),
      }),
    );
    const cookie = loginRes.headers.get("set-cookie")!.split(";")[0];

    // 2. Submit Monte Carlo Simulation Job
    const params = {
      ...DEFAULT_SIMULATION_PARAMS,
      days: 30,
      monteCarloRuns: 50,
      seed: 20261030,
    };

    const submitRes = await handler(
      new Request("https://api.internal/api/v1/jobs", {
        method: "POST",
        headers: {
          cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "smoke-test-key-1",
        },
        body: JSON.stringify({
          params,
          visibility: "PRIVATE",
        }),
      }),
    );
    expect(submitRes.status).toBe(202);
    const { jobId } = await submitRes.json();

    // 3. Status is initially PENDING
    const initialStatusRes = await handler(
      new Request(`https://api.internal/api/v1/jobs/${jobId}`, {
        method: "GET",
        headers: { cookie },
      }),
    );
    expect((await initialStatusRes.json()).job.status).toBe("PENDING");

    // 4. Results endpoint returns 409 while job is not finished
    const earlyResultsRes = await handler(
      new Request(`https://api.internal/api/v1/jobs/${jobId}/results`, {
        method: "GET",
        headers: { cookie },
      }),
    );
    expect(earlyResultsRes.status).toBe(409);

    // 5. Workers execute the 2 batches (25 runs each = 50 runs) per strategy
    const strategies = ["NO_INTERVENTION", "RANDOM", "SMART_CORTAFUEGOS"] as const;
    for (const strat of strategies) {
      for (let b = 0; b < 2; b++) {
        const workerRes = await executeBatchWorker(
          {
            jobId,
            attempt: 1,
            strategy: strat,
            batchIndex: b,
            startRunIndex: b * 25,
            runsCount: 25,
            params,
          },
          { db, s3 },
        );
        expect(workerRes.ok).toBe(true);
      }
    }

    // 6. Aggregator consolidates results and finalizes exactly once
    const aggRes = await executeAggregator(
      {
        jobId,
        attempt: 1,
        strategies: [...strategies],
        batchesPerStrategy: 2,
        runsPerBatch: 25,
        params,
      },
      { db, s3 },
    );
    expect(aggRes.ok).toBe(true);

    // 7. Status is now COMPLETED
    const finalStatusRes = await handler(
      new Request(`https://api.internal/api/v1/jobs/${jobId}`, {
        method: "GET",
        headers: { cookie },
      }),
    );
    const finalStatusData = await finalStatusRes.json();
    expect(finalStatusData.job.status).toBe("COMPLETED");

    // 8. Fetch and inspect final results via authenticated proxy
    const finalResultsRes = await handler(
      new Request(`https://api.internal/api/v1/jobs/${jobId}/results`, {
        method: "GET",
        headers: { cookie },
      }),
    );
    expect(finalResultsRes.status).toBe(200);
    const resultsData = await finalResultsRes.json();

    expect(resultsData.ok).toBe(true);
    expect(resultsData.status).toBe("COMPLETED");
    expect(resultsData.result.strategies.SMART_CORTAFUEGOS).toBeDefined();
    expect(
      resultsData.result.strategies.SMART_CORTAFUEGOS.zeroWastedVaccinesVerified,
    ).toBe(true);
    expect(
      resultsData.result.strategies.SMART_CORTAFUEGOS.meanLivesSavedVsBaseline,
    ).toBeGreaterThan(0);

    const totalDurationSeconds = (performance.now() - overallStart) / 1000;
    expect(totalDurationSeconds).toBeLessThan(45); // Pitch requirement: sub-45s
  });
});
