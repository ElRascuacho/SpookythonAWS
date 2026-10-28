import { describe, expect, test } from "bun:test";
import { learnStrategy } from "../strategyAdvisor";

describe("strategy advisor", () => {
  test("learns a better candidate and checks it on unseen runs", () => {
    const calls: number[] = [];
    const advice = learnStrategy("RANDOM", 42, (plan, index) => { calls.push(index); return plan === "SMART_CORTAFUEGOS" ? 100 : 200; });
    expect(advice.candidate).toBe("SMART_CORTAFUEGOS");
    expect(advice.confirmed).toBe(true);
    expect(advice.candidateMean).toBe(100);
    expect(calls.filter((index) => index < 2000)).toHaveLength(20);
    expect(calls.filter((index) => index >= 2000)).toHaveLength(6);
    expect(learnStrategy("RANDOM", 42, (plan) => plan === "SMART_CORTAFUEGOS" ? 100 : 200)).toEqual(advice);
  });
  test("does not claim an improvement when validation is worse", () => {
    const advice = learnStrategy("RANDOM", 5, (plan, index) => plan === "SMART_CORTAFUEGOS" ? (index < 2000 ? 50 : 300) : 100);
    expect(advice.candidate).toBe("SMART_CORTAFUEGOS");
    expect(advice.confirmed).toBe(false);
  });
});
