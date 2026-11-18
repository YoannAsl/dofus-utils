export function parsePrice(value: unknown) {
  const parsed = Number(String(value).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(1, Math.round(parsed)) : null;
}

export type PriceMap = Record<string, number>;

export function parsePriceMap(values: unknown): PriceMap {
  const next: PriceMap = {};
  if (!values || typeof values !== "object") return next;
  for (const [id, value] of Object.entries(values)) {
    if (!/^\d+$/.test(id)) continue;
    const parsed = parsePrice(value);
    if (parsed) next[id] = parsed;
  }
  return next;
}
