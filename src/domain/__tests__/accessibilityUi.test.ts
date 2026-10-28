import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { ComparisonChart } from '../../components/ComparisonChart';
import { FieldOperations } from '../../components/FieldOperations';
import { ResearchWorkspace } from '../../research/ResearchWorkspace';
import { createGame } from '../cureGame';
import { runMonteCarloComparison } from '../monteCarlo';

const game = createGame({ seed: 42, scenario: 'standard', patientZeroId: 'N01', dailyBudget: 7500 });

describe('accessible UI contracts', () => {
  test('comparison provides a named native day selector and a legible scrollable graph', () => {
    const result = runMonteCarloComparison({ ...game.params, days: 2, monteCarloRuns: 1 });
    const html = renderToStaticMarkup(createElement(ComparisonChart, { result, currentDay: 1, onSelectDay: () => {}, activeStrategy: 'SMART_CORTAFUEGOS' }));
    expect(html).toContain('type="range"');
    expect(html).toContain('min="0" max="2"');
    expect(html).toContain('aria-valuetext="Día 1 de 2"');
    expect(html).toContain('role="region"');
    expect(html).toContain('min-width:760px');
    expect(html).not.toContain('text-[10px]');
    expect(html).toContain('grid-cols-1 lg:grid-cols-3');
    expect(html).toContain('aria-live="polite"');
  });

  test('parkour exposes named touch controls and keeps the covered canvas out of tab order', () => {
    const html = renderToStaticMarkup(createElement(FieldOperations, { game, nodeId: 'N01', kind: 'parkour', onComplete: () => '' }));
    for (const label of ['Mover a la izquierda', 'Mover a la derecha', 'Saltar']) expect(html).toContain(`aria-label="${label}"`);
    expect(html).toContain('class="field-touch-controls"');
    expect(html).toContain('tabindex="-1"');
  });

  test('laboratory result is focusable and research announces only additions to its log', () => {
    const lab = renderToStaticMarkup(createElement(FieldOperations, { game, nodeId: 'N04', kind: 'lab', onComplete: () => '' }));
    expect(lab).toContain('tabindex="-1" role="status"');
    const research = renderToStaticMarkup(createElement(ResearchWorkspace, { visible: true, gameParams: null, onBack: () => {} }));
    expect(research).toContain('role="log" aria-live="polite" aria-relevant="additions" aria-atomic="false"');
    expect(research).toContain('class="rw-agent-status" role="status"');
  });

  test('control boundary token exceeds 3:1 against both form surfaces', () => {
    const css = readFileSync(new URL('../../index.css', import.meta.url), 'utf8');
    const border = css.match(/--control-border:\s*(#[0-9a-f]{6})/i)![1];
    const luminance = (hex: string) => {
      const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
      return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
    };
    for (const fill of ['#0c1c23', '#0f2028', '#14252d']) {
      const a = luminance(border), b = luminance(fill);
      expect((Math.max(a, b) + .05) / (Math.min(a, b) + .05)).toBeGreaterThanOrEqual(3);
    }
  });
});
