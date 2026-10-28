import { describe, test, expect } from "bun:test";
import { handleResearchAgent, clearResearchRateLimit } from "../researchAgent";
import { researchMeasure } from "../../src/domain/__tests__/fixtures/researchMeasure";
const request = (
  body: unknown = { message: "Crea una restricción", current: null },
) =>
  new Request("https://app.test/api/research/agent", {
    method: "POST",
    body: JSON.stringify(body),
  });
const env = { ENABLE_RESEARCH_AI: "true", OPENAI_API_KEY: "test-only" };
describe("research agent server boundary (provider doubles only in tests)", () => {
  test("fails honestly without enable flag or credentials", async () => {
    expect((await handleResearchAgent(request(), "disabled", {})).status).toBe(
      503,
    );
    expect(
      (
        await handleResearchAgent(request(), "missing", {
          ENABLE_RESEARCH_AI: "true",
        })
      ).status,
    ).toBe(503);
  });
  test("uses server-side Responses API, Luna and structured output", async () => {
    let payload: any;
    const fetcher = (async (url: any, options: any) => {
      expect(url).toBe("https://api.openai.com/v1/responses");
      payload = JSON.parse(options.body);
      expect(options.headers.Authorization).toBe("Bearer test-only");
      return Response.json({
        status: "completed",
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  reply: "Revisa estos supuestos.",
                  proposal: researchMeasure,
                }),
              },
            ],
          },
        ],
      });
    }) as typeof fetch;
    const response = await handleResearchAgent(
      request(),
      "success",
      env,
      fetcher,
    );
    expect(response.status).toBe(200);
    expect(payload.model).toBe("gpt-6-luna");
    expect(payload.store).toBe(false);
    expect(payload.text.format.strict).toBe(true);
    expect((await response.json()).proposal.name).toBe(researchMeasure.name);
  });
  test("rejects bad input, invalid model output, refusal and incomplete responses", async () => {
    expect(
      (
        await handleResearchAgent(
          request({ message: "x", current: null, secret: "bad" }),
          "bad-input",
          env,
        )
      ).status,
    ).toBe(400);
    for (const result of [
      { status: "incomplete" },
      {
        status: "completed",
        output: [{ content: [{ type: "refusal", refusal: "no" }] }],
      },
      {
        status: "completed",
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  reply: "x",
                  proposal: { ...researchMeasure, costKey: "unknown" },
                }),
              },
            ],
          },
        ],
      },
    ]) {
      const fetcher = (async () =>
        Response.json(result)) as unknown as typeof fetch;
      expect(
        (await handleResearchAgent(request(), "bad-output", env, fetcher))
          .status,
      ).toBe(502);
    }
  });
  test("allows clarification without silently creating an intervention", async () => {
    const fetcher = (async () =>
      Response.json({
        status: "completed",
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  reply: "¿Qué zonas y costo deseas?",
                  proposal: null,
                }),
              },
            ],
          },
        ],
      })) as unknown as typeof fetch;
    const r = await handleResearchAgent(
      request(),
      "clarification",
      env,
      fetcher,
    );
    expect((await r.json()).proposal).toBeNull();
  });
  test("bounds expensive calls per process", async () => {
    clearResearchRateLimit();
    let count = 0;
    const fetcher = (async () => {
      count++;
      return new Response("", { status: 429 });
    }) as unknown as typeof fetch;
    for (let i = 0; i < 4; i++)
      expect(
        (await handleResearchAgent(request(), "limited", env, fetcher)).status,
      ).toBe(502);
    expect(
      (await handleResearchAgent(request(), "limited", env, fetcher)).status,
    ).toBe(429);
    expect(count).toBe(4);
  });
});
