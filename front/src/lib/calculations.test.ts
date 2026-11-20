import { describe, expect, it } from "vitest";
import { calculateBreedingCosts } from "@/lib/breeding";
import { calculateRecipeCost, calculateRuneAcquisition, getOcrApplyPrice, getTargetDensityCost } from "@/lib/pricing";
import { parsePrice, parsePriceMap } from "@/lib/prices";
import { findRuneByName, findRuneByOcrName, runeFamily, runes } from "@/lib/runes";
import { calculateBreakEvenCoefficient, calculateBreakResult, calculateShatter } from "@/lib/shatter";
import { parseBrisageEntries } from "@/stores/brisage";

const rune = (name: string) => runes.find((entry) => entry.name === name)!;

describe("rune acquisition", () => {
  const prices = new Map([
    ["Rune Fo", 10],
    ["Rune Pa Fo", 25],
    ["Rune Ra Fo", 100],
  ]);
  const read = (entry: { name: string }) => prices.get(entry.name) ?? null;

  it("picks the cheapest of buying, crafting from Pa and crafting from simple runes", () => {
    const raFo = rune("Rune Ra Fo");
    const acquisition = calculateRuneAcquisition(raFo, runeFamily(raFo), read);
    expect(acquisition.options.map((option) => option.cost)).toEqual([75, 90, 100]);
    expect(acquisition.best?.label).toBe("Crafter via 3 Rune Pa Fo");
    expect(acquisition.decision).toBe("craft");
    expect(acquisition.saving).toBe(25);
    expect(acquisition.profit).toBe(25);
  });

  it("asks for a price when nothing is known", () => {
    const sa = rune("Rune Sa");
    const acquisition = calculateRuneAcquisition(sa, runeFamily(sa), () => null);
    expect(acquisition).toMatchObject({ best: null, decision: "missing", badge: "Prix requis" });
  });

  it("counts the runes needed for 1 000 density", () => {
    const fo = rune("Rune Fo");
    const target = getTargetDensityCost(fo, calculateRuneAcquisition(fo, runeFamily(fo), read));
    expect(target).toEqual({ quantity: 1000, cost: 10_000, density: 1000 });
  });
});

describe("shatter", () => {
  const force = { jet: 50, weight: 1, runeValue: 1, negative: false, exo: false, price: 10 };
  const vitality = { jet: 300, weight: 0.2, runeValue: 5, negative: false, exo: false, price: 2 };

  it("turns each line into runes and adds half the other lines to a focus", () => {
    const result = calculateShatter({ level: 200, coefficient: 100, lines: [force, vitality] });
    // Force weighs 3 × 50 × 1 × 200 / 200 + 1 = 151, Vitalité 3 × 300 × 0.2 × 200 / 200 + 1 = 181.
    expect(result.rows).toEqual([
      { runesWithoutFocus: 151, kamasWithoutFocus: 1510, runesWithFocus: 241.5, kamasWithFocus: 2415 },
      { runesWithoutFocus: 181, kamasWithoutFocus: 362, runesWithFocus: 256.5, kamasWithFocus: 513 },
    ]);
    expect(result.totalWithoutFocus).toBe(1872);
    expect(result.best).toEqual({ index: 0, value: 2415 });
    expect(result.options.map((option) => option.index)).toEqual([0, null, 1]);
  });

  it("scales with the coefficient", () => {
    const result = calculateShatter({ level: 200, coefficient: 50, lines: [force] });
    expect(result.rows[0]?.runesWithoutFocus).toBe(75.5);
  });

  it("gives nothing for maluses and never focuses exotic lines", () => {
    const result = calculateShatter({
      level: 200,
      coefficient: 100,
      lines: [force, { ...vitality, negative: true, price: null }, { ...vitality, exo: true }],
    });
    expect(result.rows[1]).toEqual({ runesWithoutFocus: null, kamasWithoutFocus: null, runesWithFocus: null, kamasWithFocus: null });
    expect(result.rows[2]?.runesWithFocus).toBeNull();
    // The malus adds no weight; the exo adds its full weight to the Force focus.
    expect(result.rows[0]?.runesWithFocus).toBe(241.5);
  });

  it("withholds totals while a rune price is missing", () => {
    const result = calculateShatter({ level: 200, coefficient: 100, lines: [force, { ...vitality, price: null }] });
    expect(result).toMatchObject({ missing: 1, totalWithoutFocus: null, best: null, options: [] });
  });

  it("finds the coefficient that pays back the item", () => {
    expect(calculateBreakEvenCoefficient(3000, 100, 2415)).toBe(124);
    expect(calculateBreakEvenCoefficient(0, 100, 2415)).toBeNull();
  });

  it("values a logged break at current prices and flags missing ones", () => {
    const prices: Record<string, number> = { "1": 10 };
    const result = calculateBreakResult(
      { unitCost: 100, quantity: 2, runes: [{ id: "1", quantity: 30 }, { id: "2", quantity: 5 }] },
      (id) => prices[id] ?? null,
    );
    expect(result).toEqual({ cost: 200, value: 300, missing: 1, profit: 100, roi: 0.5 });
  });
});

