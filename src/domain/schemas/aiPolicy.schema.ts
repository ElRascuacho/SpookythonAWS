import { z } from "zod";

export const NodePriorityRuleSchema = z.enum([
  "HIGHEST_INFECTED_FIRST",
  "HIGHEST_VECTOR_FIRST",
  "HIGHEST_BETWEENNESS_FIRST",
  "CRITICAL_HEALTH_FIRST",
  "BALANCED_RISK_FIRST",
]);

export const BudgetAllocationSchema = z
  .object({
    vaccineRatio: z
      .number()
      .min(0, "vaccineRatio debe ser >= 0")
      .max(1, "vaccineRatio debe ser <= 1"),
    fumigationRatio: z
      .number()
      .min(0, "fumigationRatio debe ser >= 0")
      .max(1, "fumigationRatio debe ser <= 1"),
    cordonRatio: z
      .number()
      .min(0, "cordonRatio debe ser >= 0")
      .max(1, "cordonRatio debe ser <= 1"),
  })
  .refine(
    (data) => {
      const sum = data.vaccineRatio + data.fumigationRatio + data.cordonRatio;
      return sum <= 1.0001; // tolerance for floating point representation
    },
    {
      message:
        "La suma de proporciones de presupuesto (vaccineRatio + fumigationRatio + cordonRatio) no puede exceder 1.0",
    },
  );

export const AIPolicySpecSchema = z
  .object({
    version: z.string().default("1.0.0"),
    budgetAllocation: BudgetAllocationSchema,
    nodePriorityRule: NodePriorityRuleSchema,
    minSusceptibleToVaccinate: z.number().int().min(0).default(50),
    vectorThresholdToFumigate: z.number().min(0).max(1).default(0.3),
    rationale: z
      .string()
      .max(1000, "La justificación no debe exceder 1000 caracteres")
      .optional(),
  })
  .strict();

export type AIPolicySpec = z.infer<typeof AIPolicySpecSchema>;
export type BudgetAllocation = z.infer<typeof BudgetAllocationSchema>;
export type NodePriorityRule = z.infer<typeof NodePriorityRuleSchema>;
