import { expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import App from '../../App';

test('returning players see the objective, deliberate day advance and a direct zone action', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => '2' } });
  try {
    const html = renderToStaticMarkup(createElement(App));
    expect(html).toContain('aria-label="Objetivo de la partida"');
    expect(html).toContain('cura al 100%');
    expect(html).toContain('40 días');
    expect(html).toContain('35% de la ciudad');
    expect(html).toContain('El tiempo no corre solo');
    expect(html).toContain('Elegir medidas en esta zona');
    expect(html).toContain('+3 puntos de cura/día');
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
