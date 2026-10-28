import type { Measure } from "../../research";
export const researchMeasure: Measure = {
  name: "Restricción nocturna experimental",
  description: "Reducir movilidad con horario configurable",
  assumptions:
    "Hipótesis no calibradas: reducción 60%, cumplimiento 70%, costo 120 USD/zona/día.",
  numbers: [
    {
      key: "reduction",
      label: "Reducción",
      value: 0.6,
      min: 0,
      max: 1,
      unit: "proporción",
    },
    {
      key: "compliance",
      label: "Cumplimiento",
      value: 0.7,
      min: 0,
      max: 1,
      unit: "proporción",
    },
    {
      key: "cost",
      label: "Costo",
      value: 120,
      min: 0,
      max: 11000,
      unit: "USD/zona/día",
    },
    {
      key: "threshold",
      label: "Umbral",
      value: 0,
      min: 0,
      max: 1,
      unit: "proporción",
    },
  ],
  times: [
    { key: "start", label: "Inicio", value: "22:00" },
    { key: "end", label: "Fin", value: "05:00" },
  ],
  zones: ["N01", "N07"],
  excludedEdges: [],
  firstDay: 1,
  lastDay: 40,
  startKey: "start",
  endKey: "end",
  thresholdKey: null,
  costKey: "cost",
  effects: [
    {
      channel: "mobility",
      reductionKey: "reduction",
      complianceKey: "compliance",
    },
  ],
};
