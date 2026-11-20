import { breedingGraph } from "@/lib/mounts/breeding-graph";
import { getMountFamily, type MountFamily, pairKey } from "@/lib/mounts/family";
import { planStep, type ObjectiveMode, type RebalanceLine } from "@/lib/mounts/horizon";
import { parseMountName } from "@/lib/mounts/names";
import { likelyChild, successChance } from "@/lib/mounts/offspring";
import type { Mount, MountFamilyId, Sex } from "@/lib/mounts/types";

const PARENT_LEVEL = 40;
const CAPTURE_BUDGET = 30;
const POTION_MARGIN = 3;

export interface PlannerInput {
  family: MountFamilyId;
  mounts: string[];
  mode?: ObjectiveMode;
  missing?: Record<string, number>;
  avoidObtained?: boolean;
}

export interface Pairing {
  pair: [string, string];
  potion: Sex | null;
  final: boolean;
  intended?: string;
  target: string | null;
}

export interface ImpureMount {
  code: string;
  colourId: string;
  parentIds: string[];
}

export interface StablePlan {
  family: MountFamilyId;
  read: number;
  rejected: { index: number; code: string }[];
  pairings: Pairing[];
  unmatched: number;
  rebalance: RebalanceLine[];
  rebalanceNote: string | null;
  impures: ImpureMount[];
}

export class PlannerError extends Error {}

interface PlannedMount extends Mount {
  geneticId: string;
}

interface ColourStats {
  counts: Record<string, number>;
  females: Record<string, number>;
}

function colourStats<T extends Mount>(mounts: T[], colourOf: (mount: T) => string): ColourStats {
  const counts: Record<string, number> = {};
  const females: Record<string, number> = {};
  for (const mount of mounts) {
    const colour = colourOf(mount);
    counts[colour] = (counts[colour] ?? 0) + 1;
    females[colour] = (females[colour] ?? 0) + (mount.sex === "F" ? 1 : 0);
  }
  return { counts, females };
}

function partnersAvailable(stats: ColourStats, colourId: string, sex: Sex) {
  const total = stats.counts[colourId] ?? 0;
  const female = stats.females[colourId] ?? 0;
  return sex === "M" ? female : total - female;
}

function geneticColour(mount: Mount, family: MountFamily, stats: ColourStats) {
  const generation = family.byId.get(mount.colourId)?.generation;
  if (generation === undefined) return mount.colourId;
  const richer = mount.parentIds.filter((id) => (family.byId.get(id)?.generation ?? 0) > generation);
  if (richer.length === 0) return mount.colourId;
  if (richer.length === 1) return richer[0]!;
  const [a, b] = richer as [string, string];
  const genA = family.byId.get(a)!.generation;
  const genB = family.byId.get(b)!.generation;
  if (genA !== genB) return genA > genB ? a : b;
  const partnersA = partnersAvailable(stats, a, mount.sex);
  const partnersB = partnersAvailable(stats, b, mount.sex);
  if (partnersA !== partnersB) return partnersA > partnersB ? a : b;
  return a < b ? a : b;
}

function potionFor(family: MountFamily, childId: string, { counts, females }: ColourStats): Sex | null {
  const generation = family.byId.get(childId)?.generation;
  if (!generation || generation < 2 || generation % 2 !== 0) return null;
  const female = females[childId] ?? 0;
  const male = (counts[childId] ?? 0) - female;
  if (male - female >= POTION_MARGIN) return "F";
  if (female - male >= POTION_MARGIN) return "M";
  return null;
}

const isRich = (mount: PlannedMount, family: MountFamily) =>
  family.byId.get(mount.geneticId)!.generation > family.byId.get(mount.colourId)!.generation;
const geneticGeneration = (mount: PlannedMount, family: MountFamily) => family.byId.get(mount.geneticId)!.generation;

