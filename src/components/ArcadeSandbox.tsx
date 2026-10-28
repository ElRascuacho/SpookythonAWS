import { useEffect, useState } from 'react';
import { MANTA_NODES } from '../domain/mantaGraph';
import { createSandbox, sandboxAction, tickSandbox } from '../domain/arcadeSandbox';
import './gameMenu.css';

export function ArcadeSandbox({ onBack }: { onBack: () => void }) {
  const [state, setState] = useState(createSandbox);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setState(tickSandbox), 1000 / speed);
    return () => window.clearInterval(timer);
  }, [running, speed]);
  return <main className="game-menu" aria-labelledby="arcade-title">
    <header className="game-menu-header"><strong>ZERO DAY / SANDBOX</strong><button className="secondary-button" onClick={onBack}>Volver al menú</button></header>
    <section className="game-menu-content">
      <p className="eyebrow">REGLAS PROPIAS · SIN PRESUPUESTO · SIN DERROTA</p>
      <h1 id="arcade-title">Modo Arcade</h1>
      <p className="game-menu-intro">Crea brotes o limpia zonas con un toque. Recursos ilimitados: experimenta sin afectar el modo principal. El objetivo libre es dejar todas las zonas a cero.</p>
      <p>Reglas Arcade: el riesgo sube cada pulso y, al llegar a 50, contagia la casilla anterior. Ajusta la dificultad de cada zona: − reduce el riesgo en 35 y + lo aumenta en 40. No es el modelo epidemiológico principal.</p>
      <div className="arcade-controls" aria-label="Controles Arcade">
        <button className="primary-button" onClick={() => setRunning(!running)}>{running ? 'Pausar' : 'Iniciar acción'}</button>
        <div className="arcade-speed" role="group" aria-label="Velocidad de simulación">
          <span>Velocidad</span>
          {[1, 3].map(value => <button key={value} type="button" aria-pressed={speed === value} onClick={() => setSpeed(value)}>{value}×</button>)}
        </div>
        <button className="secondary-button" onClick={() => { setState(createSandbox()); setRunning(false); }}>Reiniciar sandbox</button>
      </div>
      <p role="status">{running ? 'En marcha' : 'Pausado'} · Pulsos: {state.ticks} · Puntos de limpieza: {state.score} · {state.zones.every(n => n === 0) ? '¡Ciudad limpia! Crea otro brote para seguir.' : 'Ajusta la dificultad con − y + en cada zona.'}</p>
      <div className="arcade-grid">{MANTA_NODES.map((node, i) => <article key={node.id} className="game-menu-option arcade-zone" aria-label={node.name}>
        <strong>{node.name}</strong><span>Riesgo {state.zones[i]} / 100</span><meter min={0} max={100} value={state.zones[i]} aria-label={`Riesgo en ${node.name}`} />
        <div className="arcade-difficulty"><span>Dificultad</span><div role="group" aria-label={`Dificultad de ${node.name}`}>
          <button type="button" aria-label={`Reducir dificultad en ${node.name}`} title="Reducir riesgo en 35" disabled={state.zones[i] === 0} onClick={() => setState(s => sandboxAction(s, i, 'cure'))}>−</button>
          <button type="button" aria-label={`Aumentar dificultad en ${node.name}`} title="Aumentar riesgo en 40" disabled={state.zones[i] === 100} onClick={() => setState(s => sandboxAction(s, i, 'outbreak'))}>+</button>
        </div></div>
      </article>)}</div>
      <p className="game-menu-note">Puntuación experimental, sin monedas ni recompensas del modo principal. Al salir o recargar se reinicia este sandbox.</p>
    </section>
  </main>;
}
