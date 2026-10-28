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

export function ModeTabs() {
  const ctx = useContext(ModeContext);
  if (!ctx) return null;
  const { mode, switchMode } = ctx;
  return (
    <nav className="mode-shell-nav" role="tablist" aria-label="Selector de modo">
      <button type="button" role="tab" aria-selected={mode === "game"} className={`mode-shell-tab ${mode === "game" ? "active" : ""}`} onClick={() => switchMode("game")} data-testid="tab-game">
        <Activity size={15} /><span>Juego</span>
      </button>
      <button type="button" role="tab" aria-selected={mode === "campaign"} className={`mode-shell-tab ${mode === "campaign" ? "active" : ""}`} onClick={() => switchMode("campaign")} data-testid="tab-campaign">
        <Clapperboard size={15} /><span>Campaña</span>
      </button>
      <button type="button" role="tab" aria-selected={mode === "committee"} className={`mode-shell-tab ${mode === "committee" ? "active" : ""}`} onClick={() => switchMode("committee")} data-testid="tab-committee">
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
          background: rgba(11, 26, 33, 0.92);
          border: 1px solid rgba(43, 65, 72, 0.85);
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
          color: #8da4ae;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.18s ease;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .mode-shell-tab:hover {
          color: #e2f1f5;
          background: rgba(43, 65, 72, 0.4);
        }
        .mode-shell-tab.active {
          color: #0b1a21;
          background: #00e5a3;
          box-shadow: 0 0 12px rgba(0, 229, 163, 0.4);
        }
        .mode-shell-hidden {
          display: none !important;
        }
        .committee-shell {
          position: fixed;
          inset: 0;
          z-index: 35;
          background: #0b1a21;
          color: #e2f1f5;
          padding: 80px 32px 32px;
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
          border-bottom: 1px solid #2b4148;
          padding-bottom: 20px;
        }
        .committee-badge {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.1em;
          color: #00e5a3;
          background: rgba(0, 229, 163, 0.12);
          padding: 3px 8px;
          border-radius: 4px;
          display: inline-block;
          margin-bottom: 8px;
        }
        .committee-title-group h2 {
          font-size: 24px;
          margin: 0 0 6px;
          color: #fff;
        }
        .committee-subtitle {
          font-size: 13px;
          color: #8da4ae;
          max-width: 640px;
          margin: 0;
          line-height: 1.5;
        }
        .committee-content-frame {
          background: rgba(16, 35, 43, 0.85);
          border: 1px solid #2b4148;
          border-radius: 8px;
          padding: 24px;
        }
        .committee-status-card {
          display: flex;
          align-items: flex-start;
          gap: 16px;
        }
        .committee-icon {
          color: #00e5a3;
          flex-shrink: 0;
          margin-top: 2px;
        }
        .committee-status-card h3 {
          margin: 0 0 8px;
          font-size: 16px;
          color: #e2f1f5;
        }
        .committee-status-card p {
          margin: 0;
          font-size: 13px;
          color: #8da4ae;
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
          <header className="hub-topbar">
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