function pairRichLeftovers(leftovers: PlannedMount[], family: MountFamily, stats: ColourStats) {
  const surplus = (mount: PlannedMount) => {
    const total = stats.counts[mount.geneticId] ?? 0;
    const female = stats.females[mount.geneticId] ?? 0;
    const male = total - female;
    return mount.sex === "M" ? male > female : female > male;
  };
  const recipeChild = (a: string, b: string) => family.childByPair.get(pairKey(a, b)) ?? null;
  const rich = leftovers.filter((mount) => isRich(mount, family)).sort((a, b) => geneticGeneration(b, family) - geneticGeneration(a, family));
  const plain = leftovers.filter((mount) => !isRich(mount, family)).sort((a, b) => geneticGeneration(a, family) - geneticGeneration(b, family));
  const used = new Set<PlannedMount>();
  const pairs: { male: PlannedMount; female: PlannedMount }[] = [];
  for (const mount of rich) {
    const otherSex: Sex = mount.sex === "M" ? "F" : "M";
    const candidates = plain.filter(
      (partner) =>
        !used.has(partner) &&
        partner.sex === otherSex &&
        geneticGeneration(partner, family) <= geneticGeneration(mount, family) &&
        (recipeChild(mount.geneticId, partner.geneticId) !== null || geneticGeneration(partner, family) === 1 || surplus(partner)),
    );
    if (candidates.length === 0) continue;
    const partner = candidates.find((candidate) => recipeChild(mount.geneticId, candidate.geneticId) !== null) ?? candidates[0]!;
    used.add(partner);
    pairs.push(mount.sex === "M" ? { male: mount, female: partner } : { male: partner, female: mount });
  }
  return pairs;
}

function lineageEnds(family: MountFamily) {
  const parents = new Set(family.colours.flatMap((colour) => colour.recipes.flat()));
  return new Set(family.colours.filter((colour) => !parents.has(colour.id)).map((colour) => colour.id));
}

function pairLineageEnds(leftovers: PlannedMount[], family: MountFamily) {
  const ends = lineageEnds(family);
  const males = new Map<number, PlannedMount[]>();
  const females = new Map<number, PlannedMount[]>();
  for (const mount of leftovers) {
    if (!ends.has(mount.geneticId)) continue;
    const generation = geneticGeneration(mount, family);
    const bySex = mount.sex === "M" ? males : females;
    if (!bySex.has(generation)) bySex.set(generation, []);
    bySex.get(generation)!.push(mount);
  }
  const pairs: [PlannedMount, PlannedMount][] = [];
  [...males.keys()]
    .sort((a, b) => b - a)
    .forEach((generation) => {
      const maleList = males.get(generation) ?? [];
      const femaleList = females.get(generation) ?? [];
      for (let index = 0; index < Math.min(maleList.length, femaleList.length); index += 1) pairs.push([maleList[index]!, femaleList[index]!]);
    });
  return pairs;
}

const lineageKey = (mount: Mount) => `${mount.colourId}|${[...mount.parentIds].sort().join(",")}`;

