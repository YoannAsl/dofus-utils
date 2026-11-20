import { BREEDING_FUELS } from "@/data/breeding";

export const BREEDING_GAUGE_MAX = 200_000;

export interface BreedingFuel {
  id: number;
  name: string;
  iconId: number;
  recharge: number;
  /** Gauge level the fuel stops at; null fills up to the gauge maximum. */
  cap: number | null;
}

const fuelIds = new Set(Object.values(BREEDING_FUELS).flat().map((fuel) => fuel.id));

export function isBreedingFuel(id: string | number) {
  return fuelIds.has(Number(id));
}

/**
 * Cost of 10 000 recharge points per fuel, and the cost of filling the tier the fuel covers
 * (from the previous cap up to its own) with whole units.
 */
export function calculateBreedingCosts(fuels: BreedingFuel[], readPrice: (id: number) => number | null) {
  const caps = [...new Set(fuels.map((fuel) => fuel.cap ?? BREEDING_GAUGE_MAX))].sort((a, b) => a - b);
  const tierWidths = new Map(caps.map((cap, index) => [cap, cap - (caps[index - 1] ?? 0)]));
  const lowestCostByCap = new Map<number | null, number>();
  const costs = fuels.map((fuel) => {
    const price = readPrice(fuel.id);
    if (price === null) return null;
    const cost = (price * 10_000) / fuel.recharge;
    const unitsToFill = Math.ceil(tierWidths.get(fuel.cap ?? BREEDING_GAUGE_MAX)! / fuel.recharge);
    lowestCostByCap.set(fuel.cap, Math.min(cost, lowestCostByCap.get(fuel.cap) ?? Infinity));
    return { cost, fillCost: unitsToFill * price };
  });
  return fuels.map((fuel, index) => {
    const costs_ = costs[index] ?? null;
    return { fuel, costs: costs_, isBestOfTier: costs_ !== null && costs_.cost === lowestCostByCap.get(fuel.cap) };
  });
}
