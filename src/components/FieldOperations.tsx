import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Crosshair, FlaskConical, Footprints, Pause, Play, RotateCcw, ShieldCheck } from 'lucide-react';
import type { CureGame } from '../domain/cureGame';
import type { FieldMissionKind } from '../domain/types';
import { FIELD_MISSIONS, PIPE_PATH, PIPE_SOLUTION, connectedPipes, createPipePuzzle, missionRewardAmount, rotatePipe } from '../domain/fieldMissions';
import { createParkour, createShooter, reloadShooter, shoot, stepParkour, stepShooter, VIEW_H, VIEW_W } from '../domain/fieldArcade';
import { NODE_MAP } from '../domain/mantaGraph';
import { drawParkour, drawShooter } from './fieldScenes';
import './FieldOperations.css';

const icons = { shooter: Crosshair, parkour: Footprints, lab: FlaskConical };
const kinds: FieldMissionKind[] = ['shooter', 'parkour', 'lab'];
type Phase = 'ready' | 'playing' | 'paused' | 'won' | 'lost';

function ArcadeMission({ kind, onWin, receipt }: { kind: 'shooter' | 'parkour'; onWin: () => void; receipt: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const shooter = useRef(createShooter()), parkour = useRef(createParkour());
  const keys = useRef(new Set<string>()), jump = useRef(false);
  const callback = useRef(onWin); callback.current = onWin;
  const [phase, setPhase] = useState<Phase>('ready');
  const [hud, setHud] = useState({ progress: 0, health: 3, ammo: 6, reloading: false, checkpoint: false, distance: 0 });
  const [canvasError, setCanvasError] = useState(false);
  const art = useRef<{ background?: HTMLImageElement; sprite?: HTMLImageElement; weapon?: HTMLImageElement }>({});
  const [artVersion, setArtVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    art.current = {};
    const load = (file: string, key: 'background' | 'sprite' | 'weapon') => {
      const image = new Image(); image.onload = () => { if (alive) { art.current[key] = image; setArtVersion(v => v + 1); } };
      image.src = `${import.meta.env.BASE_URL}field/${file}.webp`;
    };
    load(kind === 'shooter' ? 'quarantine' : 'rooftops', 'background');
    if (kind === 'shooter') { load('zombie', 'sprite'); load('containment-rifle', 'weapon'); }
    return () => { alive = false; };
  }, [kind]);
  useEffect(() => {
    const pause = () => { keys.current.clear(); jump.current = false; setPhase(p => p === 'playing' ? 'paused' : p); };
    const hidden = () => { if (document.hidden) pause(); };
    window.addEventListener('blur', pause); document.addEventListener('visibilitychange', hidden);
    return () => { window.removeEventListener('blur', pause); document.removeEventListener('visibilitychange', hidden); };
  }, []);
  useEffect(() => {
    const c = canvas.current?.getContext('2d');
    if (!c) { setCanvasError(true); return; }
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const paint = () => kind === 'shooter' ? drawShooter(c, shooter.current, reducedMotion, art.current.background, art.current.sprite, art.current.weapon) : drawParkour(c, parkour.current, reducedMotion, art.current.background);
    paint();
    if (phase !== 'playing') { keys.current.clear(); return; }
    canvas.current?.focus();
    let frame = 0, last = 0, lastHud = 0, stopped = false;
    const loop = (now: number) => {
      if (stopped) return;
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0; last = now;
      if (kind === 'shooter') {
        const s = shooter.current, k = keys.current;
        s.aimX = Math.max(18, Math.min(942, s.aimX + (Number(k.has('ArrowRight')) - Number(k.has('ArrowLeft'))) * 360 * dt));
        s.aimY = Math.max(18, Math.min(460, s.aimY + (Number(k.has('ArrowDown')) - Number(k.has('ArrowUp'))) * 300 * dt));
        stepShooter(s, dt);
      } else {
        const k = keys.current;
        stepParkour(parkour.current, dt, Number(k.has('KeyD') || k.has('ArrowRight')) - Number(k.has('KeyA') || k.has('ArrowLeft')), jump.current);
        jump.current = false;
      }
      paint();
      const s = kind === 'shooter' ? shooter.current : parkour.current;
      if (now - lastHud > 100 || s.result !== 'playing') {
        setHud({ progress: kind === 'shooter' ? shooter.current.kills : parkour.current.supplies.filter(Boolean).length, health: s.health, ammo: shooter.current.ammo, reloading: !!shooter.current.reloadUntil, checkpoint: parkour.current.checkpoint > 75, distance: Math.min(100, Math.round((parkour.current.x - 75) / 2045 * 100)) }); lastHud = now;
      }
      if (s.result !== 'playing') { setPhase(s.result); if (s.result === 'won') callback.current(); return; }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => { stopped = true; cancelAnimationFrame(frame); };
  }, [kind, phase, artVersion]);
  const restart = () => { shooter.current = createShooter(); parkour.current = createParkour(); jump.current = false; keys.current.clear(); setHud({ progress: 0, health: 3, ammo: 6, reloading: false, checkpoint: false, distance: 0 }); setPhase('playing'); };
  const aimAt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const b = e.currentTarget.getBoundingClientRect(), scale = Math.min(b.width / VIEW_W, b.height / VIEW_H);
    shooter.current.aimX = (e.clientX - b.left - (b.width - VIEW_W * scale) / 2) / scale;
    shooter.current.aimY = (e.clientY - b.top - (b.height - VIEW_H * scale) / 2) / scale;
  };
  return <>
    <div className="field-livebar">
      <span><ShieldCheck size={18} /> {hud.health} / 3 {kind === 'shooter' ? 'escudos' : 'intentos'}</span>
      <strong>{hud.progress} / {kind === 'shooter' ? '8 objetivos' : '3 reservas'}</strong>
      <span>{kind === 'shooter' ? hud.reloading ? 'Recargando…' : `${hud.ammo} / 6 · munición` : `${hud.distance}% del trayecto${hud.checkpoint ? ' · punto de control' : ''}`}</span>
      <button onClick={() => setPhase(p => p === 'playing' ? 'paused' : p === 'paused' ? 'playing' : p)} disabled={phase !== 'playing' && phase !== 'paused'}><Pause size={16} /> Pausa</button>
    </div>
    <div className={`field-viewport field-${kind}`}>
      <canvas ref={canvas} width={VIEW_W} height={VIEW_H} tabIndex={0} aria-label={kind === 'shooter' ? 'Shooter en primera persona. Apunta con el ratón o flechas; dispara con clic o espacio; R recarga; P pausa.' : 'Parkour. A D o flechas para moverte, espacio o flecha arriba para saltar, P pausa.'}
        onBlur={() => { if (phase === 'playing') { keys.current.clear(); setPhase('paused'); } }}
        onPointerMove={e => { if (kind === 'shooter') aimAt(e); }}
        onPointerDown={e => { if (phase !== 'playing') return; e.currentTarget.focus(); if (kind === 'shooter') { aimAt(e); shoot(shooter.current); } }}
        onKeyDown={e => {
          const handled = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'KeyR', 'KeyP'];
          if (!handled.includes(e.code)) return;
          e.preventDefault();
          if (e.code === 'KeyP' && !e.repeat) { setPhase(p => p === 'playing' ? 'paused' : p === 'paused' ? 'playing' : p); return; }
          if (phase !== 'playing') return;
          keys.current.add(e.code);
          if (kind === 'shooter' && e.code === 'KeyR') reloadShooter(shooter.current);
          if (!e.repeat && (e.code === 'Space' || (kind === 'parkour' && e.code === 'ArrowUp'))) { if (kind === 'shooter') shoot(shooter.current); else jump.current = true; }
        }} onKeyUp={e => keys.current.delete(e.code)} />
      {(phase !== 'playing' || canvasError) && <div className="field-overlay">
        <span className="field-kicker">{phase === 'won' ? 'OPERACIÓN COMPLETADA' : phase === 'lost' ? 'SEÑAL PERDIDA' : phase === 'paused' ? 'OPERACIÓN EN PAUSA' : 'ENLACE DE CAMPO ESTABLECIDO'}</span>
        <h3>{canvasError ? 'No se pudo iniciar el visor' : phase === 'won' ? 'La ciudad tiene una oportunidad más.' : phase === 'lost' ? 'Puedes volver a intentarlo.' : phase === 'paused' ? 'Respira. Tu misión espera.' : FIELD_MISSIONS[kind].title}</h3>
        <p>{canvasError ? 'Tu navegador no permite Canvas 2D. Puedes salir sin perder recursos.' : phase === 'won' ? receipt : phase === 'lost' ? 'Sin recompensa y sin penalización para la ciudad.' : FIELD_MISSIONS[kind].objective}</p>
        {!canvasError && phase !== 'won' && <button className="field-primary" onClick={phase === 'paused' ? () => setPhase('playing') : restart}>{phase === 'paused' ? <Play size={18} /> : phase === 'lost' ? <RotateCcw size={18} /> : <ArrowRight size={18} />}{phase === 'paused' ? 'Continuar misión' : phase === 'lost' ? 'Reintentar' : 'Comenzar misión'}</button>}
      </div>}
    </div>
    <p className="field-controls">{FIELD_MISSIONS[kind].controls} <span>P para pausar. Cambiar de pestaña también pausa.</span></p>
    <p className="field-sr" role="status">{phase === 'won' ? receipt : phase === 'lost' ? 'Operación fallida, puedes reintentar.' : phase === 'paused' ? 'Operación pausada.' : ''}</p>
  </>;
}

