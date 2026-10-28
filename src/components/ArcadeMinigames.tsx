import { useEffect, useState } from 'react';
import { ArcadeMission } from './FieldOperations';
import { playGameSound } from '../audio/gameSounds';

export type ArcadeGame = 'shooter' | 'parkour' | 'memory' | 'reflex';
const games: { id: ArcadeGame; title: string; description: string }[] = [
  { id: 'shooter', title: 'Perímetro cero', description: 'Apunta y neutraliza objetivos antes de perder tus escudos.' },
  { id: 'parkour', title: 'La última azotea', description: 'Salta obstáculos y recoge suministros para escapar.' },
  { id: 'memory', title: 'Código de emergencia', description: 'Memoriza la secuencia de señales antes de que desaparezca.' },
  { id: 'reflex', title: 'Brigada relámpago', description: 'Atrapa focos de infección antes de que se acabe el tiempo.' },
];

function MemoryGame() {
  const [sequence, setSequence] = useState(() => Array.from({ length: 5 }, () => Math.floor(Math.random() * 4)));
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<'show' | 'play' | 'won' | 'lost'>('show');
  useEffect(() => { if (phase !== 'show') return; const timer = window.setTimeout(() => setPhase('play'), 4000); return () => clearTimeout(timer); }, [phase, sequence]);
  function restart() { setSequence(Array.from({ length: 5 }, () => Math.floor(Math.random() * 4))); setStep(0); setPhase('show'); }
  return <div className="arcade-mini-play"><h3>Código de emergencia</h3><p>Memoriza las 5 señales en orden. Después repítelas; un error termina la ronda.</p>
    <p role="status">{phase === 'show' ? `Memoriza: ${sequence.map(n => n + 1).join(' · ')}` : phase === 'won' ? '¡Código correcto!' : phase === 'lost' ? 'Código incorrecto. Inténtalo de nuevo.' : `Repite la secuencia: ${step} de 5`}</p>
    <div className="arcade-mini-buttons">{[0, 1, 2, 3].map(n => <button key={n} type="button" disabled={phase !== 'play'} onClick={() => { if (sequence[step] !== n) { playGameSound('error'); setPhase('lost'); } else if (step === 4) { playGameSound('win'); setPhase('won'); } else { playGameSound('select'); setStep(step + 1); } }}>Señal {n + 1}</button>)}</div>
    {(phase === 'won' || phase === 'lost') && <button className="secondary-button" onClick={restart}>Jugar de nuevo</button>}
  </div>;
}

function ReflexGame() {
  const [target, setTarget] = useState(0);
  const [hits, setHits] = useState(0);
  const [seconds, setSeconds] = useState(15);
  const [playing, setPlaying] = useState(false);
  useEffect(() => { if (!playing) return; const timer = window.setInterval(() => setSeconds(s => Math.max(0, s - 1)), 1000); return () => clearInterval(timer); }, [playing]);
  useEffect(() => { if (seconds === 0 || hits >= 10) setPlaying(false); }, [seconds, hits]);
  const start = () => { setHits(0); setSeconds(15); setTarget(Math.floor(Math.random() * 9)); setPlaying(true); };
  return <div className="arcade-mini-play"><h3>Brigada relámpago</h3><p>Encuentra y pulsa 10 focos en 15 segundos. Cada foco aparece en una casilla distinta.</p>
    <p role="status">{hits >= 10 ? '¡Brote controlado!' : !playing && seconds === 0 ? 'Tiempo agotado.' : playing ? 'Busca el foco.' : 'Listo para empezar.'} · {hits}/10 · {seconds} s</p>
    <div className="arcade-reflex-grid">{Array.from({ length: 9 }, (_, n) => <button key={n} type="button" disabled={!playing || n !== target || hits >= 10 || seconds === 0} aria-label={n === target && playing ? `Foco activo, casilla ${n + 1}` : `Casilla ${n + 1}`} onClick={() => { playGameSound('hit'); setHits(h => h + 1); setTarget(current => (current + 1 + Math.floor(Math.random() * 8)) % 9); }}>{n === target && playing ? '✦' : '·'}</button>)}</div>
    {!playing && <button className="primary-button" onClick={start}>{seconds === 15 && hits === 0 ? 'Empezar' : 'Jugar de nuevo'}</button>}
  </div>;
}

export function ArcadeMinigames({ game, onClose }: { game: ArcadeGame | null; onClose: () => void }) {
  const [started, setStarted] = useState(false);
  const [receipt, setReceipt] = useState('');
  useEffect(() => { setStarted(false); setReceipt(''); }, [game]);
  const event = games.find(item => item.id === game);
  return <section className="arcade-minigames" aria-labelledby="arcade-games-title">
    <p className="eyebrow">EVENTOS DE CAMPO</p><h2 id="arcade-games-title">Minijuegos Arcade</h2>
    {!game ? <p role="status">Inicia la simulación para descubrir eventos aleatorios. Cuando aparezca uno, el mapa se pausará hasta que lo cierres.</p> : !started ? <div role="status"><h3>¡Evento disponible: {event?.title}!</h3><p>{event?.description}</p><button className="primary-button" onClick={() => setStarted(true)}>Jugar evento</button> <button className="secondary-button" onClick={onClose}>Omitir evento</button></div> : <>
      <button className="secondary-button" onClick={onClose}>Cerrar evento y continuar</button>
      {game === 'memory' ? <MemoryGame /> : game === 'reflex' ? <ReflexGame /> : <div className="arcade-mini-play"><h3>{games.find(item => item.id === game)?.title}</h3><ArcadeMission key={game} kind={game} onWin={() => setReceipt('¡Misión completada!')} receipt={receipt} /></div>}
    </>}
    <p className="game-menu-note">Los dos minijuegos nuevos son independientes y no otorgan monedas; disparos y parkour conservan su progreso cosmético.</p>
  </section>;
}
