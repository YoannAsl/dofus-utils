import { MOUNT_FAMILY_LABELS, MOUNT_TREES } from "@/data/mounts";
import type { MountColour, MountFamilyId } from "@/lib/mounts/types";

export const MOUNT_FAMILY_IDS = Object.keys(MOUNT_TREES) as MountFamilyId[];

export function isMountFamilyId(value: unknown): value is MountFamilyId {
  return typeof value === "string" && value in MOUNT_TREES;
}

/** Code de 2 lettres de chaque couleur de base, pour les noms de montures. */
const COLOUR_CODES: Record<string, string> = {
  Amande: "AM",
  Doree: "DO",
  Dore: "DO",
  Rousse: "RO",
  Roux: "RO",
  Indigo: "IN",
  Ebene: "EB",
  Pourpre: "PO",
  Orchidee: "OR",
  Turquoise: "TU",
  Ivoire: "IV",
  Emeraude: "EM",
  Prune: "PR",
  Ambre: "AB",
  Corail: "CO",
  Azur: "AZ",
  "Aigue-marine": "AI",
  Jade: "JA",
  Rubis: "RU",
  Saphir: "SA",
  Amethyste: "AT",
};

const ACCENTED_WORDS: Record<string, string> = {
  Doree: "Dorée",
  Dore: "Doré",
  Ebene: "Ébène",
  Orchidee: "Orchidée",
  Amethyste: "Améthyste",
};

export interface MountFamily {
  id: MountFamilyId;
  label: string;
  colours: MountColour[];
  byId: Map<string, MountColour>;
  /** Code de 4 lettres de chaque couleur. Les bicolores ont leurs deux codes triés. */
  typeById: Map<string, string>;
  /** Couleur d'un code de 4 lettres ; les bicolores s'acceptent dans les deux ordres. */
  idByType: Map<string, string>;
  /** Couleur obtenue par chaque couple, clé `a|b` triée. */
  childByPair: Map<string, string>;
  /** Code de 2 lettres des couleurs unies (générations impaires), triées par génération. */
  baseCodes: { code: string; name: string; generation: number }[];
}

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Unie (génération impaire) : son code doublé. Bicolore : les codes de sa 1re recette. */
function typeCodeOf(byId: Map<string, MountColour>, colour: MountColour, keepOrder: boolean) {
  if (colour.generation % 2 === 1) {
    const code = COLOUR_CODES[colour.name];
    return code ? code + code : null;
  }
  const recipe = colour.recipes[0];
  if (!recipe) return null;
  const codes = recipe.map((id) => COLOUR_CODES[byId.get(id)?.name ?? ""]);
  if (!codes[0] || !codes[1]) return null;
  return keepOrder ? codes.join("") : [...codes].sort().join("");
}

const families = new Map<MountFamilyId, MountFamily>();

export function getMountFamily(id: MountFamilyId): MountFamily {
  const cached = families.get(id);
  if (cached) return cached;

  const colours = MOUNT_TREES[id];
  const byId = new Map(colours.map((colour) => [colour.id, colour]));
  const typeById = new Map<string, string>();
  const idByType = new Map<string, string>();
  for (const colour of colours) {
    const type = typeCodeOf(byId, colour, false);
    if (!type) throw new Error(`${id} : pas de code pour ${colour.name}`);
    if (idByType.has(type)) throw new Error(`${id} : le code ${type} sert à ${idByType.get(type)} et ${colour.id}`);
    typeById.set(colour.id, type);
    idByType.set(type, colour.id);
  }
  for (const [type, colourId] of [...idByType]) {
    const swapped = type.slice(2) + type.slice(0, 2);
    if (!idByType.has(swapped)) idByType.set(swapped, colourId);
  }

  const childByPair = new Map<string, string>();
  for (const colour of colours) for (const [a, b] of colour.recipes) childByPair.set(pairKey(a, b), colour.id);

  const baseCodes = colours
    .filter((colour) => colour.generation % 2 === 1 && COLOUR_CODES[colour.name])
    .map((colour) => ({ code: COLOUR_CODES[colour.name]!, name: colour.name, generation: colour.generation }))
    .sort((a, b) => a.generation - b.generation || a.name.localeCompare(b.name, "fr"));

  const family: MountFamily = { id, label: MOUNT_FAMILY_LABELS[id], colours, byId, typeById, idByType, childByPair, baseCodes };
  families.set(id, family);
  return family;
}

/** Code de 4 lettres de la couleur ; `keepOrder` garde l'ordre de la recette du jeu pour les bicolores. */
export function colourType(family: MountFamily, colourId: string, keepOrder = false) {
  const colour = family.byId.get(colourId);
  if (!colour) return null;
  if (!keepOrder) return family.typeById.get(colourId) ?? null;
  return typeCodeOf(family.byId, colour, true) ?? family.typeById.get(colourId) ?? null;
}

/** Nom affichable : « Orchidee-Ebene » devient « Orchidée-Ébène ». */
export function accentColourName(name: string) {
  return name
    .split("-")
    .map((word) => ACCENTED_WORDS[word] ?? word)
    .join("-");
}

export function colourLabel(family: MountFamily, colourId: string) {
  return accentColourName(family.byId.get(colourId)?.name ?? colourId);
}