function LabPuzzle({ seed, day, onWin, receipt }: { seed: number; day: number; onWin: () => void; receipt: string }) {
  const [pieces, setPieces] = useState(() => createPipePuzzle(seed, day));
  const [moves, setMoves] = useState(0), [message, setMessage] = useState(''), [won, setWon] = useState(false);
  const claimed = useRef(false);
  const reached = connectedPipes(pieces), solved = reached.has(11) && !!(pieces[11] & 2);
  const hint = () => { const cell = PIPE_PATH.find(i => pieces[i] !== PIPE_SOLUTION[i]); if (cell === undefined) return; setPieces(p => p.map((mask, i) => i === cell ? PIPE_SOLUTION[i] : mask)); setMoves(n => n + 1); setMessage(`Conducto ${cell + 1} calibrado. Sigue la luz desde la entrada.`); };
  return <div className="field-lab">
    <div className="field-lab-notes"><span className="field-kicker">SINTETIZADOR / LÁZARO</span><h3>Reconstruye el circuito.</h3><p>La muestra entra por la izquierda de la segunda fila. Conduce la luz hasta la salida derecha de la tercera fila.</p><div className="field-lab-telemetry"><span>Giros realizados <b>{moves}</b></span><span>Circuito <b>{won ? 'Estabilizado' : solved ? 'Conectado' : 'Sin conexión'}</b></span></div><p className="field-lab-hint">Cada pieza gira 90°. Las conexiones activas se iluminan. No hay cronómetro ni penalización por pedir una pista.</p></div>
    <div className="field-puzzle-wrap"><span className="field-port field-port-in">ENTRADA →</span><div className="field-pipes" aria-label="Circuito de laboratorio de cuatro filas y cuatro columnas">
      {pieces.map((mask, i) => <button key={i} disabled={won} className={`field-pipe ${reached.has(i) ? 'energized' : ''}`} aria-label={`Conducto ${i + 1}, fila ${Math.floor(i / 4) + 1}, columna ${i % 4 + 1}. Conecta ${['arriba', 'derecha', 'abajo', 'izquierda'].filter((_, n) => mask & (1 << n)).join(' y ')}. Girar 90 grados.`} onClick={() => { setPieces(p => p.map((m, n) => n === i ? rotatePipe(m) : m)); setMoves(n => n + 1); setMessage(''); }}>
        <svg viewBox="0 0 100 100" aria-hidden="true"><path d={[[50, 0], [100, 50], [50, 100], [0, 50]].map(([x, y], n) => mask & (1 << n) ? `M50 50 L${x} ${y}` : '').join(' ')} /><circle cx="50" cy="50" r="8" /></svg><span>{String(i + 1).padStart(2, '0')}</span>
      </button>)}
    </div><span className="field-port field-port-out">→ CURA</span></div>
    <div className="field-puzzle-footer"><p role="status">{won ? receipt : message || 'Gira los conductos y verifica la conexión.'}</p>{!won && <><button className="field-secondary" onClick={hint}>Pedir pista</button><button className="field-primary" onClick={() => { if (claimed.current) return; if (!solved) { setMessage('El flujo no llega a la salida. Revisa las conexiones iluminadas.'); return; } claimed.current = true; setWon(true); onWin(); }}><FlaskConical size={18} /> Sintetizar cura</button></>}</div>
  </div>;
}

