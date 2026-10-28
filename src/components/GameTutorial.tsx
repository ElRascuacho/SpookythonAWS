import { useEffect, useReducer, useRef } from "react";
import { ArrowLeft, ArrowRight, Check, FlaskConical, HandHeart, MapPin, Play, ShieldCheck } from "lucide-react";
import { INTERVENTIONS, RESEARCH_LEVELS, getPlanCost, type GameConfig } from "../domain/cureGame";
import { NODE_MAP } from "../domain/mantaGraph";
import { canContinueTutorial, createTutorial, TUTORIAL_STEPS, tutorialReducer } from "../domain/tutorial";
import "./GameTutorial.css";

const money = (value: number) => `$${value.toLocaleString("es-EC")}`;
const TITLES = ["Elige dónde ayudar", "Asigna una brigada", "Dale recursos a la ciencia", "Pon tu plan en marcha", "Ya sabes tomar el mando"];
const HINTS = ["Selecciona una zona para continuar.", "Asigna prevención para continuar.", "Elige una inversión para continuar."];
const SCREENSHOTS = [
  { file: "01-zona.png", alt: "Zona del mapa destacada con un contorno coral.", caption: "1. Toca una zona del mapa. También puedes elegirla en el selector de zona del móvil." },
  { file: "02-brigada.png", alt: "Botón Prevención comunitaria de la ventana de intervenciones, con su costo de 700 dólares.", caption: "2. En la ventana de la zona, toca Prevención comunitaria para asignarla." },
  { file: "03-cura.png", alt: "Controles del laboratorio con inversiones de cero, 1200 y 2200 dólares al día.", caption: "3. El laboratorio está en la barra inferior. Invierte para que avance la cura." },
  { file: "04-turno.png", alt: "Barra de progreso de la cura, día actual y botón Avanzar un día.", caption: "4. Revisa tu presupuesto y toca Avanzar un día para ejecutar el plan." },
];

