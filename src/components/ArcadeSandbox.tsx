import { useEffect, useState } from 'react';
import { MANTA_NODES } from '../domain/mantaGraph';
import { createSandbox, sandboxAction, tickSandbox } from '../domain/arcadeSandbox';
import './gameMenu.css';

export function ArcadeSandbox({ onBack }: { onBack: () => void }) {
  const [state, setState] = useState(createSandbox);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [action, setAction] = useState<'cure' | 'outbreak'>('cure');
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
      <p>Reglas Arcade: el riesgo sube cada pulso y, al llegar a 50, contagia la casilla anterior. Curar resta 35; crear un brote suma 40. No es el modelo epidemiológico principal.</p>
      <div className="arcade-controls" aria-label="Controles Arcade">
        <button className="primary-button" onClick={() => setRunning(!running)}>{running ? 'Pausar' : 'Iniciar acción'}</button>
        <button className="secondary-button" aria-pressed={action === 'cure'} onClick={() => setAction('cure')}>Curar −35</button>
        <button className="secondary-button" aria-pressed={action === 'outbreak'} onClick={() => setAction('outbreak')}>Crear brote +40</button>
        <label>Velocidad <select value={speed} onChange={e => setSpeed(Number(e.target.value))}><option value={1}>1×</option><option value={3}>3×</option></select></label>
        <button className="secondary-button" onClick={() => { setState(createSandbox()); setRunning(false); }}>Reiniciar sandbox</button>
      </div>
      <p role="status">{running ? 'En marcha' : 'Pausado'} · Pulsos: {state.ticks} · Puntos de limpieza: {state.score} · {state.zones.every(n => n === 0) ? '¡Ciudad limpia! Crea otro brote para seguir.' : 'Selecciona una herramienta y toca una zona.'}</p>
      <div className="arcade-grid">{MANTA_NODES.map((node, i) => <button key={node.id} className="game-menu-option" onClick={() => setState(s => sandboxAction(s, i, action))} aria-label={`${action === 'cure' ? 'Curar' : 'Crear brote en'} ${node.name}, riesgo ${state.zones[i]}`}>
        <strong>{node.name}</strong><span>Riesgo {state.zones[i]} / 100</span><meter min={0} max={100} value={state.zones[i]} aria-label={`Riesgo en ${node.name}`} />
      </button>)}</div>
      <p className="game-menu-note">Puntuación experimental, sin monedas ni recompensas del modo principal. Al salir o recargar se reinicia este sandbox.</p>
    </section>
  </main>;
}
