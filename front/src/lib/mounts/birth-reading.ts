import { accentColourName, colourType, type MountFamily } from "@/lib/mounts/family";
import { parseMountName } from "@/lib/mounts/names";
import type { Pairing } from "@/lib/mounts/planner";
import type { Sex } from "@/lib/mounts/types";

export interface BirthEvent {
  child: string;
  generation: number | null;
  left_parent: string;
  right_parent: string;
  sex: Sex | null;
  father?: "left" | "right" | null;
  card?: string;
  litter?: string;
}

export interface BirthReading {
  childId: string;
  sex: Sex | null;
  fatherId: string;
  motherId: string;
  names: { M: string; F: string };
  pairingIndex: number | null;
}

function letters(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word.length > 2)
    .join("");
}

function editDistance(a: string, b: string) {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++)
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = current;
  }
  return previous[b.length]!;
}

const MIN_SIMILARITY = 0.75;

function colourKeys(family: MountFamily, colourId: string) {
  const colour = family.byId.get(colourId)!;
  const recipe = colour.generation % 2 === 0 ? colour.recipes[0] : undefined;
  if (!recipe) return [letters(accentColourName(colour.name))];
  const [a, b] = recipe.map((id) => letters(accentColourName(family.byId.get(id)!.name))) as [string, string];
  return [a + b, b + a];
}

export function matchColour(family: MountFamily, text: string, generation?: number | null): string | null {
  const read = letters(text);
  if (!read) return null;
  let best: { id: string; score: number } | null = null;
  for (const colour of family.colours) {
    if (generation && colour.generation !== generation) continue;
    for (const key of colourKeys(family, colour.id)) {
      const score = 1 - editDistance(read, key) / Math.max(read.length, key.length);
      if (!best || score > best.score) best = { id: colour.id, score };
    }
  }
  if (best && best.score >= MIN_SIMILARITY) return best.id;
  return generation ? matchColour(family, text) : null;
}

export function readBirth(
  family: MountFamily,
  birth: BirthEvent,
  pairings: Pairing[] = [],
  done: Set<number> = new Set(),
  active: number | null = null,
): BirthReading | { error: string } {
  const childId = matchColour(family, birth.child, birth.generation);
  const leftId = matchColour(family, birth.left_parent);
  const rightId = matchColour(family, birth.right_parent);
  if (!childId) return { error: `couleur du petit illisible (« ${birth.child} »)` };
  if (!leftId || !rightId) return { error: `couleur d’un parent illisible (« ${birth.left_parent} », « ${birth.right_parent} »)` };

  const sameParents = (pairing: Pairing) => {
    const colours = pairing.pair.map((code) => parseMountName(code, family)?.colourId);
    return (colours[0] === leftId && colours[1] === rightId) || (colours[0] === rightId && colours[1] === leftId);
  };
  const candidates = pairings.map((pairing, index) => ({ pairing, index })).filter(({ pairing }) => sameParents(pairing));
  const observedFather = birth.father === "right" ? rightId : birth.father === "left" ? leftId : null;
  const oriented = candidates.filter(({ pairing }) => parseMountName(pairing.pair[0], family)?.colourId === observedFather);
  const pool = oriented.length ? oriented : candidates;
  const open = pool.filter(({ index }) => !done.has(index));
  const match = open.find(({ index }) => index === active) ?? open[0] ?? pool[0];

  const father = match ? parseMountName(match.pairing.pair[0], family) : null;
  const mother = match ? parseMountName(match.pairing.pair[1], family) : null;
  const [fallbackFather, fallbackMother] = birth.father === "right" ? [rightId, leftId] : [leftId, rightId];
  const parentsType =
    father && mother ? father.type + mother.type : `${colourType(family, fallbackFather, true)}${colourType(family, fallbackMother, true)}`;
  const suffix = `${colourType(family, childId, true)}${parentsType}`;
  return {
    childId,
    sex: birth.sex,
    fatherId: father?.colourId ?? fallbackFather,
    motherId: mother?.colourId ?? fallbackMother,
    names: { M: `M${suffix}`, F: `F${suffix}` },
    pairingIndex: match?.index ?? null,
  };
}
