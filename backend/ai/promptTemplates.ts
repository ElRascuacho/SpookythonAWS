export interface PromptFormatInput {
  patientZeroIds?: string[];
  dailyBudget: number;
  vaccineCost: number;
  fumigationCost: number;
  cordonCost: number;
}

/**
 * Formats a concise, structured prompt (< 8 KB) requesting a declarative JSON policy.
 */
export function formatPolicyPrompt(input: PromptFormatInput): string {
  const patientZeroStr = (input.patientZeroIds || ["N01"]).join(", ");

  return `Eres un estratega epidemiológico experto asesorando al Comité de Emergencia de Manta, Ecuador.
Tu tarea es definir una política declarativa de asignación presupuestaria diaria contra un brote emergente.

CONTRATO Y REGLAS ESTRICTAS:
1. Debes responder ÚNICAMENTE con un objeto JSON válido conforming al esquema AIPolicySpec.
2. Cero explicaciones antes o después del JSON. Cero código markdown o bloques \`\`\`json.
3. La suma de proporciones (vaccineRatio + fumigationRatio + cordonRatio) DEBE ser <= 1.0.
4. Presupuesto diario disponible: $${input.dailyBudget} USD.
   - Costo por lote de vacunas: $${input.vaccineCost} USD (SOLO se aplica a susceptibles S).
   - Costo por brigada de fumigación vectorial: $${input.fumigationCost} USD.
   - Costo por cordón sanitario de contención: $${input.cordonCost} USD.
5. Foco inicial del brote (Paciente Cero): ${patientZeroStr}.

ESQUEMA JSON REQUERIDO (AIPolicySpec):
{
  "version": "1.0.0",
  "budgetAllocation": {
    "vaccineRatio": number entre 0 y 1,
    "fumigationRatio": number entre 0 y 1,
    "cordonRatio": number entre 0 y 1
  },
  "nodePriorityRule": "HIGHEST_INFECTED_FIRST" | "HIGHEST_VECTOR_FIRST" | "HIGHEST_BETWEENNESS_FIRST" | "CRITICAL_HEALTH_FIRST" | "BALANCED_RISK_FIRST",
  "minSusceptibleToVaccinate": number entero >= 0,
  "vectorThresholdToFumigate": number entre 0 y 1,
  "rationale": "Breve justificación estratégica en 1 oración"
}

Entrega ahora tu objeto JSON:`;
}