export function FieldOperations({ game, nodeId, onComplete }: { game: CureGame; nodeId: string; onComplete: (kind: FieldMissionKind) => string }) {
  const [selected, setSelected] = useState<FieldMissionKind | null>(null);
  const [receipt, setReceipt] = useState('');
  const [error, setError] = useState('');
  const complete = () => { if (!selected) return; try { setReceipt(onComplete(selected)); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo aplicar la recompensa.'); } };
  return <section className="field-operations">
    <div className="field-context"><span><span className="field-signal" /> DÍA {String(game.day).padStart(2, '0')} · {NODE_MAP[nodeId].name}</span><span>Una recompensa por operación y día</span></div>
    {!selected ? <>
      <p className="field-intro">Tres perspectivas. Una ciudad que proteger.<span>Elige una operación; la simulación no avanza mientras juegas.</span></p>
      <div className="field-missions">{kinds.map((kind, i) => {
        const mission = FIELD_MISSIONS[kind], Icon = icons[kind], done = !!game.actions[game.day]?.fieldRewards?.[kind];
        const eligible = missionRewardAmount(game, kind, nodeId) > 0;
        return <article className={`field-card field-card-${kind}`} key={kind}><div className="field-card-top"><span>0{i + 1} / {mission.role}</span><Icon size={34} strokeWidth={1.3} /></div><h3>{mission.title}</h3><p>{mission.objective}</p><div className="field-card-reward"><ShieldCheck size={18} /><span>{mission.reward}</span></div><button className={done ? 'field-secondary' : 'field-primary'} disabled={done || !eligible || game.status !== 'playing'} onClick={() => { setReceipt(''); setError(''); setSelected(kind); }}>{done ? <><Check size={17} /> Recompensa aplicada</> : !eligible ? 'Sin población elegible' : <>{kind === 'shooter' ? 'Desplegar agente' : kind === 'parkour' ? 'Iniciar extracción' : 'Entrar al laboratorio'} <ArrowRight size={17} /></>}</button></article>;
      })}</div>
      <p className="field-footnote">Operaciones ficticias. El agente usa contención no letal (infectados → recuperados); la extracción protege susceptibles (susceptibles → inmunes). No se elimina población. Salir o fallar no cuesta recursos.</p>
    </> : <>
      <div className="field-mission-title"><button className="field-back" onClick={() => setSelected(null)}><ArrowLeft size={17} /> Operaciones</button><span>{FIELD_MISSIONS[selected].role}</span><strong>{FIELD_MISSIONS[selected].title}</strong></div>
      {selected === 'lab' ? <LabPuzzle seed={game.config.seed} day={game.day} onWin={complete} receipt={receipt} /> : <ArcadeMission key={selected} kind={selected} onWin={complete} receipt={receipt} />}
      {error && <p className="field-error" role="alert">{error}</p>}
    </>}
  </section>;
}
