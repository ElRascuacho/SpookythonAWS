import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GameTutorial } from "../../components/GameTutorial";
import { hasCompletedTutorial, rememberTutorialCompletion, tutorialCookieComplete, TUTORIAL_COMPLETED_KEY } from "../tutorialProgress";

const originals = new Map(["document", "localStorage", "location"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
function browser(cookie = "", blockedCookies = false, blockedStorage = false) {
  const values = new Map<string, string>();
  let savedCookie = cookie;
  Object.defineProperty(globalThis, "document", { configurable: true, value: {
    get cookie() { if (blockedCookies) throw Error("Blocked"); return savedCookie; },
    set cookie(value: string) { if (blockedCookies) throw Error("Blocked"); savedCookie = value; },
  } });
  Object.defineProperty(globalThis, "location", { configurable: true, value: { protocol: "https:" } });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem(key: string) { if (blockedStorage) throw Error("Blocked"); return values.get(key) ?? null; },
    setItem(key: string, value: string) { if (blockedStorage) throw Error("Blocked"); values.set(key, value); },
  } });
  return { values, cookie: () => savedCookie };
}
afterEach(() => {
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

describe("first-visit tutorial completion", () => {
  test("accepts only the exact completed cookie version", () => {
    expect(tutorialCookieComplete("other=1; manta_cero_tutorial=2")).toBe(true);
    for (const cookie of ["", "manta_cero_tutorial=1", "manta_cero_tutorial=20", "not_manta_cero_tutorial=2"]) expect(tutorialCookieComplete(cookie)).toBe(false);
  });
  test("a legacy seen marker does not count as completion", () => {
    const env = browser();
    env.values.set("manta-cero:tutorial:v1", "1");
    expect(hasCompletedTutorial()).toBe(false);
    rememberTutorialCompletion();
    expect(hasCompletedTutorial()).toBe(true);
    expect(env.values.get(TUTORIAL_COMPLETED_KEY)).toBe("2");
    expect(env.cookie()).toContain("Max-Age=31536000; Path=/; SameSite=Lax; Secure");
  });
  test("cookie and local storage work independently and blocked persistence does not throw", () => {
    browser("manta_cero_tutorial=2", false, true);
    expect(hasCompletedTutorial()).toBe(true);
    browser("", true, false);
    rememberTutorialCompletion();
    expect(hasCompletedTutorial()).toBe(true);
    browser("", true, true);
    expect(hasCompletedTutorial()).toBe(false);
    expect(() => rememberTutorialCompletion()).not.toThrow();
  });
  test("required welcome has no skip while replay can be closed", () => {
    const props = { config: { seed: 42, scenario: "standard" as const, patientZeroId: "N01", dailyBudget: 7500 }, onClose: () => {}, onComplete: () => {} };
    const required = renderToStaticMarkup(createElement(GameTutorial, { ...props, required: true }));
    expect(required).toContain("Primera visita");
    expect(required).not.toContain("Cerrar guía");
    expect(required).not.toContain("omitir");
    expect(renderToStaticMarkup(createElement(GameTutorial, props))).toContain("Cerrar guía");
  });
});
