import { useRef, useState } from "react";
import type { TacticalCameraBridge } from "./components/tacticalCamera";
import App from "./App";
import { ResearchWorkspace } from "./research/ResearchWorkspace";
import type { SimulationParams } from "./domain/types";
import "./research/research.css";

export default function WorkspaceShell(props: {
  onLogout?: () => void;
  loggingOut?: boolean;
}) {
  const [mode, setMode] = useState<"game" | "research">("game");
  const [params, setParams] = useState<SimulationParams | null>(null);
  const cameraBridge = useRef<TacticalCameraBridge["current"]>(null);
  return (
    <div className="workspace-shell">
      <div
        className={`workspace-layer ${mode === "game" ? "is-active" : ""}`}
        inert={mode !== "game"}
        aria-hidden={mode !== "game"}
      >
        <App
          {...props}
          inactive={mode !== "game"}
          cameraBridge={cameraBridge}
          onScenarioChange={setParams}
          onOpenResearch={() => {
            setMode("research");
          }}
        />
      </div>
      <ResearchWorkspace
        visible={mode === "research"}
        gameParams={params}
        cameraBridge={cameraBridge}
        onBack={() => setMode("game")}
      />
    </div>
  );
}
