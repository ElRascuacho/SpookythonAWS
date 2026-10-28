import { createSeededRng } from "./prng";
import { MANTA_NODES } from "./mantaGraph";

export interface LabEvent {
  nodeId: string;
  sequence: number[];
}

/** One reproducible lab incident on roughly 1 in 5 active days. */
export function createLabEvent(seed: number, day: number): LabEvent | null {
  const rng = createSeededRng(seed, "LAB_EVENT", day);
  if (day < 1 || rng() >= 0.2) return null;
  const node = MANTA_NODES[Math.floor(rng() * MANTA_NODES.length)];
  return { nodeId: node.id, sequence: Array.from({ length: 3 }, () => Math.floor(rng() * 4)) };
}
