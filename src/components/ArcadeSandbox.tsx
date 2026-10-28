import { useEffect, useMemo, useState } from 'react';
import { MANTA_NODES } from '../domain/mantaGraph';
import { createSandbox, sandboxAction, tickSandbox } from '../domain/arcadeSandbox';
import { createGame } from '../domain/cureGame';
import { CureEarth3DMap } from './CureEarth3DMap';
import { ArcadeMinigames, type ArcadeGame } from './ArcadeMinigames';
import './gameMenu.css';

export function ArcadeSandbox({ onBack }: { onBack: () => void }) {
  const [state, setState] = useState(createSandbox);
  const [started, setStarted] = useState(false);
  const [difficulty, setDifficulty] = useState<'relajada' | 'normal' | 'caotica'>('normal');
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1_000_000));
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [event, setEvent] = useState<ArcadeGame | null>(null);
  const [lastEventTick, setLastEventTick] = useState(0);
  const [selectedNode, setSelectedNode] = useState(MANTA_NODES[0].id);
  const baseSnapshot = useMemo(() => createGame({ seed: 42, scenario: 'standard', patientZeroId: 'N01', dailyBudget: 7500 }).timeline[0], []);
  const arcadeRisk = Object.fromEntries(MANTA_NODES.map((node, i) => [node.id, state.zones[i]]));
  const snapshot = { ...baseSnapshot, day: state.ticks + 3, nodes: Object.fromEntries(MANTA_NODES.map(node => [node.id, { ...baseSnapshot.nodes[node.id], I: arcadeRisk[node.id] * 5, R: 0 }])) };
  useEffect(() => {
    if (!running || event) return;
    const timer = window.setInterval(() => setState(tickSandbox), 1000 / speed);
    return () => window.clearInterval(timer);
  }, [running, speed, event]);
  useEffect(() => {
    if (!running || event || state.ticks - lastEventTick < 6) return;
    if (Math.random() < 0.3 || state.ticks - lastEventTick >= 15) {
      const games: ArcadeGame[] = ['shooter', 'parkour', 'memory', 'reflex'];
      setEvent(games[Math.floor(Math.random() * games.length)]);
      setLastEventTick(state.ticks);
    }
  }, [state.ticks, running, event, lastEventTick]);
  if (!started) return <main className="arcade-setup" aria-labelledby="arcade-setup-title">
    <header className="arcade-topbar"><strong>ZERO DAY <span>/ ARCADE</span></strong><button className="secondary-button" onClick={onBack}>Volver</button></header>
    <section className="arcade-setup-card"><p className="eyebrow">NUEVA PARTIDA · SANDBOX INDEPENDIENTE</p><h1 id="arcade-setup-title">Configura Arcade</h1>
      <p>Elige el ritmo del brote y una semilla para repetir la misma partida. Los minijuegos aparecerán como eventos aleatorios.</p>
      <fieldset><legend>Dificultad del brote</legend>{(['relajada','normal','caotica'] as const).map(value => <button key={value} type="button" aria-pressed={difficulty === value} onClick={() => setDifficulty(value)}>{value === 'relajada' ? 'Relajada · lento' : value === 'normal' ? 'Normal · equilibrado' : 'Caótica · rápido'}</button>)}</fieldset>
      <label className="arcade-seed">Semilla <input type="number" min="0" max="999999" value={seed} onChange={e => setSeed(Math.max(0, Number(e.target.value)))}/></label>
      <button className="secondary-button" onClick={() => setSeed(Math.floor(Math.random()*1_000_000))}>Semilla aleatoria</button>
      <button className="primary-button" onClick={() => { setState(createSandbox(difficulty, seed)); setStarted(true); }}>Iniciar partida Arcade</button>
    </section>
  </main>;
  return <main className="arcade-screen" aria-label="Modo Arcade">
    {event && <button className="arcade-event-alert" onClick={() => document.getElementById('arcade-games-title')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>¡Evento disponible! Ver minijuego ↑</button>}
    <header className="arcade-topbar"><strong>ZERO DAY <span>/ ARCADE</span></strong><div><span>{event ? 'EVENTO' : running ? 'EN MARCHA' : 'PAUSADO'} · {state.ticks} PULSOS</span><button className="secondary-button" onClick={onBack}>Salir</button></div></header>
    <section className={`arcade-layout ${event ? 'has-event' : ''}`}>
      <aside className="arcade-rail"><h1 id="arcade-title">Arcade</h1><p>Desafíos aleatorios y sandbox independiente.</p>
        <button className="primary-button" onClick={() => setRunning(!running)}>{running ? 'Pausar' : 'Iniciar'}</button>
        <div className="arcade-speed" role="group" aria-label="Velocidad de simulación"><span>Velocidad</span>{[1, 3].map(value => <button key={value} type="button" aria-pressed={speed === value} onClick={() => setSpeed(value)}>{value}×</button>)}</div>
        <button className="secondary-button" onClick={() => { setStarted(false); setRunning(false); setEvent(null); setLastEventTick(0); }}>Reiniciar partida</button>
        <p role="status">Puntuación: {state.score} · {state.zones.every(n => n === 0) ? '¡Ciudad limpia!' : 'Riesgo ' + state.zones[selectedNodeIndex(selectedNode)] + '/100'}</p>
        <div className="arcade-difficulty"><span>Dificultad · {MANTA_NODES.find(n => n.id === selectedNode)?.name}</span><div><button aria-label="Reducir dificultad" disabled={state.zones[selectedNodeIndex(selectedNode)] === 0} onClick={() => setState(s => sandboxAction(s, selectedNodeIndex(selectedNode), 'cure'))}>−</button><button aria-label="Aumentar dificultad" disabled={state.zones[selectedNodeIndex(selectedNode)] === 100} onClick={() => setState(s => sandboxAction(s, selectedNodeIndex(selectedNode), 'outbreak'))}>+</button></div></div>
        <ArcadeMinigames game={event} onClose={() => { setLastEventTick(state.ticks); setEvent(null); }} />
      </aside>
      <section className="arcade-map" aria-label="Mapa Arcade de Manta">
        <CureEarth3DMap snapshot={snapshot} arcadeRisk={arcadeRisk} selectedNode={selectedNode} onSelect={setSelectedNode} orders={[]} patientZeroId="" paused={!running || !!event} />
      </section>
    </section>
  </main>;
}

const selectedNodeIndex = (nodeId: string) => MANTA_NODES.findIndex(node => node.id === nodeId);
