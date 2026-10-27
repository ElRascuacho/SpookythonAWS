import { Radio, Sparkles, X } from "lucide-react";
import type { GameNews } from "../domain/newsModel";

export function NewsFlash({
  news,
  loading,
  day,
  facts,
  onClose,
}: {
  news: GameNews | null;
  loading: boolean;
  day: number;
  facts: string;
  onClose: () => void;
}) {
  const severity = news?.severity ?? "alert";

  return (
    <aside
      className="news-flash"
      data-severity={severity}
      aria-live="polite"
      aria-label="Última transmisión"
    >
      <div className="news-head">
        <span>
          <i /> ÚLTIMA TRANSMISIÓN · DÍA {String(day).padStart(2, "0")}
        </span>
        <button aria-label="Cerrar noticia" onClick={onClose}>
          <X size={13} />
        </button>
      </div>
      {news ? (
        <>
          <h3 className="news-headline">{news.headline}</h3>
          <p className="news-body">{news.body}</p>
          <p className="news-facts">{facts}</p>
          <div className="news-foot">
            <span className="news-source">
              {news.source === "ai" ? (
                <Sparkles size={10} />
              ) : (
                <Radio size={10} />
              )}
              {news.source === "ai"
                ? "SALA DE CRISIS · IA"
                : "RED DE VIGILANCIA"}
            </span>
            <span>MANTA · MANABÍ</span>
          </div>
        </>
      ) : (
        <>
          <h3 className="news-headline">Recibiendo transmisión…</h3>
          <div className="news-skeleton" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <div className="news-foot">
            <span className="news-source">
              <Radio size={10} /> RED DE VIGILANCIA
            </span>
            <span>MANTA · MANABÍ</span>
          </div>
        </>
      )}
    </aside>
  );
}
