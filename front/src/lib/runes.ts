import { RUNE_DATA } from "@/data/runes";
import { EFFECTS, type Effect } from "@/lib/effects";
import { round2 } from "@/lib/format";
import { normalizeText } from "@/lib/text";

export interface RawRune {
  id: number;
  name: string;
  level: number;
  img: string;
  effectId: number | null;
  value: number;
  characteristic: number | null;
}

export type TierRank = 1 | 2 | 3;

export interface Rune extends RawRune {
  tier: "simple" | "pa" | "ra";
  tierRank: TierRank;
  tierLabel: string;
  baseName: string;
  effect: Effect;
  density: number;
}

const UNKNOWN_EFFECT: Effect = { label: "Effet inconnu", unit: "effet", weight: 0, family: "Autres" };

export function parseTier(name: string): Pick<Rune, "tier" | "tierRank" | "tierLabel" | "baseName"> {
  const clean = name.replace(/^Rune\s+/, "").trim();
  if (clean.startsWith("Pa ")) return { tier: "pa", tierRank: 2, tierLabel: "Pa", baseName: clean.slice(3) };
  if (clean.startsWith("Ra ")) return { tier: "ra", tierRank: 3, tierLabel: "Ra", baseName: clean.slice(3) };
  return { tier: "simple", tierRank: 1, tierLabel: "Simple", baseName: clean };
}

export function enrichRune(rune: RawRune): Rune {
  const effect = (rune.effectId === null ? null : EFFECTS[rune.effectId]) ?? UNKNOWN_EFFECT;
  return { ...rune, ...parseTier(rune.name), effect, density: round2((Number(rune.value) || 0) * effect.weight) };
}

export const runes: Rune[] = RUNE_DATA.map(enrichRune);
export const runesByName = [...runes].sort((a, b) => a.name.localeCompare(b.name, "fr"));
export const xpRunes = runesByName.filter((rune) => rune.density > 0);
export const runeById = new Map(runes.map((rune) => [String(rune.id), rune]));

/** Tiers of the same characteristic, keyed by tier rank. */
export type RuneFamily = Map<TierRank, Rune>;
const familyMap = new Map<string, RuneFamily>();
for (const rune of runes) {
  let family = familyMap.get(rune.baseName);
  if (!family) familyMap.set(rune.baseName, (family = new Map()));
  family.set(rune.tierRank, rune);
}

export function runeFamily(rune: Rune): RuneFamily | undefined {
  return familyMap.get(rune.baseName);
}

export function shortRuneName(rune: Rune) {
  return rune.name.replace(/^Rune\s+/, "");
}

export function findRuneByName(value: string) {
  const name = normalizeText(value).trim().replace(/^rune\s+/, "");
  return runes.find((rune) => normalizeText(rune.name).replace(/^rune\s+/, "") === name) ?? null;
}

function normalizeRuneNameForMatch(value: unknown) {
  return normalizeText(value ?? "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\brunes?\b/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function findRuneByOcrName(itemName: string | null | undefined) {
  const target = normalizeRuneNameForMatch(itemName);
  if (!target) return null;
  return runes.find((rune) => normalizeRuneNameForMatch(rune.name) === target) ?? null;
}

// A characteristic shatters into its smallest rune; the other tiers only matter for prices elsewhere.
export const baseRuneByCharacteristic = new Map<number, Rune>();
for (const rune of runes) {
  if (rune.characteristic == null || rune.effect.weight <= 0) continue;
  const current = baseRuneByCharacteristic.get(rune.characteristic);
  if (!current || rune.value < current.value) baseRuneByCharacteristic.set(rune.characteristic, rune);
}

export const runeEffectIds = new Set(runes.map((rune) => rune.effectId));

export const DEFAULT_XP_RUNE_ID = String((runes.find((rune) => rune.name === "Rune Pa So") ?? xpRunes[0] ?? runes[0]!).id);
