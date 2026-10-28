import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import App, { type AppProps } from "../../App";
import ModeShell from "../../ModeShell";

test("default entry shows mode selection without mounting gameplay or committee", () => {
  let mounts = 0;
  const html = renderToStaticMarkup(createElement(ModeShell, {
    renderApp: () => { mounts++; return "GAME"; },
    renderCommittee: () => { mounts++; return "COMMITTEE"; },
  }));
  expect(mounts).toBe(0);
  expect(html).toContain("Crear partida");
  expect(html).toContain("Modo Arcade");
  expect(html).toContain("recursos ilimitados");
  expect(html).toContain("Laboratorio");
  expect(html).toContain("Entrar al laboratorio");
  for (const label of ["JUEGO LIBRE", "Campa\u00f1a", "Comit\u00e9"]) expect(html).toContain(label);
});

test("menu game entry opens setup even without tutorial completion", () => {
  const html = renderToStaticMarkup(createElement<AppProps>(App, { initialSetup: true, activeMode: "game" }));
  expect(html).toContain('role="dialog" aria-modal="true" aria-label="Prepara una nueva misi\u00f3n."');
  expect(html).toContain("Iniciar nueva misi\u00f3n");
  expect(html).not.toContain('class="game-shell is-training');
});

test("direct laboratory entry does not open a hidden setup dialog", () => {
  const html = renderToStaticMarkup(createElement<AppProps>(App, { initialSetup: true, initialResearch: true, activeMode: "game" }));
  expect(html).not.toContain('role="dialog"');
  expect(html).not.toContain('class="game-shell is-training');
});

test("menu campaign and committee entries do not start tutorial or free-game setup", () => {
  for (const activeMode of ["campaign", "committee"] as const) {
    const html = renderToStaticMarkup(createElement<AppProps>(App, { initialSetup: true, activeMode }));
    expect(html).not.toContain('aria-label="Prepara una nueva misi\u00f3n."');
    expect(html).not.toContain('class="game-shell is-training');
  }
});


