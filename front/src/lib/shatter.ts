import { round2 } from "@/lib/format";

export interface BreakEntryRune {
  id: string;
  quantity: number;
}

export function calculateBreakResult(
  entry: { unitCost: number; quantity: number; runes: BreakEntryRune[] },
  readRunePrice: (id: string) => number | null,
) {
  const cost = entry.unitCost * entry.quantity;
  let value = 0;
  let missing = 0;
  for (const { id, quantity } of entry.runes) {
    const price = readRunePrice(id);
    if (price === null) missing++;
    else value += price * quantity;
  }
  const profit = value - cost;
  return { cost, value, missing, profit, roi: cost ? profit / cost : null };
}

export function shatterLineWeight(jet: number, weight: number, level: number) {
  return (3 * jet * weight * level) / 200 + 1;
}

export interface ShatterLineInput {
  jet: number;
  weight: number;
  runeValue: number;
  negative: boolean;
  exo: boolean;
  price: number | null;
}

export interface ShatterRow {
  runesWithoutFocus: number | null;
  kamasWithoutFocus: number | null;
  runesWithFocus: number | null;
  kamasWithFocus: number | null;
}

export interface ShatterOption {
  index: number | null;
  value: number;
}

export interface ShatterResult {
  rows: ShatterRow[];
  missing: number;
  totalWithoutFocus: number | null;
  options: ShatterOption[];
  best: ShatterOption | null;
}

export function calculateShatter({ level, coefficient, lines }: { level: number; coefficient: number; lines: ShatterLineInput[] }): ShatterResult {
  const factor = coefficient / 100;
  const pools = lines.map((line) => (line.negative ? 0 : shatterLineWeight(line.jet, line.weight, level)));
  const totalPool = pools.reduce((sum, pool) => sum + pool, 0);
  const kamas = (runeCount: number | null, price: number | null) =>
    runeCount === null || price === null ? null : Math.round(runeCount * price);

  const rows = lines.map((line, index): ShatterRow => {
    const pool = pools[index]!;
    const runeWeight = line.weight * line.runeValue;
    const runesWithoutFocus = line.negative ? null : round2((pool * factor) / runeWeight);
    const runesWithFocus = line.negative || line.exo ? null : round2(((pool + 0.5 * (totalPool - pool)) * factor) / runeWeight);
    return {
      runesWithoutFocus,
      kamasWithoutFocus: kamas(runesWithoutFocus, line.price),
      runesWithFocus,
      kamasWithFocus: kamas(runesWithFocus, line.price),
    };
  });

  const missing = lines.filter((line) => !line.negative && line.price === null).length;
  const totalWithoutFocus = missing ? null : rows.reduce((sum, row) => sum + (row.kamasWithoutFocus || 0), 0);
  const options: ShatterOption[] =
    totalWithoutFocus === null
      ? []
      : [
          { index: null, value: totalWithoutFocus },
          ...rows.flatMap((row, index) => (row.kamasWithFocus === null ? [] : [{ index, value: row.kamasWithFocus }])),
        ].sort((a, b) => b.value - a.value);

  return { rows, missing, totalWithoutFocus, options, best: options[0] ?? null };
}

export function calculateBreakEvenCoefficient(cost: number, coefficient: number, bestValue: number) {
  return cost > 0 && coefficient > 0 && bestValue > 0 ? Math.round((cost * coefficient) / bestValue) : null;
}
