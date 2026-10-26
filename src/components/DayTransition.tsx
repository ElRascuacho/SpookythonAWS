import type { CSSProperties } from "react";
import { Activity, FlaskConical, ShieldPlus } from "lucide-react";

export interface DayTransitionReport {
  day: number;
  totalDays: number;
  research: number;
  newCases: number;
  brigades: number;
  funding: number;
  status: "playing" | "won" | "lost";
}

const format = (value: number) => value.toLocaleString("es-EC");

const STATUS_LABEL = {
  playing: "BROTE ACTIVO",
  won: "CURA VALIDADA",
  lost: "MISIÓN TERMINADA",
} as const;

export function DayTransition({ report }: { report: DayTransitionReport }) {
  const { day, totalDays, research, newCases, brigades, funding, status } =
    report;

  return (
    <div className="day-transition" data-status={status} aria-hidden="true">
      <div className="day-transition-field" />
      <div className="day-transition-sweep" />
      <div className="day-transition-core">
        <span className="day-transition-kicker">
          REPORTE DIARIO <b>/</b> RED DE VIGILANCIA · MANTA
        </span>
        <div className="day-transition-day">
          <span>DÍA</span>
          <strong>{String(day).padStart(2, "0")}</strong>
          <small>/ {totalDays}</small>
        </div>
        <span className="day-transition-status">
          <i className="dot" />
          {STATUS_LABEL[status]}
        </span>
        <dl className="day-transition-readout">
          <div style={{ "--i": 0 } as CSSProperties}>
            <dt>
              <Activity size={12} /> Contagios nuevos
            </dt>
            <dd className="coral-text">+{format(newCases)}</dd>
          </div>
          <div style={{ "--i": 1 } as CSSProperties}>
            <dt>
              <FlaskConical size={12} /> Cura
            </dt>
            <dd>
              {research}
              <span className="day-transition-unit">%</span>
            </dd>
          </div>
          <div style={{ "--i": 2 } as CSSProperties}>
            <dt>
              <ShieldPlus size={12} /> Brigadas
            </dt>
            <dd>
              {brigades}
              <small>${format(funding)} al laboratorio</small>
            </dd>
          </div>
        </dl>
      </div>
      <div className="day-transition-timer" />
    </div>
  );
}
