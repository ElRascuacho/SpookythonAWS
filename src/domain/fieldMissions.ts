import { createSeededRng } from './prng';
import { MANTA_NODES, NODE_MAP, TOTAL_MANTA_POPULATION } from './mantaGraph';
import { campaignStatus } from './campaign';
import { LOSS_THRESHOLD, type CureGame } from './cureGame';
import { runSingleSeirSimulation } from './seirEngine';
import type { DailyAction, FieldMissionKind } from './types';

export const FIELD_MISSIONS = {
  shooter: { title: 'Perímetro cero', role: 'Agente de contención', reward: 'Reduce un 20% los infectados de la zona, hasta 60.', objective: 'Neutraliza 8 zombis antes de perder tus 3 escudos.', controls: 'Ratón para apuntar · clic para disparar · R para recargar. También flechas + espacio.' },
  parkour: { title: 'La última azotea', role: 'Superviviente en extracción', reward: 'Protege a 150 susceptibles de la zona.', objective: 'Recoge las 3 reservas médicas y alcanza la baliza de extracción.', controls: 'A / D o ← / → para moverte · espacio / ↑ para saltar. Tienes 3 intentos y un punto de control.' },
  lab: { title: 'Protocolo Lázaro', role: 'Especialista de laboratorio', reward: 'Suma entre 5 y 10 puntos porcentuales a la cura.', objective: 'Gira los conductos para conectar la muestra de entrada con el sintetizador.', controls: 'Clic o Tab + Enter para girar una pieza · verifica el circuito al terminar. Sin límite de tiempo.' },
} as const;

export interface FieldOperation { nodeId: string; kind: FieldMissionKind }

export function missionFitsZone(kind: FieldMissionKind, nodeId: string) {
  const hospital = NODE_MAP[nodeId]?.category === 'Salud Crítica';
  return Object.hasOwn(NODE_MAP, nodeId) && (kind === 'lab' ? hospital : !hospital);
}

export function pendingFieldOperation(game:CureGame, operation:FieldOperation|null):FieldOperation|null {
  if(game.status!=='playing'||!operation||!Object.hasOwn(FIELD_MISSIONS,operation.kind)||!missionFitsZone(operation.kind,operation.nodeId)||game.actions[game.day]?.fieldRewards?.[operation.kind])return null;
  return missionRewardAmount(game,operation.kind,operation.nodeId)>0?operation:null;
}

export function randomFieldOperation(game: CureGame, rng = Math.random): FieldOperation | null {
  if (game.status !== 'playing') return null;
  const available = (Object.keys(FIELD_MISSIONS) as FieldMissionKind[]).map(kind => ({
    kind,
    nodes: MANTA_NODES.filter(node => !game.actions[game.day]?.fieldRewards?.[kind] && missionFitsZone(kind, node.id) && missionRewardAmount(game, kind, node.id) > 0),
  })).filter(option => option.nodes.length > 0);
  if (!available.length) return null;
  const option = available[Math.floor(rng() * available.length)];
  return { kind: option.kind, nodeId: option.nodes[Math.floor(rng() * option.nodes.length)].id };
}

export function missionRewardAmount(game: CureGame, kind: FieldMissionKind, nodeId: string) {
  const node = game.timeline[game.day].nodes[nodeId];
  if (!node) throw new Error('Zona de operación inválida.');
  if (node.E + node.I <= 0) return 0;
  if (kind === 'shooter') return Math.min(node.I, 60, Math.ceil(node.I * 0.2));
  if (kind === 'parkour') return Math.min(node.S, 150);
  if (kind !== 'lab') throw new Error('Operación inválida.');
  return Math.min(100 - game.research, 5 + Math.floor(createSeededRng(game.config.seed, 'LAB_REWARD', game.day)() * 6));
}

