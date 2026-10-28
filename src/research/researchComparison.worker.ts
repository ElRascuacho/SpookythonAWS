import { z } from "zod";
import { WorkspaceSchema } from "../domain/research";
import {
  compareResearch,
  configurationHash,
  EvidenceSchema,
} from "../domain/researchEvidence";
const Input = z
  .object({
    workspace: WorkspaceSchema,
    replicas: z.union([z.literal(16), z.literal(32)]),
  })
  .strict();
self.onmessage = async (event: MessageEvent) => {
  try {
    const { workspace, replicas } = Input.parse(event.data);
    const hash = await configurationHash(workspace);
    const metrics = compareResearch(workspace, replicas, (done) =>
      self.postMessage({ type: "progress", done }),
    );
    self.postMessage({
      type: "result",
      evidence: EvidenceSchema.parse({
        ...metrics,
        protocol: "research-paired-v1",
        hash,
        createdAt: new Date().toISOString(),
        configuration: workspace,
        replicas,
      }),
    });
  } catch (e) {
    self.postMessage({
      type: "error",
      message: e instanceof Error ? e.message : "No se pudo comparar.",
    });
  }
};
