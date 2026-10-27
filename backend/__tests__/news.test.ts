import { beforeEach, describe, expect, test } from "bun:test";
import {
  BODY_MAX_WORDS,
  BODY_MIN_WORDS,
  HEADLINE_MAX_CHARS,
  NEWS_SYSTEM_PROMPT,
  buildNewsPrompt,
  countWords,
  fallbackNews,
  newsSeverity,
  type NewsState,
} from "../../src/domain/newsModel";
import {
  NEWS_RATE_LIMIT,
  clearNewsCache,
  clearNewsRateLimit,
  generateNews,
  handleNewsRoute,
  newsCacheKey,
  readModelNews,
  readNewsState,
  takeNewsRateLimit,
} from "../news";

const state = (overrides: Partial<NewsState> = {}): NewsState => ({
  day: 7,
  totalDays: 40,
  status: "playing",
  scenario: "standard",
  seed: 20261030,
  dailyBudget: 7500,
  budgetSpent: 6500,
  funding: 2200,
  research: 35,
  researchGain: 5,
  newCases: 480,
  cumulativeInfected: 12400,
  activeInfections: 2100,
  infectionsGrowthPct: 6.4,
  hospitalLoadPct: 84,
  decisions: { vaccine: 1, fumigate: 0, cordon: 1 },
  zonesAffected: 11,
  zonesTotal: 16,
  ...overrides,
});

const modelBody = (words = 72) =>
  Array.from({ length: words }, (_, index) => `palabra${index}`).join(" ");

const modelResponse = (news: {
  headline: string;
  body: string;
  severity: string;
}) =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(news) } }],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );

beforeEach(() => {
  clearNewsCache();
  clearNewsRateLimit();
});

