import {
  DEFAULT_COMPATIBILITY_VERSIONS,
  MAX_POLICY_LIBRARY_ENTRIES,
  WEIGHT_BOUNDS,
  ZERO_POLICY_WEIGHTS,
  type PolicyLibraryEntry,
  type PolicyWeights,
} from "./types";

function isValidWeights(weights: unknown): weights is PolicyWeights {
  if (!Array.isArray(weights) || weights.length !== 4) return false;
  return weights.every(
    (w) => typeof w === "number" && Number.isFinite(w) && w >= WEIGHT_BOUNDS.min && w <= WEIGHT_BOUNDS.max,
  );
}

function isZeroWeights(weights: PolicyWeights): boolean {
  return weights.every((w, index) => w === ZERO_POLICY_WEIGHTS[index]);
}

function serializeWeights(weights: PolicyWeights): string {
  return weights.map((w) => Number(w.toFixed(6))).join(",");
}

/**
 * Filters compatible warm-start weight vectors for a given horizon (algorithm.md §7).
 */
export function filterCompatibleWarmStarts(
  library: readonly PolicyLibraryEntry[],
  horizonDays: number,
): PolicyWeights[] {
  const targetHorizon = Math.round(horizonDays);
  const result: PolicyWeights[] = [];

  for (const entry of library) {
    if (result.length >= MAX_POLICY_LIBRARY_ENTRIES) break;
    if (
      entry.engineVersion === DEFAULT_COMPATIBILITY_VERSIONS.engineVersion &&
      entry.graphVersion === DEFAULT_COMPATIBILITY_VERSIONS.graphVersion &&
      entry.policyFamily === DEFAULT_COMPATIBILITY_VERSIONS.policyFamily &&
      entry.horizonClass === targetHorizon &&
      isValidWeights(entry.weights)
    ) {
      result.push([...entry.weights]);
    }
  }

  return result;
}

export interface ArchiveValidatedPolicyInput {
  readonly weights: PolicyWeights;
  readonly horizonDays: number;
  readonly scoreHint: number;
  readonly archivedAt?: number;
}

/**
 * Archives a statistically validated policy into the bounded policy library.
 * - Rejects ZERO_POLICY_WEIGHTS ([0,0,0,0]) or invalid weights.
 * - Deduplicates identical serialized weights + horizonClass.
 * - Enforces MAX_POLICY_LIBRARY_ENTRIES (8), evicting highest (worst) scoreHint (ties broken by oldest archivedAt).
 * - Returns a frozen sorted copy (best scoreHint first).
 */
export function archiveValidatedPolicy(
  library: readonly PolicyLibraryEntry[],
  input: ArchiveValidatedPolicyInput,
): PolicyLibraryEntry[] {
  if (!isValidWeights(input.weights) || isZeroWeights(input.weights) || !Number.isFinite(input.scoreHint)) {
    return Object.freeze([...library]) as PolicyLibraryEntry[];
  }

  const horizonClass = Math.round(input.horizonDays);
  const archivedAt = input.archivedAt ?? Date.now();
  const normalizedWeights: PolicyWeights = Object.freeze([
    input.weights[0],
    input.weights[1],
    input.weights[2],
    input.weights[3],
  ]) as PolicyWeights;
  const targetKey = serializeWeights(normalizedWeights);

  const nextEntries: PolicyLibraryEntry[] = [];
  let updatedExisting = false;

  for (const entry of library) {
    if (entry.horizonClass === horizonClass && serializeWeights(entry.weights) === targetKey) {
      updatedExisting = true;
      const bestScore = Math.min(entry.scoreHint ?? Number.POSITIVE_INFINITY, input.scoreHint);
      nextEntries.push(
        Object.freeze({
          ...entry,
          scoreHint: bestScore,
          archivedAt: Math.max(entry.archivedAt, archivedAt),
        }),
      );
    } else {
      nextEntries.push(entry);
    }
  }

  if (!updatedExisting) {
    if (nextEntries.length >= MAX_POLICY_LIBRARY_ENTRIES) {
      let worstIdx = 0;
      for (let i = 1; i < nextEntries.length; i += 1) {
        const current = nextEntries[i];
        const worst = nextEntries[worstIdx];
        const currentScore = current.scoreHint ?? Number.POSITIVE_INFINITY;
        const worstScore = worst.scoreHint ?? Number.POSITIVE_INFINITY;
        if (
          currentScore > worstScore ||
          (currentScore === worstScore && current.archivedAt < worst.archivedAt)
        ) {
          worstIdx = i;
        }
      }
      nextEntries.splice(worstIdx, 1);
    }

    const newEntry: PolicyLibraryEntry = Object.freeze({
      entryId: `policy-h${horizonClass}-${targetKey}-${archivedAt}`,
      weights: normalizedWeights,
      engineVersion: DEFAULT_COMPATIBILITY_VERSIONS.engineVersion,
      graphVersion: DEFAULT_COMPATIBILITY_VERSIONS.graphVersion,
      policyFamily: DEFAULT_COMPATIBILITY_VERSIONS.policyFamily,
      horizonClass,
      scoreHint: input.scoreHint,
      archivedAt,
    });
    nextEntries.push(newEntry);
  }

  nextEntries.sort((a, b) => {
    const scoreA = a.scoreHint ?? Number.POSITIVE_INFINITY;
    const scoreB = b.scoreHint ?? Number.POSITIVE_INFINITY;
    if (scoreA !== scoreB) return scoreA - scoreB;
    return b.archivedAt - a.archivedAt;
  });

  return Object.freeze(nextEntries) as PolicyLibraryEntry[];
}
