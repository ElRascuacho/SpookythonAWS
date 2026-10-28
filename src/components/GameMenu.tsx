import { Activity, ArrowRight, Brain, Clapperboard, Dna, Gamepad2, LogOut } from "lucide-react";
import type { Mode } from "../ModeShell";
import "./gameMenu.css";

export function GameMenu({ onSelect, onLogout, loggingOut, onArcade }: {
  onArcade: () => void;
  onSelect: (mode: Mode) => void;
  onLogout?: () => void;
  loggingOut: boolean;
}) {
  return (
    <main className="game-menu" aria-labelledby="game-menu-title" data-testid="game-menu">
      <header className="game-menu-header">
        <div className="access-brand"><span className="access-brand-icon"><Dna size={26} /></span><span>ZERO DAY<small>OPERACIÓN DE RESPUESTA</small></span></div>
        {onLogout && <button type="button" className="secondary-button" onClick={onLogout} disabled={loggingOut}><LogOut size={16} />{loggingOut ? "Saliendo…" : "Cerrar sesión"}</button>}
      </header>
      <section className="game-menu-content">
        <p className="eyebrow">MANTA, ECUADOR / CENTRO DE RESPUESTA</p>
        <h1 id="game-menu-title">Crea tu próxima <em>partida.</em></h1>
        <p className="game-menu-intro">Elige cómo enfrentar el brote. Tú decides el siguiente paso.</p>
        <div className="game-menu-options">
          <button type="button" className="game-menu-option game-menu-featured" onClick={() => onSelect("game")}>
            <span className="game-menu-option-top"><Activity size={28} /><small>01 / JUEGO LIBRE</small></span>
            <h2>Crear partida</h2>
            <p>Configura el brote, protege las zonas de Manta y completa la cura antes de que sea tarde.</p>
            <span className="game-menu-action">Configurar partida <ArrowRight size={19} /></span>
          </button>
          <button type="button" className="game-menu-option" onClick={() => onSelect("campaign")}>
            <span className="game-menu-option-top"><Clapperboard size={28} /><small>02 / CAMPAÑA</small></span>
            <h2>Campaña</h2>
            <p>Tres capítulos con objetivos concretos. Conoce la misión y toma el mando de cada operación.</p>
            <span className="game-menu-action">Elegir misión <ArrowRight size={19} /></span>
          </button>
          <button type="button" className="game-menu-option" onClick={() => onSelect("committee")}>
            <span className="game-menu-option-top"><Brain size={28} /><small>03 / COMITÉ</small></span>
            <h2>Comparar estrategias</h2>
            <p>Un laboratorio opcional para probar propuestas y comparar resultados sin intervenir en tu partida.</p>
            <span className="game-menu-action">Abrir Comité <ArrowRight size={19} /></span>
          </button>
          <button type="button" className="game-menu-option" onClick={onArcade}><span className="game-menu-option-top"><Gamepad2 size={28} aria-hidden="true" /><small>04 / SANDBOX</small></span><h2>Modo Arcade</h2><p>Juega minijuegos de acción y experimenta en el mapa con recursos ilimitados, sin afectar la partida principal.</p><span className="game-menu-action">Jugar Arcade <ArrowRight size={19} /></span></button>
        </div>
        <p className="game-menu-note">¿Primera vez? La práctica guiada está disponible dentro del juego. Las partidas no se guardan al recargar.</p>
      </section>
    </main>
  );
}