export function completeFieldMission(game: CureGame, kind: FieldMissionKind, nodeId: string): CureGame {
  if (!Object.hasOwn(FIELD_MISSIONS, kind) || !Object.hasOwn(NODE_MAP, nodeId)) throw new Error('Operación inválida.');
  if (game.actions[game.day]?.fieldRewards?.[kind]) return game;
  if (game.status !== 'playing') throw new Error('La partida ya terminó.');
  if (!missionFitsZone(kind, nodeId)) throw new Error('Operación incompatible con esta zona.');
  const amount = missionRewardAmount(game, kind, nodeId);
  if (amount <= 0) throw new Error('No hay población elegible o la cura ya está completa.');
  const action: DailyAction = game.actions[game.day] ?? { day: game.day, vaccinatedNodes: {}, fumigatedNodes: [], cordonedNodes: [], cordonedEdges: [], budgetSpent: 0, summaryText: 'Operación de campo.' };
  const actions = { ...game.actions, [game.day]: { ...action, fieldRewards: { ...action.fieldRewards, [kind]: { nodeId, amount } } } };
  const run = runSingleSeirSimulation({ ...game.params, days: game.day }, 'SMART_CORTAFUEGOS', 0, actions);
  const research = Math.min(100, game.research + (kind === 'lab' ? amount : 0));
  const snapshot = run.timeline[game.day];
  const status = snapshot.cumulativeInfected >= TOTAL_MANTA_POPULATION * LOSS_THRESHOLD ? 'lost' : game.config.campaignChapter !== undefined ? campaignStatus(game.config.campaignChapter, game.day, snapshot, research) : research >= 100 ? 'won' : 'playing';
  const message = kind === 'lab' ? `Laboratorio: +${amount} pp de cura.` : kind === 'shooter' ? `Perímetro asegurado: ${amount} infectados tratados en ${NODE_MAP[nodeId].name}.` : `Extracción completada: ${amount} susceptibles protegidos en ${NODE_MAP[nodeId].name}.`;
  return { ...game, actions, research, timeline: run.timeline, status, log: [message, ...game.log].slice(0, 20) };
}

export const rotatePipe = (mask: number) => ((mask << 1) & 15) | ((mask >> 3) & 1);
export const PIPE_PATH = [4, 5, 1, 2, 6, 10, 11];
// Bits clockwise: north, east, south, west. The solvable path is scrambled, never generated by chance.
export const PIPE_SOLUTION = [5, 6, 12, 3, 10, 9, 5, 10, 3, 6, 3, 10, 12, 5, 9, 6];
export function createPipePuzzle(seed: number, day: number) {
  const rng = createSeededRng(seed, 'PIPE_PUZZLE', day);
  const pieces = PIPE_SOLUTION.map((mask) => { for (let n = Math.floor(rng() * 4); n > 0; n--) mask = rotatePipe(mask); return mask; });
  if (connectedPipes(pieces).has(11) && (pieces[11] & 2)) pieces[4] = rotatePipe(pieces[4]);
  return pieces;
}
export function connectedPipes(pieces: number[]): Set<number> {
  const reached = new Set<number>();
  if (pieces.length !== 16 || !(pieces[4] & 8)) return reached;
  const queue = [4];
  const directions = [{ bit: 1, opposite: 4, dx: 0, dy: -1 }, { bit: 2, opposite: 8, dx: 1, dy: 0 }, { bit: 4, opposite: 1, dx: 0, dy: 1 }, { bit: 8, opposite: 2, dx: -1, dy: 0 }];
  while (queue.length) {
    const cell = queue.shift()!;
    if (reached.has(cell)) continue;
    reached.add(cell);
    for (const d of directions) {
      const x = cell % 4 + d.dx, y = Math.floor(cell / 4) + d.dy, next = y * 4 + x;
      if (x >= 0 && x < 4 && y >= 0 && y < 4 && (pieces[cell] & d.bit) && (pieces[next] & d.opposite) && !reached.has(next)) queue.push(next);
    }
  }
  return reached;
}
