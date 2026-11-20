import { colourType, type MountFamily, pairKey } from "@/lib/mounts/family";
import type { Mount } from "@/lib/mounts/types";

export const DEFAULT_PARENT_LEVELS = 80;

export function successChance(parentLevels = DEFAULT_PARENT_LEVELS) {
  return Math.min(1, Math.max(0, (30 + 0.15 * parentLevels) / 100));
}

function geneticWeights(mount: Mount, family: MountFamily) {
  const entries: [string, number][] = [[mount.colourId, 5], ...mount.parentIds.map((id): [string, number] => [id, 3])];
  return entries.map(([id, weight]) => {
    const generation = family.byId.get(id)!.generation;
    const pure = generation % 2 === 1 && generation <= 7;
    return { id, weight: weight * (pure ? 4.5 : 1) };
  });
}

export interface OffspringChance {
  colourId: string;
  target: boolean;
  probability: number;
}

export function offspringChances(family: MountFamily, father: Mount, mother: Mount, parentLevels = DEFAULT_PARENT_LEVELS): OffspringChance[] {
  if (!family.byId.has(father.colourId) || !family.byId.has(mother.colourId)) return [];
  const fatherWeights = geneticWeights(father, family);
  const motherWeights = geneticWeights(mother, family);
  const total = (weights: { weight: number }[]) => weights.reduce((sum, entry) => sum + entry.weight, 0);
  const scores = new Map<string, number>();
  const add = (id: string, score: number) => scores.set(id, (scores.get(id) ?? 0) + score);

  for (const a of fatherWeights)
    for (const b of motherWeights) {
      const child = family.childByPair.get(pairKey(a.id, b.id));
      if (child) add(child, a.weight * b.weight);
    }
  for (const a of fatherWeights) add(a.id, a.weight * total(motherWeights));
  for (const b of motherWeights) add(b.id, b.weight * total(fatherWeights));

  const ids = [...scores.keys()];
  const topGeneration = Math.max(...ids.map((id) => family.byId.get(id)!.generation));
  const isTarget = (id: string) => family.byId.get(id)!.generation === topGeneration;
  const chance = successChance(parentLevels);
  const targetScore = ids.filter(isTarget).reduce((sum, id) => sum + scores.get(id)!, 0);
  const otherScore = ids.filter((id) => !isTarget(id)).reduce((sum, id) => sum + scores.get(id)!, 0);

  return ids
    .map((id) => ({
      colourId: id,
      target: isTarget(id),
      probability: isTarget(id) ? (otherScore > 0 ? chance : 1) * (scores.get(id)! / targetScore) : (1 - chance) * (scores.get(id)! / otherScore),
    }))
    .sort((a, b) => Number(b.target) - Number(a.target) || b.probability - a.probability || a.colourId.localeCompare(b.colourId));
}

export function likelyChild(family: MountFamily, father: Mount, mother: Mount) {
  return offspringChances(family, father, mother)[0]?.colourId ?? null;
}

export interface BirthOutcome {
  labels: string[];
  colourId: string;
  nameSuffix: string;
  probability: number;
}

export function birthOutcomes(family: MountFamily, father: Mount, mother: Mount): BirthOutcome[] {
  const parentsType = father.type + mother.type;
  const outcomes: Omit<BirthOutcome, "probability">[] = [];
  const add = (label: string, colourId: string | undefined) => {
    if (!colourId) return;
    const existing = outcomes.find((outcome) => outcome.colourId === colourId);
    if (existing) existing.labels.push(label);
    else outcomes.push({ labels: [label], colourId, nameSuffix: colourType(family, colourId, true) + parentsType });
  };
  const chances = offspringChances(family, father, mother);
  add("Réussie", chances[0]?.colourId);
  add("Comme le père", father.colourId);
  add("Comme la mère", mother.colourId);
  chances
    .filter((chance) => chance.probability >= 0.01 && !outcomes.some((outcome) => outcome.colourId === chance.colourId))
    .forEach((chance) => add(chance.target ? "Réussie aussi" : "Grand-parent", chance.colourId));
  const probabilityById = new Map(chances.map((chance) => [chance.colourId, chance.probability]));
  return outcomes.map((outcome) => ({ ...outcome, probability: probabilityById.get(outcome.colourId) ?? 0 }));
}
