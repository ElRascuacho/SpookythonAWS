import { describe, expect, test } from "bun:test";
import { archiveValidatedPolicy, filterCompatibleWarmStarts } from "../library";
import { DEFAULT_COMPATIBILITY_VERSIONS, MAX_POLICY_LIBRARY_ENTRIES, type PolicyLibraryEntry } from "../types";
import { clearPolicyLibrary, getPolicyLibrary, resetCommitteeJobs, startCommitteeJob } from "../../../../backend/committee/jobStore";

describe("committee policy library (anti-overfitting warm starts)", () => {
  test("rejects ZERO_POLICY_WEIGHTS and out-of-bounds weights", () => {
    const empty: PolicyLibraryEntry[] = [];
    const afterZero = archiveValidatedPolicy(empty, {
      weights: [0, 0, 0, 0],
      horizonDays: 40,
      scoreHint: 1200,
    });
    expect(afterZero).toHaveLength(0);

    const afterInvalid = archiveValidatedPolicy(empty, {
      weights: [4.5, 0, 0, 0],
      horizonDays: 40,
      scoreHint: 1200,
    });
    expect(afterInvalid).toHaveLength(0);
  });

  test("deduplicates identical weights for the same horizon and retains best scoreHint", () => {
    let lib: PolicyLibraryEntry[] = [];
    lib = archiveValidatedPolicy(lib, {
      weights: [1.2, -0.5, 0.8, 0.2],
      horizonDays: 40,
      scoreHint: 1500,
      archivedAt: 1000,
    });
    expect(lib).toHaveLength(1);
    expect(lib[0].scoreHint).toBe(1500);

    lib = archiveValidatedPolicy(lib, {
      weights: [1.2, -0.5, 0.8, 0.2],
      horizonDays: 40,
      scoreHint: 1350,
      archivedAt: 2000,
    });
    expect(lib).toHaveLength(1);
    expect(lib[0].scoreHint).toBe(1350);
  });

  test("enforces MAX_POLICY_LIBRARY_ENTRIES (8) by evicting worst scoreHint and oldest on ties", () => {
    let lib: PolicyLibraryEntry[] = [];
    for (let i = 1; i <= MAX_POLICY_LIBRARY_ENTRIES; i += 1) {
      lib = archiveValidatedPolicy(lib, {
        weights: [i * 0.2, -0.1, 0.1, 0.2],
        horizonDays: 40,
        scoreHint: 1000 + i * 100, // 1100 .. 1800
        archivedAt: 1000 + i,
      });
    }
    expect(lib).toHaveLength(MAX_POLICY_LIBRARY_ENTRIES);
    expect(lib[0].scoreHint).toBe(1100);
    expect(lib[lib.length - 1].scoreHint).toBe(1800);

    // Insert a 9th policy with a better scoreHint (950): 1800 should be evicted
    lib = archiveValidatedPolicy(lib, {
      weights: [2.5, 1.1, -0.4, 0.9],
      horizonDays: 40,
      scoreHint: 950,
      archivedAt: 5000,
    });
    expect(lib).toHaveLength(MAX_POLICY_LIBRARY_ENTRIES);
    expect(lib[0].scoreHint).toBe(950);
    expect(lib.some((e) => e.scoreHint === 1800)).toBe(false);
  });

  test("filters compatible warm starts by horizon and version metadata", () => {
    let lib: PolicyLibraryEntry[] = [];
    lib = archiveValidatedPolicy(lib, {
      weights: [1.0, 0.5, -0.5, 0.2],
      horizonDays: 40,
      scoreHint: 1100,
    });
    lib = archiveValidatedPolicy(lib, {
      weights: [0.3, -0.8, 0.4, 1.1],
      horizonDays: 25,
      scoreHint: 900,
    });

    const withIncompatible: PolicyLibraryEntry[] = [
      ...lib,
      {
        entryId: "legacy",
        weights: [2, 2, 2, 2],
        engineVersion: "seir-v0",
        graphVersion: DEFAULT_COMPATIBILITY_VERSIONS.graphVersion,
        policyFamily: DEFAULT_COMPATIBILITY_VERSIONS.policyFamily,
        horizonClass: 40,
        scoreHint: 800,
        archivedAt: 100,
      },
    ];

    const warm40 = filterCompatibleWarmStarts(withIncompatible, 40);
    expect(warm40).toEqual([[1.0, 0.5, -0.5, 0.2]]);

    const warm25 = filterCompatibleWarmStarts(withIncompatible, 25);
    expect(warm25).toEqual([[0.3, -0.8, 0.4, 1.1]]);
  });

  test("jobStore archives only promoted or audit-passed policies and passes warm starts to subsequent runs", () => {
    resetCommitteeJobs();
    expect(getPolicyLibrary()).toHaveLength(0);

    // 1. Unpromoted candidate is NOT archived (anti-overfitting gate)
    const unpromotedJob = startCommitteeJob({
      ownerHash: "owner-1",
      idempotencyKey: "run-1-unpromoted",
      horizonDays: 40,
      baseSeed: 101,
      run: () => ({
        status: "completed",
        stateRevision: 2,
        recommendedPolicyVersion: 0,
        finalAudit: "not-run",
        weights: [1.5, 0.5, -0.5, 0.2],
        baselineMean: 2000,
        candidateMean: 1800,
        trajectories: 50,
        playback: [],
        note: "unpromoted",
        promoted: false,
      }),
    });
    expect("error" in unpromotedJob).toBe(false);
    expect(getPolicyLibrary()).toHaveLength(0);

    // 2. Promoted candidate IS archived and passed into next run's librarySnapshot
    let capturedSnapshotLength = -1;
    startCommitteeJob({
      ownerHash: "owner-1",
      idempotencyKey: "run-2-promoted",
      horizonDays: 40,
      baseSeed: 202,
      run: (req) => {
        capturedSnapshotLength = req.librarySnapshot?.length ?? 0;
        return {
          status: "completed",
          stateRevision: 3,
          recommendedPolicyVersion: 1,
          finalAudit: "not-run",
          weights: [1.1, 0.4, -0.3, 0.8],
          baselineMean: 2000,
          candidateMean: 1450,
          trajectories: 177,
          playback: [],
          note: "promoted",
          promoted: true,
        };
      },
    });
    expect(capturedSnapshotLength).toBe(0);
    expect(getPolicyLibrary()).toHaveLength(1);
    expect(getPolicyLibrary()[0].weights).toEqual([1.1, 0.4, -0.3, 0.8]);

    // 3. Subsequent run receives the archived champion in librarySnapshot
    let nextSnapshotLength = -1;
    startCommitteeJob({
      ownerHash: "owner-1",
      idempotencyKey: "run-3-warmstart",
      horizonDays: 40,
      baseSeed: 303,
      run: (req) => {
        nextSnapshotLength = req.librarySnapshot?.length ?? 0;
        return {
          status: "completed",
          stateRevision: 2,
          recommendedPolicyVersion: 0,
          finalAudit: "not-run",
          weights: [0, 0, 0, 0],
          baselineMean: 2000,
          candidateMean: 1900,
          trajectories: 177,
          playback: [],
          note: "kept incumbent",
          promoted: false,
        };
      },
    });
    expect(nextSnapshotLength).toBe(1);

    clearPolicyLibrary();
    expect(getPolicyLibrary()).toHaveLength(0);
  });
});
