import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GameTutorial } from "../../components/GameTutorial";
import { createTutorial } from "../tutorial";

describe("tutorial for first-time players", () => {
  test("prioritizes decisions practice and keeps the shooter optional", () => {
    const markup = renderToStaticMarkup(createElement(GameTutorial, {
      state: createTutorial({ seed: 42, scenario: "standard", patientZeroId: "N01", dailyBudget: 7500 }),
      required: true,
      onStart() {}, onTarget() {}, onClose() {}, onComplete() {}, onGuidedTour() {},
    }));
    expect(markup).toContain("proteger la ciudad y encontrar la cura");
    expect(markup).toContain('class="primary-button">Empezar práctica');
    expect(markup.indexOf("Empezar práctica")).toBeLessThan(markup.indexOf("Practicar con minijuego"));
    expect(markup).toMatch(/<details[^>]*><summary>También quiero practicar un minijuego/);
    expect(markup).toContain("sin minijuegos ni cambios en tu partida");
  });
});
