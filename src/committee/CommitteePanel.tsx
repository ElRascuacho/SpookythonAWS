import { useEffect, useState, type ComponentType } from "react";
import { ShieldAlert } from "lucide-react";
import type { Order } from "../domain/cureGame";
import type { DailyCitySnapshot } from "../domain/types";

interface MapProps {
  snapshot: DailyCitySnapshot;
  selectedNode: string;
  onSelect: (nodeId: string) => void;
  orders: Order[];
  patientZeroId: string;
  paused?: boolean;
}

interface JobView {
  jobId: string;
  status: string;
  stateRevision: number;
  recommendedPolicyVersion: number;
  finalAudit: string;
  baselineMean: number | null;
  candidateMean: number | null;
  note: string;
}

interface StartResponse extends Partial<JobView> {
  message?: string;
  error?: string;
}

function PlaybackMap({ snapshot }: { snapshot: DailyCitySnapshot }) {
  const [MapView, setMapView] = useState<ComponentType<MapProps> | null>(null);
  useEffect(() => {
    let alive = true;
    void import("../components/CureEarth3DMap").then((mod) => {
      if (alive) setMapView(() => mod.CureEarth3DMap);
    });
    return () => {
      alive = false;
    };
  }, []);
  if (!MapView) return null;
  return (
    <MapView
      snapshot={snapshot}
      selectedNode="N01"
      onSelect={() => undefined}
      orders={[]}
      patientZeroId="N01"
      paused
    />
  );
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
    try {
      const response = await fetch("/api/committee/jobs", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `local-${horizonDays}-${Date.now()}`,
        },
        body: JSON.stringify({ horizonDays, seed: 20261030 }),
      });
      let body: StartResponse | null = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      if (!response.ok) {
        setError(body?.message ?? body?.error ?? "No se pudo iniciar");
        return;
      }
      if (typeof body?.jobId !== "string") {
        setError("No se pudo iniciar");
        return;
      }
      setJob(body as JobView);
      setDay(0);
    } catch {
      setError("No se pudo conectar. Revisa tu conexión y vuelve a intentar.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!job || job.status === "completed" || job.status === "cancelled") return;
    const timer = window.setInterval(() => {
      void fetch(`/api/committee/jobs/${job.jobId}`, { credentials: "same-origin" })
        .then((response) => response.ok ? response.json() : null)
        .then((body: JobView | null) => {
          if (!body) return;
          setJob((current) => !current || body.stateRevision < current.stateRevision ? current : body);
        })
        .catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [job]);

  useEffect(() => {
    if (!job || job.status === "queued") return;
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
              <h3>Baseline {job.baselineMean == null ? "en curso" : Math.round(job.baselineMean).toLocaleString()} contagios</h3>
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
                <>
                  <p>
                    Día {snapshot.day}: {snapshot.action.summaryText}. Acumulados {Math.round(snapshot.cumulativeInfected).toLocaleString()}.
                  </p>
                  <PlaybackMap snapshot={snapshot} />
                </>
              )}
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