export function GameTutorial({ config, onClose, onComplete, required = false }: { config: GameConfig; onClose: () => void; onComplete: () => void; required?: boolean }) {
  const [state, dispatch] = useReducer(tutorialReducer, config, createTutorial);
  const heading = useRef<HTMLHeadingElement>(null);
  const { step, game, nodeId, protection, funding } = state;
  const ready = canContinueTutorial(state);
  const spent = getPlanCost(protection && nodeId ? [{ nodeId, kind: "prevention" }] : [], funding);
  const snapshot = game.timeline[game.day];
  useEffect(() => {
    if (step >= 0) {
      heading.current?.focus({ preventScroll: true });
      heading.current?.scrollIntoView({ block: "nearest" });
    }
  }, [step]);

  return (
    <section className="tutorial" aria-label="Tutorial interactivo">
      <p className="tutorial-safe"><ShieldCheck size={15} aria-hidden="true" /> Práctica segura · tu partida no cambia</p>
      {required && <p className="tutorial-required">Primera visita: completa estos 4 pasos para desbloquear el juego. Sin límite de tiempo.</p>}
      {step === -1 ? (
        <>
          <div className="tutorial-welcome">
            <span className="tutorial-emblem"><FlaskConical size={32} aria-hidden="true" /></span>
            <h3>Un mapa. Un plan. Una cura.</h3>
            <p>Tu objetivo es llegar al 100% de cura antes de que el brote desborde la ciudad. Te enseñamos dónde tocar con capturas del juego; después lo pruebas aquí.</p>
          </div>
          <ol className="tutorial-roadmap">
            {TUTORIAL_STEPS.map((label, index) => <li key={label}><span>{index + 1}</span>{label}</li>)}
          </ol>
          <button className="primary-button" onClick={() => dispatch({ type: "next" })}>Practicar mi primer día <ArrowRight size={18} /></button>
          {!required && <button className="secondary-button" onClick={onClose}>Cerrar guía</button>}
          <p className="tutorial-caption">Puedes volver cuando quieras desde «Cómo jugar».</p>
        </>
      ) : (
        <>
          <ol className="tutorial-progress" aria-label="Progreso del tutorial">
            {TUTORIAL_STEPS.map((label, index) => (
              <li key={label} className={index <= step ? "reached" : ""} aria-current={index === step ? "step" : undefined}>
                <span>{index < step ? <Check size={13} aria-hidden="true" /> : index + 1}</span>{label}
              </li>
            ))}
          </ol>
          <div className="tutorial-step-heading">
            <span className="eyebrow">{step < 4 ? `PASO ${step + 1} DE 4` : "PRÁCTICA COMPLETADA"}</span>
            <h3 ref={heading} tabIndex={-1}>{TITLES[step]}</h3>
          </div>
          {step < 4 && <figure className={`tutorial-screenshot tutorial-screenshot-${step}`}>
            <a href={`${import.meta.env.BASE_URL}tutorial/${SCREENSHOTS[step].file}`} target="_blank" rel="noreferrer" aria-label={`Ampliar captura del paso ${step + 1} (abre otra pestaña)`}>
              <img src={`${import.meta.env.BASE_URL}tutorial/${SCREENSHOTS[step].file}`} alt={SCREENSHOTS[step].alt} />
            </a>
            <figcaption>{SCREENSHOTS[step].caption} <span>Captura de ejemplo · toca para ampliar.</span></figcaption>
          </figure>}
          {step === 0 && (
            <>
              <p><strong>Ahora tú:</strong> elige una zona de práctica. El mapa real muestra dónde hay infecciosos.</p>
              <div className="tutorial-choices" role="group" aria-label="Zonas de práctica">
                {[config.patientZeroId, "N03", "N04"].filter((id, index, ids) => ids.indexOf(id) === index).map((id) => (
                  <button key={id} className="tutorial-choice" aria-pressed={nodeId === id} onClick={() => dispatch({ type: "zone", nodeId: id })}>
                    <MapPin size={20} aria-hidden="true" />
                    <span><strong>{NODE_MAP[id].name}</strong><small className={snapshot.nodes[id].I > 0 ? "coral-text" : ""}>{snapshot.nodes[id].I} infecciosos{snapshot.nodes[id].I > 0 ? " · foco del brote" : " · sin casos activos"}</small></span>
                    {nodeId === id && <Check size={18} aria-hidden="true" />}
                  </button>
                ))}
              </div>
              <p className="tutorial-tip">Empieza por el foco del brote: aparece en coral.</p>
            </>
          )}
          {step === 1 && (
            <>
              <p><strong>Ahora tú:</strong> asigna prevención a <strong>{NODE_MAP[nodeId!].name}</strong>. Reduce contagios humanos por un día; no elimina el brote.</p>
              <button className="tutorial-choice" aria-pressed={protection} onClick={() => dispatch({ type: "protect" })}>
                <HandHeart size={24} aria-hidden="true" />
                <span><strong>{INTERVENTIONS.prevention.label}</strong><small>{protection ? "Asignada · toca de nuevo para retirarla" : `${money(INTERVENTIONS.prevention.cost)} · toca para asignar`}</small></span>
                {protection && <Check size={20} aria-hidden="true" />}
              </button>
              <p className="tutorial-tip">Asignar no ejecuta: puedes cambiar tu plan antes de avanzar el día. En la partida también hay vacunación, fumigación, cordón y aislamiento.</p>
            </>
          )}
          {step === 2 && (
            <>
              <p><strong>Ahora tú:</strong> elige una inversión para la cura. Sale del mismo presupuesto que las brigadas.</p>
              <div className="tutorial-choices" role="group" aria-label="Inversión de práctica">
                {RESEARCH_LEVELS.filter(amount => amount > 0).map(amount => (
                  <button key={amount} className="tutorial-choice" aria-pressed={funding === amount} onClick={() => dispatch({ type: "fund", amount })}>
                    <FlaskConical size={22} aria-hidden="true" />
                    <span><strong>{money(amount)} / día</strong><small>{amount === RESEARCH_LEVELS[1] ? "Estándar · +3 puntos de cura por día" : "Prioridad · +5 puntos de cura por día"}</small></span>
                    {funding === amount && <Check size={18} aria-hidden="true" />}
                  </button>
                ))}
              </div>
              <p className="tutorial-tip">En modo libre, la meta es llegar al 100% de cura en hasta 40 días, sin alcanzar el 35% de contagios acumulados.</p>
            </>
          )}
          {step === 3 && (
            <>
              <p><strong>Ahora tú:</strong> revisa el plan y avanza un día de práctica. Se ejecutan tus decisiones y progresa la cura.</p>
              <dl className="tutorial-summary">
                <div><dt>Zona</dt><dd>{NODE_MAP[nodeId!].name}</dd></div>
                <div><dt>Prevención · 1 día</dt><dd>{money(INTERVENTIONS.prevention.cost)}</dd></div>
                <div><dt>Laboratorio</dt><dd>{money(funding)}</dd></div>
              </dl>
              <p className="tutorial-tip">El presupuesto se renueva cada día, pero lo que sobra no se acumula. Las brigadas se reasignan; la inversión del laboratorio se mantiene.</p>
            </>
          )}
          {step > 0 && step < 4 && (
            <div className="tutorial-budget" role="status" aria-live="polite">
              <span>Disponible para hoy<strong>{money(game.params.dailyBudget - spent)}</strong></span>
              <span>De {money(game.params.dailyBudget)}<small>{money(spent)} en tu plan</small></span>
            </div>
          )}
          {step === 4 && (
            <>
              <p>Simulaste el día 1 con el mismo motor del juego. Estos son los resultados de tu práctica, no de tu partida.</p>
              <dl className="tutorial-summary tutorial-results">
                <div><dt>Cura investigada</dt><dd>{game.research}%</dd></div>
                <div><dt>Nuevos contagios</dt><dd>+{(snapshot.cumulativeInfected - game.timeline[0].cumulativeInfected).toLocaleString("es-EC")}</dd></div>
                <div><dt>Presupuesto renovado</dt><dd>{money(game.params.dailyBudget)}</dd></div>
              </dl>
              <p className="tutorial-tip">El brote puede crecer aunque intervengas. Revisa infecciosos y hospital, ajusta tus brigadas y usa <strong>Evaluar</strong> para comparar tu plan con no intervenir y actuar al azar.</p>
              <div className="tutorial-explore">
                <h4>Lo que puedes hacer después</h4>
                <ul>
                  <li><strong>Mapa:</strong> mover la cámara, cambiar entre 2D y 3D y ver contagios o protección.</li>
                  <li><strong>Brigadas:</strong> vacunar, fumigar, limitar movilidad, aislar casos o prevenir.</li>
                  <li><strong>Evaluar y Simulación:</strong> comparar estrategias antes de decidir.</li>
                  <li><strong>Agente:</strong> diseñar medidas experimentales. Las propuestas se revisan antes de aplicarlas.</li>
                  <li><strong>Campaña y burbujas !:</strong> jugar capítulos y operaciones de campo cuando aparezcan.</li>
                </ul>
              </div>
              <p className="tutorial-caption">Modelo ficticio, no herramienta clínica. Los contagios evitados no son muertes evitadas. La campaña tiene objetivos propios por capítulo.</p>
            </>
          )}
          {state.error && <p role="alert">{state.error}</p>}
          <div className="tutorial-actions">
            {!ready && step < 4 && <p className="tutorial-caption" id="tutorial-next-hint">{HINTS[step]}</p>}
            <button className="primary-button" disabled={step < 4 && !ready} aria-describedby={!ready && step < 4 ? "tutorial-next-hint" : undefined} onClick={() => step === 4 ? onComplete() : dispatch({ type: "next" })}>
              {step === 4 ? required ? "Completar y empezar a jugar" : "Volver a mi partida" : step === 3 ? "Avanzar un día de práctica" : "Continuar"}
              {step === 3 ? <Play size={17} /> : <ArrowRight size={17} />}
            </button>
            <div className="tutorial-navigation">
              {step > 0 && step < 4 && <button onClick={() => dispatch({ type: "back" })}><ArrowLeft size={15} /> Atrás</button>}
              {!required && step < 4 && <button onClick={onClose}>Cerrar guía</button>}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
