import { colourType, type MountFamily } from "@/lib/mounts/family";
import type { Mount, Sex } from "@/lib/mounts/types";

export const WILD = "SAUV";
const NAME_PATTERN = /^([MF])([A-Z]{4})(SAUV|[A-Z]{8})$/;
const WILD_PARENTS = new Set([WILD, WILD + WILD]);

/** Lit un nom de 13 lettres (sexe + couleur + 1er parent + 2e parent), ou SAUVSAUV pour une capture. */
export function parseMountName(name: string, family: MountFamily): Mount | null {
  const code = name.trim().toUpperCase();
  const match = NAME_PATTERN.exec(code);
  if (!match) return null;
  const [, sex, type, parents] = match as unknown as [string, Sex, string, string];
  const colourId = family.idByType.get(type);
  if (!colourId) return null;
  const wild = WILD_PARENTS.has(parents);
  const parentTypes = wild ? [] : [parents.slice(0, 4), parents.slice(4)];
  const parentIds = parentTypes.map((parentType) => family.idByType.get(parentType));
  if (parentIds.some((id) => !id)) return null;
  return { family: family.id, code, sex, colourId, type, parentIds: parentIds as string[], parentTypes, wild };
}

/** Nom à donner en jeu à une monture. Sans parents, c'est une capture. */
export function mountName(
  family: MountFamily,
  { colourId, sex, parentIds = [], keepOrder = false }: { colourId: string; sex: Sex; parentIds?: string[]; keepOrder?: boolean },
) {
  const type = colourType(family, colourId, keepOrder);
  if (!type) return null;
  if (parentIds.length === 0) return `${sex}${type}${WILD}${WILD}`;
  const parentTypes = parentIds.map((id) => colourType(family, id, keepOrder));
  if (parentTypes.length !== 2 || parentTypes.some((parentType) => !parentType)) return null;
  return `${sex}${type}${(keepOrder ? parentTypes : [...parentTypes].sort()).join("")}`;
}

const TRUNCATION = /(…|\.{2,})\s*$/u;

/**
 * Le jeu coupe les noms trop longs avec « … » : c'est alors le 2e parent qui manque.
 * On le remplace par la couleur de la monture elle-même.
 */
export function completeMountName(raw: string, family: MountFamily): { code: string; completed: boolean } | null {
  const upper = raw.trim().toUpperCase();
  const truncated = TRUNCATION.test(upper);
  const code = upper.replace(TRUNCATION, "").replace(/\s+/g, "");
  if (parseMountName(code, family)) return { code, completed: false };
  const head = code.slice(0, 9);
  if (code.length < 9 || code.length >= 13 || !/^[MF][A-Z]{8}$/.test(head) || (!truncated && code.length === 9)) return null;
  const completed = head + head.slice(1, 5);
  return parseMountName(completed, family) ? { code: completed, completed: true } : null;
}

export interface MountListReading {
  codes: string[];
  completed: { from: string; to: string }[];
  refused: string[];
  unreadable: string[];
}

const CODE_FENCE = /^```[a-z]*\s*|```\s*$/gi;
const NAME_START = /^[MF][A-Z]{8}/i;

/** Lit une liste de noms : JSON (`["…"]` ou `{ mounts, illisibles }`) ou texte libre. */
export function readMountList(text: string, family: MountFamily): MountListReading {
  const reading: MountListReading = { codes: [], completed: [], refused: [], unreadable: [] };
  const body = text.replace(CODE_FENCE, "").trim();
  if (!body) return reading;

  let entries: unknown[] | null = null;
  try {
    const parsed: unknown = JSON.parse(body);
    if (Array.isArray(parsed)) entries = parsed;
    else if (parsed && typeof parsed === "object") {
      const { mounts, illisibles } = parsed as { mounts?: unknown; illisibles?: unknown };
      entries = Array.isArray(mounts) ? mounts : [];
      if (Array.isArray(illisibles)) reading.unreadable = illisibles.map(String).filter(Boolean);
    }
  } catch {
    // Pas du JSON : liste de noms séparés par des espaces, virgules ou retours à la ligne.
  }
  entries ??= body
    .split(/[\s,;"'[\]{}:]+/)
    .map((token) => token.trim())
    .filter((token) => NAME_START.test(token));

  for (const entry of entries) {
    const raw = String(entry ?? "").trim();
    if (!raw) continue;
    const result = completeMountName(raw, family);
    if (!result) {
      reading.refused.push(raw);
      continue;
    }
    reading.codes.push(result.code);
    if (result.completed) reading.completed.push({ from: raw, to: result.code });
  }
  return reading;
}
