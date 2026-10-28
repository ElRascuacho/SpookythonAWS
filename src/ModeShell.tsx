import { createContext, lazy, Suspense, useContext, useState, type ReactNode } from "react";
import CommitteePanel from "./committee/CommitteePanel";
import { Activity, Clapperboard, Brain, LoaderCircle } from "lucide-react";
import type { AppProps } from "./App";

export type Mode = "game" | "campaign" | "committee";

export interface ModeShellProps {
  onLogout?: () => void;
  loggingOut?: boolean;
  initialMode?: Mode;
  onModeChange?: (mode: Mode) => void;
  renderApp?: (props: AppProps) => ReactNode;
  renderCommittee?: () => ReactNode;
}

const DefaultApp = lazy(() => import("./App"));

const ModeContext = createContext<{
  mode: Mode;
  switchMode: (mode: Mode) => void;
} | null>(null);

export function ModeTabs({ onSelect }: { onSelect?: (mode: Mode) => void }) {
  const ctx = useContext(ModeContext);
  if (!ctx) return null;
  const { mode, switchMode } = ctx;
  const select = (next: Mode) => {
    switchMode(next);
    onSelect?.(next);
  };
  return (
    <nav className="mode-shell-nav" role="tablist" aria-label="Selector de modo">
      <button type="button" role="tab" aria-label="Juego" aria-selected={mode === "game"} className={`mode-shell-tab ${mode === "game" ? "active" : ""}`} onClick={() => select("game")} data-testid="tab-game">
        <Activity size={15} /><span>Juego</span>
      </button>
      <button type="button" role="tab" aria-label="Campaña" aria-selected={mode === "campaign"} className={`mode-shell-tab ${mode === "campaign" ? "active" : ""}`} onClick={() => select("campaign")} data-testid="tab-campaign">
        <Clapperboard size={15} /><span>Campaña</span>
      </button>
      <button type="button" role="tab" aria-label="Comité" aria-selected={mode === "committee"} className={`mode-shell-tab ${mode === "committee" ? "active" : ""}`} onClick={() => select("committee")} data-testid="tab-committee">
        <Brain size={15} /><span>Comité</span>
      </button>
    </nav>
  );
}

