import { useEffect, useRef, useState, type CSSProperties } from "react";
import "./researchVoice.css";
import { Mic, PhoneOff, VolumeX } from "lucide-react";
import {
  ResearchVoiceSession,
  type VoiceState,
  type VoiceTurn,
} from "./ResearchVoiceSession";

const labels: Record<VoiceState, string> = {
  idle: "Conversación finalizada",
  connecting: "Conectando voz…",
  listening: "Te escucho",
  thinking: "Preparando respuesta…",
  speaking: "El agente está hablando",
  error: "Voz no disponible",
};
export function ResearchVoiceControls({
  active,
  processing,
  onQuery,
  getContext,
  onTranscript,
  onReport,
}: {
  active: boolean;
  processing: boolean;
  onQuery: (text: string, signal: AbortSignal) => Promise<string>;
  getContext: () => unknown;
  onTranscript: (turn: VoiceTurn) => void;
  onReport: () => unknown;
}) {
  const [state, setState] = useState<VoiceState>("idle");
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [partial, setPartial] = useState("");
  const callbacks = useRef({ onQuery, getContext, onTranscript, onReport });
  callbacks.current = { onQuery, getContext, onTranscript, onReport };
  const session = useRef<ResearchVoiceSession | null>(null);
  const waveform = useRef<HTMLDivElement>(null);
  const preview = useRef<HTMLParagraphElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const endButton = useRef<HTMLButtonElement>(null);
  const closingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasOpen = useRef(false);
  function finish() {
    session.current?.stop();
    setClosing(true);
    if (closingTimer.current) clearTimeout(closingTimer.current);
    closingTimer.current = setTimeout(
      () => {
        setOpen(false);
        setClosing(false);
        closingTimer.current = null;
      },
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 220,
    );
  }
  useEffect(() => {
    const transport = new ResearchVoiceSession({
      status: (s, m) => {
        setState(s);
        setMessage(m ?? "");
      },
      propose: (text, signal) => callbacks.current.onQuery(text, signal),
      context: () => callbacks.current.getContext(),
      report: () => callbacks.current.onReport(),
      transcript: (turn) => callbacks.current.onTranscript(turn),
      partial: (delta) =>
        setPartial((s) => (delta ? (s + delta).slice(-6000) : "")),
      level: (value) =>
        waveform.current?.style.setProperty("--voice-level", value.toFixed(3)),
    });
    session.current = transport;
    const hidden = () => {
      if (document.hidden) {
        transport.stop();
        if (closingTimer.current) clearTimeout(closingTimer.current);
        setClosing(false);
        setOpen(false);
      }
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      transport.stop();
      session.current = null;
      if (closingTimer.current) clearTimeout(closingTimer.current);
    };
  }, []);
  useEffect(() => {
    if (!active) {
      session.current?.stop();
      if (closingTimer.current) clearTimeout(closingTimer.current);
      setClosing(false);
      setOpen(false);
    }
  }, [active]);
  useEffect(() => {
    if (open) endButton.current?.focus({ preventScroll: true });
    else if (wasOpen.current && active)
      trigger.current?.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [open, active]);
  useEffect(() => {
    if (preview.current)
      preview.current.scrollTop = preview.current.scrollHeight;
  }, [partial]);
  const connected = !["idle", "error"].includes(state);
  return (
    <section
      className="rw-voice-controls rw-voice-inline"
      aria-label="Conversación por voz"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.preventDefault();
          e.stopPropagation();
          finish();
        }
      }}
    >
      {!open ? (
        <div className="rw-voice-actions">
          <button
            ref={trigger}
            type="button"
            aria-label="Hablar con el agente"
            disabled={!active || processing}
            onClick={() => {
              setClosing(false);
              setPartial("");
              setOpen(true);
              void session.current?.start();
            }}
          >
            <Mic size={15} /> Hablar
          </button>
          <span className="rw-voice-indicator">Voz con IA · consume API</span>
        </div>
      ) : (
        <div
          className={`rw-voice-card ${closing ? "is-closing" : ""}`}
          data-state={state}
        >
          <div className="rw-voice-card-top">
            <span className="rw-voice-card-status" role="status">
              <i aria-hidden="true" />
              {closing ? "Voz finalizada" : labels[state]}
            </span>
            <div className="rw-voice-card-actions">
              {(state === "speaking" || state === "thinking") && (
                <button
                  type="button"
                  aria-label="Interrumpir"
                  title="Interrumpir"
                  onClick={() => session.current?.interrupt()}
                >
                  <VolumeX size={14} />
                </button>
              )}
              <button
                ref={endButton}
                type="button"
                aria-label="Finalizar conversación por voz"
                className="rw-voice-stop"
                onClick={finish}
                disabled={closing}
              >
                <PhoneOff size={14} />
                {connected ? "Finalizar" : "Cerrar"}
              </button>
            </div>
          </div>
          <div ref={waveform} className="rw-voice-waveform" aria-hidden="true">
            {Array.from({ length: 29 }, (_, i) => (
              <span
                key={i}
                style={
                  {
                    "--shape":
                      0.25 + 0.75 * Math.pow(Math.sin((i + 1) * 1.7), 2),
                    "--delay": `${i * -65}ms`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
          {partial ? (
            <p
              ref={preview}
              className="rw-voice-preview"
              aria-label="Respuesta de voz en curso"
            >
              {partial}
            </p>
          ) : (
            <div className="rw-voice-card-bottom">
              <span>
                {closing || state === "idle"
                  ? "Micrófono apagado"
                  : state === "error"
                    ? "Puedes cerrar e intentarlo de nuevo"
                    : state === "connecting"
                      ? "Esperando conexión y permiso del micrófono"
                      : "Puedes interrumpirme hablando"}
              </span>
            </div>
          )}
          {message && (
            <p
              className="rw-voice-error"
              role={state === "error" ? "alert" : "status"}
            >
              {message}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
