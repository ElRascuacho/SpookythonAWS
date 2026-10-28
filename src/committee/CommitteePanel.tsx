import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import type { DailyCitySnapshot } from "../domain/types";

interface JobView {
  jobId: string;
  status: string;
  stateRevision: number;
  recommendedPolicyVersion: number;
  finalAudit: string;
  baselineMean: number;
  candidateMean: number | null;
  note: string;
}

export default function CommitteePanel() {
  const [horizonDays, setHorizonDays] = useState(40);
  const [job, setJob] = useState<JobView | null>(null);
  const [day, setDay] = useState(0);
  const [snapshot, setSnapshot] = useState<DailyCitySnapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    setError("");
    const response = await fetch("/api/committee/jobs", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `local-${horizonDays}-${Date.now()}`,
      },
      body: JSON.stringify({ horizonDays, seed: 20261030 }),
    });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(body.message ?? "No se pudo iniciar");
      return;
    }
    setJob(body);
    setDay(0);
  }

  useEffect(() => {
    if (!job) return;
    let ignore = false;
    fetch(`/api/committee/jobs/${job.jobId}/playback/${day}`, { credentials: "same-origin" })
      .then((response) => response.ok ? response.json() : null)
      .then((body) => {
        if (!ignore) setSnapshot(body?.snapshot ?? null);
      })
      .catch(() => {
        if (!ignore) setSnapshot(null);
      });
    return () => {
      ignore = true;
    };
  }, [job, day]);

  return (
    <div className="committee-placeholder-panel">
      <header className="committee-header">
        <div className="committee-title-group">
          <span className="committee-badge">COMITÉ EPIDEMIOLÓGICO</span>
          <h2>Vista previa local</h2>
          <p className="committee-subtitle">
            Compara una baseline con una candidata de una generación. No es la auditoría final ni el entrenamiento en AWS.
          </p>
        </div>
      </header>
      <form
        className="committee-content-frame"
        onSubmit={(event) => {
          event.preventDefault();
          void start();
        }}
      >
        <label>
          Horizonte (20–60)
          <input
            type="number"
            min={20}
            max={60}
            value={horizonDays}
            onChange={(event) => setHorizonDays(Number(event.target.value))}
          />
        </label>
        <button type="submit" disabled={busy}>{busy ? "Calculando…" : "Buscar"}</button>
        {error && <p role="alert">{error}</p>}
        {job && (
          <div className="committee-status-card">
            <ShieldAlert size={28} className="committee-icon" />
            <div>
              <h3>Baseline {Math.round(job.baselineMean).toLocaleString()} contagios</h3>
              <p>
                Candidata {job.candidateMean == null ? "sin dato" : Math.round(job.candidateMean).toLocaleString()}.
                Versión recomendada {job.recommendedPolicyVersion}. Auditoría {job.finalAudit}. Revisión {job.stateRevision}.
              </p>
              <p>{job.note}</p>
              <label>
                Día
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, horizonDays)}
                  value={day}
                  onChange={(event) => setDay(Number(event.target.value))}
                />
              </label>
              {snapshot && (
                <p>
                  Día {snapshot.day}: {snapshot.action.summaryText}. Acumulados {Math.round(snapshot.cumulativeInfected).toLocaleString()}.
                </p>
              )}
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
