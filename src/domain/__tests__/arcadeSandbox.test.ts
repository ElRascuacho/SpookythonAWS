import { expect, test } from 'bun:test';
import { createSandbox, sandboxAction, tickSandbox } from '../arcadeSandbox';
test('sandbox actions are immediate, bounded and do not mutate other sessions', () => {
  const original = createSandbox();
  const cured = sandboxAction(original, 0, 'cure');
  expect(cured.zones[0]).toBe(0);
  expect(cured.score).toBe(original.zones[0]);
  expect(original.zones[0]).toBeGreaterThan(0);
  expect(sandboxAction(original, -1, 'cure')).toBe(original);
  let state = original;
  for (let i = 0; i < 100; i++) state = tickSandbox(sandboxAction(state, 0, 'outbreak'));
  expect(state.zones.every(n => n >= 0 && n <= 100)).toBe(true);
  expect(state.ticks).toBe(100);
  expect(createSandbox()).toEqual(original);
});
