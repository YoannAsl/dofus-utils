import { breedingGraph } from "@/lib/mounts/breeding-graph";
import { getMountFamily, type MountFamily, pairKey } from "@/lib/mounts/family";
import { planStep, type ObjectiveMode, type RebalanceLine } from "@/lib/mounts/horizon";
import { parseMountName } from "@/lib/mounts/names";
import { likelyChild, successChance } from "@/lib/mounts/offspring";
import type { Mount, MountFamilyId, Sex } from "@/lib/mounts/types";

/** Niveau des parents supposé par le plan. */
const PARENT_LEVEL = 40;
const CAPTURE_BUDGET = 30;
/** Écart de sexes à partir duquel on conseille une potion pour la couleur visée. */
const POTION_MARGIN = 3;

export interface PlannerInput {
  family: MountFamilyId;
  /** Noms de 13 lettres des montures fécondes de l'étable. */
  mounts: string[];
  mode?: ObjectiveMode;
  /** Mode succès : naissances voulues par couleur (G2 et plus). */
  missing?: Record<string, number>;
  /** Mode succès : n'accoupler que vers les couleurs à obtenir. */
  avoidObtained?: boolean;
}

export interface Pairing {
  /** Mâle puis femelle. */
  pair: [string, string];
  /** Sexe à forcer avec une potion pour le petit, quand sa couleur manque de ce sexe. */
  potion: Sex | null;
  /** Dernier accouplement de deux montures en bout de lignée, avant le brisage. */
  final: boolean;
  /** Couleur que le plan vise. */
  intended?: string;
  /** Couleur que le jeu visera avec ces deux montures. */
  target?: string | null;
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
  /** Tentatives du plan sans monture libre pour les faire. */
  unmatched: number;
  rebalance: RebalanceLine[];
  rebalanceNote: string | null;
  impures: ImpureMount[];
}

export class PlannerError extends Error {}

interface PlannedMount extends Mount {
  /** Couleur dont la monture porte les gènes : son parent le plus avancé, s'il dépasse sa couleur. */
  geneticId: string;
}

interface ColourStats {
  counts: Record<string, number>;
  females: Record<string, number>;
}

function colourStats(mounts: Mount[]): ColourStats {
  const counts: Record<string, number> = {};
  const females: Record<string, number> = {};
  for (const mount of mounts) {
    counts[mount.colourId] = (counts[mount.colourId] ?? 0) + 1;
    females[mount.colourId] = (females[mount.colourId] ?? 0) + (mount.sex === "F" ? 1 : 0);
  }
  return { counts, females };
}

/** Partenaires de l'autre sexe qu'a déjà cette couleur dans l'étable. */
function partnersAvailable(stats: ColourStats, colourId: string, sex: Sex) {
  const total = stats.counts[colourId] ?? 0;
  const female = stats.females[colourId] ?? 0;
  return sex === "M" ? female : total - female;
}

/**
 * Une Amande née d'une Ébène-Indigo se croise comme une Ébène-Indigo : la couleur génétique est
 * celle du parent le plus avancé, quand il dépasse la monture. À égalité, celle qui a le plus de partenaires.
 */
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

/** Potion conseillée : la couleur visée, paire, a trois montures d'un sexe de plus que de l'autre. */
function potionFor(family: MountFamily, childId: string, counts: Record<string, number>, females: Record<string, number>): Sex | null {
  const generation = family.byId.get(childId)?.generation;
  if (!generation || generation < 2 || generation % 2 !== 0) return null;
  const total = Math.max(0, Math.round(counts[childId] ?? 0));
  if (total <= 0) return null;
  const female = Math.min(Math.max(0, Math.round(females[childId] ?? 0)), total);
  const male = total - female;
  if (male - female >= POTION_MARGIN) return "F";
  if (female - male >= POTION_MARGIN) return "M";
  return null;
}

const isRich = (mount: PlannedMount, family: MountFamily) =>
  family.byId.get(mount.geneticId)!.generation > family.byId.get(mount.colourId)!.generation;
const geneticGeneration = (mount: PlannedMount, family: MountFamily) => family.byId.get(mount.geneticId)!.generation;

/**
 * Une monture « riche » que le plan laisse de côté s'accouple quand même : avec une monture qui
 * donne une recette, une G1, ou une monture dont la couleur a trop de ce sexe.
 */
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

/** Couleurs qui ne servent de parent à aucune recette : la fin de la lignée. */
function lineageEnds(family: MountFamily) {
  const parents = new Set(family.colours.flatMap((colour) => colour.recipes.flat()));
  return new Set(family.colours.filter((colour) => !parents.has(colour.id)).map((colour) => colour.id));
}

/** Les montures en bout de lignée se croisent une dernière fois entre elles, par génération. */
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

  const stats = colourStats(mounts);
  for (const mount of mounts) mount.geneticId = geneticColour(mount, family, stats);
  const counts: Record<string, number> = {};
  const females: Record<string, number> = {};
  for (const mount of mounts) {
    counts[mount.geneticId] = (counts[mount.geneticId] ?? 0) + 1;
    females[mount.geneticId] = (females[mount.geneticId] ?? 0) + (mount.sex === "F" ? 1 : 0);
  }

  const success = mode === "success";
  const wanted: Record<string, number> = {};
  if (success) {
    for (const [id, count] of Object.entries(missing)) {
      const amount = Math.floor(Number(count) || 0);
      if ((family.byId.get(id)?.generation ?? 0) >= 2 && amount > 0) wanted[id] = Math.min(amount, 20);
    }
    if (Object.keys(wanted).length === 0) throw new PlannerError("Mode succès : aucune couleur à obtenir. Décoche les naissances qui te manquent, ou passe en génétons.");
  }

  const step = planStep({
    graph: breedingGraph(family.colours),
    mode,
    chance: successChance(2 * PARENT_LEVEL),
    captureBudget: CAPTURE_BUDGET,
    counts,
    females,
    missing: wanted,
    avoidObtained: success && avoidObtained,
  });

  // Les tentatives qui rapportent le plus de génétons d'abord : elles prennent les montures en premier.
  const genetons = (attempts: number, femaleId: string, maleId: string) =>
    Math.round(attempts * successChance(2 * PARENT_LEVEL) * (2 ** (family.byId.get(femaleId)!.generation - 1) + 2 ** (family.byId.get(maleId)!.generation - 1)) * 100) / 100;
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
    return list.filter((mount) => !seen.has(lineageKey(mount)) && (seen.add(lineageKey(mount)), true));
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
      // Parmi les montures de ces couleurs, un couple dont le jeu vise bien la couleur voulue.
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
        potion: potionFor(family, reproduction.childId, counts, females),
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
    pairings.push({ pair: [male.code, female.code], potion: null, final: false });
  }
  for (const [male, female] of pairLineageEnds(
    leftovers.filter((mount) => !paired.has(mount)),
    family,
  ))
    pairings.push({ pair: [male.code, female.code], potion: null, final: true });

  // G1 aux parents d'autres couleurs : leurs petits visent moins souvent la bonne couleur.
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
