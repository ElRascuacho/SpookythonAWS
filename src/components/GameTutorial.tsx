import { useEffect, useRef } from "react";
import { ArrowRight, Check, Crosshair, ShieldCheck } from "lucide-react";
import { TUTORIAL_STEPS, type TutorialState } from "../domain/tutorial";
import "./GameTutorial.css";

const STEPS = [
  { title: "Elige una zona del mapa", text: "Toca una etiqueta del mapa o usa el selector de zona. Se abrirán sus intervenciones.", file: "01-zona.png" },
  { title: "Asigna prevención comunitaria", text: "Pulsa Prevención comunitaria en esta ventana. Cuesta $700 y reduce los contagios humanos durante un día.", file: "02-brigada.png" },
  { title: "Invierte en la cura", text: "En LABORATORIO, elige $1.200 o $2.200. La cura y las brigadas comparten el presupuesto.", file: "03-cura.png" },
  { title: "Ejecuta tu plan", text: "Revisa el presupuesto y pulsa Avanzar un día. El motor aplicará tus decisiones en esta práctica.", file: "04-turno.png" },
];

export function GameTutorial({ state, required = false, inline = false, onStart, onTarget, onClose, onComplete, onGuidedTour }: {
  state: TutorialState; required?: boolean; inline?: boolean;
  onGuidedTour?:()=>void;
  onStart: () => void; onTarget: () => void; onClose: () => void; onComplete: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const { step, game } = state;
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "nearest" });
  }, [step]);
  const finished = step === 4;
  return <section className={`tutorial ${step >= 0 ? "training-coach" : ""} ${inline ? "training-coach-inline" : ""}`} aria-label="Guía de práctica interactiva">
    <p className="tutorial-safe"><ShieldCheck size={16} aria-hidden="true" /> Práctica segura · tu partida no cambia</p>
    {step === -1 ? <>
      <h3 ref={heading} tabIndex={-1}>Aprende en el mapa, no en diapositivas.</h3>
      <p>Elegirás una zona, asignarás una brigada, financiarás la cura y avanzarás un día con los controles reales del juego.</p>
      {required && <p>Primera visita: te guiamos en cuatro acciones. Puedes saltar la práctica y volver desde «Cómo jugar».</p>}
      <ol className="tutorial-roadmap">{TUTORIAL_STEPS.map(label => <li key={label}>{label}</li>)}</ol>
      {onGuidedTour&&<><p>Recorre también la interfaz con foco guiado: elige una zona, financia la cura, completa Perímetro cero (disparos) y ejecuta el turno. El día queda bloqueado hasta ganar el minijuego. Tu partida se restaura al terminar o salir.</p><button className="primary-button" onClick={onGuidedTour}>Recorrer la interfaz del juego <ArrowRight size={18}/></button></>}
      <button className={onGuidedTour?'secondary-button':'primary-button'} onClick={onStart}>Empezar práctica <ArrowRight size={18} /></button>
      <button className="secondary-button" onClick={required ? onComplete : onClose}>{required ? "Saltar tutorial" : "Cerrar guía"}</button>
    </> : <>
      <p className="tutorial-progress" aria-label="Progreso del tutorial">{finished ? "4 de 4 · práctica completada" : `Paso ${step + 1} de 4 · ${TUTORIAL_STEPS[step]}`}</p>
      <h3 ref={heading} tabIndex={-1}>{finished ? "Ya diste tu primer paso" : STEPS[step].title}</h3>
      {finished ? <>
        <p>Usaste el mapa, asignaste prevención e investigaste la cura. Tu partida real sigue exactamente donde la dejaste.</p>
        <dl className="tutorial-results"><div><dt>Día simulado</dt><dd>{game.day}</dd></div><div><dt>Cura investigada</dt><dd>{game.research}%</dd></div><div><dt>Brigadas aplicadas</dt><dd>{game.actions[1]?.preventionNodes?.length ?? 0}</dd></div></dl>
        <p>En tu partida también puedes vacunar, fumigar, aislar casos y limitar movilidad. «Evaluar» y «Simulación» comparan estrategias; «Agente» ayuda a explorar medidas. Los capítulos están en «Campaña» y las burbujas ! ofrecen operaciones.</p>
        <button className="primary-button" onClick={onComplete}><Check size={18} /> Volver a mi partida</button>
      </> : <>
        <p>{STEPS[step].text}</p>
        <p className="tutorial-live-hint">La guía avanza sola cuando realizas la acción resaltada.</p>
        <button className="tutorial-target" onClick={onTarget}><Crosshair size={17} /> {step === 1 && !inline ? "Abrir intervenciones" : "Llévame al control"}</button>
        <details className="tutorial-example"><summary>Ver una referencia visual</summary><img src={`${import.meta.env.BASE_URL}tutorial/${STEPS[step].file}`} alt={`Ejemplo del control: ${STEPS[step].title}`} /></details>
        {state.error && <p role="alert">{state.error}</p>}
        <button className="tutorial-skip" onClick={required ? onComplete : onClose}>{required ? "Saltar tutorial" : "Cerrar guía"}</button>
      </>}
    </>}
  </section>;
}
