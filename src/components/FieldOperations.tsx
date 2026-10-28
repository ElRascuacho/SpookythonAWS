import { ACHIEVEMENTS, ARCADE_KEY, COSMETICS, loadProgress, purchase, rewardWin, type ArcadeProgress } from '../domain/arcadeProgress';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, FlaskConical, Pause, Play, RotateCcw, ShieldCheck } from 'lucide-react';
import type { CureGame } from '../domain/cureGame';
import type { FieldMissionKind } from '../domain/types';
import { FIELD_MISSIONS, PIPE_PATH, PIPE_SOLUTION, connectedPipes, createPipePuzzle, rotatePipe } from '../domain/fieldMissions';
import { createParkour, createShooter, reloadShooter, shoot, stepParkour, stepShooter, VIEW_H, VIEW_W } from '../domain/fieldArcade';
import { NODE_MAP } from '../domain/mantaGraph';
import { drawParkour, drawShooter } from './fieldScenes';
import { playGameSound, unlockGameSounds } from '../audio/gameSounds';
import './FieldOperations.css';

type Phase = 'ready' | 'playing' | 'paused' | 'won' | 'lost';

export function ArcadeMission({ kind, onWin, receipt }: { kind: 'shooter' | 'parkour'; onWin: () => void; receipt: string }) {
  const [progress, setProgress] = useState(loadProgress);
  const progressRef = useRef(progress);
  const [saveError, setSaveError] = useState('');
  const claimed = useRef(false);
  const updateProgress = (next: ArcadeProgress) => {
    progressRef.current = next;
    setProgress(next);
    try { localStorage.setItem(ARCADE_KEY, JSON.stringify(next)); setSaveError(''); }
    catch { setSaveError('No se pudo guardar el progreso; se perderá al cerrar.'); }
  };
  const canvas = useRef<HTMLCanvasElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const shooter = useRef(createShooter()), parkour = useRef(createParkour());
  const keys = useRef(new Set<string>()), jump = useRef(false);
  const callback = useRef(onWin); callback.current = onWin;
  const [phase, setPhase] = useState<Phase>('ready');
  const [hud, setHud] = useState({ progress: 0, health: 3, ammo: 6, reloading: false, checkpoint: false, distance: 0 });
  const [canvasError, setCanvasError] = useState(false);
  useEffect(() => { if (phase === 'paused' || phase === 'won' || phase === 'lost') resultHeading.current?.focus(); }, [phase]);
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
        const k = keys.current, s = parkour.current;
        const previousVy = s.vy, previousSupplies = s.supplies.filter(Boolean).length, previousHealth = s.health;
        stepParkour(s, dt, Number(k.has('KeyD') || k.has('ArrowRight')) - Number(k.has('KeyA') || k.has('ArrowLeft')), jump.current);
        if (previousVy >= -400 && s.vy < -400) playGameSound('jump');
        if (s.supplies.filter(Boolean).length > previousSupplies) playGameSound('pickup');
        if (s.health < previousHealth) playGameSound('error');
        jump.current = false;
      }
      paint();
      const s = kind === 'shooter' ? shooter.current : parkour.current;
      if (now - lastHud > 100 || s.result !== 'playing') {
        setHud({ progress: kind === 'shooter' ? shooter.current.kills : parkour.current.supplies.filter(Boolean).length, health: s.health, ammo: shooter.current.ammo, reloading: !!shooter.current.reloadUntil, checkpoint: parkour.current.checkpoint > 75, distance: Math.min(100, Math.round((parkour.current.x - 75) / 2045 * 100)) }); lastHud = now;
      }
      if (s.result !== 'playing') { playGameSound(s.result === 'won' ? 'win' : 'error'); setPhase(s.result); if (s.result === 'won' && !claimed.current) { claimed.current = true; updateProgress(rewardWin(progressRef.current)); callback.current(); } return; }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => { stopped = true; cancelAnimationFrame(frame); };
  }, [kind, phase, artVersion]);
  const restart = () => { unlockGameSounds(); shooter.current = createShooter(); parkour.current = createParkour(); jump.current = false; keys.current.clear(); setHud({ progress: 0, health: 3, ammo: 6, reloading: false, checkpoint: false, distance: 0 }); setPhase('playing'); };
  const fire = () => {
    const s = shooter.current, ammo = s.ammo, kills = s.kills, reloading = s.reloadUntil;
    shoot(s);
    if (s.ammo < ammo) playGameSound('shoot');
    if (s.kills > kills) playGameSound('hit');
    if (!reloading && s.reloadUntil) playGameSound('reload');
  };
  const reload = () => {
    const before = shooter.current.reloadUntil;
    reloadShooter(shooter.current);
    if (!before && shooter.current.reloadUntil) playGameSound('reload');
  };
  const aimAt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const b = e.currentTarget.getBoundingClientRect(), scale = Math.min(b.width / VIEW_W, b.height / VIEW_H);
    shooter.current.aimX = (e.clientX - b.left - (b.width - VIEW_W * scale) / 2) / scale;
    shooter.current.aimY = (e.clientY - b.top - (b.height - VIEW_H * scale) / 2) / scale;
  };
  return <div className="field-arcade" onBlur={e => { if (phase === 'playing' && !e.currentTarget.contains(e.relatedTarget)) { keys.current.clear(); jump.current = false; setPhase('paused'); } }}>
    <details className="field-progression">
      <summary>Arcade · {progress.coins} monedas · Logros y cosméticos</summary>
      <p>Gana una operación arcade: 10 monedas. Los logros dan bonos únicos. Los marcos no cambian la dificultad.</p>
      <ul>{ACHIEVEMENTS.map(a => <li key={a.id}>{progress.wins >= a.target ? '✓' : '○'} {a.name} · {Math.min(progress.wins, a.target)}/{a.target} · +{a.reward} monedas</li>)}</ul>
      <div role="group" aria-label="Tienda de marcos arcade">{COSMETICS.map(c => <button key={c.id} disabled={progress.equipped === c.id || (!progress.owned.includes(c.id) && progress.coins < c.price)} onClick={() => updateProgress(purchase(progress, c.id))}>{c.name} · {progress.equipped === c.id ? 'Equipado' : progress.owned.includes(c.id) ? 'Equipar' : c.price + ' monedas'}</button>)}</div>
      <p role="status">{saveError || 'Progreso guardado en este navegador. Solo arcade.'}</p>
    </details>
    <div className="field-livebar">
      <span><ShieldCheck size={18} /> {hud.health} / 3 {kind === 'shooter' ? 'escudos' : 'intentos'}</span>
      <strong>{hud.progress} / {kind === 'shooter' ? '8 objetivos' : '3 reservas'}</strong>
      <span>{kind === 'shooter' ? hud.reloading ? 'Recargando…' : `${hud.ammo} / 6 · munición` : `${hud.distance}% del trayecto${hud.checkpoint ? ' · punto de control' : ''}`}</span>
      <button onClick={() => setPhase(p => p === 'playing' ? 'paused' : p === 'paused' ? 'playing' : p)} disabled={phase !== 'playing' && phase !== 'paused'}><Pause size={16} /> Pausa</button>
    </div>
    <div style={{ border: `3px solid ${COSMETICS.find(c => c.id === progress.equipped)!.color}` }} className={`field-viewport field-${kind}`}>
      <canvas ref={canvas} width={VIEW_W} height={VIEW_H} tabIndex={phase === 'playing' ? 0 : -1} aria-label={kind === 'shooter' ? 'Shooter en primera persona. Apunta con el ratón o flechas; dispara con clic o espacio; R recarga; P pausa.' : 'Parkour. A D o flechas para moverte, espacio o flecha arriba para saltar, P pausa.'}
        onPointerMove={e => { if (kind === 'shooter') aimAt(e); }}
        onPointerDown={e => { if (phase !== 'playing') return; unlockGameSounds(); e.currentTarget.focus(); if (kind === 'shooter') { aimAt(e); fire(); } }}
        onKeyDown={e => {
          const handled = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'KeyR', 'KeyP'];
          if (!handled.includes(e.code)) return;
          e.preventDefault();
          if (e.code === 'KeyP' && !e.repeat) { setPhase(p => p === 'playing' ? 'paused' : p === 'paused' ? 'playing' : p); return; }
          if (phase !== 'playing') return;
          unlockGameSounds();
          keys.current.add(e.code);
          if (kind === 'shooter' && e.code === 'KeyR') reload();
          if (!e.repeat && (e.code === 'Space' || (kind === 'parkour' && e.code === 'ArrowUp'))) { if (kind === 'shooter') fire(); else jump.current = true; }
        }} onKeyUp={e => keys.current.delete(e.code)} />
      {(phase !== 'playing' || canvasError) && <div className="field-overlay">
        <span className="field-kicker">{phase === 'won' ? 'OPERACIÓN COMPLETADA' : phase === 'lost' ? 'SEÑAL PERDIDA' : phase === 'paused' ? 'OPERACIÓN EN PAUSA' : 'ENLACE DE CAMPO ESTABLECIDO'}</span>
        <h3 ref={resultHeading} tabIndex={-1}>{canvasError ? 'No se pudo iniciar el visor' : phase === 'won' ? 'La ciudad tiene una oportunidad más.' : phase === 'lost' ? 'Puedes volver a intentarlo.' : phase === 'paused' ? 'Respira. Tu misión espera.' : FIELD_MISSIONS[kind].title}</h3>
        <p>{canvasError ? 'Tu navegador no permite Canvas 2D. Puedes salir sin perder recursos.' : phase === 'won' ? receipt : phase === 'lost' ? 'Sin recompensa y sin penalización para la ciudad.' : FIELD_MISSIONS[kind].objective}</p>
        {!canvasError && phase !== 'won' && <button className="field-primary" onClick={phase === 'paused' ? () => setPhase('playing') : restart}>{phase === 'paused' ? <Play size={18} /> : phase === 'lost' ? <RotateCcw size={18} /> : <ArrowRight size={18} />}{phase === 'paused' ? 'Continuar misión' : phase === 'lost' ? 'Reintentar' : 'Comenzar misión'}</button>}
      </div>}
    </div>
    {kind === 'parkour' && <div className="field-touch-controls" role="group" aria-label="Controles de parkour">
      {([['ArrowLeft', 'Mover a la izquierda', '←'], ['ArrowRight', 'Mover a la derecha', '→'], ['Space', 'Saltar', 'Saltar']] as const).map(([code, label, text]) => <button key={code} type="button" aria-label={label} disabled={phase !== 'playing'}
        onPointerDown={e => { e.preventDefault(); unlockGameSounds(); e.currentTarget.setPointerCapture(e.pointerId); keys.current.add(code); if (code === 'Space') jump.current = true; }}
        onPointerUp={() => keys.current.delete(code)} onPointerCancel={() => keys.current.delete(code)} onLostPointerCapture={() => keys.current.delete(code)}
        onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); unlockGameSounds(); keys.current.add(code); if (code === 'Space' && !e.repeat) jump.current = true; } }}
        onKeyUp={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); keys.current.delete(code); } }} onBlur={() => keys.current.delete(code)}>{text}</button>)}
    </div>}
    <p className="field-controls">{FIELD_MISSIONS[kind].controls} <span>P para pausar. Cambiar de pestaña también pausa.</span></p>
    <p className="field-sr" role="status">{phase === 'won' ? receipt : phase === 'lost' ? 'Operación fallida, puedes reintentar.' : phase === 'paused' ? 'Operación pausada.' : ''}</p>
  </div>;
}

