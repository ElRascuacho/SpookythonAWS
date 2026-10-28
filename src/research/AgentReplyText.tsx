import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** Visual reveal only: the complete structured response is already validated. */
export function AgentReplyText({
  text,
  animate,
  onProgress,
  onComplete,
}: {
  text: string;
  animate: boolean;
  onProgress: () => void;
  onComplete: () => void;
}) {
  const [shown, setShown] = useState("");
  const callbacks = useRef({ onProgress, onComplete });
  callbacks.current = { onProgress, onComplete };

  useEffect(() => {
    if (!animate) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let stopped = false;
    const finish = () => {
      stopped = true;
      cancelAnimationFrame(frame);
      callbacks.current.onComplete();
    };
    const preferenceChanged = () => {
      if (motion.matches) finish();
    };
    if (motion.matches) {
      finish();
      return;
    }
    motion.addEventListener("change", preferenceChanged);
    // Split by grapheme so accents, emoji and joined characters stay intact.
    const parts = Array.from(
      new Intl.Segmenter("es", { granularity: "grapheme" }).segment(text),
      (p) => p.segment,
    );
    const duration = Math.min(12000, Math.max(650, parts.length * 16));
    const start = performance.now();
    let previous = -1;
    setShown("");
    const tick = (now: number) => {
      if (stopped) return;
      const count = Math.min(
        parts.length,
        Math.floor((parts.length * (now - start)) / duration),
      );
      if (count !== previous) {
        setShown(parts.slice(0, count).join(""));
        previous = count;
      }
      if (count === parts.length) finish();
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      motion.removeEventListener("change", preferenceChanged);
    };
  }, [animate, text]);

  useLayoutEffect(() => {
    callbacks.current.onProgress();
  }, [shown, animate]);

  return (
    <>
      <p>
        <span className="sr-only">{text}</span>
        <span aria-hidden="true">
          {animate ? shown : text}
          {animate && <i className="rw-typing-caret" />}
        </span>
      </p>
      {animate && (
        <button className="rw-skip-typing" onClick={onComplete}>
          Mostrar respuesta completa
        </button>
      )}
    </>
  );
}
