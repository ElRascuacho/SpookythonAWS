import { test, expect } from "bun:test";
import { handleResearchAgent } from "../researchAgent";
import { newWorkspace } from "../../src/domain/research";
const context = {
  schemaVersion: 1,
  selectedMeasure: null,
  editableParameters: newWorkspace().params,
  executionParameters: null,
  configurationChanged: true,
  observed: {
    day: 0,
    infected: 10,
    exposed: 0,
    recovered: 0,
    cumulativeInfected: 10,
    hospitalCollapsed: false,
  },
  measures: [],
  evidence: null,
  evidenceCurrent: false,
  committee: null,
  committeeReadAt: null,
};
const env = { ENABLE_RESEARCH_AI: "true", OPENAI_API_KEY: "test-only" };
const request = (value: unknown) =>
  new Request("https://app.test/api/research/agent", {
    method: "POST",
    body: JSON.stringify({
      message: "Explica mi escenario",
      current: null,
      context: value,
    }),
  });
test("agent receives a validated bounded snapshot and explicit evidence limitations", async () => {
  let payload: any;
  const fetcher = (async (_url: unknown, init: any) => {
    payload = JSON.parse(init.body);
    return Response.json({
      status: "completed",
      output: [
        {
          content: [
            {
              type: "output_text",
              text: JSON.stringify({
                scope: "research",
                reply: "La configuración editable cambió.",
                proposal: null,
              }),
            },
          ],
        },
      ],
    });
  }) as typeof fetch;
  const result = await handleResearchAgent(
    request(context),
    "context-valid",
    env,
    fetcher,
  );
  expect(result.status).toBe(200);
  expect(JSON.parse(payload.input).context).toEqual(context);
  expect(payload.instructions).toContain("evidenceCurrent=false");
  expect(payload.instructions).toContain(
    "el API actual del Comité no las recibe",
  );
  expect(payload.instructions).toContain("simulador no calibrado");
});
test("rejects unknown context fields, future trajectories and invalid observed values before provider access", async () => {
  let calls = 0;
  const fetcher = (async (): Promise<Response> => {
    calls++;
    throw Error("must not be called");
  }) as unknown as typeof fetch;
  for (const invalid of [
    { ...context, timeline: [{ day: 40 }] },
    { ...context, observed: { ...context.observed, infected: -1 } },
    { ...context, execute: "apply()" },
  ])
    expect(
      (
        await handleResearchAgent(
          request(invalid),
          "context-invalid",
          env,
          fetcher,
        )
      ).status,
    ).toBe(400);
  expect(calls).toBe(0);
});