export default function ModeShell({
  onLogout,
  loggingOut = false,
  initialMode = "game",
  onModeChange,
  renderApp,
  renderCommittee,
}: ModeShellProps) {
  const [mode, setMode] = useState<Mode>(initialMode);

  const switchMode = (newMode: Mode) => {
    setMode(newMode);
    onModeChange?.(newMode);
  };

  const appElement = renderApp ? (
    renderApp({ onLogout, loggingOut, activeMode: mode, onModeChange: switchMode, inactive: mode === "committee" })
  ) : (
    <Suspense
      fallback={
        <div className="access-loading" role="status">
          <LoaderCircle className="access-spinner" /> Preparando el centro de respuesta…
        </div>
      }
    >
      <DefaultApp
        onLogout={onLogout}
        loggingOut={loggingOut}
        activeMode={mode}
        inactive={mode === "committee"}
        onModeChange={switchMode}
      />
    </Suspense>
  );

  return (
    <ModeContext.Provider value={{ mode, switchMode }}>
    <div className="mode-shell" data-testid="mode-shell">
      <style>{`
        .mode-shell {
          position: relative;
          width: 100%;
          height: 100%;
        }
        /* A containing block keeps the fixed game UI below the shared mode tabs. */
        .mode-shell-app-slot {
          position: fixed;
          inset: 0;
          transform: translateZ(0);
        }
        .mode-shell-nav {
          position: static;
          z-index: 1;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 4px;
          background: rgba(8, 20, 28, 0.94);
          border: 1px solid #1f394a;
          border-radius: 9999px;
          backdrop-filter: blur(12px);
          box-shadow: 0 4px 18px rgba(0, 0, 0, 0.45);
        }
        .mode-shell-tab {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 5px 14px;
          border-radius: 9999px;
          border: none;
          background: transparent;
          color: var(--muted, #9eb9c7);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.18s ease;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .mode-shell-tab:hover {
          color: var(--text, #edf6fa);
          background: rgba(31, 57, 74, 0.5);
        }
        .mode-shell-tab.active {
          color: var(--mint-ink, #041f15);
          background: var(--mint, #2ee59d);
          box-shadow: 0 0 14px rgba(46, 229, 157, 0.38);
        }
        .mode-shell-hidden {
          display: none !important;
        }
        .committee-shell {
          position: fixed;
          inset: 0;
          z-index: 35;
          background: var(--ink, #071016);
          color: var(--text, #edf6fa);
          padding: 88px 32px 32px;
          overflow-y: auto;
        }
        .committee-placeholder-panel {
          max-width: 900px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .committee-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 1px solid var(--line, #1e3545);
          padding-bottom: 20px;
        }
        .committee-badge {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.1em;
          color: var(--mint, #2ee59d);
          background: rgba(46, 229, 157, 0.12);
          border: 1px solid rgba(46, 229, 157, 0.3);
          padding: 3px 8px;
          border-radius: 4px;
          display: inline-block;
          margin-bottom: 8px;
        }
        .committee-title-group h2 {
          font-size: 24px;
          margin: 0 0 6px;
          color: var(--text, #edf6fa);
        }
        .committee-subtitle {
          font-size: 13px;
          color: var(--muted, #9eb9c7);
          max-width: 640px;
          margin: 0;
          line-height: 1.5;
        }
        .committee-content-frame {
          background: var(--panel, #0d1922);
          border: 1px solid var(--line, #1e3545);
          border-radius: 8px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .committee-content-frame label {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 14px;
          color: var(--text, #edf6fa);
        }
        .committee-content-frame input[type="number"] {
          background: #08131b;
          border: 1px solid var(--control-border, #82a6b8);
          border-radius: 4px;
          color: var(--text, #edf6fa);
          padding: 8px 12px;
          font: 15px var(--mono, monospace);
        }
        .committee-content-frame button[type="submit"] {
          align-self: flex-start;
          background: var(--mint, #2ee59d);
          color: var(--mint-ink, #041f15);
          border: 1px solid #63f5b8;
          border-radius: 4px;
          padding: 10px 20px;
          font-weight: 700;
          box-shadow: 0 4px 16px rgba(46, 229, 157, 0.2);
        }
        .committee-content-frame button[type="submit"]:hover:not(:disabled) {
          background: var(--mint-hover, #52f2b4);
        }
        .committee-status-card {
          display: flex;
          align-items: flex-start;
          gap: 16px;
          padding-top: 12px;
          border-top: 1px solid var(--line, #1e3545);
        }
        .committee-icon {
          color: var(--mint, #2ee59d);
          flex-shrink: 0;
          margin-top: 2px;
        }
        .committee-status-card h3 {
          margin: 0 0 8px;
          font-size: 16px;
          color: var(--text, #edf6fa);
        }
        .committee-status-card p {
          margin: 0;
          font-size: 13px;
          color: var(--muted, #9eb9c7);
          line-height: 1.6;
        }
      `}</style>

      {/* App Container: kept mounted across all modes, hidden with CSS when in committee mode (ADR-0007 / AC-01) */}
      <div
        className={`mode-shell-app-slot ${mode === "committee" ? "mode-shell-hidden" : ""}`}
        style={{ display: mode === "committee" ? "none" : "block" }}
        data-testid="mode-shell-app-slot"
        aria-hidden={mode === "committee"}
      >
        {appElement}
      </div>

      {/* Committee Container: displayed only when committee mode is active. Never receives or injects game actions. */}
      {mode === "committee" && (
        <section
          className="committee-shell"
          data-testid="committee-shell"
          role="tabpanel"
          aria-label="Comité de Aprendizaje"
        >
          <header className="hub-topbar committee-topbar">
            <nav className="header-actions" aria-label="Modos">
              <ModeTabs />
            </nav>
          </header>
          {renderCommittee ? renderCommittee() : <CommitteePanel />}
          {onLogout && (
            <button type="button" className="secondary-button committee-logout" onClick={onLogout} disabled={loggingOut}>
              {loggingOut ? "Saliendo…" : "Cerrar sesión"}
            </button>
          )}
        </section>
      )}
    </div>
    </ModeContext.Provider>
  );
}
