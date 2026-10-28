import { useEffect, useRef } from "react";
import { ArrowRight, Check, Crosshair, ShieldCheck } from "lucide-react";
import { TUTORIAL_STEPS, type TutorialState } from "../domain/tutorial";
import "./GameTutorial.css";

const STEPS = [
  { title: "Elige una zona del mapa", text: "Pulsa una etiqueta del mapa o elige una zona en el selector. Allí decidirás cómo proteger a sus habitantes.", file: "01-zona.png" },
  { title: "Asigna prevención comunitaria", text: "Pulsa «Prevención comunitaria». Reserva $700 para reducir los contagios de esa zona durante el próximo día.", file: "02-brigada.png" },
  { title: "Invierte en la cura", text: "En «Laboratorio», elige $1.200 o $2.200. Al avanzar el día, la cura progresará 3 o 5 puntos. Comparte el dinero con la prevención.", file: "03-cura.png" },
  { title: "Ejecuta tu plan", text: "Pulsa «Avanzar un día» para aplicar lo que elegiste. Después verás el avance de la cura y los contagios: así comprobarás el resultado de tu plan.", file: "04-turno.png" },
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
      <h3 ref={heading} tabIndex={-1}>Tu misión: proteger la ciudad y encontrar la cura</h3>
      <p>Tú decides cómo repartir el dinero entre proteger habitantes e investigar la cura. Cada vez que pulsas «Avanzar un día», se aplican tus decisiones y el brote cambia.</p>
      {required && <p>Primera visita: prueba cuatro acciones, sin minijuegos ni cambios en tu partida. Puedes volver a esta práctica desde «Cómo jugar».</p>}
      <ol className="tutorial-roadmap">{TUTORIAL_STEPS.map(label => <li key={label}>{label}</li>)}</ol>
      <button className="primary-button" onClick={onStart}>Empezar práctica <ArrowRight size={18} /></button>
      {onGuidedTour&&<details className="tutorial-example"><summary>También quiero practicar un minijuego</summary><p>Este recorrido añade una operación de disparos. Deberás ganarla para avanzar el día. Puedes salir cuando quieras sin cambiar tu partida.</p><button className="secondary-button" onClick={onGuidedTour}>Practicar con minijuego <ArrowRight size={18}/></button></details>}
      <button className="secondary-button" onClick={required ? onComplete : onClose}>{required ? "Saltar tutorial" : "Cerrar guía"}</button>
    </> : <>
      <p className="tutorial-progress" aria-label="Progreso del tutorial">{finished ? "4 de 4 · práctica completada" : `Paso ${step + 1} de 4 · ${TUTORIAL_STEPS[step]}`}</p>
      <h3 ref={heading} tabIndex={-1}>{finished ? "Ya sabes tomar decisiones y ver su resultado" : STEPS[step].title}</h3>
      {finished ? <>
        <p>Aplicaste prevención en una zona y avanzaste la investigación de la cura. Tu partida real no cambió.</p>
        <dl className="tutorial-results"><div><dt>Día simulado</dt><dd>{game.day}</dd></div><div><dt>Cura investigada</dt><dd>{game.research}%</dd></div><div><dt>Brigadas aplicadas</dt><dd>{game.actions[1]?.preventionNodes?.length ?? 0}</dd></div></dl>
        <p>Repite este ciclo en tu partida: elige dónde proteger, reserva dinero para la cura y avanza un día. Revisa si hay nuevos contagios y cuánto avanzó la cura antes de decidir de nuevo. Puedes explorar las demás herramientas después.</p>
        <button className="primary-button" onClick={onComplete}><Check size={18} /> Volver a mi partida</button>
      </> : <>
        <p>{STEPS[step].text}</p>
        <p className="tutorial-live-hint">Haz la acción resaltada; la guía pasará al siguiente paso automáticamente.</p>
        <button className="tutorial-target" onClick={onTarget}><Crosshair size={17} /> {step === 1 && !inline ? "Abrir intervenciones" : "Llévame al control"}</button>
        <details className="tutorial-example"><summary>Ver una referencia visual</summary><img src={`${import.meta.env.BASE_URL}tutorial/${STEPS[step].file}`} alt={`Ejemplo del control: ${STEPS[step].title}`} /></details>
        {state.error && <p role="alert">{state.error}</p>}
        <button className="tutorial-skip" onClick={required ? onComplete : onClose}>{required ? "Saltar tutorial" : "Cerrar guía"}</button>
      </>}
    </>}
  </section>;
}
