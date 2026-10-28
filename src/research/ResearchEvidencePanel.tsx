import { useEffect, useRef, useState } from "react";
import type { ResearchWorkspace } from "../domain/research";
import {
  configurationIdentity,
  configurationHash,
  confirmedMeasures,
  EvidenceSchema,
  CommitteeSummarySchema,
  INVALID_WORKSPACE_MESSAGE,
  type ResearchEvidence,
  type CommitteeSummary,
} from "../domain/researchEvidence";
import "./researchEvidence.css";
export type EvidenceContext = {
  evidence: ResearchEvidence | null;
  evidenceCurrent: boolean;
  identity: string | null;
  committee: CommitteeSummary | null;
  committeeReadAt: string | null;
};
const KEY = "manta-cero:research-evidence:v1";
export function ResearchEvidencePanel({
  workspace,
  active,
  onContext,
  onSuggest,
}: {
  workspace: ResearchWorkspace;
  active: boolean;
  onContext: (value: EvidenceContext) => void;
  onSuggest: (text: string) => void;
}) {
  const [evidence, setEvidence] = useState<ResearchEvidence | null>(() => {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? EvidenceSchema.parse(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  });
  const [hashed, setHashed] = useState<{
      identity: string;
      hash: string;
    } | null>(null),
    [replicas, setReplicas] = useState<16 | 32>(16),
    [progress, setProgress] = useState<number | null>(null),
    [error, setError] = useState(""),
    [jobId, setJobId] = useState(""),
    [committee, setCommittee] = useState<CommitteeSummary | null>(null),
    [loading, setLoading] = useState(false),
    [committeeReadAt, setCommitteeReadAt] = useState<string | null>(null);
  const worker = useRef<Worker | null>(null),
    request = useRef<AbortController | null>(null),
    callbacks = useRef(onContext);
  callbacks.current = onContext;
  const identity = configurationIdentity(workspace),
    valid = identity !== null,
    current =
      identity !== null &&
      hashed !== null &&
      hashed.identity === identity &&
      hashed.hash === evidence?.hash;
  useEffect(() => {
    let cancelled = false;
    if (identity === null) {
      setHashed(null);
      return;
    }
    void configurationHash(workspace)
      .then((hash) => {
        if (!cancelled && hash !== null) setHashed({ identity, hash });
      })
      .catch(() => {
        if (!cancelled)
          setError("No se pudo calcular la identidad del experimento.");
      });
    return () => {
      cancelled = true;
    };
  }, [identity]);
  useEffect(() => {
    callbacks.current({
      evidence,
      evidenceCurrent: current,
      identity: current ? identity : null,
      committee,
      committeeReadAt,
    });
  }, [evidence, current, identity, committee, committeeReadAt]);
  useEffect(() => {
    worker.current?.terminate();
    worker.current = null;
    setProgress(null);
  }, [identity, active]);
  useEffect(() => {
    if (!active) {
      request.current?.abort();
      setLoading(false);
    }
  }, [active]);
  useEffect(
    () => () => {
      worker.current?.terminate();
      request.current?.abort();
    },
    [],
  );
  function exportEvidence() {
    if (!evidence) return;
    const blob = new Blob(
      [JSON.stringify(EvidenceSchema.parse(evidence), null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = `manta-evidencia-${evidence.hash.slice(0, 12)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function cancel() {
    worker.current?.terminate();
    worker.current = null;
    setProgress(null);
    setError("Evaluación cancelada; no se sustituyó la evidencia anterior.");
  }
  function evaluate() {
    if (identity === null) {
      setError(INVALID_WORKSPACE_MESSAGE);
      return;
    }
    try {
      confirmedMeasures(workspace);
      if (!hashed || hashed.identity !== identity)
        throw Error("Espera a que se calcule la identidad del experimento.");
      worker.current?.terminate();
      const frozen = structuredClone(workspace),
        thread = new Worker(
          new URL("./researchComparison.worker.ts", import.meta.url),
          { type: "module" },
        );
      worker.current = thread;
      setProgress(0);
      setError("");
      const finish = () => {
        thread.terminate();
        if (worker.current === thread) {
          worker.current = null;
          setProgress(null);
        }
      };
      thread.onerror = () => {
        if (worker.current !== thread) return;
        setError(
          "Falló el proceso de evaluación. No se modificaron las medidas.",
        );
        finish();
      };
      thread.onmessage = (e) => {
        if (worker.current !== thread) return;
        if (e.data.type === "progress") {
          setProgress(e.data.done);
          return;
        }
        if (e.data.type === "result") {
          const result = EvidenceSchema.safeParse(e.data.evidence);
          if (!result.success || result.data.hash !== hashed.hash) {
            setError("Resultado incompatible: no se vinculó al experimento.");
            finish();
            return;
          }
          setEvidence(result.data);
          try {
            localStorage.setItem(KEY, JSON.stringify(result.data));
          } catch {
            setError(
              "Evaluación disponible, pero no se pudo guardar en este navegador.",
            );
          }
        } else
          setError(
            typeof e.data.message === "string"
              ? e.data.message
              : "La evaluación no pudo completarse.",
          );
        finish();
      };
      thread.postMessage({ workspace: frozen, replicas });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo evaluar.");
    }
  }
  async function readCommittee() {
    const id = jobId.trim();
    if (!/^[a-zA-Z0-9-]{8,100}$/.test(id)) {
      setError("Introduce un ID de job válido del Comité.");
      return;
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/committee/jobs/${encodeURIComponent(id)}`,
        {
          credentials: "same-origin",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(10000),
          ]),
        },
      );
      if (!response.ok)
        throw Error(
          response.status === 404
            ? "No existe un job accesible con ese ID."
            : "No se pudo consultar el Comité.",
        );
      const data = CommitteeSummarySchema.parse(await response.json());
      if (data.jobId !== id) throw Error("El job recibido no coincide.");
      if (
        committee?.jobId === id &&
        data.stateRevision < committee.stateRevision
      )
        throw Error(
          "Se recibió una revisión antigua; se conserva la más reciente.",
        );
      if (!controller.signal.aborted) {
        setCommittee(data);
        setCommitteeReadAt(new Date().toISOString());
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error ? e.message : "Respuesta del Comité inválida.",
        );
    } finally {
      if (request.current === controller) {
        setLoading(false);
        request.current = null;
      }
    }
  }
  const selected = workspace.drafts.filter((d) => d.enabled),
    allConfirmed =
      selected.length > 0 &&
      selected.every((d) => d.confirmed && d.confirmedRevision === d.revision);
  const status =
    identity === null
      ? "Configuración inválida"
      : !allConfirmed
        ? "Propuesta pendiente"
        : current
          ? "Evaluada"
          : evidence
            ? "Evidencia desactualizada"
            : "Confirmada · sin evaluar";
  return (
    <details className="rw-evidence">
      <summary>
        Evidencia y evaluación <span>{status}</span>
      </summary>
      <p>
        Compara la política actual sin medidas frente a la misma política con
        las medidas confirmadas. Mismo escenario, presupuesto máximo y semillas
        ambientales emparejadas.
      </p>
      {!valid && (
        <p role="alert" className="rw-warning">
          {INVALID_WORKSPACE_MESSAGE} La evaluación queda deshabilitada hasta
          corregirla.
        </p>
      )}
      <div className="rw-evidence-actions">
        <label>
          Réplicas por alternativa
          <select
            aria-label="Réplicas de evaluación"
            value={replicas}
            disabled={progress !== null}
            onChange={(e) => setReplicas(Number(e.target.value) as 16 | 32)}
          >
            <option value={16}>16 · exploratoria</option>
            <option value={32}>32 · exploratoria</option>
          </select>
        </label>
        <button
          type="button"
          disabled={!active || !valid || progress !== null || !allConfirmed}
          onClick={evaluate}
        >
          Evaluar medidas confirmadas
        </button>
        {progress !== null && (
          <button type="button" onClick={cancel}>
            Cancelar evaluación
          </button>
        )}
      </div>
      {progress !== null && (
        <p role="status">
          Evaluando {progress}/{replicas} pares en segundo plano…
        </p>
      )}
      {evidence && (
        <section aria-label="Ficha de evidencia">
          <strong>
            {current
              ? "Evidencia vigente"
              : "Evidencia de otra configuración · no usar como resultado actual"}
          </strong>
          <p>
            {evidence.replicas} pares ·{" "}
            {new Date(evidence.createdAt).toLocaleString()} ·{" "}
            {evidence.protocol}
          </p>
          <p>
            Horizonte: {evidence.configuration.params.days} días · semilla{" "}
            {evidence.configuration.params.seed} · política{" "}
            {evidence.configuration.strategy}. Medidas:{" "}
            {evidence.configuration.drafts
              .filter((d) => d.enabled)
              .map((d) => `${d.definition.name} r${d.revision}`)
              .join(", ")}
            .
          </p>
          <code title={evidence.hash}>
            SHA-256 {evidence.hash.slice(0, 16)}…
          </code>
          <button type="button" onClick={exportEvidence}>
            Exportar evidencia y configuración
          </button>
          <table>
            <thead>
              <tr>
                <th>Métrica media</th>
                <th>Sin medidas</th>
                <th>Con medidas</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["Contagios acumulados", "infected"],
                  ["Pico de infecciosos", "peak"],
                  ["Días de colapso", "collapseDays"],
                  ["Gasto simulado USD", "cost"],
                ] as const
              ).map(([name, key]) => (
                <tr key={key}>
                  <th>{name}</th>
                  <td>
                    {evidence.baseline[key].toLocaleString(undefined, {
                      maximumFractionDigits: 1,
                    })}
                  </td>
                  <td>
                    {evidence.candidate[key].toLocaleString(undefined, {
                      maximumFractionDigits: 1,
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            Diferencia de contagios (con − sin):{" "}
            {evidence.infectionDifference.toFixed(1)}. Intervalo bootstrap
            emparejado 95% exploratorio: [
            {evidence.interval.map((n) => n.toFixed(1)).join(", ")}]. Negativo
            favorece las medidas; si incluye cero, no hay una dirección clara en
            esta evaluación.
          </p>
          <p>
            No es auditoría final del Comité, prueba clínica ni garantía de
            eficacia. No corregido por comparaciones múltiples.
          </p>
        </section>
      )}
      <div className="rw-evidence-variants">
        <span>Siguiente experimento · preparar petición, sin enviarla:</span>
        {["mayor cumplimiento", "menor duración", "menor costo"].map(
          (variant) => (
            <button
              key={variant}
              type="button"
              onClick={() =>
                onSuggest(
                  `Quiero explorar una variante con ${variant} de la medida seleccionada. Explica los supuestos y pregúntame los valores antes de generar una revisión; no la confirmes ni la ejecutes.`,
                )
              }
            >
              {variant}
            </button>
          ),
        )}
      </div>
      <label>
        Consultar job existente del Comité
        <input
          aria-label="ID de job del Comité"
          maxLength={100}
          value={jobId}
          onChange={(e) => setJobId(e.target.value)}
          placeholder="ID de tu ejecución"
        />
      </label>
      <button
        type="button"
        disabled={!active || loading}
        onClick={() => void readCommittee()}
      >
        {loading ? "Consultando…" : "Consultar / actualizar Comité"}
      </button>
      {committee && (
        <p role="status">
          Consulta{" "}
          {committeeReadAt
            ? new Date(committeeReadAt).toLocaleString()
            : "sin fecha"}{" "}
          · Job {committee.jobId} · {committee.status} · revisión{" "}
          {committee.stateRevision} · versión recomendada{" "}
          {committee.recommendedPolicyVersion} · auditoría{" "}
          {committee.finalAudit}. {committee.note} No demuestra el efecto de tus
          medidas: el Comité actual no las recibe.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
