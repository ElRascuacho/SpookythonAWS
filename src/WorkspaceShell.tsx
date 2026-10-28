import { useEffect, useRef, useState } from "react";
import type { TacticalCameraBridge } from "./components/tacticalCamera";
import App, { type AppProps } from "./App";
import { ResearchWorkspace } from "./research/ResearchWorkspace";
import type { SimulationParams } from "./domain/types";
import "./research/research.css";

export default function WorkspaceShell(props: AppProps) {
  const [mode, setMode] = useState<"game" | "research">("game");
  const [params, setParams] = useState<SimulationParams | null>(null);
  useEffect(() => {
    if (props.activeMode === "game" || props.activeMode === "campaign") setMode("game");
  }, [props.activeMode]);
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (props.inactive) return;
    const frame = requestAnimationFrame(() => {
      if (mode === "research") document.querySelector<HTMLElement>('.research-workspace.is-active')?.focus();
      else { returnFocus.current?.focus(); returnFocus.current = null; }
    });
    return () => cancelAnimationFrame(frame);
  }, [mode, props.inactive]);
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
          inactive={props.inactive || mode !== "game"}
          cameraBridge={cameraBridge}
          onScenarioChange={setParams}
          onOpenResearch={() => {
            returnFocus.current = document.activeElement as HTMLElement | null;
            setMode("research");
          }}
        />
      </div>
      <ResearchWorkspace
        visible={!props.inactive && mode === "research"}
        gameParams={params}
        cameraBridge={cameraBridge}
        onBack={() => setMode("game")}
      />
    </div>
  );
}