export function planStable({ family: familyId, mounts: names, mode = "genetons", missing = {}, avoidObtained = true }: PlannerInput): StablePlan {
  const family = getMountFamily(familyId);
  const mounts: PlannedMount[] = [];
  const rejected: StablePlan["rejected"] = [];
  names.forEach((name, index) => {
    const mount = parseMountName(String(name), family);
    if (mount) mounts.push({ ...mount, geneticId: mount.colourId });
    else rejected.push({ index, code: String(name) });
  });
  if (mounts.length === 0) throw new PlannerError("Aucune monture lisible : vérifie les noms.");

  const stats = colourStats(mounts, (mount) => mount.colourId);
  for (const mount of mounts) mount.geneticId = geneticColour(mount, family, stats);
  const geneticStats = colourStats(mounts, (mount) => mount.geneticId);

  const success = mode === "success";
  const wanted: Record<string, number> = {};
  if (success) {
    for (const [id, count] of Object.entries(missing)) {
      const amount = Math.floor(Number(count) || 0);
      if ((family.byId.get(id)?.generation ?? 0) >= 2 && amount > 0) wanted[id] = Math.min(amount, 20);
    }
    if (Object.keys(wanted).length === 0) throw new PlannerError("Mode succès : aucune couleur à obtenir. Décoche les naissances qui te manquent, ou passe en génétons.");
  }

  const chance = successChance(2 * PARENT_LEVEL);
  const step = planStep({
    graph: breedingGraph(family.colours),
    mode,
    chance,
    captureBudget: CAPTURE_BUDGET,
    ...geneticStats,
    missing: wanted,
    avoidObtained: success && avoidObtained,
  });

  const genetons = (attempts: number, femaleId: string, maleId: string) =>
    Math.round(attempts * chance * (2 ** (family.byId.get(femaleId)!.generation - 1) + 2 ** (family.byId.get(maleId)!.generation - 1)) * 100) / 100;
  const reproductions = step.reproductions
    .map((reproduction) => ({ ...reproduction, score: genetons(reproduction.attempts, reproduction.femaleId, reproduction.maleId) }))
    .sort((a, b) => b.score - a.score);

  const pools: Record<Sex, Map<string, PlannedMount[]>> = { M: new Map(), F: new Map() };
  for (const mount of mounts) {
    const pool = pools[mount.sex];
    if (!pool.has(mount.geneticId)) pool.set(mount.geneticId, []);
    pool.get(mount.geneticId)!.push(mount);
  }
  const childCache = new Map<string, string | null>();
  const childOf = (male: Mount, female: Mount) => {
    const key = `${lineageKey(male)}>${lineageKey(female)}`;
    if (!childCache.has(key)) childCache.set(key, likelyChild(family, male, female));
    return childCache.get(key)!;
  };
  const distinctLineages = (list: PlannedMount[]) => {
    const seen = new Set<string>();
    return list.filter((mount) => {
      const key = lineageKey(mount);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const pairings: Pairing[] = [];
  let unmatched = 0;
  for (const reproduction of reproductions) {
    for (let attempt = 0; attempt < Math.max(0, Math.round(reproduction.attempts)); attempt += 1) {
      const males = pools.M.get(reproduction.maleId) ?? [];
      const femalesLeft = pools.F.get(reproduction.femaleId) ?? [];
      if (males.length === 0 || femalesLeft.length === 0) {
        unmatched += 1;
        continue;
      }
      let chosen: [PlannedMount, PlannedMount] | null = null;
      for (const male of distinctLineages(males)) {
        for (const female of distinctLineages(femalesLeft))
          if (childOf(male, female) === reproduction.childId) {
            chosen = [male, female];
            break;
          }
        if (chosen) break;
      }
      const [male, female] = chosen ?? [males[0]!, femalesLeft[0]!];
      males.splice(males.indexOf(male), 1);
      femalesLeft.splice(femalesLeft.indexOf(female), 1);
      pairings.push({
        pair: [male.code, female.code],
        potion: potionFor(family, reproduction.childId, geneticStats),
        final: false,
        intended: reproduction.childId,
        target: childOf(male, female),
      });
    }
  }

  const leftovers = [...pools.M.values(), ...pools.F.values()].flat();
  const paired = new Set<PlannedMount>();
  for (const { male, female } of pairRichLeftovers(leftovers, family, stats)) {
    paired.add(male);
    paired.add(female);
    pairings.push({ pair: [male.code, female.code], potion: null, final: false, target: childOf(male, female) });
  }
  for (const [male, female] of pairLineageEnds(
    leftovers.filter((mount) => !paired.has(mount)),
    family,
  ))
    pairings.push({ pair: [male.code, female.code], potion: null, final: true, target: childOf(male, female) });

  const inPairs = new Set(pairings.flatMap((pairing) => pairing.pair));
  const impures = mounts
    .filter(
      (mount) =>
        !inPairs.has(mount.code) &&
        family.byId.get(mount.colourId)?.generation === 1 &&
        mount.parentIds.length > 0 &&
        mount.parentIds.some((id) => id !== mount.colourId) &&
        mount.geneticId === mount.colourId,
    )
    .map((mount) => ({ code: mount.code, colourId: mount.colourId, parentIds: mount.parentIds }));

  return {
    family: familyId,
    read: mounts.length,
    rejected,
    pairings,
    unmatched,
    rebalance: step.rebalance,
    rebalanceNote: step.rebalanceNote,
    impures,
  };
}