function LabPuzzle({ seed, day, onWin, receipt }: { seed: number; day: number; onWin: () => void; receipt: string }) {
  const [pieces, setPieces] = useState(() => createPipePuzzle(seed, day));
  const [moves, setMoves] = useState(0), [message, setMessage] = useState(''), [won, setWon] = useState(false);
  const claimed = useRef(false);
  const resultMessage = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (won) resultMessage.current?.focus(); }, [won]);
  const reached = connectedPipes(pieces), solved = reached.has(11) && !!(pieces[11] & 2);
  const hint = () => { const cell = PIPE_PATH.find(i => pieces[i] !== PIPE_SOLUTION[i]); if (cell === undefined) return; playGameSound('rotate'); setPieces(p => p.map((mask, i) => i === cell ? PIPE_SOLUTION[i] : mask)); setMoves(n => n + 1); setMessage(`Conducto ${cell + 1} calibrado. Sigue la luz desde la entrada.`); };
  return <div className="field-lab">
    <div className="field-lab-notes"><span className="field-kicker">SINTETIZADOR / LÁZARO</span><h3>Reconstruye el circuito.</h3><p>La muestra entra por la izquierda de la segunda fila. Conduce la luz hasta la salida derecha de la tercera fila.</p><div className="field-lab-telemetry"><span>Giros realizados <b>{moves}</b></span><span>Circuito <b>{won ? 'Estabilizado' : solved ? 'Conectado' : 'Sin conexión'}</b></span></div><p className="field-lab-hint">Cada pieza gira 90°. Las conexiones activas se iluminan. No hay cronómetro ni penalización por pedir una pista.</p></div>
    <div className="field-puzzle-wrap"><span className="field-port field-port-in">ENTRADA →</span><div className="field-pipes" aria-label="Circuito de laboratorio de cuatro filas y cuatro columnas">
      {pieces.map((mask, i) => <button key={i} disabled={won} className={`field-pipe ${reached.has(i) ? 'energized' : ''}`} aria-label={`Conducto ${i + 1}, fila ${Math.floor(i / 4) + 1}, columna ${i % 4 + 1}. Conecta ${['arriba', 'derecha', 'abajo', 'izquierda'].filter((_, n) => mask & (1 << n)).join(' y ')}. Girar 90 grados.`} onClick={() => { playGameSound('rotate'); setPieces(p => p.map((m, n) => n === i ? rotatePipe(m) : m)); setMoves(n => n + 1); setMessage(''); }}>
        <svg viewBox="0 0 100 100" aria-hidden="true"><path d={[[50, 0], [100, 50], [50, 100], [0, 50]].map(([x, y], n) => mask & (1 << n) ? `M50 50 L${x} ${y}` : '').join(' ')} /><circle cx="50" cy="50" r="8" /></svg><span>{String(i + 1).padStart(2, '0')}</span>
      </button>)}
    </div><span className="field-port field-port-out">→ CURA</span></div>
    <div className="field-puzzle-footer"><p ref={resultMessage} tabIndex={-1} role="status">{won ? receipt : message || 'Gira los conductos y verifica la conexión.'}</p>{!won && <><button className="field-secondary" onClick={hint}>Pedir pista</button><button className="field-primary" onClick={() => { if (claimed.current) return; if (!solved) { playGameSound('error'); setMessage('El flujo no llega a la salida. Revisa las conexiones iluminadas.'); return; } playGameSound('win'); claimed.current = true; setWon(true); onWin(); }}><FlaskConical size={18} /> Sintetizar cura</button></>}</div>
  </div>;
}

