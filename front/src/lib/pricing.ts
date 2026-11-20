import type { Rune, RuneFamily } from "@/lib/runes";
import { parsePrice } from "@/lib/prices";

export const XP_TARGET_DENSITY = 1000;

export type Decision = "craft" | "buy" | "neutral" | "missing";

export interface AcquisitionOption {
  kind: "buy" | "craft";
  cost: number;
  label: string;
  quantity?: number;
  unitPrice?: number;
}

export interface RuneAcquisition {
  directPrice: number | null;
  options: AcquisitionOption[];
  best: AcquisitionOption | null;
  bestCraft: AcquisitionOption | null;
  saving: number | null;
  profit: number;
  xpDirect: number | null;
  xpOptimal: number | null;
  decision: Decision;
  badge: string;
}

type ReadRunePrice = (rune: Rune) => number | null;

export function calculateRuneAcquisition(rune: Rune, family: RuneFamily | undefined, readRunePrice: ReadRunePrice): RuneAcquisition {
  const directPrice = readRunePrice(rune);
  const options: AcquisitionOption[] = [];

  if (directPrice) options.push({ kind: "buy", cost: directPrice, label: "Acheter HDV" });

  if (family && rune.tierRank >= 2) {
    const lower = family.get((rune.tierRank - 1) as 1 | 2);
    const lowerPrice = lower ? readRunePrice(lower) : null;
    if (lower && lowerPrice) {
      options.push({ kind: "craft", cost: lowerPrice * 3, label: `Crafter via 3 ${lower.name}`, quantity: 3, unitPrice: lowerPrice });
    }
  }

  if (family && rune.tierRank === 3) {
    const simple = family.get(1);
    const simplePrice = simple ? readRunePrice(simple) : null;
    if (simple && simplePrice) {
      options.push({ kind: "craft", cost: simplePrice * 9, label: `Crafter via 9 ${simple.name}`, quantity: 9, unitPrice: simplePrice });
    }
  }

  options.sort((a, b) => a.cost - b.cost);
  const best = options[0] ?? null;
  const bestCraft = options.find((option) => option.kind === "craft") ?? null;
  const saving = directPrice && bestCraft ? directPrice - bestCraft.cost : null;
  const xpDirect = directPrice && rune.density > 0 ? rune.density / directPrice : null;
  const xpOptimal = best && rune.density > 0 ? rune.density / best.cost : null;

  let decision: Decision = "missing";
  let badge = "Prix requis";
  if (rune.density <= 0) {
    decision = "neutral";
    badge = "Hors XP";
  } else if (best?.kind === "craft" && directPrice && best.cost < directPrice) {
    decision = "craft";
    badge = "Crafter";
  } else if (best?.kind === "craft" && !directPrice) {
    decision = "craft";
    badge = "Craft possible";
  } else if (best?.kind === "buy") {
    decision = "buy";
    badge = "Acheter";
  }

  return { directPrice, options, best, bestCraft, saving, profit: saving && saving > 0 ? saving : 0, xpDirect, xpOptimal, decision, badge };
}

export function getTargetDensityCost(rune: Rune, acquisition: RuneAcquisition) {
  if (!acquisition.best || rune.density <= 0) return null;
  const quantity = Math.ceil(XP_TARGET_DENSITY / rune.density);
  return { quantity, cost: quantity * acquisition.best.cost, density: quantity * rune.density };
}

export function calculateItemEconomy(
  candidate: { runeUses: number; potentialDensity: number },
  acquisition: RuneAcquisition,
  itemPrice: number | null,
) {
  const runeCost = acquisition.best ? candidate.runeUses * acquisition.best.cost : null;
  const totalCost = itemPrice ? itemPrice + (runeCost || 0) : null;
  const costPerDensity = totalCost && candidate.potentialDensity > 0 ? (totalCost / candidate.potentialDensity) * XP_TARGET_DENSITY : null;
  return { itemPrice, runeCost, totalCost, costPerDensity };
}

export function calculateRecipeCost(ingredients: { id: number | string; quantity: number }[], readPrice: (id: string) => number | null) {
  let total = 0;
  let missing = 0;
  const subtotals = ingredients.map(({ id, quantity }) => {
    const price = readPrice(String(id));
    if (price === null) {
      missing++;
      return null;
    }
    const subtotal = price * quantity;
    total += subtotal;
    return subtotal;
  });
  return { subtotals, total, missing };
}

export interface OcrLot {
  quantity: number;
  total_price: number;
  unit_price: number;
}

export interface OcrResult {
  item_name?: string | null;
  lots?: OcrLot[];
  best_lot?: OcrLot | null;
  practical_average_unit_price?: number | null;
  weighted_average_unit_price?: number | null;
  displayed_average_price?: number | string | null;
  warnings?: string[];
}

function positive(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function getOcrBestLot(result: OcrResult | null) {
  return result?.best_lot ?? null;
}

export function getOcrPracticalAverage(result: OcrResult | null) {
  return positive(result?.practical_average_unit_price);
}

export function getOcrWeightedAverage(result: OcrResult | null) {
  return positive(result?.weighted_average_unit_price);
}

export function getOcrUnitPrice(result: OcrResult | null) {
  return getOcrPracticalAverage(result) ?? getOcrWeightedAverage(result) ?? positive(getOcrBestLot(result)?.unit_price);
}

export function getOcrApplyPrice(result: OcrResult | null) {
  const unitPrice = getOcrUnitPrice(result);
  return unitPrice === null ? null : Math.max(1, Math.round(unitPrice));
}

export function getOcrMarketPrice(result: OcrResult | null) {
  return getOcrApplyPrice(result) ?? parsePrice(result?.displayed_average_price);
}
