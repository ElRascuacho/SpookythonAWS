import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseBenchmarkArgs, runLocalBenchmark } from '../../scripts/benchmark-committee';

describe('local Committee benchmark CLI', () => {
  test('requires explicit artifact, immutable plan and output paths', () => {
    expect(parseBenchmarkArgs(['--artifact', 'a.json', '--plan', 'p.json', '--output', 'o.json'])).toEqual({ artifact: 'a.json', plan: 'p.json', output: 'o.json' });
    for (const args of [[], ['--artifact', 'a.json'], ['--artifact', 'a', '--plan', 'p', '--output', 'o', '--output', 'x'], ['--artifact', 'a', '--plan', 'p', '--output', 'o', '--cloud', 'yes']]) {
      expect(() => parseBenchmarkArgs(args)).toThrow();
    }
  });

  test('writes local-only provenance/profile and refuses overwrite', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'committee-benchmark-'));
    const options = { artifact: join(dir, 'artifact.json'), plan: join(dir, 'plan.json'), output: join(dir, 'report.json') };
    await writeFile(options.artifact, JSON.stringify({ artifactHash: 'hash' }));
    await writeFile(options.plan, JSON.stringify({ schemaVersion: 1, scenarios: [] }));
    const fakeBenchmark = (() => ({ manifest: { planHash: 'plan' }, scenarios: [], aggregate: {} })) as any;
    await runLocalBenchmark(options, fakeBenchmark);
    const report = JSON.parse(await readFile(options.output, 'utf8'));
    expect(report.published).toBe(false);
    expect(report.provenance.artifactFileSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(report.provenance.planFileSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(report.profile.scope).toBe('local-only-not-aws-cost');
    expect(report.profile.awsCostUsd).toBeNull();
    expect(report.profile.arch).toBe(process.arch);
    await expect(runLocalBenchmark(options, fakeBenchmark)).rejects.toThrow();
  });
});
