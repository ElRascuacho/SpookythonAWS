import { useEffect, useRef, useState } from "react";
import { FlaskConical } from "lucide-react";
import type { LabEvent } from "../domain/spontaneousEvents";
import { NODE_MAP } from "../domain/mantaGraph";

const reagents = ["Cian", "Ámbar", "Violeta", "Verde"];

export function LabSpontaneousEvent({ event, onComplete, onClose }: { event: LabEvent; onComplete: (success: boolean) => void; onClose: () => void }) {
  const [phase, setPhase] = useState<"ready" | "watching" | "input" | "success" | "failed">("ready");
  const [lit, setLit] = useState(-1);
  const [input, setInput] = useState<number[]>([]);
  const firstReagent = useRef<HTMLButtonElement>(null);
  const completed = useRef(false);

  useEffect(() => {
    if (phase === "input") firstReagent.current?.focus();
    if (phase !== "watching") return;
    const timers: number[] = [];
    event.sequence.forEach((color, index) => {
      timers.push(window.setTimeout(() => setLit(color), 550 + index * 700));
      timers.push(window.setTimeout(() => setLit(-1), 1050 + index * 700));
    });
    timers.push(window.setTimeout(() => setPhase("input"), 550 + event.sequence.length * 700));
    return () => timers.forEach(window.clearTimeout);
  }, [event, phase]);

  const choose = (color: number) => {
    if (phase !== "input" || completed.current) return;
    const answer = [...input, color];
    setInput(answer);
    const correct = answer.every((value, index) => value === event.sequence[index]);
    if (!correct || answer.length === event.sequence.length) {
      completed.current = true;
      setPhase(correct ? "success" : "failed");
      onComplete(correct);
    }
  };
  const finished = phase === "success" || phase === "failed";

  return <>
    <p className="dialog-intro">Alarma de calibración en {NODE_MAP[event.nodeId].name}. Memoriza el orden de los reactivos y repítelo.</p>
    <p className="dialog-intro">Recompensa: prevención gratuita en esta zona durante el siguiente día. Sin límite de tiempo para responder; omitir o fallar no penaliza.</p>
    <div className="lab-event">
      <FlaskConical size={28} aria-hidden="true" />
      <p role="status">{phase === "ready" ? "Comienza cuando estés listo." : phase === "watching" ? (lit < 0 ? "Observa la secuencia…" : `Reactivo ${reagents[lit]}`) : phase === "success" ? "Calibración correcta. Tu brigada gratuita está lista." : phase === "failed" ? "Secuencia incorrecta. No perdiste recursos." : `Tu turno: reactivo ${input.length + 1} de ${event.sequence.length}`}</p>
      <div className="lab-reagents">
        {reagents.map((name, index) => <button ref={index === 0 ? firstReagent : undefined} key={name} className={`lab-reagent reagent-${index} ${lit === index ? "lit" : ""}`} disabled={phase !== "input"} onClick={() => choose(index)} aria-label={`Reactivo ${name}`}>{name}</button>)}
      </div>
    </div>
    {!finished && <button className="primary-button" disabled={phase === "watching"} onClick={() => { setInput([]); setLit(-1); setPhase("watching"); }}>{phase === "ready" ? "Comenzar calibración" : phase === "watching" ? "Observa los reactivos…" : "Ver secuencia otra vez"}</button>}
    <button className="secondary-button" onClick={onClose}>{finished ? "Volver al mapa" : "Omitir tarea"}</button>
  </>;
}
