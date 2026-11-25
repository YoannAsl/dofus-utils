import type { BreedingGraph } from "@/lib/mounts/breeding-graph";
import { augmentFlow, FlowGraph } from "@/lib/mounts/min-cost-flow";
import type { Sex } from "@/lib/mounts/types";

export const POTION_MIN_GAIN = 0.1;

export interface PotionAttempt {
  childId: string | null;
  chance: number;
}

export interface PotionInput {
  graph: BreedingGraph;
  counts: Record<string, number>;
  females: Record<string, number>;
  attempts: PotionAttempt[];
  usefulChild?: (node: number) => boolean;
}

const MAX_ROUNDS = 1e5;

function partnerLists(graph: BreedingGraph, usefulChild: (node: number) => boolean) {
  const partners = graph.ids.map(() => new Set<number>());
  for (const recipe of graph.recipes) {
    if (!usefulChild(recipe.child)) continue;
    partners[recipe.a]!.add(recipe.b);
    partners[recipe.b]!.add(recipe.a);
  }
  return partners;
}

export function freePartnerSlots(input: Omit<PotionInput, "attempts">, childId: string, sex: Sex, extra: number) {
  const { graph, counts, females, usefulChild = () => true } = input;
  const child = graph.pos.get(childId);
  if (child === undefined) return 0;
  const partners = partnerLists(graph, usefulChild);
  const isBase = new Uint8Array(graph.n);
  for (const base of graph.bases) isBase[base] = 1;
  const flexible = partners.map((list, node) => isBase[node] === 1 || [...list].some((partner) => isBase[partner] === 1));
  if (flexible[child]) return Infinity;

  const n = graph.n;
  const source = 2 * n;
  const sink = 2 * n + 1;
  const flow = new FlowGraph(2 * n + 2);
  for (let node = 0; node < n; node += 1) {
    if (isBase[node] || graph.exits[node]) continue;
    const total = Math.max(0, counts[graph.ids[node]!] ?? 0);
    const female = Math.min(total, Math.max(0, females[graph.ids[node]!] ?? 0));
    if (female > 0) flow.addEdge(source, node, female, 0);
    if (total - female > 0) flow.addEdge(n + node, sink, total - female, 0);
  }
  partners.forEach((list, a) => {
    if (isBase[a] || graph.exits[a]) return;
    for (const b of list) {
      if (isBase[b] || graph.exits[b] || (flexible[a] && flexible[b])) continue;
      flow.addEdge(a, n + b, Infinity, 0);
    }
  });
  const reachable = (distance: number) => Number.isFinite(distance);
  const options = { acceptPath: reachable, maxRounds: MAX_ROUNDS, relaxTolerance: 0, throwOnNegativeCycle: false };
  augmentFlow(flow, source, sink, options);
  const added = sex === "F" ? flow.addEdge(source, child, extra, 0) : flow.addEdge(n + child, sink, extra, 0);
  augmentFlow(flow, source, sink, options);
  return flow.flowOn(added);
}

function expectedOverflow(chances: number[], slots: number) {
  if (!Number.isFinite(slots)) return 0;
  let distribution = [1];
  for (const chance of chances) {
    if (chance <= 0) continue;
    const next = new Array<number>(distribution.length + 1).fill(0);
    distribution.forEach((probability, births) => {
      next[births]! += probability * (1 - chance);
      next[births + 1]! += probability * chance;
    });
    distribution = next;
  }
  return distribution.reduce((sum, probability, births) => sum + probability * Math.max(0, births - slots), 0);
}

export function choosePotions(input: PotionInput): (Sex | null)[] {
  const potions: (Sex | null)[] = input.attempts.map(() => null);
  const byChild = new Map<string, number[]>();
  input.attempts.forEach((attempt, index) => {
    if (!attempt.childId || !(attempt.chance > 0)) return;
    if (!byChild.has(attempt.childId)) byChild.set(attempt.childId, []);
    byChild.get(attempt.childId)!.push(index);
  });

  byChild.forEach((indices, childId) => {
    const slots = {
      F: freePartnerSlots(input, childId, "F", indices.length),
      M: freePartnerSlots(input, childId, "M", indices.length),
    };
    if (!Number.isFinite(slots.F) && !Number.isFinite(slots.M)) return;
    const stranded = () => {
      const share = (sex: Sex) =>
        indices.map((index) => {
          const chance = input.attempts[index]!.chance;
          const potion = potions[index];
          return potion === null ? chance / 2 : potion === sex ? chance : 0;
        });
      return expectedOverflow(share("F"), slots.F) + expectedOverflow(share("M"), slots.M);
    };
    const ordered = [...indices].sort((a, b) => input.attempts[b]!.chance - input.attempts[a]!.chance || a - b);
    for (const index of ordered) {
      const without = stranded();
      let best: { sex: Sex; value: number } | null = null;
      for (const sex of ["F", "M"] as const) {
        potions[index] = sex;
        const value = stranded();
        if (!best || value < best.value) best = { sex, value };
      }
      potions[index] = best && without - best.value >= POTION_MIN_GAIN ? best.sex : null;
    }
  });
  return potions;
}
