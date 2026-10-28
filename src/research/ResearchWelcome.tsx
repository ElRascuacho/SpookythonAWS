import { useEffect, useRef } from "react";
import {
  FlaskConical,
  SlidersHorizontal,
  ChartNoAxesCombined,
  MessageSquare,
  X,
} from "lucide-react";
import "./researchWelcome.css";
const KEY = "manta-cero:research-welcome:v1";
export function ResearchWelcome({
  active,
  openRequest = 0,
}: {
  active: boolean;
  openRequest?: number;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    heading = useRef<HTMLHeadingElement>(null),
    acknowledged = useRef(false),
    lastRequest = useRef(openRequest);
  function dismiss() {
    acknowledged.current = true;
    try {
      localStorage.setItem(KEY, "seen");
    } catch {
      /* Session-only acknowledgement when storage is unavailable. */
    }
    dialog.current?.close();
  }
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    const requested = openRequest !== lastRequest.current;
    lastRequest.current = openRequest;
    let seen = acknowledged.current;
    try {
      seen = seen || localStorage.getItem(KEY) === "seen";
    } catch {
      /* Still explain the module if persistence is blocked. */
    }
    if (active && (!seen || requested) && !el.open) {
      el.showModal();
      heading.current?.focus({ preventScroll: true });
    } else if (!active && el.open) el.close();
    return () => {
      if (el.open) el.close();
    };
  }, [active, openRequest]);
  return (
    <dialog
      ref={dialog}
      id="rw-research-welcome"
      className="rw-welcome"
      aria-labelledby="rw-welcome-title"
      aria-describedby="rw-welcome-description"
      onCancel={(e) => {
        e.preventDefault();
        dismiss();
      }}
    >
      <div className="rw-welcome-top">
        <span>
          <FlaskConical size={16} /> LABORATORIO DE INVESTIGACIÓN
        </span>
        <button
          type="button"
          aria-label="Cerrar bienvenida de Investigación"
          onClick={dismiss}
        >
          <X size={18} />
        </button>
      </div>
      <h2 ref={heading} tabIndex={-1} id="rw-welcome-title">
        De las preguntas
        <br />a los experimentos.
      </h2>
      <p id="rw-welcome-description" className="rw-welcome-lead">
        Un módulo 100% orientado a la simulación científica: formula hipótesis,
        explora intervenciones y contrasta resultados con el modelo SEIR-V de
        Manta.
      </p>
      <div className="rw-welcome-benefits">
        <article>
          <MessageSquare size={19} />
          <div>
            <h3>Un agente para investigar contigo</h3>
            <p>
              Conversa por texto o voz para explicar el modelo y diseñar medidas
              con nombres y supuestos propios.
            </p>
          </div>
        </article>
        <article>
          <SlidersHorizontal size={19} />
          <div>
            <h3>Tú controlas el experimento</h3>
            <p>
              Ajusta escenarios, zonas, horarios, costos y cumplimiento. Revisa
              y confirma cada propuesta antes de ejecutarla.
            </p>
          </div>
        </article>
        <article>
          <ChartNoAxesCombined size={19} />
          <div>
            <h3>Resultados que puedes contrastar</h3>
            <p>
              Observa la evolución en el mapa y evalúa medidas con comparaciones
              reproducibles. La evidencia queda ligada a su configuración.
            </p>
          </div>
        </article>
      </div>
      <p className="rw-welcome-note">
        <strong>Investigación, no competición.</strong> Sin progreso de cura,
        recompensas ni condiciones de victoria. Es un modelo educativo no
        calibrado: sus resultados dependen de los supuestos y no equivalen a
        evidencia clínica ni predicciones epidemiológicas validadas.
      </p>
      <footer>
        <span>Puedes volver a verla desde el botón ⓘ de Investigación.</span>
        <button type="button" onClick={dismiss}>
          Entrar al laboratorio <span aria-hidden="true">→</span>
        </button>
      </footer>
    </dialog>
  );
}