describe("Daily news model", () => {
  test("fallback is deterministic, varied and within the editorial contract", () => {
    const first = fallbackNews(state());
    expect(first).toEqual(fallbackNews(state()));
    expect(first.source).toBe("fallback");
    expect(first.headline.length).toBeLessThanOrEqual(HEADLINE_MAX_CHARS);
    const words = countWords(first.body);
    expect(words).toBeGreaterThanOrEqual(BODY_MIN_WORDS);
    expect(words).toBeLessThanOrEqual(BODY_MAX_WORDS);
    expect(/[*_#`]/.test(first.body)).toBe(false);

    const headlines = new Set(
      [1, 2, 3, 4, 5].map((day) =>
        fallbackNews(state({ day, seed: 20261030 + day })).headline,
      ),
    );
    expect(headlines.size).toBeGreaterThan(1);
  });

  test("severity follows status, hospital saturation and growth", () => {
    expect(newsSeverity(state({ status: "won" }))).toBe("victory");
    expect(newsSeverity(state({ status: "lost" }))).toBe("critical");
    expect(newsSeverity(state({ hospitalLoadPct: 120 }))).toBe("critical");
    expect(newsSeverity(state({ infectionsGrowthPct: 24 }))).toBe("critical");
    expect(newsSeverity(state({ infectionsGrowthPct: 0 }))).toBe("calm");
    expect(newsSeverity(state({ infectionsGrowthPct: 3 }))).toBe("alert");
    expect(
      fallbackNews(state({ status: "won", research: 100 })).severity,
    ).toBe("victory");
  });

  test("prompt carries Manta territorial context and the JSON contract", () => {
    const { system, user } = buildNewsPrompt(state());
    expect(system).toContain("Manta");
    expect(system).toContain("atunero");
    expect(system).toContain("COE Nacional");
    expect(system).toContain("Hospital Rodríguez Zambrano");
    expect(system).toContain("Ecuador");
    expect(system).toContain("JSON");
    expect(system).toContain("90");
    expect(system).toContain("60 y 110");
    expect(NEWS_SYSTEM_PROMPT).toBe(system);
    expect(JSON.parse(user)).toMatchObject({
      day: 7,
      research: 35,
      decisions: { vaccine: 1, cordon: 1 },
    });
  });

  test("state and model output are validated before use", () => {
    expect(readNewsState(state())).toEqual({
      ...state(),
      decisions: { ...state().decisions, isolation: 0, prevention: 0 },
    });
    expect(readNewsState({ ...state(), decisions: { ...state().decisions, isolation: "bad" } })).toBeNull();
    expect(readNewsState({ ...state(), decisions: undefined })).toBeNull();
    expect(readNewsState({ ...state(), day: "7" })).toBeNull();
    expect(readNewsState({ ...state(), status: "paused" })).toBeNull();
    expect(readNewsState({ ...state(), scenario: "zombie" })).toBeNull();

    const valid = {
      headline: "Boletín de prueba con cifras verificadas",
      body: modelBody(),
      severity: "alert" as const,
    };
    expect(readModelNews(JSON.stringify(valid))).toEqual({
      ...valid,
      source: "ai",
    });
    expect(readModelNews("{}")).toBeNull();
    expect(
      readModelNews(JSON.stringify({ ...valid, body: modelBody(20) })),
    ).toBeNull();
    expect(
      readModelNews(
        JSON.stringify({ ...valid, headline: "x".repeat(HEADLINE_MAX_CHARS + 1) }),
      ),
    ).toBeNull();
    expect(
      readModelNews(JSON.stringify({ ...valid, body: `${modelBody()} **markdown**` })),
    ).toBeNull();
    expect(
      readModelNews(JSON.stringify({ ...valid, severity: "apocalyptic" })),
    ).toBeNull();
  });
});

describe("News generation", () => {
  test("missing credentials fall back without calling the provider", async () => {
    let called = false;
    const news = await generateNews(
      state(),
      {},
      (async () => {
        called = true;
        return modelResponse({
          headline: "No debería usarse",
          body: modelBody(),
          severity: "alert",
        });
      }) as unknown as typeof fetch,
    );
    expect(called).toBe(false);
    expect(news.source).toBe("fallback");
  });

  test("provider failure or invalid output falls back without leaking details", async () => {
    const failing = await generateNews(
      state(),
      { OPENAI_API_KEY: "test-key" },
      (async () => {
        throw new Error("upstream exploded with test-key");
      }) as unknown as typeof fetch,
    );
    expect(failing.source).toBe("fallback");
    expect(failing.body).not.toContain("test-key");

    const invalid = await generateNews(
      state(),
      { OPENAI_API_KEY: "test-key" },
      (async () =>
        new Response("not json", { status: 500 })) as unknown as typeof fetch,
    );
    expect(invalid.source).toBe("fallback");
  });

  test("valid provider output is used and cached per game state", async () => {
    const expected = {
      headline: "COE Manta confirma contención parcial en Tarqui",
      body: modelBody(),
      severity: "alert" as const,
    };
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return modelResponse(expected);
    }) as unknown as typeof fetch;

    const first = await generateNews(
      state(),
      { OPENAI_API_KEY: "test-key" },
      fetchImpl,
    );
    const second = await generateNews(
      state(),
      { OPENAI_API_KEY: "test-key" },
      fetchImpl,
    );

    expect(first).toEqual({ ...expected, source: "ai" });
    expect(second).toEqual(first);
    expect(calls).toBe(1);
    expect(newsCacheKey(state())).toBe(newsCacheKey(state()));
    expect(newsCacheKey(state({ day: 8 }))).not.toBe(newsCacheKey(state()));
  });

  test("HTTP route enforces method, rate limit, body and payload", async () => {
    const getResponse = await handleNewsRoute(
      new Request("http://localhost/api/news"),
      "1.1.1.1",
      {},
    );
    expect(getResponse.status).toBe(405);

    const badBody = await handleNewsRoute(
      new Request("http://localhost/api/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day: "hoy" }),
      }),
      "2.2.2.2",
      {},
    );
    expect(badBody.status).toBe(400);

    const ok = await handleNewsRoute(
      new Request("http://localhost/api/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state()),
      }),
      "3.3.3.3",
      {},
    );
    expect(ok.status).toBe(200);
    expect((await ok.json()).source).toBe("fallback");

    for (let index = 0; index < NEWS_RATE_LIMIT; index += 1)
      takeNewsRateLimit("4.4.4.4");
    expect(takeNewsRateLimit("4.4.4.4").ok).toBe(false);
  });
});
