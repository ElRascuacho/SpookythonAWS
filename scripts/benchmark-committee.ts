import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { benchmarkFrozenPolicy, type BenchmarkPlan } from '../src/domain/committee/benchmark';
import type { PolicyArtifact } from '../src/domain/committee/offline';

export interface BenchmarkOptions { artifact: string; plan: string; output: string }

/** A local-only report; no registry writes or AWS calls. */
export function parseBenchmarkArgs(args: string[]): BenchmarkOptions {
  const values = new Map<string, string>();
  const allowed = new Set(['--artifact', '--plan', '--output']);
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]; const value = args[index + 1];
    if (!allowed.has(key) || !value || value.startsWith('--') || values.has(key)) throw new Error('Invalid or duplicate benchmark argument');
    values.set(key, value);
  }
  const artifact = values.get('--artifact'); const plan = values.get('--plan'); const output = values.get('--output');
  if (!artifact || !plan || !output) throw new Error('--artifact, --plan and --output are required');
  return { artifact, plan, output };
}

function sourceRevision(): { sha: string | null; dirty: boolean | null } {
  try {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0;
    return { sha, dirty };
  } catch {
    return { sha: null, dirty: null };
  }
}

export async function runLocalBenchmark(options: BenchmarkOptions, benchmark: typeof benchmarkFrozenPolicy = benchmarkFrozenPolicy) {
  parseBenchmarkArgs(['--artifact', options.artifact, '--plan', options.plan, '--output', options.output]);
  const [artifactJson, planJson] = await Promise.all([readFile(options.artifact, 'utf8'), readFile(options.plan, 'utf8')]);
  const artifactInput = JSON.parse(artifactJson);
  const artifact = (artifactInput.artifact ?? artifactInput) as PolicyArtifact;
  const plan = JSON.parse(planJson) as BenchmarkPlan;
  const provenance = {
    source: sourceRevision(),
    artifactFileSha256: createHash('sha256').update(artifactJson).digest('hex'),
    planFileSha256: createHash('sha256').update(planJson).digest('hex'),
  };
  const beforeCpu = process.cpuUsage();
  const beforeMemory = process.memoryUsage();
  const started = performance.now();
  const result = benchmark({ artifact, plan });
  const elapsedWallMs = performance.now() - started;
  const cpu = process.cpuUsage(beforeCpu);
  const afterMemory = process.memoryUsage();
  const report = {
    schemaVersion: 1,
    published: false,
    provenance,
    profile: {
      scope: 'local-only-not-aws-cost',
      runtime: typeof Bun === 'undefined' ? 'unknown' : `Bun ${Bun.version}`,
      arch: process.arch,
      platform: process.platform,
      elapsedWallMs,
      cpuUserMicros: cpu.user,
      cpuSystemMicros: cpu.system,
      rssBeforeBytes: beforeMemory.rss,
      rssAfterBytes: afterMemory.rss,
      heapBeforeBytes: beforeMemory.heapUsed,
      heapAfterBytes: afterMemory.heapUsed,
      awsCostUsd: null,
    },
    result,
  };
  await writeFile(options.output, JSON.stringify(report), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return report;
}

if (import.meta.main) {
  try {
    const options = parseBenchmarkArgs(process.argv.slice(2));
    const report = await runLocalBenchmark(options);
    console.log(`Local benchmark: ${report.result.scenarios.length} scenarios; equal-scenario mean improvement=${report.result.aggregate.meanImprovement}. Not published: ${options.output}`);
  } catch (error) {
    console.error(`Benchmark failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