describe("market and fuel costs", () => {
  it("adds known recipe subtotals and counts missing prices", () => {
    const cost = calculateRecipeCost([{ id: 1, quantity: 3 }, { id: 2, quantity: 2 }], (id) => (id === "1" ? 7 : null));
    expect(cost).toEqual({ subtotals: [21, null], total: 21, missing: 1 });
  });

  it("prices breeding fuels per 10 000 points and per gauge tier", () => {
    const fuels = [
      { id: 1, name: "A", iconId: 1, recharge: 2000, cap: 80_000 },
      { id: 2, name: "B", iconId: 1, recharge: 10_000, cap: 80_000 },
      { id: 3, name: "C", iconId: 1, recharge: 6000, cap: null },
    ];
    const prices: Record<number, number> = { 1: 100, 2: 600, 3: 300 };
    const rows = calculateBreedingCosts(fuels, (id) => prices[id] ?? null);
    expect(rows.map((row) => row.costs)).toEqual([
      { cost: 500, fillCost: 4000 },
      { cost: 600, fillCost: 4800 },
      // 120 000 points from 80 000 to the 200 000 maximum need 20 units.
      { cost: 500, fillCost: 6000 },
    ]);
    expect(rows.map((row) => row.isBestOfTier)).toEqual([true, false, true]);
  });
});

describe("parsing", () => {
  it("reads typed prices with spaces and decimal commas", () => {
    expect(parsePrice("12 500")).toBe(12500);
    expect(parsePrice("2,4")).toBe(2);
    expect(parsePrice("0,2")).toBe(1);
    expect(parsePrice("-5")).toBeNull();
    expect(parsePrice("")).toBeNull();
    expect(parsePriceMap({ "1": "10", abc: 3, "2": 0 })).toEqual({ "1": 10 });
  });

  it("rounds OCR unit prices to whole kamas", () => {
    expect(getOcrApplyPrice({ practical_average_unit_price: 12.6 })).toBe(13);
    expect(getOcrApplyPrice({ best_lot: { quantity: 10, total_price: 51, unit_price: 5.1 } })).toBe(5);
    expect(getOcrApplyPrice({})).toBeNull();
  });

  it("matches rune names typed or read by OCR", () => {
    expect(findRuneByName("pa fo")?.name).toBe("Rune Pa Fo");
    expect(findRuneByOcrName("Rune  Pa-Fo")?.name).toBe("Rune Pa Fo");
    expect(findRuneByOcrName("Gelano")).toBeNull();
  });

  it("keeps only well-formed logged breaks from storage or an import", () => {
    const valid = { id: "a", date: "2026-11-01T10:00:00.000Z", itemName: "Gelano", quantity: 1, unitCost: 100, coefficient: 80, runes: [{ id: "1519", quantity: 3 }] };
    const entries = parseBrisageEntries([valid, { ...valid, id: "b", quantity: 0 }, { ...valid, id: "c", runes: [{ id: "999999", quantity: 1 }] }, null]);
    expect(entries.map((entry) => entry.id)).toEqual(["a"]);
    expect(entries[0]).toMatchObject({ itemId: null, iconId: null, level: null, runes: [{ id: "1519", quantity: 3 }] });
  });
});
