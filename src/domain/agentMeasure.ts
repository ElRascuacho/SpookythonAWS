import { MeasureSchema, WorkspaceSchema, type Measure, type ResearchWorkspace } from "./research";

/** Apply an explicitly requested, validated agent proposal as an active revision. */
export function applyAgentMeasure(workspace: ResearchWorkspace, proposal: Measure, id: string, target: string | null) {
  const definition = MeasureSchema.parse(proposal);
  if (target && !workspace.drafts.some((draft) => draft.id === target)) throw Error("La medida a editar ya no existe.");
  if (!target && workspace.drafts.length >= 8) throw Error("Máximo ocho medidas por experimento.");
  const drafts = target
    ? workspace.drafts.map((draft) => {
        if (draft.id !== target) return draft;
        const revision = draft.revision + 1;
        return { ...draft, definition, revision, confirmed: structuredClone(definition), confirmedRevision: revision,
          enabled: true, history: [...draft.history, { revision, definition: structuredClone(definition) }].slice(-20) };
      })
    : [...workspace.drafts, { id, definition, revision: 1, confirmed: structuredClone(definition),
        confirmedRevision: 1, enabled: true, history: [{ revision: 1, definition: structuredClone(definition) }] }];
  return WorkspaceSchema.parse({ ...workspace, drafts });
}
