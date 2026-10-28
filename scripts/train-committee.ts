import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { trainOffline } from '../src/domain/committee/offline';
import { PROTOCOL_BUDGET } from '../src/domain/committee/types';

interface TrainingOptions { output: string; baseSeed: number; horizonDays: number }

/** The operator supplies only bounded scenario inputs, never search internals. */
export function parseTrainingArgs(args: string[]): TrainingOptions {
  const allowed = new Set(['--output', '--seed', '--days']);
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]; const value = args[i + 1];
    if (!allowed.has(key) || !value || value.startsWith('--') || values.has(key)) throw new Error('Invalid or duplicate argument');
    values.set(key, value);
  }
  const output = values.get('--output');
  if (!output || !output.trim()) throw new Error('--output is required');
  const seedText = values.get('--seed') ?? '20261030';
  const daysText = values.get('--days') ?? '40';
  if (!/^\d+$/.test(seedText) || !/^\d+$/.test(daysText)) throw new Error('Seed and days must be integers');
  const baseSeed = Number(seedText); const horizonDays = Number(daysText);
  if (!Number.isSafeInteger(baseSeed) || baseSeed < 0 || baseSeed > 0xffffffff) throw new Error('Seed must be between 0 and 4294967295');
  if (!Number.isInteger(horizonDays) || horizonDays < 20 || horizonDays > 60) throw new Error('Days must be between 20 and 60');
  return { output, baseSeed, horizonDays };
}

/** Local-only operator flow: never publishes or touches the cloud registry. */
export async function runLocalTraining(options: TrainingOptions, train: typeof trainOffline = trainOffline) {
  // Validate programmatic callers using the same bounds as the CLI.
  parseTrainingArgs(['--output', options.output, '--seed', String(options.baseSeed), '--days', String(options.horizonDays)]);
  const result = train({ jobId: randomUUID(), baseSeed: options.baseSeed, horizonDays: options.horizonDays });
  if (result.trajectories !== PROTOCOL_BUDGET.total || result.ledger.length !== result.trajectories || result.audit === 'not-run') throw new Error('Incomplete training result');
  const ledger = result.ledger.map(({ timeline: _timeline, ...trajectory }) => trajectory);
  const record = { schemaVersion: 1, published: false, artifact: result.artifact, audit: result.audit, finalEvidence: result.finalEvidence, promotion: result.promotion, baseline: result.baseline, final: result.final, trajectories: result.trajectories, ledger };
  await writeFile(options.output, JSON.stringify(record), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return result;
}

if (import.meta.main) {
  try {
    const options = parseTrainingArgs(process.argv.slice(2));
    const result = await runLocalTraining(options);
    console.log(`Local training complete: ${result.trajectories} trajectories; audit=${result.audit}; recommendation=${result.artifact.recommendation}. Not published: ${options.output}`);
  } catch (error) {
    console.error(`Training failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