export function FieldOperations({ game, nodeId, kind, onComplete }: { game: CureGame; nodeId: string; kind: FieldMissionKind; onComplete: (kind: FieldMissionKind) => string }) {
  const [receipt, setReceipt] = useState('');
  const [error, setError] = useState('');
  const complete = () => { try { setReceipt(onComplete(kind)); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo aplicar la recompensa.'); } };
  return <section className="field-operations">
    <div className="field-context"><span><span className="field-signal" /> DÍA {String(game.day).padStart(2, '0')} · {NODE_MAP[nodeId].name}</span><span>Una recompensa por operación y día</span></div>
    <div className="field-mission-title"><span>{FIELD_MISSIONS[kind].role}</span><strong>{FIELD_MISSIONS[kind].title}</strong></div>
    {kind === 'lab' ? <LabPuzzle seed={game.config.seed} day={game.day} onWin={complete} receipt={receipt} /> : <ArcadeMission kind={kind} onWin={complete} receipt={receipt} />}
    {error && <p className="field-error" role="alert">{error}</p>}
    <p className="field-footnote">{FIELD_MISSIONS[kind].reward} Operaciones ficticias: se trata o protege a la población, sin eliminarla. {receipt?'Operación completada: cierra esta ventana para continuar.':'El día está bloqueado hasta ganar: esta operación y su recompensa corresponden al turno actual. Salir o fallar no cuesta recursos, pero no desbloquea el día. Vuelve desde «Realizar minijuego» o la burbuja y reintenta.'}</p>
  </section>;
}
