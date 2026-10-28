import { useEffect, useState } from "react";
import type { ResearchContext } from "../domain/researchEvidence";
import "./researchLiveReport.css";
export interface ReportData {
  context: ResearchContext;
  identity: string;
  points: { day: number; infected: number }[];
}
export function ResearchLiveReport({
  initial,
  current,
  createdAt,
  onClose,
}: {
  initial: ReportData;
  current: ReportData;
  createdAt: string;
  onClose: () => void;
}) {
  const [follow, setFollow] = useState(true),
    [last, setLast] = useState(initial);
  const compatible = current.identity === initial.identity;
  useEffect(() => {
    if (follow && compatible) setLast(current);
  }, [current, follow, compatible]);
  const data = follow && compatible ? current : last,
    ctx = data.context,
    live = follow && compatible;
  const max = Math.max(1, ...data.points.map((p) => p.infected)),
    days = Math.max(1, ...data.points.map((p) => p.day));
  function download() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              protocol: "research-live-report-v1",
              createdAt,
              live: false,
              data,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "manta-reporte-dia-" + ctx.observed.day + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="rw-live-report" aria-label="Reporte del experimento">
      <header>
        <strong>Reporte del experimento</strong>
        <button type="button" aria-label="Cerrar reporte" onClick={onClose}>
          ×
        </button>
      </header>
      <p className="rw-report-status">
        {live ? "● En vivo" : "Instantánea conservada"} · día {ctx.observed.day}{" "}
        · {new Date(createdAt).toLocaleTimeString()}
      </p>
      {!compatible && (
        <p>
          La configuración cambió. Este reporte conserva los últimos datos de su
          experimento original.
        </p>
      )}
      {!ctx.executionParameters && (
        <p>
          Aún no hay ejecución preparada: se muestra el estado inicial, no
          resultados de una intervención.
        </p>
      )}
      {ctx.configurationChanged && (
        <p>
          La ejecución visible corresponde a una configuración anterior a la
          editable.
        </p>
      )}
      <dl>
        {[
          ["Infecciosos", ctx.observed.infected],
          ["Contagios acumulados", ctx.observed.cumulativeInfected],
          ["Expuestos", ctx.observed.exposed],
          ["Recuperados", ctx.observed.recovered],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{Number(value).toLocaleString()}</dd>
          </div>
        ))}
      </dl>
      <svg
        viewBox="0 0 320 100"
        role="img"
        aria-label={`Evolución de infecciosos hasta el día ${ctx.observed.day}`}
      >
        <title>Solo días observados · infecciosos</title>
        <path d="M8 8 V88 H312" fill="none" stroke="#ffffff30" />
        <polyline
          points={data.points
            .map(
              (p) =>
                `${8 + (p.day / days) * 304},${88 - (p.infected / max) * 76}`,
            )
            .join(" ")}
          fill="none"
          stroke="#ffad66"
          strokeWidth="2"
        />
        <text x="10" y="99">
          Día 0
        </text>
        <text x="265" y="99">
          Día {ctx.observed.day}
        </text>
      </svg>
      <p>
        Hospital:{" "}
        {ctx.observed.hospitalCollapsed
          ? "capacidad superada"
          : "dentro de capacidad"}{" "}
        · {ctx.measures.filter((m) => m.enabled && m.confirmed).length} medidas
        confirmadas activas.
      </p>
      {ctx.evidence && (
        <p>
          {ctx.evidenceCurrent
            ? `Evaluación exploratoria de ${ctx.evidence.replicas} pares: diferencia de contagios (con − sin) ${ctx.evidence.infectionDifference.toFixed(1)}, intervalo 95% [${ctx.evidence.interval.map((n) => n.toFixed(1)).join(", ")}].`
            : "La evidencia disponible está desactualizada; no se usa como resultado de este reporte."}
        </p>
      )}
      {ctx.committee && (
        <p>
          Última consulta del Comité: {ctx.committee.status}, versión{" "}
          {ctx.committee.recommendedPolicyVersion}, auditoría{" "}
          {ctx.committee.finalAudit}. No demuestra el efecto de estas medidas.
        </p>
      )}
      <p className="rw-report-note">
        Fuente: motor SEIR-V local y días observados. Modelo educativo no
        calibrado; no es predicción clínica ni auditoría final. Generar este
        reporte no ejecuta simulaciones nuevas.
      </p>
      <footer>
        <button
          type="button"
          disabled={!compatible}
          onClick={() => setFollow((v) => !v)}
        >
          {live ? "Conservar instantánea" : "Seguir en vivo"}
        </button>
        <button type="button" onClick={download}>
          Descargar JSON
        </button>
      </footer>
    </section>
  );
}
